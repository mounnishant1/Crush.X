#!/usr/bin/env python3
"""Crush.X read-only v402 source/feature candidates. No automatic porting."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import zipfile
from source_handoff_preflight import inspect_archive

MAX_MANIFEST_SIZE = 1024 * 1024

FEATURES = (
    ("navigation_fullscreen", "P0", (17,18,19,23,26), ("app-improvements.js","app-experience.css"), ("route","navigation","screen","layout","back")),
    ("home_feed", "P1", (18,19), ("app-improvements.js",), ("feed","home","post")),
    ("search_explore", "P1", (19,), ("app-improvements.js",), ("explore","search")),
    ("profile_highlights", "P1", (19,), ("app-improvements.js",), ("profile","highlight","follow")),
    ("reels_player_gestures", "P0", (18,19,20), ("app-improvements.js",), ("reel","video","player")),
    ("stories_stickers_export", "P0", (20,21), ("story-editor.js",), ("stor","sticker","editor")),
    ("posts_repost_share", "P1", (19,20), ("app-improvements.js",), ("post","repost","share")),
    ("editor_mp4_audio_captions", "P0", (21,), ("story-editor.js",), ("editor","timeline","export","caption","audio")),
    ("camera_unity_lenses", "P0", (21,), ("UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraSwipe.cs", "UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraPermissionGate.cs"), ("camera","lens","capture","ar")),
    ("messages_groups_voice", "P0", (22,), ("app-improvements.js",), ("message","chat","group","voice")),
    ("calls_nearby_p2p", "P0", (22,), ("app-improvements.js",), ("call","rtc","nearby","p2p","offline")),
    ("notifications_privacy", "P1", (23,), ("heads-up-notifications.js","permissions-center.js","social-notifications.js"), ("notification","permission","privacy","activity")),
    ("live_streaming", "P0", (24,), ("live-gifting-preview.js",), ("live","stream","broadcast")),
    ("coins_inr_billing", "P0", (24,), ("coins-ledger-sandbox.js",), ("wallet","coin","gift","payment","ledger")),
    ("aura_x_agent", "P0", (25,), ("aura-x-assistant.js","aura-x-policy.js"), ("aura","assistant","agent","consent")),
    ("auth_account_security", "P0", (23,25), ("permissions-center.js","aura-x-policy.js"), ("auth","account","cognito","login","security")),
)

def _snapshot(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_MANIFEST_SIZE:
        raise ValueError("Missing/symlinked/oversized PR path inventory")
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict) or not isinstance(data.get("prs"), dict):
        raise ValueError("Invalid manifest structure")
    for pr, paths in data["prs"].items():
        if not pr.isdigit() or not isinstance(paths, list) or not all(isinstance(s, str) for s in paths):
            raise ValueError("Invalid PR path mapping")
    return data

def _target_entries(path, prefix):
    # Caller invokes ZIP SHA, structure, and CRC checks first.
    with zipfile.ZipFile(path) as z:
        rel = {info.filename[len(prefix):] for info in z.infolist()
               if not info.is_dir() and info.filename.startswith(prefix)}
    rel.discard("")
    react = sorted(x for x in rel if x.startswith("frontend/src/") and
                   x.lower().endswith((".js",".jsx",".ts",".tsx",".mjs",".css")))
    return rel, react

def audit(manifest, archive=None, sha256=None, expected_version="20.402.0-v402"):
    snap = _snapshot(manifest)
    original = None
    names, react = set(), []
    authenticated = False
    if archive is not None:
        original = inspect_archive(archive, expected_version, sha256)
        if original["source_preflight_pass"]:
            roots = original["source"].get("candidate_roots", [])
            if len(roots) == 1:
                names, react = _target_entries(archive, roots[0])
                authenticated = True
    planned = []
    collisions = 0
    for name, priority, affected_prs, legacy_paths, tokens in FEATURES:
        touched = sorted(int(pr) for pr, paths in snap["prs"].items()
                         if int(pr) in affected_prs and any(x in paths for x in legacy_paths))
        candidates = sorted(x for x in react
                            if any(term in x.casefold() for term in tokens))[:15]
        conflicts = sorted(x for x in legacy_paths if x in names)
        collisions += len(conflicts)
        planned.append({
            "feature":name, "priority":priority, "legacy_prs_with_evidence":touched,
            "legacy_files":list(legacy_paths), "target_file_name_candidates":candidates,
            "same_relative_path_conflicts":conflicts,
            "status": ("BLOCKED_NO_ATTESTED_V402_ZIP" if not authenticated else
                       "REVIEW_SOURCE_CANDIDATES" if candidates else "REVIEW_NO_FILENAME_CANDIDATE"),
            "feature_verified":False, "automatic_copy_allowed":False,
            "review_requirement":"Inspect actual React APIs, targeted tests and Android/Unity device behavior"
        })
    return {
        "schema_version":1,
        "classification":"filename matching only, NOT semantic code parity",
        "repository":snap.get("repository"), "snapshot_head_sha":snap.get("source_head_sha"),
        "target_version":expected_version, "v402_zip_attested":authenticated,
        "source_preflight":original and {key:original[key] for key in
            ("archive_sha256","source_preflight_pass","reasons","source","production_release_ready")},
        "react_code_file_count":len(react), "direct_legacy_path_conflicts":collisions,
        "feature_count":len(planned), "features":planned,
        "status":"SOURCE_REVIEW_READY_ONLY" if authenticated else "BLOCKED_NO_ATTESTED_V402_ZIP",
        "feature_integration_complete":False,"production_release_ready":False,
        "no_source_or_project_writes":True,
        "next_action":"Provide original v402 full ZIP and independently trusted SHA256; review, never blindly copy browser code"
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",type=Path,default=Path(__file__).resolve().parents[1]/"docs"/"STEP13-PR17-28-PATH-INVENTORY.json")
    parser.add_argument("--archive",type=Path)
    parser.add_argument("--trusted-sha256")
    parser.add_argument("--expected-version",default="20.402.0-v402")
    parser.add_argument("--output",type=Path)
    parser.add_argument("--require-attested-source",action="store_true")
    args=parser.parse_args(argv)
    if args.trusted_sha256 and args.archive is None:
        parser.error("--trusted-sha256 requires --archive")
    if args.output:
        out=args.output.resolve()
        if out.is_relative_to(args.manifest.resolve().parent.parent) or args.output.exists() or (args.archive and out==args.archive.resolve()):
            parser.error("JSON report must be new, outside repository and original ZIP")
    result=audit(args.manifest,args.archive,args.trusted_sha256,args.expected_version)
    payload=json.dumps(result,ensure_ascii=False,indent=2)+"\n"
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(payload,encoding="utf-8")
    print(payload,end="")
    return 2 if args.require_attested_source and not result["v402_zip_attested"] else 0

if __name__=="__main__":
    raise SystemExit(main())
