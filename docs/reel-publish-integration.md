# Reel controls and publishing feedback (2026-10-18)

## What works in the checked-in UI

- Reel creator **Follow → Following → Follow** toggles immediately, updates the local sample state, and does **not** re-render the playing video. Visible buttons for the same sample creator stay in sync.
- Video reels show a small draggable seek dot at the bottom. The position follows the HTML video player's real playback time; keyboard seeking works with the range input. Photo-only sample reels do not show a video seeker.
- **Home only:** a moving publish line appears when a publishing job is explicitly started. A bottom confirmation pops up with a brief crack/ring flash and disappears after about 3 seconds. **Your story published** only appears after an explicit success signal. Reduced-motion settings are respected.

## Live backend integration remains required

The current Story Studio and Create/Post screens do **not** have an approved upload destination or verified publishing API; they correctly block live publishing. This PR does not add a fake upload or say a story has been published merely because a timer finished.

After the authenticated upload and final publication endpoints have been built and verified:

1. Start an actual publishing request and assign a unique ID. Then call window.CrushXPublishFlow.start({id, kind:'story'}). It navigates to Home by default. The adapter should close the Story Studio dialog after accepting the request so Home is visible.
2. Call window.CrushXPublishFlow.progress(id, percent) with measured upload progress. UI caps values at 99%, since upload completion is not publication confirmation.
3. After the server confirms story creation and its audience/visibility, call window.CrushXPublishFlow.complete(id) once.
4. On failure or cancellation call window.CrushXPublishFlow.fail(id). Never show a success toast for failed requests.
5. The Home line hides outside Home, but the job remains active. A recent notice is queued for up to 12 seconds when returning to Home.

Equivalent events on document are supported:

    document.dispatchEvent(new CustomEvent('crushx:publish-start', {
      detail: { id: requestId, kind: 'story' }
    }));
    document.dispatchEvent(new CustomEvent('crushx:publish-progress', {
      detail: { id: requestId, percent: measuredPercent }
    }));
    document.dispatchEvent(new CustomEvent('crushx:publish-success', {
      detail: { id: requestId }
    }));
    // On failure INSTEAD:
    document.dispatchEvent(new CustomEvent('crushx:publish-error', {
      detail: { id: requestId }
    }));

Do not send success events from timers, mocked responses, or local draft saves. The API must enforce authenticated ownership, validated media, audience privacy, idempotency, and authoritative publication status. A refresh clears the in-flight UI until a backend status query is available.

**Follow limitation:** browser-local sample follows work. Real account follow/unfollow API calls, notifications, conflict resolution, and cross-device sync remain backend work.

## Verification

- node --check reel-publish-flows.js
- node --test tests/reel-publish-flows.test.cjs
- Existing Playwright suite in GitHub Actions after the PR is created.
- Android device and cloud integration checks remain pending: touch drag, interrupted playback, navigation, actual server confirmation, disconnect/retry, cancellation, and screen safe-area.

This is not a claim of production deployment, native device QA, or live publishing.
