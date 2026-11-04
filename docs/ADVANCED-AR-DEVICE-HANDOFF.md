# Advanced AR verification handoff — 1 November 2026

Branch: `feature/crushx-advanced-ar-lens-engine`. Base:
`da22abcbc2d4ec1a39380f57567566683aedb3d3`. The workspace is a development
candidate. No APK, Unity import, phone installation, device recording or production
deployment has been performed in this task.

## Repeat host checks

From the repository root with Python, Node, .NET 8 and FFmpeg/FFprobe installed:

```bash
python -m pip install -r tests/requirements-source.txt
python -m unittest discover -s tests -p 'test_*.py' -v
python tools/check_engine_core.py --dotnet dotnet --output work/engine-core
node --test tests/aura-x-core.test.cjs tests/aura-x-policy.test.cjs tests/coins-ledger.cjs tests/music-library.cjs tests/notes-system.test.js
```

The .NET runner compiles actual portable runtime source without Unity stubs.
It does not compile Unity-dependent scripts or shaders. The Python suite labels
its C# parser as syntax-only and tests the media validator using synthetic clips.
The GitHub workflow now installs .NET 8 and runs those core tests explicitly.

Java API validation uses separately acquired Eclipse ECJ and Android 14 API
reference JARs; these tools are not distributed in the source archive:

```bash
python tools/check_android_media_java.py --ecj /path/to/ecj.jar --android-api /path/to/android-all.jar --output work/android-java-check
```

Run the mocked browser suite through `python tools/check_all.py --browser` with
Playwright/Chromium configured. Additional standalone suites and actual final
results are recorded in `ADVANCED-AR-TEST-RESULTS.json`. Browser tests block live
writes and do not establish real backend/native-app integration.

## Unity and Android build

Install/license Unity **6000.0.30f1**, its Android Build Support/SDK/NDK/OpenJDK,
and import `UnityProjects/CrushXLensEngine`. Keep the configured Built-in renderer;
URP capture/native background remain explicitly unsupported until a renderer
feature is implemented and validated. Run both EditMode and PlayMode suites.

The existing Windows runner creates isolated logs, XML and a development test APK:

```powershell
$repo = (Resolve-Path '.').Path
pwsh ./tools/run_unity_checks.ps1 -Repository $repo -Unity 'C:\Program Files\Unity\Hub\Editor\6000.0.30f1\Editor\Unity.exe' -CacheRoot "$repo\work\unity-cache" -Artifacts "$repo\work\unity-artifacts" -RunPlayMode -BuildAndroid -Package 'in.crushx.lens.devtest.advanced'
```

Use the actual licensed Editor path. Inspect XML, build logs, generated APK
manifest and build-info identity; command invocation is not a passing result.
No signing secrets are supplied or needed for the isolated debug package.

Select the actual OnePlus serial and read its exact model before collecting:

```bash
adb devices -l
adb -s SELECTED_SERIAL shell getprop ro.product.model
adb -s SELECTED_SERIAL shell getprop ro.build.version.release
python tools/collect_android_evidence.py --serial SELECTED_SERIAL --package in.crushx.lens.devtest.advanced --seconds 60 --output work/oneplus-evidence
```

Collection is read-only by default and keeps logs local. An optional install uses
the existing tool's explicit `--install`, exact `--expected-model`, matching
`--build-info`, APK and manifest inspector parameters; it was **not run here**.
Do not treat the marketing device name as the exact hardware model identifier.

## Device acceptance

1. Start with permission denied, grant it, revoke/expire it, return from Settings,
   background/foreground repeatedly, and interrupt initialization. Confirm bounded
   recovery and no repeated camera ownership. AR readiness requires the actual
   requested direction, fresh textures and a rendered background. Confirm front
   AR where supported and honest native fallback where unsupported.
2. Use asymmetric text/hand markers at all four screen rotations. Check preview,
   saved PNG, MP4 playback and both export-flip modes. Display metadata alone
   cannot establish upright pixels or correct mirroring. Change safe areas and
   rotate during a gesture/recording; stale gestures and interrupted media must
   not succeed.
3. Swipe very short/long/fast in both directions, add a second finger, cancel,
   hold/release the shutter and use Android Back. Each completed swipe selects at
   most one adjacent visible lens. Buttons, grade/quality, categories, favourites,
   recent consent and search must remain accessible without face detection.
4. Test physical face size/pose, cover/uncover, leave/re-enter view and switch
   people. Confirm tracking expiry, snap on identity change and no stale expression
   triggers. ARCore pose/mesh alone must not animate a model-driven mouth or blink.
   Validate Fox art/rigging/licence and real alignment/occlusion independently.
5. Record silent/audio clips, short and maximum-duration clips, stop/cancel, full
   disk/save conflicts and interruptions. Reopen completed private drafts. Save
   to gallery on API 29+, cancel export and verify no partial/pending rows. Test
   Unity and an independent decoder/player. The current encoder is explicitly
   15 FPS / 1280 pixels / 30 seconds, not a 30/60 FPS recorder.
6. Use the Creator Editor to preview/save/import/apply a preset and verify its
   identity/configuration fingerprint in captured metadata. Reject tampered,
   unknown-dependency, invalid-revision or unreviewed packages. No binary bundle
   loader or publishing transport is implemented.

## Validate a real device clip locally

Copy only a deliberately selected test clip into local `work/device-media/`.
For a five-second portrait recording made with microphone enabled:

```bash
python tools/validate_captured_media.py --input work/device-media/clip.mp4 --expected-orientation portrait --expected-duration 5 --duration-tolerance 0.5 --require-audio --max-av-skew 0.15 --output work/device-media/clip-evidence.json
```

Specify `--expected-width` and `--expected-height` once the real capture dimensions
are known. The tool hashes the file, checks streams/dimensions/display rotation/
duration/packet timelines and fully decodes with FFmpeg. It never uploads footage.
A passing container/decode/timestamp result does **not** prove visual orientation,
selfie mirroring, lens alignment or perceptual lip sync. Film a clap/visible mouth
motion and measure the visible/audio event offset separately. No real device
clip was available to validate during this task.

## Profiling and model/app blockers

Attach Unity Profiler to the development player with deep profiling disabled.
Inspect CPU markers `CrushX.Tracking.SampleAndSmooth`,
`CrushX.Lens.AttachAndAnimate`, `CrushX.Capture.Readback` and render samples
`CrushX.Beauty.Composite`, `CrushX.Capture.Copy`. Existing development telemetry
reports sampled game FPS, p95/max frame time, memory, GC and battery every 15s;
game FPS is distinct from camera image delivery, inference latency and encoder FPS.

Measure cold/warm startup and sustained 15-minute standard-lens sessions with
repeated lens switches and capture/export, noting quality setting, ambient
conditions and actual OS/AR-service/GPU versions. Compare thermal/memory behavior:

```bash
adb -s SELECTED_SERIAL shell dumpsys meminfo in.crushx.lens.devtest.advanced
adb -s SELECTED_SERIAL shell dumpsys thermalservice
adb -s SELECTED_SERIAL shell dumpsys battery
```

No 30/60 FPS, latency, thermal or leak target has been measured or achieved here.
Missing MediaPipe/segmentation/hand/body runners/models and reviewed licences must
be supplied before those capabilities can be tested. GPU particles/advanced VFX
authoring and URP renderer integration remain incomplete. The full v402 React/
Capacitor application is absent: a real host launcher/composer adapter, content URI
handoff, durable account drafts/catalogue and authenticated publish contracts are
still required. See the implementation report for exact phase boundaries.
