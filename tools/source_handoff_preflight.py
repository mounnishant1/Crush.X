#!/usr/bin/env python3
"""Crush.X source handoff preflight. Local, read-only, fail-closed.

Does NOT install, apply patches, merge branches, execute payloads, deploy,
inspect secrets, or claim Android/Unity/backend runtime verification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import stat
import unicodedata
import zipfile
from pathlib import Path

MAX_ENTRIES = 50000
MAX_UNCOMPRESSED_BYTES = 30 * 1024**3
MAX_SINGLE_FILE_BYTES = 8 * 1024**3
MAX_PACKAGE_BYTES = 1024 * 1024
MAX_COMPRESSION_RATIO = 500
MIN_RATIO_CHECK_BYTES = 8 * 1024 * 1024
WINDOWS_RESERVED = frozenset(("CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))))
MANDATORY = (
    "frontend/package.json",
    "frontend/android/app/src/main/AndroidManifest.xml",
)
GRADLE_ANY = ("frontend/android/app/build.gradle", "frontend/android/app/build.gradle.kts")
V378_MARKERS = (
    "frontend/src/lib/editor-export-boundary-v378.mjs",
    "tests/v378/editor-end-frame-v378.test.mjs",
)
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


def _digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _unsafe_name(name: str) -> bool:
    if (not name or "\\" in name or name.startswith("/") or
            "\x00" in name or any(ord(c) < 32 for c in name)):
        return True
    parts = name.rstrip("/").split("/")
    if not parts:
        return True
    for part in parts:
        # Windows-safe source ZIP paths: reject reserved device names, NTFS
        # specials and ambiguous trailing spaces/dots before any extraction.
        if (part in ("", ".", "..") or part[-1] in (".", " ") or
                any(c in '<>:"|?*' for c in part) or
                part.split(".", 1)[0].upper() in WINDOWS_RESERVED):
            return True
    return False


def _check_windows_tree(info: zipfile.ZipInfo, seen: dict[str, tuple[str, bool]]) -> bool:
    """Check implicit parent directories as well as explicit file names."""
    full = info.filename.rstrip("/")
    segments = full.split("/")
    for index in range(1, len(segments) + 1):
        actual = "/".join(segments[:index])
        canonical = unicodedata.normalize("NFC", actual).casefold()
        is_dir = index < len(segments) or info.is_dir()
        previous = seen.get(canonical)
        if previous is not None:
            prev_name, prev_is_dir = previous
            if prev_name != actual or prev_is_dir != is_dir or index == len(segments):
                return True
        else:
            seen[canonical] = (actual, is_dir)
    return False


def _manifest(paths: set[str], expected_version: str, read_package) -> tuple[dict, list[str]]:
    """Evaluate source markers, not feature correctness."""
    problems: list[str] = []
    candidates = []
    for item in paths:
        if item == "frontend/package.json" or item.endswith("/frontend/package.json"):
            prefix = item[: -len("frontend/package.json")]
            if all(prefix + required in paths for required in MANDATORY) and any(
                prefix + gradle in paths for gradle in GRADLE_ANY
            ):
                candidates.append(prefix)
    candidates.sort()
    if len(candidates) != 1:
        problems.append("ANDROID_PROJECT_ROOT_COUNT_" + str(len(candidates)))
        return {"candidate_roots": candidates, "source_version": None,
                "version_matches": False, "v378_export_markers": False,
                "android_gradle_manifest_present": False}, problems
    prefix = candidates[0]
    file_name = prefix + "frontend/package.json"
    try:
        data = json.loads(read_package(file_name))
        if not isinstance(data, dict):
            raise ValueError("package.json must be a JSON object")
        version = data.get("version")
    except (ValueError, UnicodeError, KeyError, OSError):
        version = None
        problems.append("FRONTEND_PACKAGE_INVALID")
    matched = version == expected_version
    if not matched:
        problems.append("SOURCE_VERSION_MISMATCH")
    markers = all(prefix + marker in paths for marker in V378_MARKERS)
    if not markers:
        problems.append("INHERITED_V378_EXPORT_MARKERS_MISSING")
    return {"candidate_roots": candidates, "source_version": version,
            "version_matches": matched, "v378_export_markers": markers,
            "android_gradle_manifest_present": True}, problems


def inspect_archive(path: Path, expected_version: str, trusted_sha256: str | None) -> dict:
    reasons = []
    report = {"input_type": "zip", "input": str(path), "expected_version": expected_version,
              "archive_sha256": None, "trusted_sha256_match": False, "zip_crc_ok": False,
              "zip_structure_ok": False, "source": {}, "reasons": reasons,
              "source_preflight_pass": False, "production_release_ready": False,
              "did_modify_source": False}
    if not path.is_file():
        reasons.append("ARCHIVE_NOT_FOUND")
        return report
    try:
        report["archive_sha256"] = _digest(path)
    except OSError:
        reasons.append("ARCHIVE_UNREADABLE")
        return report
    if trusted_sha256 is None:
        reasons.append("TRUSTED_ARCHIVE_SHA256_NOT_PROVIDED")
    elif not HEX64.fullmatch(trusted_sha256):
        reasons.append("TRUSTED_ARCHIVE_SHA256_INVALID")
    else:
        report["trusted_sha256_match"] = report["archive_sha256"] == trusted_sha256.lower()
        if not report["trusted_sha256_match"]:
            reasons.append("ARCHIVE_SHA256_MISMATCH")
    # Do not open or decompress untrusted ZIP contents with missing/wrong SHA.
    if reasons:
        return report
    try:
        with zipfile.ZipFile(path, "r") as archive:
            entries = archive.infolist()
            paths = set()
            seen: dict[str, tuple[str, bool]] = {}
            total = 0
            if len(entries) > MAX_ENTRIES:
                reasons.append("TOO_MANY_ZIP_ENTRIES")
            for info in entries:
                name = info.filename
                if _unsafe_name(name):
                    reasons.append("UNSAFE_ZIP_PATH")
                    break
                if _check_windows_tree(info, seen):
                    reasons.append("DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH")
                    break
                file_mode = (info.external_attr >> 16)
                if stat.S_IFMT(file_mode) == stat.S_IFLNK:
                    reasons.append("SYMLINK_IN_ARCHIVE")
                    break
                if info.flag_bits & 0x1:
                    reasons.append("ENCRYPTED_ZIP_ENTRY")
                    break
                if not info.is_dir():
                    total += info.file_size
                    if info.file_size > MAX_SINGLE_FILE_BYTES or total > MAX_UNCOMPRESSED_BYTES:
                        reasons.append("ZIP_EXPANSION_SIZE_LIMIT")
                        break
                    if (info.file_size >= MIN_RATIO_CHECK_BYTES and
                            info.file_size > MAX_COMPRESSION_RATIO * max(info.compress_size, 1)):
                        reasons.append("ZIP_COMPRESSION_RATIO_LIMIT")
                        break
                    paths.add(name)
            if any(x in reasons for x in (
                "TOO_MANY_ZIP_ENTRIES", "UNSAFE_ZIP_PATH",
                "DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH", "SYMLINK_IN_ARCHIVE",
                "ENCRYPTED_ZIP_ENTRY", "ZIP_EXPANSION_SIZE_LIMIT",
                "ZIP_COMPRESSION_RATIO_LIMIT"
            )):
                return report
            report["zip_structure_ok"] = True
            broken = archive.testzip()
            if broken:
                reasons.append("ZIP_CRC_FAILED")
                return report
            report["zip_crc_ok"] = True

            def read_package(name: str) -> str:
                entry = archive.getinfo(name)
                if entry.file_size > MAX_PACKAGE_BYTES:
                    raise ValueError("Package metadata too large")
                return archive.read(name).decode("utf-8-sig")
            report["source"], source_problems = _manifest(paths, expected_version, read_package)
            reasons.extend(source_problems)
            report["entry_count"] = len(entries)
            report["uncompressed_bytes"] = total
    except (zipfile.BadZipFile, OSError, RuntimeError, ValueError, EOFError, zipfile.LargeZipFile):
        reasons.append("ARCHIVE_CORRUPT_OR_UNREADABLE")
        return report
    report["source_preflight_pass"] = not reasons
    return report


def inspect_directory(root: Path, expected_version: str) -> dict:
    reasons = ["EXTRACTED_DIRECTORY_NOT_AUTHENTICATED_BY_ARCHIVE_SHA256"]
    report = {"input_type": "directory", "input": str(root),
              "expected_version": expected_version, "source": {}, "reasons": reasons,
              "source_preflight_pass": False, "production_release_ready": False,
              "did_modify_source": False}
    if not root.is_dir():
        reasons.append("DIRECTORY_NOT_FOUND")
        return report
    paths = set()
    for relative in (*MANDATORY, *GRADLE_ANY, *V378_MARKERS):
        path = root / relative
        if path.is_symlink():
            reasons.append("SYMLINK_SOURCE_MARKER")
        elif path.is_file():
            paths.add(relative)

    def read_package(name: str) -> str:
        path = root / name
        if path.stat().st_size > MAX_PACKAGE_BYTES:
            raise ValueError("Package metadata too large")
        return path.read_text(encoding="utf-8-sig")
    report["source"], source_problems = _manifest(paths, expected_version, read_package)
    reasons.extend(source_problems)
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument("--archive", type=Path, help="Full source ZIP (never extracted)")
    target.add_argument("--root", type=Path, help="Existing extracted project root (never changed)")
    p.add_argument("--expected-version", default="20.402.0-v402")
    p.add_argument("--trusted-sha256", default=None,
                   help="SHA256 from independently trusted original handoff, not from inside ZIP")
    p.add_argument("--output", type=Path, help="Optional JSON report path (outside source)")
    p.add_argument("--strict", action="store_true", help="exit 2 unless all ZIP checks pass")
    args = p.parse_args(argv)
    if args.root and args.trusted_sha256:
        p.error("--trusted-sha256 is only valid for --archive")
    if args.output:
        output_abs = args.output.resolve()
        if args.archive and output_abs == args.archive.resolve():
            p.error("Report output must not replace the source ZIP")
        if args.root and output_abs.is_relative_to(args.root.resolve()):
            p.error("Report output must be outside the inspected source tree")
        if args.output.exists() or args.output.is_symlink():
            p.error("Refusing to overwrite or follow an existing report path")
    result = (inspect_archive(args.archive, args.expected_version, args.trusted_sha256)
              if args.archive else inspect_directory(args.root, args.expected_version))
    result["warning"] = ("Preflight is not code integration, build, Android certification, "
                         "security approval or permission to deploy. No source writes are made.")
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 2 if args.strict and not result["source_preflight_pass"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
