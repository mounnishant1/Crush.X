# Crush.X Step 13 — Cross-architecture port audit (27 October 2026)

**Status: SOURCE-INTEGRATION BLOCKED.** No v402 full-source bytes were available, so this is a review inventory, not an implementation, merge, Android build, or release.

## Verified source path inventory

The connected GitHub repo `mounnishant1/Crush.X` has a historical **root-level browser sample** plus Unity source; the separately maintained full React/Capacitor Android app is not in its reviewed commit. Changed-file paths were retrieved from PR #17–#28, and pinned in `docs/STEP13-PR17-28-PATH-INVENTORY.json` with its observed head SHA. There are **55 changed-path occurrences, 32 distinct paths**. Classifications (unique paths):

- **13 root browser HTML/CSS/JS paths:** React/Capacitor requires manual behavior adaptation; no direct file overlay.
- **3 Unity native C# paths:** compare existing v402 code, scene/meta/dependencies and perform Unity/ARCore build; overlapping same path is a conflict risk, not evidence a change is correct.
- **9 test paths:** adapt test harness to target framework; never equate browser Playwright PASS with Android UI PASS.
- **4 docs, 2 tools and 1 GitHub workflow paths:** independently review release constraints and CI configuration; do not overwrite newer configuration.

PR #17 selector/layout -> #18 Reels swipe -> #19 Profile/Explore -> #20 player/Stories/Post -> #21 Unity camera/Story export -> #22 local DM/group drafts -> #23 privacy/notifications -> #24 Live/demo wallet -> #25 AURA local consent -> #26 release audit -> #27 v378 gate -> #28 v402 preflight. All remain unmerged drafts and stacked on historical code at audit time.

## Implemented offline audit command

The new tool `tools/integration_port_audit.py` consumes the pinned PR path inventory. Without any v402 source, it emits **BLOCKED_NO_ANDROID_SOURCE** and all 32 manual review decisions. If an extracted project is provided, it checks the exact expected version, Android Gradle/manifest, frontend/src and inherited v378 end-frame export markers, then checks same-path collision risk. It **never** applies a patch or performs automatic merge. A valid-looking directory is still **SOURCE_STRUCTURE_PRESENT_UNATTESTED**, not verified.

From a checkout of the new draft branch, on a Windows machine containing the independently validated *original* v402 full source:

```powershell
python tools/integration_port_audit.py --target-root 'F:\CrushX-v402\CrushX-v220' --expected-version '20.402.0-v402' --output 'F:\CrushX-Reports\step13-port-inventory.json'
```

To insist on verified integration (intentionally fails in this source-only audit):

```powershell
python tools/integration_port_audit.py --target-root 'F:\CrushX-v402\CrushX-v220' --require-verified-integration
```

The script has no network, subprocess to app tools, mutation, deployment or payment calls; only explicitly requested JSON report output *outside* the inspected tree and repo. It will not overwrite existing reports.

## Required before any actual source changes

1. Independently authenticate the v402 original full ZIP, SHA256, package version, source layout and vendor incremental chain with the Step 12 preflight. A file name or version string is not enough.
2. Compare each affected behavior against **actual** v402 React screen/component/routing/API contracts, not just similar names. Categorize as existing/superseded/missing/conflicting.
3. For each approved missing behavior, create a target-platform implementation and focused regression, preserving global full-screen navigation, reliable Back, touch targets, keyboard safe areas, and one-swipe-one-reel.
4. Treat Unity capture as separate high risk: `NativeMediaCapture.cs` currently rejects URP/SRP capture without a renderer feature; `ARFoundationFaceProvider.cs` has placeholders for blink and mouth opening. Require licensed Unity build, real self-facing camera validation and frame/audio capture, plus device evidence.
5. Keep wallet and AURA browser demo code out of authoritative payments, social tool permissions and streaming. Use isolated staging and security/financial reviews.
6. Run Node/Vite, backend, Gradle, Unity, staging, signed APK and OnePlus + second device acceptance. Do not claim source-only tests certify real behavior.
7. Review and approve patches in a separated target integration branch with explicit owner permission. No `main` merge, deploy or release without completed gates.

## CI and safety

This branch adds `tests/test_integration_port_audit.py` with 9 synthetic fixtures for version mismatch, absent source, missing export marker, same-path conflict and fail-closed execution/report output. **Tests can prove the tool's behavior only; they cannot substitute the missing v402 artifact.**

No production AWS, INR billing, release signing, APK build, app content publication or code merge is part of Step 13.
