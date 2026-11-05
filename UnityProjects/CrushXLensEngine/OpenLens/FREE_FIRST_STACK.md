# Crush.X — free-first original lens stack (research checked 2026-11-05)

## Verdict

Use **Unity 6 + AR Foundation/ARCore + MediaPipe Face Landmarker + original Crush.X URP shaders** as the shipped core. Use **OpenCV 4.5+** only for optional processing, with Apache-2.0 notice compliance. Use **Poly Haven / Kenney CC0** *downloaded individual assets* for original non-branded lens props and games. These asset repositories are not a runtime lens SDK.

Do **not** embed GPUPixel, MarsFace, Snap Camera Kit, DeepAR or Banuba in release builds until all respective binary/model/subdependency rights, commercial restrictions, costs, and appearance/attribution obligations have been reviewed. The main GPUPixel source advertises Apache-2.0, but do not assume a bundled MarsFace binary/model has the same grants.

## Component comparison

| Provider | Core value | Verified license / business status | Crush.X choice |
|---|---|---|---|
| Unity 6 AR Foundation + ARCore | 3D tracking/face masks/Unity renderer | Free conditional on Unity tier eligibility and Google APIs terms | KEEP existing core |
| Google MediaPipe Face Landmarker | 478 face landmarks, 52 blendshapes | SDK Apache-2.0; bundled model cards/licenses require per-asset review | KEEP; real device model QA HOLD |
| Original Crush.X URP shader | Face warp/funny/beauty techniques under our control | Original project source; no vendor watermark | KEEP; still requires Unity compile and device validation |
| GPUPixel | Advanced beauty smoothing/whitening, face reshape | GitHub repo Apache-2.0; MarsFace shipped components require audit | OPTIONAL EXPERIMENT; do not bundle yet |
| OpenCV 4.5+ | image transforms/segmentation helpers, not 3D AR | Apache-2.0 | OPTIONAL; not installed by this patch |
| Poly Haven / Kenney | CC0 3D models, textures, UI, SFX | CC0 on official asset pages; logos/trademarks separate | SAFE BASELINE for original edited asset packs, offline downloads |
| DeepAR | turnkey face effects | Free up to 10 MAU with watermark, then paid | EXCLUDE for no-watermark scalable free app |
| Banuba | turnkey AR, beauty, multi-face | 14-day trial; commercial quote MAU-based | EXCLUDE for free app |
| Snap Camera Kit | Snapchat lenses | Snap Camera Kit terms restrict Snapchat-like competing experiences; branding/attribution conditions | EXCLUDE for Crush.X; do not copy/republish creator lenses |

## Architecture with one camera (do not open two cameras)

1. Use existing ARCameraManager source and existing ARCameraBackground to show camera frames. Face Landmarker samples the SAME video source asynchronously at bounded rate.
2. One time-stamped MediaPipe packet is converted to viewport UV landmarks and expression state for current face ID. If tracking stale, hide masks and bypass morph.
3. One unified Unity render stack: optional original beauty smoothing/color/LUT -> original face-warp pass -> 3D occluding props/particles -> photo/video encoder -> Story/Reel/DM.
4. Use existing LensCatalog and categories. Paid providers should never silently load because an asset catalog entry was returned from a feed. Only approved local asset IDs may be activated.
5. GPU shader pipeline should preserve skin texture, allow intensity 0-100%, and have a clear Original/Off option. Benchmark GL/Vulkan and crop/mirror on OnePlus 9 Pro.
6. Do not ship third-party tool logos/wordmarks in the user-facing Crush.X UI. Correct OSS copyright/license/NOTICE disclosures remain required in legal notices, not as UI promotions.

## License/brand rule

Apache-2.0 permits commercial use and generally does not require an SDK logo in the UI, but requires retaining copyright, license and NOTICE information where applicable. It does **not** grant brand/trademark rights. CC0 assets generally allow commercial use without attribution, but do not grant third-party trademark, image or personality rights. **Never import Snapchat/TikTok/Instagram lenses or named branded face assets without express rights.**

## Build and release gates

- Validate exact SDK commits, dependency graph, AAR and native .so provenance; archive SPDX license texts, notices, SHA-256 and original URLs.
- The FaceLandmarker model bundle must have a valid license review, owner approval marker and hash; missing model disables native inference.
- Resolve current Unity project URP asset/renderer setup; compile URP renderer feature, ARCore, MediaPipe Java bridge before any release claims.
- Real front camera mirror, face landmarks, blink/jaw scores, tracking loss, multi-face boundaries, camera permission, photo/video fidelity and 30 FPS must pass device tests.
- Merge into latest isolated Windows source conflict-safely, because this GitHub demo may be older than F: Step259+ builds. Owner approval for merges/deployment.

### Preflight

`python OpenLens/check_free_stack.py` checks for excluded runtime SDK references without asserting readiness.

`python OpenLens/check_free_stack.py --release` fails until model licensing, notices, build, photo/video and physical-device evidence are all verified. Never flip gates to true without evidence.

## Official sources

- [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)
- [MediaPipe Apache license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)
- [OpenCV license](https://opencv.org/license/)
- [GPUPixel repo](https://github.com/pixpark/gpupixel) and [MarsFace binary clarification issue](https://github.com/pixpark/gpupixel/issues/253)
- [Poly Haven CC0](https://polyhaven.com/license)
- [Kenney CC0](https://kenney.nl/support)
- [DeepAR pricing](https://docs.deepar.ai/deepar-sdk/pricing/)
- [Banuba pricing](https://www.banuba.com/banuba-pricing-face-ar-sdk)
- [Snap Camera Kit terms](https://www.snap.com/terms/snap-camera-kit?lang=en-US)
- [Unity licensing thresholds](https://unity.com/pages/license-compliance)
