# Crush.X — Step 10 integration audit and Android release checklist
**Date:** 27 Oct 2026. Scope: GitHub browser-sample source and Unity source stacked on Step 9.
**Release verdict: NO-GO.** No PR merge, deployment, device installation or AWS mutation performed.

## What is actually verified
- GitHub browser regression suites cover sample Stories, Reels, Posts, Explore, Profiles, local Messages/voice drafts, notifications/privacy, Live demo coin wallet and one local AURA-X assistant entry.
- Ledger sandbox has balanced integer postings, gift replay idempotency and no live INR capture/credit/payout.
- AURA-X browser-local rules have consent/expiry and ephemeral notes. No real model, agent action, remote memory or account subject authorization was verified.
- Unity camera/lens Java/C# source tests are NOT Unity Editor compile or ARCore device acceptance.
- Step 10 adds automatic cleanup of transient dialogs/editors during routes and Back changes, to be validated in browser CI.

## Machine-readable fail-closed audit
Run from this checked-out repository, with Python 3:

    python tools/release_readiness.py --output release-readiness.json
    python tools/release_readiness.py --require-release-ready

The first command succeeds when it writes an **accurate audit**, even if NOT release ready.
The second exits nonzero until independently verified release gates are met. Neither command
touches AWS/Android devices, changes production, or creates credentials.

## Current independent acceptance gates
| Gate | Status | Required evidence |
| --- | --- | --- |
| Latest v378 React + Capacitor Android source | BLOCKED | Exact owner-approved frontend/package.json, Android Gradle project and locked source SHA |
| Navigation / touch / UI | Browser QA only | Android Back, keyboard, modal, tab, scroll, 320px/safe-area real-device matrix |
| Media Editor / Camera | BLOCKED | Rendered frame/audio preview, effects, GIF, export/gallery MP4, front selfie orientation |
| Unity face and lens engine | BLOCKED | Licensed Editor compilation, NUnit, ARCore tracking, native face mask and capture |
| Auth and Account Center | BLOCKED | Isolated Cognito staging, JWT-authorized APIs, MFA/2FA behavior and cross-account isolation |
| Messages, Groups and Calls | BLOCKED | Live DM/group receipts and two-device voice/video TURN/ICE reconnection |
| Offline nearby P2P | BLOCKED | Consent to discovery, QR/4-digit verification, encrypted nearby device transport |
| Notifications | BLOCKED | Authenticated push, opt-in, background and cross-device read/mute state |
| AURA-X | BLOCKED | Verified model gateway, approval queue, persistent scoped consent and auditable tool policy |
| Live video streaming | BLOCKED | Authorized media ingest/playback, moderation, reconnect, device camera/mic |
| Coins Wallet and INR gifts | BLOCKED | Gateway verified callbacks, server-owned ledger, idempotency, refunds, settlement/payout |
| Security, legal and privacy | BLOCKED | Penetration assessment, dependency/CSP review, licenses and India payment/store policy review |
| Signed release APK/AAB | BLOCKED | Reproducible build, signing check, package/version, SHA256 and rollback |
| OnePlus 9 Pro and second-device QA | BLOCKED | Current-build physical install/launch, crash logs, face/lens, playback/export and calls |
| Production owner approval | BLOCKED | Explicit informed authorization and security/finance/operations gates |

Do not treat SOURCE_PRESENT, DEMO_ONLY or green browser CI as verified runtime functionality.

## GitHub pull request integration order
As inspected on 27 Oct, PRs #17 to #25 were all **open drafts**, stacked in order:
#17 basic browser selector/mobile overflow, #18 Reel single-swipe, #19 Explore/profile,
#20 Reel controls/Stories/Posts, #21 native lens input + Story timeout, #22 local
Messages/Groups/voice preview, #23 privacy/notifications, #24 sample Live/Coins
and #25 AURA-X. This Step 10 audit PR stacks on #25. Review and merge each
explicitly only after cumulative conflict and regression checks, and separately
port the accepted commits into the owner's actual v378 app; NEVER blindly
overwrite new Android source with older sample code.

## Windows PC verification (manual, after owner source review)
The user-maintained latest Android source is NOT present in this checkout.
On the owner PC, verify the real location before attempting any build:

    $root = 'F:\CrushX-v378\CrushX-v220'
    Test-Path "$root\frontend\package.json"
    Test-Path "$root\frontend\android\app\build.gradle"
    git -C $root rev-parse HEAD

Do not run Gradle, Unity or sign/install an APK before checking source,
dependencies and approved staging config. Run local frontend regression/build,
then an isolated development APK only when the correct source exists. Native
lens validation is separate:

    pwsh -File tools/run_unity_checks.ps1 -BuildAndroid

Requires a valid local Unity Editor license plus Android tooling; isolated
test package output is NOT the full app. Follow docs/ANDROID-VERIFICATION.md
for guarded OnePlus read-only evidence. Verify selfie preview, front camera,
face/hand tracking, lens carousel, image/MP4 export and performance; record
source SHA, APK hash, package/version and sanitized logs. Keep secrets and
personal device identifiers outside Git and review evidence before sharing.

## Backend, payments and model go/no-go
Use an approved isolated staging account/role. Independently validate API
JWT authorizers, Cognito refresh/recovery, 2+ account isolation, signed payment
webhooks and external provider capture, concurrency-safe server double-entry
coins and INR paise, reversible refunds/chargebacks and reconciled payouts.
For Live confirm authenticated ingest, moderation, streaming/player lifecycle.
For calls/P2P verify the encrypted two-device data path and denial/reconnection.
For AURA-X confirm model/tool permissions are enforced server-side,
account-scoped memory consent and deletion, action logs and human approval
for high-impact actions. Only licensed test music/assets are allowed.

The production release remains BLOCKED without full physical Android acceptance,
a real server-integrated release candidate, payment security/legal compliance
and explicit owner authorization. No tool can infer these from sample code.
