# Crush.X Funny Lens System — Original Lens Pack

## Reference analysis
Official Snap Lens documentation describes funny effects through face deformation,
face morph, screen effects, head scale and face-event triggers:
- https://easylens.snapchat.com/learn/blocks?category=face-swaps-morphs
- https://easylens.snapchat.com/learn/blocks/face-deformation
- https://easylens.snapchat.com/learn/blocks/face-events
- https://help.snapchat.com/hc/en-us/articles/7012348332052-How-do-I-use-Lenses-on-Snapchat

Crush.X must build **original** assets and shader implementations, not copy
Snap's creator lenses, meshes, voice effects or proprietary tracking systems.

## Implemented on this isolated branch (source only)

| Funny lens | Behavior | Real image warping? |
|---|---|---|
| `funny-big-eyes` — Pop Eyes | 3D cartoon eyeballs pulse and respond to blink | No |
| `funny-jumbo-mouth` — Jumbo Mouth | Mouth 3D overlay scales with mouth-open signal | No |
| `funny-balloon-cheeks` — Balloon Cheeks | 3D puffy cheeks pulse; mouth-responsive | No |
| `funny-long-nose` — Rubber Nose | Animated elongated 3D nose | No |
| `funny-mini-eyes` — Tiny Eyes | Small eyes set within exaggerated frames | No |
| `funny-wiggle-brows` — Wiggle Brows | Independent comedic eyebrow motion | No |
| `funny-party-clown` — Party Clown | Animated nose, hat and 3D cheek makeup | No |
| `funny-toothy-grin` — Toothy Grin | 3D teeth overlay responds to mouth-open | No |
| `funny-noodle-stache` — Noodle Mustache | Wiggly 3D mustache | No |
| `funny-bubble-pop` — Bubble Pop | Mouth-open-triggered animated bubbles | No |
| `funny-goofy-glasses` — Goofy Glasses | Moving oversized 3D glasses | No |
| `funny-jelly-head` — Jelly Head Outline | Soft pulsating head outline, not face morph | No |

The existing `trend-pixels` lens also appears in Funny collection, giving
**13 Funny** entries and **34 total** registered lens IDs.

### Camera navigation
- Category tabs: All / Beauty / Alien / Funny / Trending.
- Front-facing face-tracking pose drives 3D overlay position and rotation.
- A full left/right swipe over the camera preview advances one lens.
- Gestures starting over top tabs or bottom capture area cannot change lens.
- Unity Input System is used, not legacy Input APIs disabled in the project.
- Gallery-style Favorites and native SetLens API remain unchanged.
- Losing a tracking frame immediately clears old mouth/blink expression signals,
  even while preserving pose briefly for visual recovery.

### Limitations — do NOT claim full Snapchat parity
The repo's current ARFoundation face provider reports mouth-open and blink
as zero on Android. Therefore real expression-triggered effects require
a properly licensed, connected live expression provider before they will
respond on physical devices. The Editor mock supports these values for
preview/testing only. No real camera-image face warp, eye enlargement,
skin segmentation, lip sync or voice changer exists in this patch.

No device build, Unity compile, recording export or test runner has been
performed via the GitHub connector. Source review alone is not an APK pass.

## Production implementation backlog
1. **Face warp renderer:** capture compliant camera frames, obtain facial
   landmarks, apply temporally smoothed per-region GPU mesh/UV deformation
   (eye, mouth, nose, cheek, chin, forehead), and clamp distortion. Implement
   reprojected hairline/occlusion where needed. Add intensity slider and reset.
2. **Expressions:** Android provider for mouth-open, blink, smile, eyebrow raise,
   tongue or other supported blendshapes; timestamp freshness and per-signal
   confidence; never fire outdated events after tracking loss.
3. **Character transforms:** original cartoon character heads, exaggerated
   funny masks, age-style makeup, face-in-object and playful AR props.
4. **Audio and comedy reactions:** original sound effects, voice FX by consent,
   on-device audio delay checks and synced reactions; no third-party audio copies.
5. **Party / multiplayer:** multi-face IDs, face crossing, group photo behavior,
   independent face effects and stable pairing.
6. **Funny lens mini-games:** blink-to-pop, mouth-to-catch, smile score, head-tilt
   balance, separate from production face morphs.
7. **User-generated lenses:** sandboxed authoring, signed asset manifests,
   licensing, performance budgets, moderation and safe publishing workflow.
8. **Exports:** photos + Story/Reel/DM recorded video matching live preview,
   audio sync, portrait orientation, continuity across UI switches.
9. **Physical QA:** Unity 6000.0.30f1 compilation, EditMode/PlayMode tests,
   ARM64 IL2CPP export, OnePlus 9 Pro face tracking/thermal/30 FPS checks,
   low light, multiple faces, rotation, cancellation, lifecycle recovery.
10. **Merger:** compare against the newest isolated Windows F: source. The
    remote GitHub branch could be behind local Step259+ work.

## Owner approval and release status
This is a separate **draft branch** layered on the unmerged Beauty/Alien/Trending
lens source. Do not merge to main, deploy to AWS, or claim production ready
without owner review, conflict-safe porting, build and device validation.
