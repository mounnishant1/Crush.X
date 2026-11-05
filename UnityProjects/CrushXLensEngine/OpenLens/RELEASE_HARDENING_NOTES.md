# Crush.X Lens Engine — all-features hardening and release blockers

Updated: 2026-11-05. **Source work only on an isolated branch. No main merge, no physical Unity/Android QA was executed in this conversation.**

## What this branch implements in source

1. Normal/no-face photo capture: ScreenCapture no longer rejects photos because there is no tracked face. The app emits an async screenshot receipt only after the PNG file exists and is non-empty. Video export is still missing.
2. Original funny voice preview: Robot (ring modulation), Deep (simple low-pass), Space (amplitude modulation), explicit Start Mic button, permission gating, microphone cleanup on app pause/lens change. **These are simple audible effects, not premium pitch-shift or MP4 audio mixing.**
3. Two original expression games: Blink Pop (10 pts) and Mouth Catch (5 pts). Each trigger requires release/re-arm, cooldown, valid face tracking and no stale expression. Scores remain local; no wallets.
4. Up to three face display overlays using MediaPipe Face Landmarker with `numFaces=3`, without re-opening the camera. `MultiFaceFunnyOverlay` validates up to 3 faces with 180ms expiry and draws original comic signs for Group Party. **These are frame-local face positions, not stable IDs.**
5. Better camera lifecycle: asynchronous conversion frame generation tokens avoid stale camera results from a prior camera session; Android bridge accepts calibrated 0/90/180/270 rotation + preview mirror flag.
6. Read-only Unity release preflight checks active URP asset, both original renderer features, shaders, owner-reviewed model bundle/hash and real AR scene.
7. Non-destructive opt-in test setup: Unity Editor menu creates a new URP test asset only when no active pipeline exists; isolated CI can generate AR scene only with a separate environment confirmation.
8. Windows PowerShell QA runner to run Unity EditMode, IL2CPP ARM64 export, Gradle assembleDebug, calculate APK SHA-256 and optionally install on a named ADB device.
9. GitHub Actions Python source-policy checks; **not a Unity Editor or Android test run**.

Catalog total: **37** entries, including **16 Funny** (12 original funny overlays, existing Pixel Glasses, 2 expression games, 1 group comedy entry).

## Reproduce in an isolated Windows checkout

Place this exact branch in a separate checkout from newer F: source. Do not overwrite Step259+ Windows work. Check your disk has enough space for Unity import, IL2CPP + Gradle, model assets and APK.

1. Open PowerShell inside `UnityProjects\CrushXLensEngine`.
2. Use the QA runner in `OpenLens\run_lens_qa.ps1`.
3. First run source tests: `python OpenLens\check_free_stack.py` and `python OpenLens\test_lens_static.py -v`.
4. For an intentionally isolated debug project only: `./OpenLens/run_lens_qa.ps1 -ConfigureURP -GenerateNativeARScene -RunTests -RunDevGate -ExportAndroid -BuildGradleApk -ConfirmIsolatedSource`.
5. For a known Debug APK and explicit ADB serial: `./OpenLens/run_lens_qa.ps1 -InstallDeviceApk -ExistingApk 'F:\path\to\CrushX-debug.apk' -Serial 'DEVICE_SERIAL' -ConfirmIsolatedSource`. Device install is optional and requires a physical device attached to your PC.
6. `-RunReleaseGate` intentionally fails when the license-reviewed MediaPipe model or other real release requirements are not present. Do not bypass it by toggling booleans.

## Approved model requirement

Requires `Assets/StreamingAssets/CrushXModels/face_landmarker.task`, matching `.sha256` receipt and `approval.txt` containing exactly `MODEL-LICENSE-APPROVED`, **after** human review of the exact model card, redistribution terms and source provenance. We did not download/approve or commit a third-party model binary. Hash alone does not grant licensing rights.

## Camera alignment

ARCameraBackground may apply sensor rotation and display cropping. Model-normalized UV must match the **actual displayed selfie preview**, not merely the CPU source image. The Unity receiver accepts:

    CalibrateFaceCamera("0,false")
    CalibrateFaceCamera("90,true")
    CalibrateFaceCamera("180,false")
    CalibrateFaceCamera("270,true")

Those commands only calibrate MODEL INPUT orientation; they do not automatically flip the rendered front camera. Device operator must compare actual pupil/mouth warp with the physical camera preview, including portrait rotation, horizontal mirror and crop.

## Hard release blockers still open

| Gate | Current state |
|---|---|
| Licensed + hashed Face Landmarker .task model file | HOLD, not provided |
| Unity URP 17 renderer + native AR scene actual import and compile | NOT RUN |
| Java MediaPipe .aar resolution / arm64 Gradle build | NOT RUN |
| GPU shader render with correct camera image orientation/crop | NOT RUN |
| Real blink / mouth / 2+ face tracks and face-crossing on OnePlus 9 Pro | NOT RUN |
| Funny mic playback feedback / live monitoring with headphones | NOT RUN |
| Story/Reel MP4 encoder with same live beauty/AR image and funny audio | NOT IMPLEMENTED |
| 30 FPS device benchmark, thermal, low-light, front/rear camera, permission flows | NOT RUN |
| Third-party model legal/notice/package review | HOLD |
| Conflict-safe port into newest Windows Step259+ sources | NOT DONE |
| Production signed release / main merge | NOT AUTHORIZED |

## Behavioral limitations

- ARCore Unity ARFace tracks one face on Android. Multi-face relies on MediaPipe 2D results, not ARFace meshes, and cannot guarantee stable person identity across crossing.
- Video capture/parity is not provided by ScreenCapture.CaptureScreenshot. A dedicated encoded video/audio output path with verification is necessary.
- Native funny voice FX are local preview effects, NOT finished pitch shifting. Keep the mic off until explicit consent.
- Source checks and authored tests do not prove Android runtime performance. Unity Editor and OnePlus QA are mandatory.
- Camera calibration data is ephemeral. After changing orientation/mirror old landmarks are invalidated to avoid applying stale warps.

Sources: Unity 6 URP documentation https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/universal-render-pipeline/urp-quality-settings/urp-asset-create ; Google ARCore augmented faces limits https://developers.google.com/ar/develop/unity-arf/augmented-faces/developer-guide ; MediaPipe Face Landmarker https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/android
