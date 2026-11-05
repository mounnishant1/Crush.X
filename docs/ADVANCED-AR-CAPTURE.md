# Capture and Android gallery implementation

Phase 5 changes build on feature branch `feature/crushx-advanced-ar-lens-engine`,
Phase 4 commit `12721e445f366ee9c3c8db049736a2e4fe33d344`. The source baseline review
is recorded in `ADVANCED-AR-SOURCE-BASELINE.json`. Playback, separate microphone
permission and retained-save behavior were recovered selectively from the richer
Unity source at `928a57ad823ae480baccfdb3ad8cfe9701f1d841`; later camera ownership,
permission and touch fixes are retained.

## IMPLEMENTED behavior

`NativeMediaCapture` copies the active camera's rendered image at Built-in
`CameraEvent.AfterEverything`, after the GPU beauty/color compositor and before
overlay UI. It does not open another hardware camera. On Android a live
`CameraSessionController.PreviewReady` and its `RenderCamera` are required. Both
AR and native-camera fallback previews use this path; native fallback does not
claim face tracking. A new hardware-image sequence and a corresponding render
are required before capture progresses. Repeated render callbacks alone cannot
refresh capture progress.

- Photo output is an actual encoded PNG, at most 2048 pixels on its longest side.
  The service waits for a rendered image, writes the file and checks its
  dimensions/chunk boundaries/terminal IEND before reporting a preview.
- Android video uses the existing actual MediaCodec AVC byte-buffer encoder,
  MediaMuxer MP4 container and optional AudioRecord/AAC microphone track.
  **The current CPU recorder is limited to 15 FPS, 1280 pixels per side and 30
  seconds.** It is not a measured 30/60 FPS production recorder or a GPU surface
  encoder. Unsupported I420/NV12 encoder layouts and dimensions fail explicitly.
- A microphone permission action occurs before a shutter hold. Denial permits
  explicitly silent recording. The recorder never accesses the microphone when
  audio is disabled or permission is unavailable.
- A single pending frame bounds native queue memory. Busy encoders drop frames
  instead of growing an unbounded queue. Video PTS use the native monotonic
  clock, adjusted by the captured frame's readback age. Audio PTS use counted
  PCM frames. Actual encoded-frame output and successful frame submissions must
  advance; a three-second stall cancels the capture.
- Camera generation changes, orientation/dimension changes, lost preview,
  backgrounding or lost focus cancel in-flight capture. Start/finalization waits
  are bounded. Completed preview drafts survive disable/navigation and can be
  restored from their private metadata sidecar. Explicit Retry deletes the
  pending draft. A failed Save retains it for retry.
- MP4 completion requires native track/dimension/duration/readable-sample checks,
  requested audio, and an audio/video duration difference no larger than 500 ms.
  The C# layer also checks complete top-level MP4 box boundaries with ftyp,
  mdat and moov. These checks do not establish decoding quality or lip sync.
- `MediaPreviewPlayer` uses Unity VideoPlayer to prepare/play the completed local
  MP4. An unavailable decoder, error or eight-second preparation timeout retains
  the draft and reports the failure. There is no simulated video playback.
- `CaptureMirrorMode.MatchPreview` preserves the rendered pixels.
  `FlipHorizontally` flips the complete rendered camera/effect image together.
  The setting is frozen per capture and recorded as a relation to the rendered
  preview. Absolute AR-provider selfie mirroring is not inferred. Photo creation
  time is the first captured render receipt; video creation time is the native
  recorder start UTC. Completion UTC and the first-video-frame offset are
  separate metadata fields.

`NativeLensUI` uses the shared `ShutterGesture`: tap requests a photo, hold
requests video, release stops it, and one gesture makes one decision. Its
recording ring/duration, explicit microphone action, playback controls, export
mirror switch and Gallery action use the real capture APIs. Cancellation cannot
discard media already finalizing or in preview. Camera switching is blocked
during capture; generation checking also catches external changes.

## Gallery and privacy

`CrushXGalleryExporter` is a background-thread Android 10/API 29+ MediaStore
exporter. An explicit Gallery action first saves the completed private capture,
then copies it to Pictures/Crush.X or Movies/Crush.X. No broad storage permission
is requested. Older Android versions retain private-save support and report
gallery export as unsupported.

Only direct children of this app's canonical
`<filesDir or externalFilesDir>/CrushXLensCaptures/saved` directory are accepted.
The exporter checks the media type/header and bounds files to 128 MiB. A single
64 KiB copy buffer and source-size checks bound memory and copied bytes.
MediaStore `IS_PENDING` is cleared only after successful copying. Failure or
cancellation removes the pending row; cancellation after the ready/committed
state preserves the gallery item. Component teardown requests cancellation;
cleanup runs when the provider's in-progress operation returns. Runtime
MediaStore/provider behavior still requires device tests.

Camera frames, face data and recordings remain on the device. This code has no
network upload, external AI service or publishing call. Camera access belongs to
the existing camera permission gate; optional microphone access uses Android
RECORD_AUDIO. Private files require no gallery permission. Unity video and image
conversion modules are declared explicitly.

## Host/editor contract

The native receiver additionally exposes `RequestMicrophone`, `StartRecording`
(`"true"`/`"false"`), `StopRecording`, `SaveCapture`, `RetryCapture`,
`ExportSavedCapture` and `SetCaptureMirror` (`MatchPreview`/`FlipHorizontally`).
`UnitySendMessage` remains asynchronous; calling a method is not evidence of a
completed file. Hosts must observe capture completion/failure events.

`PreviewReady` means a completed private draft exists; `MediaSaved` means Save
has committed its move into private saved storage. `GalleryExportCompleted`
returns a real content URI only after MediaStore publication. Draft metadata
passed through `LensWorkflowBridge` includes dimensions, MIME type, duration,
audio, orientation, mirroring, capture/completion UTC and first-frame offset.
The existing `ILensComposerHost` adapter is still required to open the app's
Story/Reel/Post editors. No Android host application source or working composer
adapter was invented, and no editor/publishing integration is claimed.

## TESTED in this cloud workspace

Commands from the repository root:

```sh
python3 tools/check_engine_core.py \
  --dotnet work/qa/toolchains/dotnet/dotnet \
  --output work/qa/engine-core-phase5
python3 tools/check_android_media_java.py \
  --ecj work/qa/toolchains/ecj-3.38.0.jar \
  --android-api work/qa/toolchains/android-all-14.jar \
  --output work/qa/java-phase5
python3 -m unittest discover -s tests -p 'test_unity_source.py'
git diff --check
```

- Actual platform-independent C# runtime code: **103/103 passed**, including 33
  capture/container/liveness/shutter cases; zero build warnings/errors.
- Actual Android Java sources compiled as Java 8 against Android 14 APIs:
  **26/26** recorder conversion/argument/timestamp/watchdog cases and **26/26**
  gallery path/header/size/copy/cancellation cases passed. Three existing
  deprecation warnings concern explicit I420/NV12 format constants.
- Unity source/asset checks: **20/20 passed**. These include syntax/metadata
  checks, not Unity compilation or device execution.
- A microphone permission API/JNI exception is caught, clears waiting state and
  reports a retryable capture error. A source regression guards that error path;
  Android permission failure injection was not executed.
- Unity-only tests additionally cover unsupported Editor video/gallery,
  missing playback and retention of a valid private PNG when its real file move
  fails or the component disables. Those tests are **NOT EXECUTED** here.

## BLOCKED / device verification

No licensed Unity 6000.0.30f1 Editor, Android SDK/NDK build support, ADB-connected
OnePlus 9 Pro or signed/installable APK is available in this workspace. The Java
API compile and host tests do not run Android MediaCodec, AudioRecord,
MediaStore or Unity VideoPlayer. No camera recording, gallery export, physical
orientation, microphone synchronization or performance target is reported as
tested.

Capture intentionally rejects an active SRP/URP renderer until a validated
renderer feature replaces the Built-in camera event bridge. Avoid enabling URP
and treating the explicit unsupported result as a completed capture pipeline.
The CPU readback/JNI/YUV path remains a performance limitation. A future GPU
surface encoder must preserve these state, timestamp and failure semantics.

Use the existing `docs/ANDROID-VERIFICATION.md` / `tools/run_unity_checks.ps1`
workflow for a clean Unity import, EditMode/PlayMode run and isolated development
APK. On the actual OnePlus, verify:

1. Front AR preview and native fallback each capture a real image with visible
   effects and no controls. Test all four rotations, export-flip options,
   safe areas, camera switches and face loss.
2. Tap, short hold, long hold, maximum duration, cancellation, Back,
   foreground/background and permission denial never report fake media.
   Reopen a completed draft after leaving the native activity; simulate a full
   disk or save conflict and confirm Retry/Save recovery.
3. Record with microphone off/on. Play every MP4 in Unity and an independent
   Android player. Export to MediaStore, verify an actual gallery item, then
   cancel/reopen during export and inspect for partial/pending items.
4. Pull only the deliberately selected test recording to local review storage.
   Inspect it with `ffprobe -v error -show_streams -show_format clip.mp4` and
   `ffmpeg -v error -i clip.mp4 -f null -`. Check dimensions, rotation metadata,
   duration, real decodability and both tracks. Film a clap/visible mouth
   movement to measure A/V offset; matching durations alone are insufficient.
5. Repeatedly switch lenses and record/export while collecting existing
   profiling/log evidence. Measure frame delivery, encode drops, memory and
   thermal behavior; the 30/60 FPS goals remain unmeasured.
