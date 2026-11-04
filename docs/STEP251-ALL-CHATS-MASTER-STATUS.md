# Crush.X Step251 — All-chat master integration status
Date: 2026-11-04 (Asia/Kolkata)
Integration branch: `integration/all-chats-step251-20261104`

## Scope and non-goals
This branch is an **isolated GitHub source integration**, not a production deployment, not an Android APK, and not a verified copy of the user's latest Windows React/Capacitor application. Never overwrite the user's F: worktree just because a filename matches. No deployments or real payments are authorized.

## GitHub histories reconciled
- Base: `feature/story-secure-service-foundation-20261104`, carrying AURA-X/OS core, unified assistant, content-intelligence consent foundation, Story viewer + secure Story HTTP/backend through PR #64.
- PR #68: merged foreground message heads-up UI and Android FCM messaging/native push outbox history (PRs #61/#65).
- PR #70: merged compact Reels Friends DP, reply-sheet and profile-navigation changes (#55).
- PR #67: manually merged AURA-X durable queue and distributed rate-limiter code (#66), preserving Story route in `operating-system/host/staging-host.cjs`.
- PR #69: manually merged content intelligence HTTP/PostgreSQL/browser client code (#57) with additive `index.html` and `frontend.yml` changes.
- PR #72: manually merged real provider/feed/media analysis source (#53), preserving consolidated consent model, canonical taxonomy, and adding feed:personalize permissions only.
- AR/Lens review PR #73: separate draft source reconciliation from `feature/aura-x-real-video-asset-factory-20261104` (includes advanced native Camera/AR, lens games/puzzles, trend lens draft factory and video keyframes). Source-diff 376 paths: 173 identical, 167 copied, 24 Unity/native conflict resolutions from newer branch, 12 shared UI/test files retained from current integration. **Not merged into this branch unless review/QA accepts it.**

## Local Windows source still requires separate reconciliation
The prior Step250 archive was described as `CrushX-Step250-ALL-CHATS-MASTER-INTEGRATION-STAGING.zip` (~63 MB), with Step248 integrated Story/Live/Reels, Step249 merge/preflight, and a 14-file Unity overlay. That archive and `F:\CrushX-Step202\CrushX-v220` are not accessible to this GitHub integration runtime. The Windows app, Editor, Avatar, Story animation, Live, and on-device flows must be reconciled in a **separate clean worktree** with exact hashes, backups, import-level review and regression testing.

## DO NOT CLAIM DONE BEFORE
1. Audit Step250 ZIP SHA/CRC and Step249 preflight in Windows without overwriting source.
2. Compare latest app React/Capacitor sources against GitHub/browser-specific code, port by feature contract (not blind root `index.html` replacement).
3. Reconcile AR candidate PR #73 and any failed CI checks.
4. Run whole-app frontend/backend tests, security, contract and release gates.
5. Unity 6.0.30f1 compilation and Android ARM64 IL2CPP export (MediaPipe/model licenses and ARCore graph included).
6. Build/install debug APK and test on OnePlus 9 Pro (Android 14): front camera, recorded media, Editor Save/Publish, Story, Reels, messages and notifications, account back/keyboard, lens games.
7. Isolated staging Cognito/API/Dynamo/Postgres/FCM/IVS, two-account permissions, real providers, wallet sandbox and event receipts.
8. Production deployment, billing/live payment, real messaging and signing only after explicit owner approval.

## No unsupported assertions
Browser tests are not a physical phone run. GitHub merge is not a Windows app merge. A CI pass is not a Unity/IL2CPP pass. A source asset factory is not a live autonomous internet-scraping or lens deployment service. Keep one unified AURA-X assistant; maintain consent, owner/user authorization and audit. Never bypass asset licensing/review or payment approval.
