# Crush.X — Whole-App Pending Acceptance Gates (27 October 2026)

**Scope:** Actual user-requested Android React/Capacitor app, Unity AR engine, social backend, media editor, AURA-X, Live and wallet. **This document is a release acceptance checklist, NOT proof that anything here works.** The connected GitHub tree is an older browser sample and a separate Unity source. Original v402 full Android ZIP has not been provided or independently attested. Browser CI does not certify an APK.

## Source provenance / integration — P0
- [ ] Exact v402 full source ZIP + independent SHA256; verify version, files, official patch ancestry, signed manifest, source hashes and rollback backup.
- [ ] Compare old browser sample PR #17–37 line-by-line with *actual* React/Capacitor routes/components; do not copy sample root JS/HTML wholesale.
- [ ] Port only approved missing behavior with type/API and authorization tests. Review every conflict and dependency; no silent overwrite.
- [ ] Node >=24.15, clean install, tests and production bundle on owner Windows PC; record SHA and sanitized build logs.
- [ ] Isolated debug APK Gradle build, Firebase config, TFLite model, signing keystore provenance (never upload secrets), install/launch, Android 14 acceptance.

## User interface, screen flow, icons & gestures — P0/P1
- [ ] Every secondary route is full-screen rather than center-modal: profile/followers/following/highlights/edit/settings, message list/new/group/requests/details, reels/stories/camera/editor, Search/Collections, Activity/Privacy.
- [ ] Hardware/system Back, toolbar Back, deep links, forward/back browser history, reentrant overlays, logout, keyboard open/close and accessibility/focus restore.
- [ ] Safe areas (status/nav bars), edge-to-edge layout, portrait/landscape, 320–900px viewport, touch target >=44px where practical; no black overlays or invisible buttons.
- [ ] Smooth independent scrolling in feed/profile/comments/share/GIF/sticker sheets, no body scroll bleed; half→full sheets when intended.
- [ ] Reel one gesture→one item on touch, wheel and Arrow keys. Long-press upper=2x, lower=pause; tap mute; scrub, persistent sound state, double-like, hide controls, thin progress.
- [ ] Story gesture pointer ownership, 1 swipe→1 Story, pause/resume, input/keyboard, poll/quiz/questions/countdown, Close Friends, drafts, media reactions and lifecycle.

## Content & discovery — P1
- [ ] Home/Following feed paging and loader animation, media fallback without infinite retries, post carousel, repost, comments/replies/pin/edit/delete, bookmark collection.
- [ ] Search live people/audio/hashtags/grid and deep-link Reel player/profile with accurate route return.
- [ ] Profile proper username routing, followers/following authorized counts, highlights add/cover/view, repost and pinned grids, privacy rules.
- [ ] Post/Reel/Story real publish, retry/idempotency, deletion, recently deleted, drafts, schedule, audience close-friends and tag notifications.

## Camera, lenses and editing — P0
- [ ] Front selfie camera default, ARCore capabilities and correct non-inverted preview orientation, 2D/3D face mask tracking, smile/blink/mouth + face/hand tracking with unsupported-device fallback.
- [ ] Camera ring/tap-photo/hold-record, one swipe→one lens, carousel/favorites/recents, microphone permission once, 3D lens alignment.
- [ ] Unity 6 license/compilation, URP camera capture feature (currently unsupported in old GitHub native source), Android recorder and saved MP4 integrity; prevent broken partial files.
- [ ] Editor trim/split/speed curves/transitions, multiple audio tracks, beat sync, noise reduction, stickers/GIF/text editing, word-level captions, segmentation and cover selection.
- [ ] Real MP4 export: final frame, valid codec/duration, A/V sync, 10s/30s multi-clip, license-free test music only, Gallery save, draft crash recovery, thermal/performance.

## Identity, messages, calls, notifications — P0
- [ ] Cognito account/session, Google login, OTP branding, MFA/2FA, privacy/account-center, account isolation and tenant-scoped authorization.
- [ ] Real DMs/groups with authenticated server delivery, chat history, receipts, typing, attachment/voice upload, abuse checks, admin/requests/disappearing and scheduling.
- [ ] WebRTC voice/video: authenticated signaling, TURN/ICE and network reconnection, incoming ringing in background, Bluetooth/camera/mute/permissions and two phones.
- [ ] Offline nearby: consented discovery, pairing QR/4-digit verification, encryption, trusted device reconnection and real no-internet two-device acceptance.
- [ ] Push notifications Android foreground/background/killed state, opt-in, private previews, sync, deep links and account/logout safety.

## Live, wallet & AURA-X — P0
- [ ] Real authenticated live ingest, playback, moderation, reconnect, viewer counts and stream lifecycle. Old GitHub Live view is demo only.
- [ ] Server-owned double-entry Coins and INR ledger, signed gateway order/webhook validation, idempotency and concurrency, pending/available creator balances, refunds/chargebacks, reconciliation, legal/store/payment compliance. Do NOT connect real money to browser demo.
- [ ] Unified single AURA-X interface: real model gateway, account-scoped consented memory, export/correct/delete, voice, permissioned tools, approval expiry, audit logs and multi-language benchmarks.
- [ ] Backend IAM/permissions, environment separation, media rights, privacy/security review, monitoring, data retention and explicit owner release approval.

## Evidence tags (cannot be substituted)
- SOURCE_PRESENT = file exists; not a functioning runtime.
- BROWSER_CI_PASS = browser/mock tests pass; not APK device evidence.
- ANDROID_BUILD_PASS = Gradle/Unity build and signed test artifact actually produced, hash captured.
- DEVICE_PASS = Android 14 OnePlus 9 Pro real interaction/video export/camera tests, with sanitized logs.
- TWO_DEVICE_PASS = secure calls, messaging/offline P2P cross-device tests.
- STAGING_PASS = authorized staging backend and account-scoped tests, not production.
- FINANCIAL_APPROVAL = gateway/compliance/transactional ledger and independent signoff.
- RELEASE_READY = ALL relevant independent gates passed and owner explicitly approved release.

**Current recorded status as of this source review:** GitHub browser fixes are draft PRs, *not merged or integrated into v402*. v402 full source missing from available inputs; Android/Unity/device, staging, wallet and real AURA-X release gates remain NOT VERIFIED. No production deployment was attempted.
