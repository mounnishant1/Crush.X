# Crush.X original beauty GPU pass (free-first stack)

Status: Source code on an isolated PR branch; **not** compiled/tested on OnePlus 9 Pro.

## Why this combo

Beauty filtering uses only **existing Unity 6 URP** + our own camera shader, with timestamped face positions from **existing MediaPipe Face Landmarker** and the original Crush.X lens catalog. No DeepAR, Banuba, Snap Camera Kit, MarsFace or bundled GPUPixel commercial/ambiguous dependency is added. OpenCV is not required by these effects.

## Effects supported in source

- `beauty-glow` (Pearl Glow): mild five-tap edge-aware smoothing, slight warm lighting restricted to a conservative face ellipse, with a cutout over both eyes and the mouth.
- `beauty-blush` (Rosy Makeup): restrained warm cheek tint and weaker smoothing, limited to face ellipse and excluding eye/mouth regions.
- `beauty-freckles`, `beauty-crystals` and other existing 3D masks remain unchanged; their current source is procedural geometry rather than a photorealistic cosmetic overlay.
- `funny-big-eyes` and `funny-jumbo-mouth` still use the separate original warp pass. Beauty and funny deformation never activate for the same selected lens.
- Slider controls intensity 0..1, per-user only. Zero means unmodified camera pixels.

## Setup

1. Merge after owner review and a conflict-safe comparison with the newest local Windows F: source. This branch stacks on PR #82, #81, #80, #79, #78.
2. Unity 6000.0.30f1: install URP 17.0.3, AR Foundation 6.0.8, ARCore XR 6.0.8, Input System 1.11.2. Existing project packages contain these except platform installation must be verified.
3. The checked-in remote project GraphicsSettings/QualitySettings did not assign an active URP pipeline asset. Create/assign a Universal Render Pipeline Asset + Universal Renderer in the intended Android Quality level.
4. Use `CrushX > Lens Engine > Install Original Beauty Renderer` and `CrushX > Lens Engine > Validate Original Beauty Setup` in Unity Editor. It refuses to write without the active URP asset.
5. For Funny image-space deformation also use the separate **Install Face Warp Renderer Feature** menu action.
6. Ensure real ARCameraBackground renders front-camera pixels *into the target consumed by the URP color pass*. Ensure accurate sensor orientation/crop/mirroring. A raw model output in camera coordinates is not automatically view-aligned.
7. Supply a licensed, SHA-256-verified `face_landmarker.task` under the existing MediaPipe model approval gate, otherwise no real face-based beauty pass is applied.
8. Run EditMode tests, build IL2CPP arm64 APK, test preview and photo/MP4 on OnePlus 9 Pro. Check 30 FPS, low light, skin-tone preservation, face leaving screen, eye/mouth detail and mirrored camera.

## Fail-safe rules

- A frame older than 180ms, malformed or low confidence: **no face beauty post-process**.
- Rapid lens changes clear the previous face coordinates, avoiding a stale lens mask applied to another face.
- Near-frame-border face geometry that cannot form a conservative visible mask: beauty pass is skipped.
- No face-image upload, external network call or additional camera permission is performed by this beauty shader.
- Source effect is **not full commercial beauty quality**: it has approximate facial ellipse bounds, no person segmentation or depth occlusion, and no color calibration. Edge artifacts and non-skin face regions can be affected until a true on-device segmentation mask is integrated.
- Other vendors' trade names/icons/models/assets must not appear in the camera UI; Apache/Unity copyright and attribution notices remain in the legal notices section.

## Tests added (not executed here)

`Assets/Tests/EditMode/OriginalBeautyStateTests.cs`: frame freshness, face mask bounds, Glow/Blush separation, off/other-lens bypass, intensity rejection/clamp, tracking loss and isolation from funny image warping.

## Real production gates

Face-segmentation mask, dynamic skin-tone preservation, GPU frame timings, native 30fps full-resolution encoder path, beauty/AR layer ordering, Android temperature/thermal, full model/OSS notices and actual proof of video/photo parity remain **pending**. Never flip release gates by documentation only.

References:
- Unity 6 URP feature & RenderGraph: https://docs.unity.cn/6000.0/Documentation/Manual/urp/renderer-features/create-custom-renderer-feature.html
- Google Face Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/android
