# Advanced AR change inventory

Source base: `da22abcbc2d4ec1a39380f57567566683aedb3d3`. Each implementation phase was committed separately.
The final QA/documentation commit is identified in the accompanying final report.

## fix(ar): repair camera ownership, recovery, orientation and single-swipe controls

Commit: `b4cbe3d4eba4155ccb1c2fe97da4bdf1dd0fd9c2`.

```text
A	UnityProjects/CrushXLensEngine/Assets/Resources/CrushXLenses/NativeCameraBackground.shader
A	UnityProjects/CrushXLensEngine/Assets/Resources/CrushXLenses/NativeCameraBackground.shader.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraPreviewTransform.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraPreviewTransform.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraRecoveryPolicy.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraRecoveryPolicy.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraSessionController.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraSessionController.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraPermissionGate.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraSwipe.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXSmartCarousel.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensEngineBootstrap.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensSwipePolicy.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensSwipePolicy.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/NativeLensUI.cs
M	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/NativeCameraInteractionTests.cs
A	docs/ADVANCED-AR-IMPLEMENTATION.md
A	docs/ADVANCED-AR-SOURCE-BASELINE.json
A	tests/engine_core/CameraAndGestureTests.cs
A	tests/engine_core/EngineCoreTests.csproj
A	tests/engine_core/Program.cs
M	tests/test_unity_source.py
A	tools/check_engine_core.py
```

## fix(ar): validate tracking identity, freshness and model-derived expression channels

Commit: `7218344c38cdc3154a439f0649bfb7ca7196e290`.

```text
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Core/ILensEngine.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraFrameFreshness.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraFrameFreshness.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraSessionController.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/ARFoundationFaceProvider.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/BlendshapeTrackingProvider.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/BlendshapeTrackingProvider.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/FaceExpressions.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/FaceExpressions.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/FaceTrackingManager.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/MockTrackingProvider.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/TrackingSampleGate.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/TrackingSampleGate.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/FaceExpressionTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/FaceExpressionTests.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/FaceTrackingManagerTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/FaceTrackingManagerTests.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/TrackingPolicyTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/TrackingPolicyTests.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Tests/PlayMode/TrackingLifecyclePlayModeTests.cs
M	docs/ADVANCED-AR-IMPLEMENTATION.md
A	docs/ADVANCED-AR-TRACKING.md
A	tests/engine_core/CameraFrameTests.cs
M	tests/engine_core/EngineCoreTests.csproj
```

## feat(ar): calibrate prototype lenses and gate animations on genuine expressions

Commit: `9dbd377c77a0cb906c6faf3e1f707849261607d3`.

```text
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Lenses/LensAttachmentPolicy.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Lenses/LensAttachmentPolicy.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Lenses/LensEffects.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensEngineBootstrap.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/FaceTrackingManager.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/ExpressionLensTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/ExpressionLensTests.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/FaceTrackingManagerTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/LensAttachmentPolicyTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/LensAttachmentPolicyTests.cs.meta
M	docs/ADVANCED-AR-IMPLEMENTATION.md
M	tests/engine_core/EngineCoreTests.csproj
```

## feat(ar): add mask-aware GPU compositor and adjustable camera color grading

Commit: `12721e445f366ee9c3c8db049736a2e4fe33d344`.

```text
A	UnityProjects/CrushXLensEngine/Assets/Resources/CrushXLenses/GpuBeautyComposite.shader
A	UnityProjects/CrushXLensEngine/Assets/Resources/CrushXLenses/GpuBeautyComposite.shader.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects/GpuBeautyPipeline.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects/GpuBeautyPipeline.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects/VisualEffectPolicy.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects/VisualEffectPolicy.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensEngineBootstrap.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/NativeCameraLayout.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/NativeLensUI.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/VisualEffectPolicyTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/VisualEffectPolicyTests.cs.meta
M	docs/ADVANCED-AR-IMPLEMENTATION.md
A	docs/ADVANCED-AR-VISUAL-EFFECTS.md
M	tests/engine_core/EngineCoreTests.csproj
```

## feat(capture): harden rendered recording, recover drafts and export to Android gallery

Commit: `54f541c5539ada3156bae11b99f4b30ac0c22e98`.

```text
A	UnityProjects/CrushXLensEngine/Assets/Plugins/Android/CrushXMediaCapture.androidlib/src/in/crushx/lens/capture/CrushXGalleryExporter.java
A	UnityProjects/CrushXLensEngine/Assets/Plugins/Android/CrushXMediaCapture.androidlib/src/in/crushx/lens/capture/CrushXGalleryExporter.java.meta
M	UnityProjects/CrushXLensEngine/Assets/Plugins/Android/CrushXMediaCapture.androidlib/src/in/crushx/lens/capture/CrushXMediaRecorder.java
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Bridge/LensWorkflowBridge.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Bridge/UnityLensReceiver.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/CaptureLifecyclePolicy.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/CaptureLifecyclePolicy.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/MediaCaptureResult.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/MediaPreviewPlayer.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/MediaPreviewPlayer.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/NativeMediaCapture.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/ShutterGesture.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/ShutterGesture.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CameraSessionController.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/NativeLensUI.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CapturePolicyTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CapturePolicyTests.cs.meta
M	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/MediaCaptureTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/ShutterGestureTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/ShutterGestureTests.cs.meta
M	UnityProjects/CrushXLensEngine/Packages/manifest.json
M	UnityProjects/CrushXLensEngine/Packages/packages-lock.json
A	docs/ADVANCED-AR-CAPTURE.md
M	docs/ADVANCED-AR-IMPLEMENTATION.md
M	tests/engine_core/EngineCoreTests.csproj
A	tests/native_media/CrushXGalleryExporterTests.java
M	tests/native_media/CrushXMediaRecorderTests.java
M	tests/test_unity_source.py
M	tools/check_android_media_java.py
```

## feat(creator): add local lens creator presets, validation, preview and immutable versions

Commit: `a8bd018506f467e04039ce74e9c80a384abff832`.

```text
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Bridge/LensWorkflowBridge.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/MediaCaptureResult.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/NativeMediaCapture.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorDocumentStore.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorDocumentStore.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensDocument.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensDocument.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensPreset.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensPreset.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensRuntime.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensRuntime.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensValidation.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/CreatorLensValidation.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/Editor.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/Editor/CreatorLensWindow.cs
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/Editor/CreatorLensWindow.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/Editor/CrushXLensCreator.Editor.asmdef
A	UnityProjects/CrushXLensEngine/Assets/Scripts/Creator/Editor/CrushXLensCreator.Editor.asmdef.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Lenses/LensGeometry.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CreatorManifestTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CreatorManifestTests.cs.meta
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CreatorRuntimeTests.cs
A	UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/CreatorRuntimeTests.cs.meta
M	docs/ADVANCED-AR-IMPLEMENTATION.md
A	docs/CREATOR-FOUNDATION.md
M	tests/engine_core/EngineCoreTests.csproj
```

## Final QA changes

The QA commit adds media validation/tests, .NET CI, Profiler markers, metadata whitespace repair and final evidence/handoff documents.

```text
M	.github/workflows/frontend.yml
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Capture/NativeMediaCapture.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects.meta
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Effects/GpuBeautyPipeline.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/LensEngineBootstrap.cs
M	UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/FaceTrackingManager.cs
M	docs/ADVANCED-AR-IMPLEMENTATION.md
A	docs/ADVANCED-AR-CHANGED-FILES.md
A	docs/ADVANCED-AR-DEVICE-HANDOFF.md
A	docs/ADVANCED-AR-TEST-RESULTS.json
A	tests/test_captured_media.py
A	tools/validate_captured_media.py
```
