# Crush.X Funny Lens implementation — sequential status

## Step 1: image-space Big Eyes / Big Mouth warp
**Code present on isolated branch; NOT production validated.**

- GPU URP17 shader with localized eye/mouth deformation on a camera color buffer.
- Renderer feature implements RenderGraph intermediate blit and copy-back.
- FaceWarpFrameSource validates normalized anchors, confidence, sequence, latency, and stale frames (180ms).
- ARFaceMeshWarpDriver uses **real ARCore face mesh**, but estimates the eyes/mouth from face mesh bounding extents. This is a coarse fallback, not landmark-precise anatomy.
- Selected funny lens maps to warp mode; slider controls intensity 0..1.
- Native Unity receiver exposes PushFaceWarpFrame, ResetFaceWarpFrame, SetFaceWarpIntensity.
- Unity EditMode test cases cover invalid, stale and out-of-order input and lens changes.

### Required Unity setup
Important: GitHub GraphicsSettings currently has m_CustomRenderPipeline: {fileID: 0}, and QualitySettings do not assign a URP asset. Installing URP as a package alone does NOT activate URP rendering.
1. In Unity 6000.0.30f1 create a URP Pipeline Asset with a Universal Renderer. Assign the URP asset in Project Settings > Graphics and Android Quality settings.
2. Confirm the real front-facing AR camera has ARCameraBackground and actually uses that Renderer Data asset.
3. Run **CrushX > Lens Engine > Install Face Warp Renderer Feature**, then **Validate Face Warp Setup**. The wizard safely refuses if URP is missing.
4. Confirm camera viewport crop, orientation and horizontal mirror; inspect the warp result with Render Graph Viewer and actual device frames.
5. Check recorded photo and video output, shader inclusion in Android build, frame rate and tracking loss.

### Precise landmark upgrade
The exact landmark input is a short JSON object, with bottom-left viewport UVs after crop, orientation and mirroring. It has sequence, hasFace, confidence, ageMilliseconds, leftEye, rightEye, mouth, eyeRadius and mouthRadius fields. At maximum confidence and short age, Big Eyes warps eye neighborhoods, Big Mouth warps mouth neighborhood. Face tracking lost or too old means OFF.
Use a licensed Android Face Landmarker with 478 landmarks + 52 blendshapes, not an invented tracking feed. Runtime model loading, photo/video reuse and expression mapping are Step 2.

## Pending steps in order
| Step | Scope | Status |
|---|---|---|
| 1 | Real image warp shader, rough ARCore mesh centers, slider, safety, tests | Code added; Unity compile, Android renderer and device QA pending |
| 2 | Android expression inference, accurate landmarks, face IDs | Pending |
| 3 | Funny voice changer and recorded audio sync | Pending |
| 4 | Multi-face tracking and independent effects | Pending |
| 5 | Funny lens mini-games and gestures | Pending |
| 6 | Preview/photo/MP4 export parity and recovery | Pending |
| 7 | Unity/IL2CPP APK and OnePlus 9 Pro QA | Not tested |

**Not verified:** Unity compilation, EditMode test run, PlayMode test, full face tracking inference, Android IL2CPP build, live camera image warp, recording parity, and device QA.
**Source safety:** this branch is stacked on the Funny lens prototype branch, not merged to main. The latest F: Windows source may be newer; compare before porting. No AWS or original local files were changed.

References:
- Unity URP 17 renderer feature documentation: https://docs.unity.cn/6000.0/Documentation/Manual/urp/renderer-features/create-custom-renderer-feature.html
- Unity ARFace mesh vertices: https://docs.unity.cn/Packages/com.unity.xr.arfoundation%406.1/api/UnityEngine.XR.ARFoundation.ARFace.html
- Google Face Landmarker outputs: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
