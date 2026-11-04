# OnePlus 9 Pro Android 14 acceptance — 1 November 2026

All device cases below are **NOT EXECUTED** here. No phone, Unity Editor or Android
SDK/ADB is attached. A requested/selected 30 FPS profile is not a measured result.
Retain the original `ADVANCED-AR-DEVICE-HANDOFF.md` instructions alongside this
recording-focused extension.

## Build identity and baseline

- Record the exact Git SHA, clean/dirty status, APK SHA-256 and build-info JSON.
  Run actual Unity import, EditMode and PlayMode tests before the isolated Android
  development APK. Use `tools/attempt_unity_android_build.py --unity <licensed
  Unity 6000.0.30f1 executable> --output work/android-build-device --attempt-build`.
- Record exact hardware model (`adb shell getprop ro.product.model`), OxygenOS/
  Android build, AR service, graphics API/driver, battery/thermal state and quality
  setting. Do not assume a hardware SKU from the marketing name.
- Confirm the installed package is the isolated `in.crushx.lens.devtest.advanced`
  build. No production package/data or AWS service is changed by these procedures.

## Camera, tracking and controls

| Case | Required result | Evidence |
| --- | --- | --- |
| Cold launch; camera permission deny/grant/revoke; one-time grant expiry; return from Settings | No stuck permission state, bounded recovery, one camera owner | Local full Logcat and actual camera/session direction/state |
| Front default and camera switch | Actual front AR configuration where supported; honest native front/rear fallback otherwise; no inferred ARCore front capability | Rendered asymmetric text/hand marker plus actual requested/current facing state |
| 0/90/180/270° rotations and display cutouts | Upright, aspect-correct preview and output; safe-area controls remain usable | PNG/MP4 samples and visual comparison, not just width/height metadata |
| Face covered/lost/reacquired; another person enters | Stale pose expires; identity changes reset smoothing; no mask jumps between people | Tracking state/age and real face motion, without uploading face data |
| Model absent/incompatible/stopped | Real pose or native preview continues; no fabricated expressions/segmentation | Loader status, actual capabilities and neutral unsupported triggers |
| Short/long/fast swipes, vertical gestures, two fingers, canceled touches, Back | At most one adjacent visible lens per accepted swipe, no ghost shutter/buttons | Manual screen interaction and selected lens ID |
| Favourites/recent consent/search/categories, color grade and beauty | Existing navigation preserved; mask effects require real registered masks | Real controls/selected state and no hidden touch blockers |

## Photo and recording

1. Capture a real photo with a moving lens/color effect. Check high-quality PNG,
   correct orientation, no UI controls, and both export mirror settings. Flip the
   whole effect/camera image together; use a readable asymmetric marker to inspect
   actual selfie pixels.
2. Request microphone permission explicitly before holding the shutter. Test
   silent, allowed, denied, one-time expired and Settings-return cases. Tap must
   produce a photo; hold/release must record/stop real MP4, with recording ring and
   duration. Very short, failed and interrupted clips must not report success.
3. On the async path, verify the real GPU calibration succeeds and no calibration
   pattern ever appears in exported media. Check `RecordingMetrics.ReadbackPath`
   and `ReadbackRowLayout` from the completed capture sidecar. Exercise GLES3 and
   Vulkan only when supported by the actual build; do not assume equal row order.
4. Record 20–30 second clips with representative Cat/Fox/helmet effects, motion,
   color grade, and real segmentation/beauty only if its reviewed runner is
   installed. Record requested and selected FPS separately. A 15 FPS compatibility
   selection must remain explicitly labelled; it does not pass the 30 FPS target.
5. Stop while GPU reads are pending. Audio must stop at the capture boundary while
   previously captured frames drain in order, with no added microphone tail,
   duplicated frames, unsafe buffer disposal or stuck finalization. Cancel and
   immediately retry; retired GPU resources must be released before reuse.
6. Background/foreground, rotate, switch camera externally, revoke permission and
   simulate full storage during preparation/recording/finalization. In-flight
   media may fail explicitly; completed private drafts must survive navigation,
   activity recreation and Save conflicts. Explicit Retry may discard the draft.

## Measure actual encoded cadence and audio

Pull a deliberately selected real test clip into local `work/device-media/`.
For a 20 second portrait clip recorded with microphone audio:

```bash
python tools/validate_captured_media.py --input work/device-media/oneplus-20s.mp4 --expected-orientation portrait --expected-duration 20 --duration-tolerance 0.5 --require-audio --expected-fps 30 --fps-tolerance 1 --max-frame-gap 0.1 --max-av-skew 0.15 --output work/device-media/oneplus-20s-evidence.json
```

Use actual expected display dimensions via `--expected-width`/`--expected-height`.
Omit `--require-audio` only for an intentionally silent clip. The tool computes
frame cadence from actual packet presentation timestamps, rather than nominal
frame-rate tags, and performs a full FFmpeg decode. It reports frame count,
presentation FPS, median/p95 intervals, maximum gap and audio/video packet skew.

Compare the clip with completed `RecordingMetrics`: requested/selected FPS,
rendered/readback/submitted/encoded counts, backpressure/encoder drops, skipped
deadlines, readback latency, capture duration, audio clock source/offset and native
measurement availability. Missing metrics are not a successful measurement.

A suggested cadence acceptance gate is 29–31 presented FPS over each full clip,
with no gap above 100 ms. This is a test criterion, **not an achieved result**.
Review the p95 interval as well as the mean. Packet cadence cannot prove distinct
sensor frames, lens alignment or perceptual lip sync. Film a clap and visible
mouth movement; measure the visible/audio event offset separately (initial and
end-of-clip, suggested absolute bound 100 ms) and record the method/results.
An AudioTimestamp anchor is preferable; identify any PCM-count fallback explicitly.

Repeat clips/lens switches for at least 15 minutes and collect CPU/GPU Profiler,
game/camera/encoder delivery, memory/GC, battery and thermal observations. Game FPS,
camera FPS and encoded FPS are separate quantities. JNI array transfer and CPU YUV
conversion remain in the source candidate; it is not a zero-copy surface encoder.

## Gallery and actual app integration

| Case | Required result | Current environment status |
| --- | --- | --- |
| Private Save/reopen | Completed media and creator/lens/recording metadata survive; no loss on screen change | Device test blocked |
| Explicit Gallery on API 29+ | Actual Pictures/Movies item and real content URI; no broad storage permission | MediaStore execution blocked |
| Cancel/fail gallery export | No orphan pending row; already committed exports remain | Device/provider test blocked |
| Story/Reel/Post import | Real host receives URI/access grant, dimensions/MIME/audio/orientation and lens/creator metadata | **Blocked: full v402+ host source and registered composer adapter missing** |
| Photo/video editor, draft reopen, Story/Reel export | Effects/orientation/audio preserved through actual editors; no publish success without real backend completion | **Blocked: real editors/draft/export contracts missing** |

The browser sample is not a replacement for these native application flows. Obtain
the reviewed full source and implement the actual Unity-as-Library launcher/result
bridge, FileProvider/content-URI ownership, composer routes, account draft lifetime
and authenticated publishing contract before marking those rows passed.
