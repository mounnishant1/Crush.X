# Crush.X Step 12 — v402 source-handoff audit (27 Oct 2026)

**Decision: BLOCKED / NO-GO. No production deployment or feature integration performed.**

## Evidence actually inspected
- GitHub `main`: `a4135f99987601e3fbcf6bbaa0b5af8c7598e8e1` (13 Oct 2026).
- GitHub draft PR #27 head: `63a1cbf6c650dc50e41066c57d42287290e7dc0f`. Its tree is an older browser UI plus Unity source; it does **not** include the full React/Capacitor Android application (`frontend/package.json`, Gradle/manifest tree).
- Draft PR #17–#27 contain unmerged changes; do not merge or copy old browser code blindly into a newer Android source.
- Available historical QA reports: v375 frontend 1,663 PASS, 1 SKIP; backend 146 PASS. v378 frontend 1,674 PASS, 1 SKIP; backend 146 PASS and 37 focused tests PASS. These reports were **not rerun on v402**.
- The actual v402 full-source ZIP, externally trusted SHA256, vendor incremental installers, Windows build and OnePlus 9 Pro acceptance were not accessible in this audit.

## Safe offline preflight
`tools/source_handoff_preflight.py` checks an **original full-source ZIP** without extracting or executing its contents: SHA256 vs an independently trusted hash, ZIP CRC, path traversal, case collisions, symlinks/encryption, expansion limits, exactly one Android source root, expected package version `20.402.0-v402`, Android Gradle/manifest and inherited v378 export markers. Outputs JSON; a source-only PASS is **never a build/device/release certification**. No network, AWS, payments or repo mutation.

Run after obtaining the reviewed original ZIP and trusted hash:

```powershell
python tools/source_handoff_preflight.py --archive 'F:\CrushX-Source\CrushX-v402-MERGED-FULL-SOURCE-20261027.zip' --expected-version '20.402.0-v402' --trusted-sha256 '<trusted_64_hex_sha256>' --output 'F:\CrushX-Reports\v402-preflight.json' --strict
```

Without a separately trusted hash, the strict source attestation intentionally fails. For an already extracted tree, `--root 'F:\...\CrushX-v220'` performs **structure-only** checks and cannot prove integrity.

## Conditional integration sequence — none of these were run
1. Preserve original ZIP and an isolated, untouched backup; record source SHA/version.
2. Obtain independent publisher SHA256, original patch manifest, and full source. Run offline preflight, abort on errors.
3. Confirm exact version chain: v377 requires v376; v378 requires v377. Do not reapply included patches or apply any patch to the wrong base. Review vendor installer before its own `-DryRun`.
4. On isolated Windows copy, verify Node >=24.15, `npm ci`, complete frontend/backend tests, Vite build and sanitized logs; do not borrow historical PASS counts.
5. Compare each behavior from PR #17–#27 against actual v402 React/Capacitor APIs. Resolve conflicts, write focused tests, port *only* approved behavior to a new integration branch, not to `main`.
6. Licensed Unity compilation and URP capture, Gradle/Firebase/native model validation, actual signed debug APK and device test.
7. Two-account staging auth/DM/calls/P2P, notifications, camera and editor export, real streaming, payment **sandbox**, AURA inference/consent, security/legal review and explicit release authorization.

## Specific blockers
- `NativeMediaCapture.cs`: URP/SRP capture is rejected without a validated renderer feature. Real Android MP4 output is unverified.
- `ARFoundationFaceProvider.cs`: `MouthOpen` and `Blink` are zero placeholders; real expression tracking is incomplete.
- Browser Coins wallet = demo; no real INR payment, authoritative server ledger, refunds or creator payout.
- Browser AURA-X = consented rule/demo; no verified cloud model, persisted account-scoped memory, autonomous tool execution or live voice.
- Real social APIs, WebRTC, nearby pairing, push, signed release and physical-device certification are outstanding.

**Safety:** no merge, force-push, APK installation, signing, AWS mutation, paid API, financial transaction, model training or production publish in this step.