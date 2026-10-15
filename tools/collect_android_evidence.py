#!/usr/bin/env python3
"""Finite, read-only-by-default Android evidence capture. No root, data/log clearing or publishing.

An optional test APK install requires an explicitly selected serial, exact expected model,
matching build sidecar, and APK manifest inspection. Capture files can contain device logs;
keep them local and review before sharing.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import zipfile

TEST_PACKAGE = re.compile(r"in\.crushx\.lens\.(?:pr3test|devtest)(?:\.[a-z][a-z0-9_]*)*\Z")
DIAGNOSTIC_TAG = re.compile(r"\[CrushX\s*(?:AR|Lens|Build|Diagnostic|FoxMask|Capture|Media)[^\]]*\]|CrushXAR", re.I)
NATIVE_ERROR = re.compile(
    r"AR_ERROR_[A-Z_]+|AR_UNAVAILABLE_[A-Z_]+|(?:arcore|augmented.?face|camera(?:service|device|manager)?).*"
    r"(?:error|exception|fail|unavailable|denied|in.use|disconnect)|"
    r"(?:error|exception|fail|unavailable).*(?:arcore|augmented.?face)", re.I)
OUTCOMES = (
    "ManagerMissing", "ManagerDisabled", "PermissionDenied", "LoaderMissing", "SessionNotReady",
    "CameraMismatch", "SubsystemMissing", "SubsystemStopped", "NoFacesDetected", "FacesNotTracking",
    "Tracking", "LensPrefabMissing", "LensRendererUnavailable",
)


def parse_logcat(text: str) -> dict:
    """Keep exact observed lines; state names and native errors are evidence, not a diagnosis."""
    diagnostics, native, outcomes = [], [], {}
    for line in text.splitlines():
        if DIAGNOSTIC_TAG.search(line):
            diagnostics.append(line)
            for outcome in OUTCOMES:
                if re.search(r"(?<![A-Za-z])" + outcome + r"(?![A-Za-z])", line):
                    outcomes[outcome] = outcomes.get(outcome, 0) + 1
        if NATIVE_ERROR.search(line):
            native.append(line)
    return {
        "diagnosticLines": diagnostics, "nativeErrorObservations": native,
        "observedOutcomeCounts": outcomes,
        "rootCause": "NOT ESTABLISHED: correlate exact native errors, build identity and session observations with reproduction.",
        "physicalAcceptance": "NOT TESTED: log collection or a Tracking observation alone does not verify visible mask alignment, UI, media or performance.",
    }


def run(command: list[str], timeout: float = 20) -> dict:
    try:
        proc = subprocess.run(command, capture_output=True, text=True, errors="replace", timeout=timeout, check=False)
        return {"exitCode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    except subprocess.TimeoutExpired as exc:
        def decoded(value):
            return value.decode(errors="replace") if isinstance(value, bytes) else value or ""
        return {"exitCode": None, "timedOut": True, "stdout": decoded(exc.stdout), "stderr": decoded(exc.stderr)}
    except OSError as exc:
        return {"exitCode": None, "stdout": "", "stderr": str(exc)}


def select_device(devices_output: str, serial: str | None) -> str:
    devices = {}
    for line in devices_output.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2:
            devices[parts[0]] = parts[1]
    if serial:
        if devices.get(serial) != "device":
            raise ValueError("Selected serial is absent, unauthorized or offline.")
        return serial
    authorized = [key for key, state in devices.items() if state == "device"]
    if len(authorized) != 1:
        raise ValueError("Read-only capture requires exactly one authorized device, or --serial.")
    return authorized[0]


def validate_install_target(*, serial: str | None, selected_serial: str, expected_model: str | None,
                            actual_model: str, package: str, manifest_package: str, info: dict,
                            apk_commit: str | None = None) -> None:
    if not serial or serial != selected_serial:
        raise ValueError("Install requires the exact explicit --serial.")
    if not expected_model or expected_model != actual_model:
        raise ValueError("Install requires an exact --expected-model matching ro.product.model.")
    if not TEST_PACKAGE.fullmatch(package) or manifest_package != package:
        raise ValueError("APK package must exactly match the requested isolated test package.")
    if info.get("packageId") != package or info.get("developmentBuild") is not True:
        raise ValueError("Build metadata must identify the same development test package.")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", str(info.get("commitSha", ""))) or not info.get("buildId"):
        raise ValueError("Build metadata requires an exact commit SHA and build ID.")
    if apk_commit and apk_commit.lower() != info["commitSha"].lower():
        raise ValueError("APK commit does not match supplied build metadata.")


def locate_manifest_tool(explicit: str | None) -> str:
    if explicit:
        path = shutil.which(explicit) or (explicit if Path(explicit).is_file() else None)
        if not path:
            raise ValueError("Manifest inspection tool does not exist.")
        return path
    for name in ("aapt2", "aapt", "apkanalyzer", "apkanalyzer.bat"):
        path = shutil.which(name)
        if path:
            return path
    for sdk in (os.getenv("ANDROID_SDK_ROOT"), os.getenv("ANDROID_HOME")):
        if sdk:
            for path in sorted((Path(sdk) / "build-tools").glob("*/aapt*"), reverse=True):
                if path.name in ("aapt", "aapt.exe", "aapt2", "aapt2.exe"):
                    return str(path)
    raise ValueError("Install requires aapt/aapt2/apkanalyzer to inspect the actual APK manifest.")


def inspect_apk(apk: Path, tool: str) -> tuple[str, dict]:
    if Path(tool).stem.lower().startswith("apkanalyzer"):
        result = run([tool, "manifest", "application-id", str(apk)], timeout=30)
        package = result["stdout"].strip()
        result["manifestXml"] = run([tool, "manifest", "print", str(apk)], timeout=30)
    else:
        result = run([tool, "dump", "badging", str(apk)], timeout=30)
        match = re.search(r"^package: name='([^']+)'", result["stdout"], re.M)
        package = match[1] if match else ""
        tree_args = [tool, "dump", "xmltree", str(apk)]
        tree_args += ["--file", "AndroidManifest.xml"] if Path(tool).stem.lower() == "aapt2" else ["AndroidManifest.xml"]
        result["manifestXml"] = run(tree_args, timeout=30)
    if result["exitCode"] != 0 or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.]*", package):
        raise ValueError("Actual APK manifest could not be inspected; refusing install.")
    return package, result


def manifest_text(result: dict) -> str:
    return result["stdout"] + "\n" + result.get("manifestXml", {}).get("stdout", "")


def apk_contains_build_identity(apk: Path, info: dict) -> bool:
    """Inspect decompressed Unity asset streams without loading the entire APK into RAM."""
    needles = [str(info.get(key, "")).encode("utf-8") for key in ("commitSha", "buildId")]
    if any(not needle for needle in needles):
        return False
    found = [False, False]
    overlap = max(map(len, needles)) - 1
    with zipfile.ZipFile(apk) as archive:
        # The controlled builder duplicates runtime Resources metadata into raw StreamingAssets.
        # Compare the entire JSON object, independently of Unity asset bundle compression.
        if "assets/CrushXBuildInfo.json" in archive.namelist():
            try:
                return json.loads(archive.read("assets/CrushXBuildInfo.json").decode("utf-8-sig")) == info
            except (ValueError, UnicodeError):
                return False
        for name in archive.namelist():
            if not name.startswith("assets/bin/Data/") or name.endswith("/"):
                continue
            tail = b""
            with archive.open(name) as stream:
                while chunk := stream.read(65536):
                    chunk = tail + chunk
                    found = [old or needle in chunk for old, needle in zip(found, needles)]
                    if all(found):
                        return True
                    tail = chunk[-overlap:] if overlap else b""
    return False


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def capture_logcat(command: list[str], path: Path, seconds: int) -> dict:
    """Collect every buffer for a finite deadline; terminate only the local adb client."""
    started = time.monotonic()
    with path.open("wb") as output, path.with_suffix(".stderr.txt").open("wb") as errors:
        process = subprocess.Popen(command, stdout=output, stderr=errors)
        try:
            code = process.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                code = process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                code = process.wait(timeout=5)
        return {"exitCode": code, "requestedSeconds": seconds, "elapsedSeconds": round(time.monotonic() - started, 3)}


def collect(args) -> Path:
    adb = shutil.which(args.adb) or (args.adb if Path(args.adb).is_file() else None)
    if not adb:
        raise ValueError("ADB is unavailable; install Android platform-tools or pass --adb.")
    if args.install and (not args.apk or not args.build_info):
        raise ValueError("--install requires --apk and --build-info.")
    device_list = run([adb, "devices", "-l"])
    if device_list["exitCode"] != 0:
        raise ValueError("ADB device enumeration failed: " + device_list["stderr"])
    serial = select_device(device_list["stdout"], args.serial)
    prefix = [adb, "-s", serial]
    model_result = run(prefix + ["shell", "getprop", "ro.product.model"])
    actual_model = model_result["stdout"].strip() if model_result["exitCode"] == 0 else ""
    # Never reuse or overwrite an existing evidence directory.
    output = args.output or Path("work/android-evidence") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    evidence = {
        "schemaVersion": 1, "startedUtc": datetime.now(timezone.utc).isoformat(), "serial": serial,
        "model": actual_model, "packageId": args.package, "readOnly": not args.install,
        "deviceEnumeration": device_list, "probes": {}, "acceptance": "NOT TESTED",
    }

    def save():
        (output / "evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    save()
    try:
        if args.apk:
            apk = args.apk.resolve(strict=True)
            evidence["apk"] = {"path": str(apk), "sha256": file_sha256(apk)}
            tool = locate_manifest_tool(args.manifest_tool)
            manifest_package, manifest = inspect_apk(apk, tool)
            evidence["apk"]["manifest"] = manifest
            (output / "apk-manifest-inspection.txt").write_text(manifest_text(manifest), encoding="utf-8")
            if args.install:
                info = json.loads(args.build_info.read_text(encoding="utf-8"))
                # A sidecar alone cannot establish it belongs to this APK: inspect the packaged Resources bytes.
                if not apk_contains_build_identity(apk, info):
                    raise ValueError("Cannot locate supplied commit/build ID in packaged Unity Resources; refusing install.")
                validate_install_target(serial=args.serial, selected_serial=serial, expected_model=args.expected_model,
                                        actual_model=actual_model, package=args.package, manifest_package=manifest_package, info=info)
                evidence["buildInfo"] = info
                evidence["install"] = run(prefix + ["install", "-r", str(apk)], timeout=180)
                if evidence["install"]["exitCode"] != 0:
                    raise ValueError("Test installation failed; see evidence.json. No uninstall or data clearing attempted.")
        probes = {
            "adbVersion": [adb, "version"],
            "manufacturer": prefix + ["shell", "getprop", "ro.product.manufacturer"],
            "androidVersion": prefix + ["shell", "getprop", "ro.build.version.release"],
            "androidApi": prefix + ["shell", "getprop", "ro.build.version.sdk"],
            "osBuild": prefix + ["shell", "getprop", "ro.build.display.id"],
            "arService": prefix + ["shell", "dumpsys", "package", "com.google.ar.core"],
            "appPackage": prefix + ["shell", "dumpsys", "package", args.package],
            "appPackagePath": prefix + ["shell", "pm", "path", args.package],
            "launchActivity": prefix + ["shell", "cmd", "package", "resolve-activity", "--brief", "-a",
                                          "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", args.package],
            "cameraPermission": prefix + ["shell", "cmd", "package", "check-permission", "android.permission.CAMERA", args.package, "0"],
            "cameraAppOps": prefix + ["shell", "cmd", "appops", "get", args.package, "CAMERA"],
            "memoryBefore": prefix + ["shell", "dumpsys", "meminfo", args.package],
            "gfxBefore": prefix + ["shell", "dumpsys", "gfxinfo", args.package],
        }
        for key, command in probes.items():
            evidence["probes"][key] = run(command)
            save()
        # Pull the selected app's base APK for exact installed identity and merged manifest evidence.
        # This is a read operation; it never modifies the app or grants permissions.
        package_paths = evidence["probes"]["appPackagePath"]["stdout"].splitlines()
        base_apk = next((line[len("package:"):] for line in package_paths
                         if line.startswith("package:/") and line.endswith("/base.apk")), None)
        if base_apk:
            installed = output / "installed-base.apk"
            evidence["installedApkPull"] = run(prefix + ["pull", base_apk, str(installed)], timeout=120)
            if evidence["installedApkPull"]["exitCode"] == 0 and installed.is_file():
                evidence["installedApkSha256"] = file_sha256(installed)
                try:
                    installed_package, installed_manifest = inspect_apk(installed, locate_manifest_tool(args.manifest_tool))
                    evidence["installedManifest"] = {"packageId": installed_package, "inspection": installed_manifest}
                    (output / "installed-manifest-inspection.txt").write_text(manifest_text(installed_manifest), encoding="utf-8")
                except ValueError as exc:
                    evidence["installedManifest"] = {"status": "BLOCKED", "reason": str(exc)}
                if "apk" in evidence:
                    evidence["installedApkMatchesSupplied"] = evidence["installedApkSha256"] == evidence["apk"]["sha256"]
        else:
            evidence["installedManifest"] = {"status": "BLOCKED", "reason": "No installed base.apk path returned for selected package."}
        save()
        snapshot = output / "logcat-before.txt"
        with snapshot.open("wb") as stdout, (output / "logcat-before.stderr.txt").open("wb") as stderr:
            try:
                result = subprocess.run(prefix + ["logcat", "-b", "all", "-d", "-v", "threadtime"],
                                        stdout=stdout, stderr=stderr, timeout=30, check=False)
                evidence["logcatSnapshot"] = {"exitCode": result.returncode}
            except subprocess.TimeoutExpired:
                evidence["logcatSnapshot"] = {"timedOut": True}
        print(f"Capturing {args.seconds}s of full Logcat to {output}. Reproduce startup, Fox selection and lifecycle now.", flush=True)
        evidence["logcatCapture"] = capture_logcat(prefix + ["logcat", "-b", "all", "-v", "threadtime", "-T", "1"],
                                                   output / "logcat-live.txt", args.seconds)
        evidence["probes"]["memoryAfter"] = run(prefix + ["shell", "dumpsys", "meminfo", args.package])
        evidence["probes"]["gfxAfter"] = run(prefix + ["shell", "dumpsys", "gfxinfo", args.package])
        parsed = parse_logcat((output / "logcat-live.txt").read_text(encoding="utf-8", errors="replace"))
        (output / "logcat-analysis.json").write_text(json.dumps(parsed, indent=2), encoding="utf-8")
        evidence["finishedUtc"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        evidence["collectorError"] = str(exc)
        raise
    finally:
        save()
    return output


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial")
    parser.add_argument("--package", default="in.crushx.lens.pr3test")
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--apk", type=Path, help="Optional APK for offline manifest/hash evidence.")
    parser.add_argument("--manifest-tool")
    parser.add_argument("--install", action="store_true", help="Explicitly permit installing only the verified development test APK.")
    parser.add_argument("--expected-model", help="Required exact ro.product.model for --install, e.g. LE2123.")
    parser.add_argument("--build-info", type=Path)
    parser.add_argument("--parse-log", type=Path, help="Parse an existing full Logcat file without ADB.")
    args = parser.parse_args(argv)
    if not 1 <= args.seconds <= 600:
        parser.error("--seconds must be between 1 and 600.")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", args.package):
        parser.error("Invalid Android package ID.")
    if args.parse_log:
        print(json.dumps(parse_logcat(args.parse_log.read_text(encoding="utf-8", errors="replace")), indent=2))
        return 0
    try:
        print(collect(args))
        return 0
    except (ValueError, OSError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        parser.exit(2, f"Evidence collection blocked: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
