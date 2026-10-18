# Crush.X: Permissions + AURA-X Reels / Messages integration
Date: 18 October 2026. This branch is an unmerged staging candidate; it must not be confused with a deployed app.

## Implemented (in this GitHub branch)
- Profile -> Privacy & Permissions opens a single accessible permission center. Browser/device status is authoritative, not a local 'allow' flag.
- Permission prompts are user-triggered; camera/microphone media streams are immediately stopped when checking a grant. Gallery media uses the system file picker. No location coordinates are persisted or uploaded by the permission center. Push notifications do not request permission without a configured delivery backend.
- Android Unity lens screen displays an explicit camera-access screen, a native OS prompt after user action, and a Settings recovery path for permanent denial; one-time grants may be explicitly requested again after expiry. No fake Android permission overlay.
- Reels -> AURA-X gives caption/hook/hashtag review and labels sample likes/comments/shares as **not live metrics**.
- Messages -> AURA-X lets the user paste incoming text, request a reply, see rule-based risk warnings, and explicitly insert a suggestion into the existing **unsent local draft**.
- The one AURA-X entry point is available from the app header and contextual Reel / Message controls. No external DM is read or sent.
- Existing Reels/Stories UI is retained rather than replacing it with an old snapshot.

## What is not yet available
- No verified live AURA-X model inference. Langflow and Ollama on the user's Windows machine are not accessible from this GitHub CI environment; never expose local Ollama directly to the public browser.
- No validated authenticated production or staging Chat/DM send API contract; no autonomous replies, message delivery or 2-hour delegation.
- No verified live Reel view/retention/creator-metrics API, video semantic analysis, transcription, licensed song catalog or publishing.
- No signed Android release build, real one-time Android permission test, full front camera AR test or native notification test.
- The web permission center and standalone Unity lens component are separate hosts; full Android app-shell wiring and platform-specific media / notification permissions require a verified native host build.

## Reproducible checks
1. `node --check aura-x-core.js`
2. `node --check aura-x-assistant.js`
3. `node --check permissions-center.js`
4. `node --test tests/aura-x-core.test.cjs`
5. With a local web server on port 8000 and Playwright Chromium available, run `node tests/frontend.cjs` and `node tests/aura-ui-browser.cjs`. CI runs these automatically for the PR.
6. Run the existing Unity source checks separately; they are not a Unity build or physical device verification.

## Android test matrix before acceptance
- Fresh install -> open camera -> grant 'while using' -> launch camera again; no redundant prompt.
- 'Only this time' -> background/expiry -> select Allow Camera again and confirm a new OS prompt is allowed.
- Deny once -> explicit retry when Android allows another prompt; block permanently -> Settings recovery.
- Turn permission off via Android App Settings -> app foreground resumes without pretending access is granted.
- Start video with microphone enabled -> microphone permission prompted only on a user recording action; silent fallback is clearly labeled.
- Camera front/rear and face tracking remain available when permissions are granted; this requires real-device testing.
- Location and notifications are requested only for features that truly use them in the installed Android host.
- Verify no network write or message send occurs from local AURA-X suggestions.

## Release gate
Do not merge into production until staging Cognito/JWT validation, real API authorization, two test accounts, two physical devices, Unity Android build, front camera and AR verification, and monitoring/rollback procedures pass. No credentials belong in the repository.
