# Step 11 — v378 Android source integration gate (27 Oct 2026)

**Status: BLOCKED until exact owner-controlled source and original incremental installer are present.** This is a source audit, not an APK or Android test. GitHub browser PRs #17–#26 are stacked drafts and do not contain the latest v378 React/Capacitor tree.

## Version chain — do not mix
- v377 requires exact `20.376.0-v376` source and `INSTALL-V377.ps1` with preimage/payload SHA-256 verification, dry run and backup.
- v378 requires **exact `20.377.0-v377`** source and the **original** `INSTALL-V378.ps1`, according to the v378 README. Do not apply v378 directly to v375/v376 or reapply it to an already-updated v378 source.
- An already-updated tree must have `frontend/package.json` version `20.378.0-v378`, `frontend/src/lib/editor-export-boundary-v378.mjs`, `tests/v378/editor-end-frame-v378.test.mjs` and the native Android Gradle/manifest structure. All of these are **source markers only**, not device release gates.
- Previous v378 QA recorded **1,674 frontend Node PASS / 1 SKIP** when launched from `frontend/`, **146 backend Social PASS**, **37 focused tests PASS**, but **no Android Gradle/Unity/OnePlus APK or real MP4 export was executed**. Do not relabel that as our current integration result.

## Read-only checks
The Step 10 release gate now rejects standalone Gradle/package.json or v377 trees as latest v378. Run:

```powershell
python tools/release_readiness.py --output F:\CrushX-Artifacts\step11-gates.json
python tools/release_readiness.py --require-release-ready
```

The strict command intentionally fails while backend/device/security gates are absent. Use the separate `CrushX-v378-Step11-Safe-Integration-Preflight.zip` kit delivered in ChatGPT to inspect actual Windows source and vendor patch components without modifying either.

## Official vendor dry run (owner PC only)
After examining and verifying the extracted v378 installer:

```powershell
& 'F:\CrushX-v378-Update\INSTALL-V378.ps1' -Root 'F:\CrushX-v377\CrushX-v220' -DryRun
```

A successful vendor dry run is necessary, not sufficient. Preserve source backup, compare hashes and isolate credentials. Applying patches, running `npm ci`/build or installing APKs is an **explicit owner-controlled separate action**. Never copy this GitHub browser-preview `index.html`, `app-improvements.js` or sample ledger into the v378 `frontend/src` React runtime as if APIs match.

## Critical editor acceptance
Use 10s and 30s **real** multi-clip samples with captions/stickers at the final visible frame, a transition, licensed music and voiceover. Verify final rendered frame, decoded duration at 24/30/60 fps where supported, audio sync, Gallery save, draft restore, safe Back and crash/thermal behavior on OnePlus 9 Pro. The source-only final-frame hold is **not** proof that Android WebView/encoder emitted the last frame.

Production remains **NO-GO** pending exact v378 source, authorized staging backend, Unity license/build, real payments and two-device/OnePlus acceptance, plus owner approval.