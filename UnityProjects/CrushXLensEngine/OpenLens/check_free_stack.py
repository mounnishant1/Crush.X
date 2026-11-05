#!/usr/bin/env python3
"""Fail-closed source preflight for the Crush.X no-third-party-brand camera stack.

Run:
    python OpenLens/check_free_stack.py
    python OpenLens/check_free_stack.py --release

This does NOT replace a full OSS legal review, SBOM, build, or runtime QA.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "OpenLens" / "approved-providers.json"
PROHIBITED_TOKENS = (
    "com.snap.camerakit", "snap-camera-kit",
    "com.banuba", "com.deepar", "com.gpupixel",
    "marsface", "mars-face",
)
APPROVED_RUNTIME = {
    "crushx-unity-lens-engine",
    "unity-arfoundation-arcore",
    "mediapipe-face-landmarker",
    "crushx-original-urp-shaders",
}
SOURCE_EXTENSIONS = {".cs", ".java", ".gradle", ".gradle.kts", ".xml"}


def audit(release: bool = False) -> list[str]:
    errors = []
    info = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if info.get("schema_version") != 1:
        errors.append("Unrecognized provider manifest schema")
    names = set()
    for item in info["providers"]:
        provider_id = item["id"]
        if provider_id in names:
            errors.append("Duplicate provider id: " + provider_id)
        names.add(provider_id)
        if item["packaged"] and provider_id not in APPROVED_RUNTIME:
            errors.append("Unapproved provider marked as packaged: " + provider_id)
        if item["packaged"] and item["public_branding"]:
            errors.append("Third-party branding requested by packaged provider: " + provider_id)

    # Only inspect runtime/native/build source. Do not read guides, readmes,
    # license docs or the provider manifest, which describe excluded names.
    for base in (ROOT / "Assets" / "Scripts", ROOT / "Assets" / "AndroidNative",
                 ROOT / "Assets" / "Editor", ROOT / "Packages"):
        if not base.exists():
            continue
        for file in base.rglob("*"):
            if not file.is_file() or file.suffix.lower() not in SOURCE_EXTENSIONS \
                    and file.name != "manifest.json":
                continue
            if file.name.endswith(".meta"):
                continue
            try:
                content = file.read_text(encoding="utf-8", errors="replace").lower()
            except OSError as ex:
                errors.append("Unable to audit " + str(file) + ": " + str(ex))
                continue
            for banned in PROHIBITED_TOKENS:
                # Do not automatically pull a trial/proprietary SDK into
                # our release. Any integration requires owner + legal review.
                if banned in content:
                    errors.append(f"Review required: {file.relative_to(ROOT)} contains {banned}")

    if release:
        for key, done in info["release_gates"].items():
            if not done:
                errors.append("Release gate not verified: " + key)
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", action="store_true",
                        help="require every device, license and artifact gate")
    args = parser.parse_args()
    failures = audit(args.release)
    if failures:
        print("FREE LENS STACK PRE-FLIGHT FAILED")
        for error in failures:
            print(" - " + error)
        sys.exit(1)
    print("FREE LENS STACK source policy preflight passed "
          "(NOT a legal clearance, Unity build, or device test).")
