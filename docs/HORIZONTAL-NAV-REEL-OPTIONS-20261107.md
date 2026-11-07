# Crush.X — Horizontal navigation + timed Reel extras (browser preview)
Date: 2026-11-07

## Intended UX

- Across the main five tabs, a horizontal **right** swipe advances Home → Reels → Messages → Search → Profile; a **left** swipe reverses it.
- From Home, a **left** swipe opens a dedicated Camera preview; from Camera, **right** returns Home.
- Camera requests user device permission only from an intentional gesture, allows flip/retry and local snapshot, and releases the active stream on route change. Native Unity/AR lenses and production recording are **not** connected by this browser prototype.
- Each Reel initially shows its **secondary options** (existing More Reel options, Repost, speed/mute, and a Shop option only if an actual Shop control exists). After **2800 ms**, those controls fade to invisible.
- Like, Comment, Share, Save and a small **More** toggle stay visible for access. **More** or tapping the video brings secondary options back briefly. Each Reel gets its own timer as the visible slide changes; no fake Shop checkout is fabricated.
- Horizontal gestures must not intercept taps or swipes on controls, story dialogs, progress scrubbing, modal sheets, editor controls, or horizontal carousels.

## Implemented source
- `horizontal-swipe-navigation.js` and `horizontal-swipe-navigation.css`: camera route and swipe ownership.
- `reel-options-auto-hide.js` and `reel-options-auto-hide.css`: action visibility state and timer.
- `index.html`: camera recognized by `normalizeState`, router, renderer; modules included.
- Browser regression: `tests/horizontal-nav-browser.cjs` and `tests/reel-options-auto-hide-browser.cjs`, run by `.github/workflows/whole-app-mock.yml`.

## Verification boundary
The GitHub source is a **sample local browser preview** and is not a verified copy of the current Windows React/Capacitor source. GitHub CI green means only Chromium/mock source tests passed. The true Android app still requires a reviewed merge into latest Windows source, actual native Camera/Unity/IL2CPP integration, APK build, gesture/reel accessibility checks and OnePlus 9 Pro device QA. No production service, payment or user account was changed.
