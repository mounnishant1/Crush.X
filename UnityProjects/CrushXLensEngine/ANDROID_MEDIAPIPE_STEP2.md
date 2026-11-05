# Step 2 — Android Face Landmarker + live expressions

**Status:** Integrated source code, *not* Unity/Gradle compiled or device-proven. No model binary committed.

## What is now wired

1. Existing ARCameraManager.TryAcquireLatestCpuImage supplies camera pixels, asynchronously downsamples to RGBA32 256x256, maximum 10 fps, and releases XRCpuImage immediately.
2. Unity Android JNI invokes `com.crushx.lens.CrushXFaceLandmarkerBridge`, which loads an approved local `face_landmarker.task` bundle, runs MediaPipe **VIDEO** detection on a single worker and drops new frames while busy.
3. Java extracts actual normalized left/right eye and mouth landmark regions from model outputs (indices 33/133, 362/263, 13/14, 61/291). It also reads actual named face blendshapes jawOpen, eyeBlinkLeft, eyeBlinkRight, mouthSmileLeft/Right and browInnerUp.
4. Unity's `FaceWarpFrameSource` consumes time-stamped landmarks for the Step 1 Big Eyes/Big Mouth GPU pass. `LiveFaceExpressionState` validates real inference values before the `LensEngineBootstrap` uses jawOpen/blink to animate funny overlays.
5. Tracking loss sends hasFace:false, clears expressions and stops warping. Inference timeout also disables effects. A coarse ARFace mesh fallback remains when MediaPipe isn't ready. The Step1 renderer still requires correct URP configuration.
6. The Android Gradle post-processor pins `com.google.mediapipe:tasks-vision:0.10.35` in **generated** unityLibrary build.gradle; it never edits another Android app's checked-in Gradle file.

## Model approval and installation — missing model is a deliberate HOLD

Download only from the official Google model source and review the *specific model bundle* licensing before redistribution. There is no external model auto-download in this code. Provide these three **local** files:

```
UnityProjects/CrushXLensEngine/Assets/StreamingAssets/CrushXModels/face_landmarker.task
UnityProjects/CrushXLensEngine/Assets/StreamingAssets/CrushXModels/face_landmarker.task.sha256
UnityProjects/CrushXLensEngine/Assets/StreamingAssets/CrushXModels/approval.txt
```

- `.sha256` contains the **64-character SHA-256 digest** of the exact `.task` file, one line.
- `approval.txt` contains exactly `MODEL-LICENSE-APPROVED` after the owner reviews the model card and license. This is a local release gate, *not* cryptographic identity or a claim that Google approved this app.
- The Unity postprocessor verifies both approval and hash, then places the model in generated `unityLibrary/src/main/assets/face_landmarker.task`.
- Without these files the Java model startup stays disabled and local AR face geometry remains the fallback. A source-only Android build may still compile when Maven dependencies resolve.
- Never commit private model files or distribute unreviewed downloaded model artifacts.

## Android camera calibration

Unity CPU camera frames are not necessarily oriented, cropped or mirrored the same way as the screen. In `ARCameraMediaPipeRunner`, calibrate `RotationDegrees` (0/90/180/270) and `MirrorForPreview` against the actual ARCameraBackground on **OnePlus 9 Pro**. The JNI worker converts detected landmark coordinates from top-left to bottom-left viewport UV before sending them to Unity. The screenshot/video must match the render, with no 180-degree inversion and no left/right-swapped expressions. Changing these options does **not** itself correct arbitrary AR background aspect cropping; align the preview framing and verify on device.

## Practical limitations

- The current `ARFaceManager` is used for 3D pose. MediaPipe face mesh enables 2D precise image warping even if native ARFace pose is unavailable, but pose-attached 3D overlay placement needs separate QA/fallback.
- `confidence: 0.8` in a successful JNI packet is a valid-result sentinel because the Java FaceLandmarkerResult API does *not* expose a calibrated face detection confidence. Treat it as validation status only.
- One face per frame; true multi-face and stable identities are **Step 4**.
- Full photo/MP4 parity, adaptive 30-fps performance, GPU acceleration tuning, pause/resume/rotation, energy and heating tests are **Step 6/7**.
- Java/API and C# compilation were not executed in this conversation. Static inspection is not a build proof.

## Test checklist (required before marking production-ready)

1. Unity 6000.0.30f1: compile, EditMode and PlayMode tests; inspect plugin importer Android platform.
2. Gradle export: inspect generated unityLibrary dependency and packaged model asset; no duplicate Gradle entries; arm64 build.
3. OnePlus 9 Pro: log native `isReady()==true`, observe real timestamped nonempty landmark packets, live blendshape changes while blinking and opening mouth, 0 detections on blank scene.
4. Rotate, switch cameras, deny permission, lose tracking, stop/resume app, and verify immediately zeroed expressions.
5. Verify only render-preview aligned pixels are modified, Story/Reel video matches preview and 30fps stability.

Official API references:
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/android
- https://developers.google.com/edge/api/mediapipe/java/com/google/mediapipe/tasks/vision/facelandmarker/FaceLandmarkerResult
- https://docs.unity.cn/Packages/com.unity.xr.arfoundation%406.0/manual/features/camera/image-capture.html

**Owner release approval required before merging, publishing or deploying.**