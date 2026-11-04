# GPU beauty and mask compositor

This is source implementation for the project's configured **Built-in renderer**.
It does not claim that Unity shaders, Android output or an AI model ran here.
The installed URP package is not the active renderer. URP rendering remains blocked
until its camera background/compositor/capture renderer features are validated together.

`GpuBeautyPipeline.GetOrCreate(camera)` installs one compositor on the actual camera
selected by `CameraSessionController`. Disable the previous compositor before
rebinding a different camera. The pass runs at `CameraEvent.AfterImageEffects`;
existing capture copies at `AfterEverything`, so preview and capture use the same
effect source. No pass is attached with neutral settings or missing required masks.
The component releases its command buffer/material on disable/destruction and does
not copy camera pixels to the CPU.

## Real operations implemented

- Edge-aware skin smoothing with bounded intensity and 5/9/13 tap quality presets.
- Skin tone adjustment; masked eye detail enhancement; luminance-preserving lip,
  cheek and hair tinting.
- Person-mask background blur or texture/color replacement.
- Color-distance chroma replacement that requires no inference model.
- Camera-wide Warm Cinema, Noir and Neon Duotone color grades, available without
  model masks. `ColorGrade` selects one; `GradeIntensity` blends it with the source.
  These reconcile existing divergent-branch filters inside one compositor.
- Independent effect intensities, neutral by default (`BeautyIntensity = 0`).

Makeup/skin/hair/person effects require actual masks. An AR face mesh is **not**
claimed as a skin/hair/person segmentation model. Nothing fabricates those masks,
guesses screen-space face locations or reports unsupported inference as successful.
The pipeline does not distort face geometry. These are GPU image operations, not
proof of natural appearance across skin tones or lighting; that requires device QA.

## Local inference integration contract

Supply `VisualMaskFrame` through `SubmitMasks`. Red-channel values represent
confidence in `[0,1]`. Each texture is already registered to the fully corrected
camera viewport: orientation, crop, selfie mirroring and any model letterbox must
be removed **by the producer**. Masks may be lower resolution but must represent
the complete same viewport. Texture lifetime belongs to the producer; the pipeline
does not destroy supplied textures.

`CameraInstanceId`, `ViewportWidth` and `ViewportHeight` must match the target camera.
`Timestamp` uses `Time.realtimeSinceStartupAsDouble` for the model input frame,
not wall-clock time or the time an old model result was repeatedly polled. Results
must be newer than the last accepted result, at most 250ms old, and no more than
20ms into the future. Layout changes and stale outputs automatically bypass all
mask-specific effects. Separate eye/lip masks protect those details from smoothing.

Example for an existing **real local inference runner**, after it has transformed
its model coordinates into the corrected viewport:

```csharp
var pipeline = GpuBeautyPipeline.GetOrCreate(camera);
pipeline.BeautyIntensity = .35f;
pipeline.SubmitMasks(new VisualMaskFrame {
    CameraInstanceId = camera.GetInstanceID(),
    ViewportWidth = camera.pixelWidth, ViewportHeight = camera.pixelHeight,
    Timestamp = inputFrameUnityTimestamp,
    Skin = registeredSkinMask, Eyes = registeredEyeMask, Lips = registeredLipMask
});
```

No model files are included by this change. Skin/makeup segmentation, person/hair
segmentation, MediaPipe hand landmarks and body pose all need separately acquired
on-device runners/models, license and redistribution review, compatible delegates,
coordinate registration and measured latency. Hand/body/depth-aware effects and
transparent background export are not implemented by this compositor. Chroma
replacement is available independently; it is not labeled AI segmentation.

## Validation

Portable `VisualEffectPolicyTests` execute the actual parameter/registration policy
on host .NET with no Unity stubs. They cover bounds, quality taps, nonfinite values,
wrong camera/viewport, stale/future/repeated/out-of-order output and maximum lifetime.
Unity EditMode/shader import, mask alignment across all rotations/mirror modes,
preview-to-PNG/MP4 equality, target FPS/GPU cost and thermal behavior remain unverified.
No camera footage or model masks are transmitted off-device by this code.
