#!/usr/bin/env python3
"""Read-only v402 Android port contract gate for legacy Crush.X browser fixes.

Never extracts, edits, merges or executes source code. Requires original ZIP
attestation from source_handoff_preflight BEFORE any ZIP metadata is inspected.
"""
from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path

MAX_MANIFEST_BYTES = 512 * 1024
MAX_SOURCE_FILE_BYTES = 1024 * 1024
MAX_REACT_FILES = 3000
SOURCE_EXTENSIONS = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".css")
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")


def checked_manifest(path: Path) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_MANIFEST_BYTES:
        raise ValueError("Missing, symlinked or oversized behavior manifest")
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    prs, contracts = data.get("pull_requests"), data.get("behavior_contracts")
    if not isinstance(prs, list) or not isinstance(contracts, list) or not contracts:
        raise ValueError("Invalid behavior contracts")
    numbers = []
    for pr in prs:
        num, sha = pr.get("number"), pr.get("head")
        if type(num) is not int or not HEX40.fullmatch(str(sha)):
            raise ValueError("Invalid PR metadata")
        numbers.append(num)
        for changed in pr.get("changed_paths", []):
            if (not isinstance(changed, str) or not changed or
                    changed.startswith("/") or "\\" in changed or
                    any(p in ("", ".", "..") for p in changed.split("/"))):
                raise ValueError("Unsafe PR path")
    if len(set(numbers)) != len(numbers) or not set(data.get("canonical_behavior_lineage", [])).issubset(numbers):
        raise ValueError("Invalid/duplicate PR numbers or lineage")
    if set(data.get("alternate_overlapping_prs", [])) & set(data.get("canonical_behavior_lineage", [])):
        raise ValueError("Conflicting alternative and canonical lineage")
    keys = [c.get("key") for c in contracts]
    if len(set(keys)) != len(keys) or not all(
        isinstance(c.get("key"), str) and
        isinstance(c.get("terms"), list) and c["terms"] and
        isinstance(c.get("tokens"), list) and c["tokens"] and
        all(isinstance(s, str) and s.isascii() and s for s in c["terms"] + c["tokens"])
        for c in contracts
    ):
        raise ValueError("Invalid behavior matching rules")
    return data


def _candidate_map(zip_path: Path, root_prefix: str, contracts: list[dict]) -> dict:
    """Inspect source-only JSX/TSX contents, not execute or modify files."""
    out = {c["key"]: [] for c in contracts}
    with zipfile.ZipFile(zip_path) as archive:
        files = sorted(
            (i for i in archive.infolist()
             if not i.is_dir() and i.filename.startswith(root_prefix + "frontend/src/")
             and i.filename.lower().endswith(SOURCE_EXTENSIONS)),
            key=lambda i: i.filename
        )
        if len(files) > MAX_REACT_FILES:
            raise ValueError("React source inventory exceeds safe scan limit")
        for info in files:
            # Oversized candidates are recorded by filename only; text isn't loaded.
            relative = info.filename[len(root_prefix):]
            path_lower = relative.casefold()
            text = ""
            if info.file_size <= MAX_SOURCE_FILE_BYTES:
                try:
                    text = archive.read(info).decode("utf-8", errors="replace").casefold()
                except (OSError, RuntimeError, UnicodeError, KeyError):
                    text = ""
            for c in contracts:
                path_hits = sorted(set(t for t in c["terms"] if t.casefold() in path_lower))
                text_hits = sorted(set(t for t in c["tokens"] if t.casefold() in text))
                if path_hits or len(text_hits) >= 2:
                    out[c["key"]].append({
                        "path": relative, "filename_terms": path_hits, "source_terms": text_hits,
                        "manual_review": True, "feature_verified": False,
                        "score": 3 * len(path_hits) + len(text_hits)
                    })
    return {key: sorted(value, key=lambda x: (-x["score"], x["path"]))[:20]
            for key, value in out.items()}


def audit(manifest: Path, archive: Path | None = None,
          trusted_sha256: str | None = None, inspector=None) -> dict:
    contracts = checked_manifest(manifest)
    status, reason, attestation, candidates = ("BLOCKED_NO_ATTESTED_V402_SOURCE",
                                                  "ORIGINAL_V402_ZIP_NOT_PROVIDED", None, {})
    if archive is not None:
        if trusted_sha256 is None or not HEX64.fullmatch(trusted_sha256):
            reason = "INDEPENDENT_SHA256_REQUIRED"
        else:
            if inspector is None:
                from source_handoff_preflight import inspect_archive
                inspector = inspect_archive
            evidence = inspector(archive, "20.402.0-v402", trusted_sha256)
            attestation = {
                "archive_sha256": evidence.get("archive_sha256"),
                "version": evidence.get("source", {}).get("source_version"),
                "trusted_sha256_match": evidence.get("trusted_sha256_match", False),
                "source_preflight_pass": evidence.get("source_preflight_pass", False),
                "reasons": evidence.get("reasons", [])
            }
            roots = evidence.get("source", {}).get("candidate_roots", [])
            if (attestation["source_preflight_pass"] and attestation["trusted_sha256_match"]
                    and attestation["version"] == "20.402.0-v402" and len(roots) == 1):
                candidates = _candidate_map(archive, roots[0], contracts["behavior_contracts"])
                status, reason = "ATTESTED_TARGETS_FOR_MANUAL_PORT_REVIEW", None
            else:
                reason = "V402_SOURCE_PREFLIGHT_FAILED"
    features = [{
        "feature": contract["key"], "priority": contract["priority"],
        "acceptance_behaviors": contract["expect"],
        "target_candidates": candidates.get(contract["key"], []),
        "status": ("MANUAL_REIMPLEMENT_AND_TEST" if status == "ATTESTED_TARGETS_FOR_MANUAL_PORT_REVIEW"
                   else "BLOCKED_NO_ATTESTED_V402_SOURCE"),
        "feature_integrated": False, "android_verified": False
    } for contract in contracts["behavior_contracts"]]
    return {
        "schema_version": 1,
        "status": status, "blocked_reason": reason,
        "source": attestation,
        "captured_prs": sorted(p["number"] for p in contracts["pull_requests"]),
        "canonical_browser_pr_chain": contracts["canonical_behavior_lineage"],
        "overlapping_alternatives_not_for_cherry_pick": contracts["alternate_overlapping_prs"],
        "manual_incorporation": contracts["incorporated_by_manual_adaptation"],
        "common_legacy_file_collisions": sorted({
            f for pr in contracts["pull_requests"] for f in pr["changed_paths"]
            if sum(f in x["changed_paths"] for x in contracts["pull_requests"]) > 1
        }),
        "behavior_workstreams": features,
        "automated_copy_allowed": False,
        "react_integrated": False,
        "android_apk_built": False,
        "device_tested": False,
        "production_release_ready": False,
        "notes": contracts["caveats"] + [
            "Matched source terms locate review targets only; they cannot prove feature parity.",
            "Do not copy root browser HTML/JS/CSS into Android React/Capacitor.",
            "Main/AWS/Unity/live payments not modified."
        ]
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", type=Path, default=Path(__file__).resolve().parents[1] /
                   "docs/STEP26-PR34-45-BEHAVIOR-PORT-CONTRACTS.json")
    p.add_argument("--archive", type=Path)
    p.add_argument("--trusted-sha256")
    p.add_argument("--output", type=Path, help="New report JSON, never overwrite")
    p.add_argument("--strict", action="store_true", help="Fail until source is independently attested")
    args = p.parse_args(argv)
    if args.trusted_sha256 and not args.archive:
        p.error("--trusted-sha256 requires --archive")
    if args.output:
        output = args.output.resolve()
        protected = [args.manifest.resolve().parent.parent]
        if args.archive:
            protected.append(args.archive.resolve())
        if args.output.exists() or args.output.is_symlink() or any(
            output == x or (x.is_dir() and output.is_relative_to(x)) for x in protected
        ):
            p.error("Report path must be NEW and outside the repository and original ZIP")
    result = audit(args.manifest, args.archive, args.trusted_sha256)
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as dest:
            dest.write(payload)
    print(payload, end="")
    return 2 if args.strict and result["status"] != "ATTESTED_TARGETS_FOR_MANUAL_PORT_REVIEW" else 0


if __name__ == "__main__":
    raise SystemExit(main())
