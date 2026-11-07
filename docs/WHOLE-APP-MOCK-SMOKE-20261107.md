# Crush.X — Whole-app mock feature smoke, 7 November 2026

## Strict scope
Isolated branch \`audit/whole-app-mock-smoke-20261107\`, based on \`feature/dp-fullscreen-pinch-zoom-20261107\`. The branch contains the older **GitHub browser-preview** app, NOT the latest Windows \`F:\CrushX-Step259-Isolated\...\Windows-App-Work\frontend\` React/Capacitor tree. This test is designed to expose regressions in existing preview controls. It does **not** create fake messaging, payment, calling, AI model, camera, deployment, or cloud functionality.

Run \`node tests/whole-app-mock-smoke-browser.cjs\` against a localhost static server with Playwright installed via \`PLAYWRIGHT_MODULE\`. CI workflow \`.github/workflows/whole-app-mock.yml\` installs an isolated browser, starts \`python3 -m http.server 8000\`, runs checks and archives \`mock-audit-artifacts/mock-audit.json\` and \`mock-audit-artifacts/mock-gates.csv\` even when tests fail. It uses \`node:24\` for source tests.

## What the checks prove
Browser smoke cases exercise **actual visible controls in a local preview**:
Login/signup UI; Home like; Stories navigation; Reels deck; Explore; Profile/DP zoom; save/unsave; comment drafts; Create editor entry; Messages drafts; Group draft; Notes; unavailable voice/video calls; unavailable offline P2P; Activity; Live unavailable state; sandbox Coins balance and no INR payment; AURA-X consent; OS feature controls; Privacy; Account status disconnected state.

Every browser case loads a new isolated page, blocks all external requests, and fails on page JavaScript exceptions or attempted remote writes. All checks are independent; if one fails, remaining cases still run. Assertions are specific to real preview DOM/logic and never fabricate server responses. Exit code is nonzero when any mock assertion fails.

The word **Verified** in the generated report means **mock browser behavior verified on the exact CI checkout only**. The report separately shows **Blocked** for required real-service/native gates and **Untested** for Windows Vitest, Unity/Gradle and OnePlus device execution. A Green GitHub Actions run does not make blocked/untested work pass.

## Real release blockers
- Latest user Windows React/Capacitor source, v402+ provenance, actual local component/router wiring and full 324-test Vitest suite
- Saved Step306C result: **273 passed, 51 failed**, 22 failing test files; some failures may be stale mock contracts rather than live bugs. This GitHub check does NOT retest them
- Real Cognito/auth/OTP and reinstatement with verified AWS account/staging; last saved audit noted Identity 503/Dynamo AccessDenied
- Camera and Unity 6 AR Foundation/ARCore compile, MediaPipe graph, native rendering/recorded media and physical front-camera QA
- Real story/reel publishing, MP4 export, gallery and user data authorization, storage and event receipts
- Two real accounts/devices: DM/group delivery, WebRTC TURN, offline P2P encrypted pairing, FCM notification routes
- Real Live ingest/view/moderation, audited wallet & payment provider receipts, AURA-X model and permissioned action execution
- Signed release APK, real OnePlus 9 Pro interaction/logcat evidence, staging load/security tests, owner approval

## Reproducible next step on Windows
Run the Windows read-only source/build test audit on **the exact active working tree** (not the GitHub static demo or an old ZIP). Match the current source branch/revision, run frontend Vitest, production build, Android build, inspect APK package/hash, and preserve logs. Triage failing cases one cluster at a time. Do not weaken auth/media validation or delete tests to turn red into green.

No production integration, payment, data migration, AWS policy change or Android deployment is performed by this PR.
