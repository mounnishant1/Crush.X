#!/usr/bin/env python3
"""Offline Crush.X legacy-browser-to-Android port inventory; NEVER applies changes.

Consumes an immutable snapshot of changed paths in GitHub PR #17-28 and an
optional extracted Android app tree. Checks the target structure without running
source, resolving dependencies or issuing network requests. Does not claim
features were merged or that UI/backend/media actually work.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_VERSION = "20.402.0-v402"
MAX_PACKAGE_BYTES = 1024 * 1024
MAX_MANIFEST_BYTES = 1024 * 1024
REQUIRED = (
    "frontend/package.json",
    "frontend/android/app/src/main/AndroidManifest.xml",
    "frontend/src/lib/editor-export-boundary-v378.mjs",
    "tests/v378/editor-end-frame-v378.test.mjs",
)
GRADLE_FILES = ("frontend/android/app/build.gradle", "frontend/android/app/build.gradle.kts")


def _within(path: Path, directory: Path) -> bool:
    return path.resolve().is_relative_to(directory.resolve())


def _read_json(path: Path, max_bytes: int) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError("Missing, symlinked or oversized JSON input")
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise ValueError("JSON input must be an object")
    return data


def _kind(path: str) -> str:
    if path.startswith("UnityProjects/"):
        return "UNITY_NATIVE_MANUAL_REVIEW"
    if path.startswith("tests/"):
        return "TEST_REIMPLEMENT_OR_ADAPT"
    if path.startswith(("docs/", "tools/", ".github/")):
        return "SUPPORT_FILES_REVIEW_SEPARATELY"
    if "/" not in path and path.endswith((".js", ".html", ".css")):
        return "LEGACY_BROWSER_MANUAL_REIMPLEMENT"
    return "NO_AUTOMATIC_PORT_UNKNOWN"


def _safe_relative(path: str) -> bool:
    if (not isinstance(path, str) or not path or "\\" in path or
            path.startswith("/") or "\x00" in path):
        return False
    return all(part not in ("", ".", "..") and ":" not in part for part in path.split("/"))


def audit(manifest_path: Path, target_root: Path | None = None,
          expected_version: str = DEFAULT_VERSION) -> dict[str, Any]:
    manifest = _read_json(manifest_path, MAX_MANIFEST_BYTES)
    prs = manifest.get("prs")
    if not isinstance(prs, dict) or not prs or not all(
            isinstance(x, list) for x in prs.values()):
        raise ValueError("Manifest must contain PR -> path-list mapping")
    source_version = None
    source_state = "BLOCKED_NO_ANDROID_SOURCE"
    source_markers = {name: False for name in (*REQUIRED, *GRADLE_FILES)}
    warnings = ["No source integration or patching is performed."]
    version_matches = False
    target = target_root.resolve() if target_root is not None else None
    if target is not None:
        if target_root.is_symlink() or not target.is_dir():
            source_state = "BLOCKED_TARGET_NOT_DIRECTORY"
        else:
            for name in source_markers:
                item = target / name
                source_markers[name] = item.is_file() and not item.is_symlink()
            if source_markers["frontend/package.json"]:
                try:
                    package = _read_json(target / "frontend/package.json", MAX_PACKAGE_BYTES)
                    source_version = package.get("version")
                except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
                    warnings.append("Invalid frontend package.json")
            version_matches = source_version == expected_version
            critical = all(source_markers[name] for name in REQUIRED)
            gradle = any(source_markers[name] for name in GRADLE_FILES)
            react = (target / "frontend/src").is_dir()
            source_state = ("SOURCE_STRUCTURE_PRESENT_UNATTESTED" if critical and gradle
                            and react and version_matches else "BLOCKED_ANDROID_SOURCE_MISMATCH")
            if not version_matches:
                warnings.append("Android source version absent or different from expected version")
    changed_by_path: dict[str, list[int]] = {}
    for pr, paths in prs.items():
        try:
            pr_number = int(pr)
        except (TypeError, ValueError) as exc:
            raise ValueError("Invalid PR number in manifest") from exc
        for path in paths:
            if not _safe_relative(path):
                raise ValueError("Unsafe or invalid PR file path")
            changed_by_path.setdefault(path, []).append(pr_number)
    entries = []
    counts: dict[str, int] = {}
    for path, prs_for_path in sorted(changed_by_path.items()):
        category = _kind(path)
        counts[category] = counts.get(category, 0) + 1
        exists_in_target = ((target / path).is_file() or (target / path).is_symlink()) if source_state == "SOURCE_STRUCTURE_PRESENT_UNATTESTED" else None
        entries.append({
            "path": path, "changed_in_prs": sorted(set(prs_for_path)),
            "port_decision": category,
            "same_relative_path_in_target": exists_in_target,
            "collision_risk": "REVIEW_REQUIRED" if exists_in_target else (
                "UNKNOWN_TARGET" if exists_in_target is None else "NOT_SAME_PATH"),
            "automatic_copy_allowed": False
        })
    return {
        "schema_version": 1,
        "repo": manifest.get("repository"), "legacy_source_sha": manifest.get("source_head_sha"),
        "snapshot_date": manifest.get("observed_date"), "pr_count": len(prs),
        "changed_path_occurrences": sum(map(len, prs.values())),
        "unique_changed_paths": len(entries), "classification_counts": counts,
        "target": str(target) if target else None, "expected_version": expected_version,
        "observed_version": source_version, "version_matches": version_matches,
        "source_markers": source_markers, "android_source_state": source_state,
        "v402_archive_provenance_verified": False,
        "automatic_merge_allowed": False,
        "android_or_production_release_ready": False,
        "review_entries": entries,
        "warnings": warnings + [
            "Source markers and same-path overlap do not establish React API or Unity runtime compatibility.",
            "Approve and reimplement legacy browser UI against exact versioned Android source; do not overlay root index.html."
        ],
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", type=Path,
                   default=Path(__file__).resolve().parents[1] /
                   "docs/STEP13-PR17-28-PATH-INVENTORY.json")
    p.add_argument("--target-root", type=Path, help="Extracted Android source project root")
    p.add_argument("--expected-version", default=DEFAULT_VERSION)
    p.add_argument("--output", type=Path, help="New JSON report outside source and repository")
    p.add_argument("--require-verified-integration", action="store_true",
                   help="Fail closed: cannot prove integration from static source paths")
    args = p.parse_args(argv)
    if args.output:
        out = args.output.resolve()
        protected = [args.manifest.resolve().parent.parent,
                     *( [args.target_root.resolve()] if args.target_root else [])]
        if any(out.is_relative_to(d) for d in protected) or args.output.exists():
            p.error("Report must be a new file outside the source repository and target tree")
    result = audit(args.manifest, args.target_root, args.expected_version)
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 2 if args.require_verified_integration else 0


if __name__ == "__main__":
    raise SystemExit(main())
