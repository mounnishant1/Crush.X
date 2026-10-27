#!/usr/bin/env python3
"""Fail-closed Crush.X integration/release audit (metadata only, no credentials, no deployment).

Source presence is never proof of device behavior, server security, financial settlement,
store compliance, or a production release. Zero network calls or write-side effects.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _item(name: str, status: str, evidence: str, next_action: str) -> dict[str, str]:
    return {"gate": name, "status": status, "evidence": evidence, "next_action": next_action}


def audit(source_root: Path) -> dict[str, Any]:
    root = source_root.resolve()
    has = lambda filename: (root / filename).is_file()
    gates: list[dict[str, str]] = []
    web_source = has("index.html") and has("app-improvements.js")
    gates.append(_item(
        "browser_source", "SOURCE_PRESENT" if web_source else "BLOCKED",
        "Older browser-local sample, not proof of v378 Android parity." if web_source else "Browser sample source not found.",
        "Keep local-only banner and source/browser regressions; do not promote sample functionality to real backend claims."
    ))
    cap_sources = all(has(name) for name in (
        "frontend/package.json", "frontend/android/app/build.gradle",
        "frontend/android/app/src/main/AndroidManifest.xml"
    ))
    gates.append(_item(
        "latest_capacitor_android_source", "SOURCE_PRESENT_UNVERIFIED" if cap_sources else "BLOCKED",
        "Capacitor Android source indicators present, but no build is proven." if cap_sources
        else "This checkout lacks the complete latest frontend/Capacitor Gradle project.",
        "Import the exact owner-approved latest Android source, record SHA and compare to installed package."
    ))
    unity_source = has("UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraSwipe.cs")
    gates.append(_item(
        "unity_camera_lenses_export", "SOURCE_PRESENT_UNVERIFIED" if unity_source else "BLOCKED",
        "Unity C# source exists; Editor compilation, license, ARCore and export are not verified."
        if unity_source else "Unity lens source not found.",
        "Compile with licensed Unity Editor; run EditMode tests, verify selfie camera, face tracking, URP and real MP4 export."
    ))
    ledger_sample = has("coins-ledger-sandbox.js") and has("docs/live-inr-ledger-production-boundaries.md")
    gates.append(_item(
        "wallet_billing_inr", "DEMO_ONLY" if ledger_sample else "BLOCKED",
        "Client-only demo ledger; no INR capture, provider settlement, tax approval or server-owned ledger."
        if ledger_sample else "No demo ledger or billing contracts found.",
        "Approve merchant integration and server-side double-entry postings; test signed webhooks, refunds, payout reconciliation."
    ))
    aura_sample = has("aura-x-policy.js") and has("aura-x-assistant.js")
    gates.append(_item(
        "aura_x_agents_memory", "DEMO_ONLY" if aura_sample else "BLOCKED",
        "Local rule-based guidance and page-memory grants; not a verified cloud model, tool executor or per-account memory."
        if aura_sample else "AURA-X local safety modules are missing.",
        "Verify Cognito-bound consent, secure backend permissions, model behavior, human approvals and audit logs in staging."
    ))
    # These gates require independent authoritative evidence, not a filename or user-supplied boolean.
    required_external = (
        ("authenticated_cloud_backend", "API Gateway/Lambda, database, upload, moderation and authorizer deployment not verified.",
         "Provide read-only AWS staging inventory, API contracts, signed request traces and sanitized authorized integration tests."),
        ("messages_calls_p2p", "Sample-only drafts; no verified real DM, WebRTC TURN or encrypted nearby device transport.",
         "Run two-account/two-device delivery, E2EE/pairing, denial, group/admin, call reconnection and offline verification."),
        ("notifications_2fa_privacy", "Push provider, real per-account settings, 2FA and cross-device security not verified.",
         "Run isolated Cognito staging auth, push fanout, account isolation and accessibility/privacy cases."),
        ("production_media_and_music", "No proven rendered media export, music license audit or production playback performance.",
         "Test licensed media rights, export frame/audio sync, codec/gallery save, segmentation and real device memory/thermal."),
        ("android_signed_release_and_install", "No verified release APK/AAB SHA, package/version/signing chain or Play Console artifact.",
         "Build from locked source, inspect signed manifest, compare SHA and test install/launch/rollback on intended devices."),
        ("physical_oneplus_acceptance", "No current signed Android device evidence for this source commit.",
         "Capture authorized OnePlus and second-device tests, AR tracking, accessibility, lifecycle, permissions and crash logs."),
        ("production_security_and_owner_approval", "Security/privacy/legal/owner release approval not supplied; production deployment prohibited.",
         "Obtain independent security, finance/legal reviews and explicit owner-controlled deployment approval.")
    )
    gates.extend(_item(name, "BLOCKED", evidence, action) for name, evidence, action in required_external)
    all_verified = all(gate["status"] == "VERIFIED" for gate in gates)
    return {
        "schema_version": 1,
        "scope": "older GitHub browser sample and Unity source; NOT latest v378 Android evidence",
        "production_release_ready": all_verified,
        "blocker_count": sum(gate["status"] != "VERIFIED" for gate in gates),
        "warning": "SOURCE_PRESENT and DEMO_ONLY are not runtime or production verification. No network/deployment action is performed.",
        "gates": gates,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, help="Write an optional read-only report JSON to this local path.")
    parser.add_argument("--require-release-ready", action="store_true",
                        help="Exit 2 while any release gate lacks authoritative verification.")
    args = parser.parse_args()
    result = audit(args.root)
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 2 if args.require_release_ready and not result["production_release_ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
