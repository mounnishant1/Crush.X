# Step254 — navigation, icon, scroll and touch hardening

2026-11-04. Scope: the **browser integration preview only**, not Windows React APK.

## Verified fixes (source)
1. Explore/Profile media card uses the actual ranked Reel ID when opening full-screen. Previously it used an index in the unsorted state.reels array; when recommendation ranking reordered items, tapping one tile could open another. If the target was hidden by preferences, the viewer now informs the user instead of opening the wrong item.
2. Navigation retains the active Reel **by ID** through re-renders, switching to Profile and returning, instead of relying only on unstable pixel scroll offsets. Resets the selection at sample account boundary and logout.
3. Trackpad wheel events over Reel action rail, buttons, comment form and scrubber no longer get intercepted by the Reel deck's next-item gesture controller, preserving inner scrolling and icon touch behavior.
4. Reel jump uses a nonanimated scroll under prefers-reduced-motion. Existing media touch swipe, keyboard arrow and Story pointer cancellation paths remain intact.

## Tests added
- `tests/navigation-touch-step254.test.cjs` exercises the shipping openGridMedia handler with ranked/filtered fixtures and post fallback; plus guards for active Reel ID retention, wheel event ownership, touch/key controls and reduced-motion handling.
- Invoked from `.github/workflows/frontend.yml`; legacy Playwright frontend tests continue as before.

## Release gate / limitations
- Full app is not available in this GitHub branch: Windows F: React/Capacitor source, Android Gradle project and Unity IL2CPP Android build are absent. No direct Android device touch/framerate QA.
- Browser preview actions include explicitly local-only data. Live DMs/calls, publishing, backend views and payment require production-connected app tests.
- Needed on actual OnePlus 9 Pro: 320/390px viewport and keyboard, one-swipe-one-Reel, 30+ tiles, rail wheel/touch scroll, thumbnails to correct ranked Reel, Profile back restoration, Story swipe-down and hold, tabs/dialog focus, reduced-motion, battery/thermal/frame budget, safe areas and editor input controls.
- Do not claim all screens fully certified or production deployed from static/CI checks.

## Additional automated browser exercise
- `tests/navigation-touch-step254-browser.cjs`: Chromium 390×844 with touch support. Simulates deliberately reversed Reel ranking (three sample Reels), checks Explore tile tap selects the requested ID, correct count and icon overlay, 44px vertical icon hit target, nested rail wheel not stolen, Profile route + browser Back returns to exactly the same Reel, and no horizontal overflow or script exceptions.
- Action buttons get an explicit keyboard focus ring. Minimum vertical hit target on Reel rail raised from 41px to 44px.
