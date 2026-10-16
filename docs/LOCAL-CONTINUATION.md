# Local continuation for review

Historical source repair report for `3c8f637`, before authorized GitHub sharing. Current publication/installation status is in [FINAL-LENS-ENGINE-STATUS.md](FINAL-LENS-ENGINE-STATUS.md); see [VERIFICATION-TOOLING-REVIEW.md](VERIFICATION-TOOLING-REVIEW.md) for the 16 October tooling follow-up.

15 October 2026. Based on the previously pushed draft PR #4 source `0843da3`.
All changes described here are **local only**, in the isolated
`codex/crushx-final-lens-engine` worktree. No further Git push, device installation, deletion of
user files, deployment, publication, or AWS production operation was performed in this round.
The original checkout remains clean at `a4135f99987601e3fbcf6bbaa0b5af8c7598e8e1`.

The user confirmed the development environment is Windows 11 on an HP ZBook, with repository
`F:\CrushX-Git\Crush.X`, Unity project `UnityProjects\CrushXLensEngine`, Android SDK/ADB installed,
OnePlus 9 Pro, and APKs under `F:\CrushX-Temp`. **No Windows remote runtime is connected.**
Linux source checks do not establish the state of those Windows files or the installed phone build.

## Findings on the original OnePlus failure

The exact device root cause and subsystem/native failure reason remain **NOT ESTABLISHED**.
The old label “Face tracking unavailable” combined several different conditions. Camera preview,
carousel interaction and selection of Fox each can work while the face subsystem is missing,
stopped, has no detected face, or has faces that are not Tracking.

| Area inspected | Source evidence | Still needs real evidence |
| --- | --- | --- |
| Packages/loader | Unity 6000.0.30f1, AR Foundation/ARCore 6.0.8; Android ARCore loader and XR automatic load/run configured. | Actual installed APK package versions, loader initialization and AR service/native errors. |
| Android camera | ARCore owns CAMERA manifest/permission flow; source requests User camera. | Merged manifest, actual permission/app-op/profile, requested/current direction and selected native camera configuration. |
| AR rig/subsystems | Native scene has active ARSession, XR Origin, ARCameraManager and ARFaceManager; one face requested and face prefab assigned. | Actual session/camera/face subsystem IDs/running states and tracked-face count. |
| Device support | OnePlus 9 Pro is listed as ARCore-supported. | Actual model/OS/service build; support does not prove successful runtime face initialization. |
| Fox asset/binding | Existing prefab/model/material GUIDs resolve, renderer is enabled, object active and camera culling includes its layer. Binding is to ARFace.transform. | Imported mesh/material/shader rendering, actual tracked face, runtime parent/scale/renderer and visible alignment. |

There is no generic `XRFaceSubsystem.failureReason`. Full Logcat must supply the exact ARCore
configure/resume error, if any. `ARSession.notTrackingReason` is not a face-provider failure reason;
`Unsupported` there does not prove unsupported hardware. Front-camera world tracking can stay
paused while Augmented Faces track.

**Smallest safe next AR fix:** preserve current camera requests and XR configuration, collect one
correlated failure interval from the exact installed build, then change only the setting or lifecycle
path identified by that evidence. No speculative camera chooser, tracking-mode, autofocus, graphics
API, prefab scale or ARAnchor change was applied. The native scene, XR settings, PlayerSettings,
original Fox prefab and model/material/texture bytes are unchanged relative to PR #3.

Existing development diagnostics already record permission, loader/session/configuration,
requested/current camera, face subsystem/trackable states, lens/Fox renderer and lifecycle snapshots.
Logs distinguish initialization failures from ordinary absence of a face. They are development/Editor
logs with bounded periodic samples, rather than a new permission owner or automatic recovery loop.

## Confirmed continuation defects repaired

- The microphone prompt previously occurred during a held shutter gesture. Its focus/pause event
  canceled that gesture and invalidated preparation. Mic access is now requested explicitly from
  the Mic toggle **before** a shutter hold. Permission callbacks never start a recording. Denial
  keeps silent video available.
- Photo countdown now cancels on focus loss as well as pause. Filtered carousel navigation enters
  its first/last result when the current lens is absent, instead of skipping the first result.
- Completed MP4 previews now use Unity VideoPlayer, a bounded RenderTexture and optional local
  audio, with Play/Pause, finite preparation timeout and resource cleanup. Decode failure preserves
  the completed file and its rendered poster. This is implemented source, not verified playback.
- A recoverable private Save failure keeps the draft and reopens its video playback. Save IO is
  separated from completion notifications. Error text clears when the user retries/new capture.
- Automatic video stop can reach Finalizing/Preview before touch release. A stale canceled shutter
  now preserves those states instead of deleting the finished clip through Retry.
- Selection still builds an inactive candidate before releasing the prior effect. Generated meshes
  have explicit idempotent cleanup, including never-active failed candidates. A failed restoration
  reports Failed, permits retry of the same ID and restores the diagnostic lens identity without
  falsely claiming the prior lens rendered successfully.
- Renderer failures for camera-only filters can now be reported without requiring a tracked face.
  Detailed face tracking remains independently observable.

These are source-level defects independently reviewed from control flow. None is presented as the
proven cause of the original OnePlus face-tracking failure.

## Three real camera filters

Warm Cinema, Noir Film and Neon Duotone have distinct implemented shader processing, not metadata
placeholders. They use an explicit Resources shader, require Built-in rendering and a running camera,
and require no face/expression/hand tracking. Unsupported pipelines/shaders reject selection while
retaining the prior effect. Owner tokens prevent an old filter from clearing a newer selection.
Inactive candidates allocate no filter material; deselection/destruction release their own material.

The catalog now has 14 entries: 10 procedural 3D prototypes, the existing imported Fox Mask and
3 color filters. **Zero** entries are device-verified in this work. Missing thumbnails and unmeasured
performance remain explicit; the separate 160-lens target is not complete.

## Windows handoff improvements

See [ANDROID-VERIFICATION.md](ANDROID-VERIFICATION.md) for exact PowerShell commands and focused
physical acceptance gates. The runner uses F:\CrushX-Temp cache/output defaults and unique run
folders, verifies the selected Editor version before opening the project, and builds only a separate
development package. The new PowerShell evidence wrapper requires explicit device serial/package,
checks Python 3.10+, discovers installed tools or accepts explicit paths, and has no installation path.
The collector retains the observed foreground Android user and raw package per-user/app-op
evidence for profile corroboration. The follow-up removes the unsupported dedicated permission
shell command and leaves grant interpretation explicit, rather than guessing a profile grant.

No command in the handoff installs an APK, deletes data/logs/files, pushes Git, or deploys anything.
The currently installed build can supply failure evidence but cannot verify newly repaired code.

## Validation actually completed

- Host Python tests: **32 passed** (15 source/asset checks and 17 evidence/guard tests). These include
  source parsing of **46 C# files across six define configurations**, asset/GUID/build-scene/package
  checks, read-only device-command mocks and the observed secondary Android user permission probe.
- Patch whitespace and metadata/GUID checks passed. Original Fox assets, native scene and XR/
  PlayerSettings files remain unchanged. Original checkout is still clean.
- Nine new filter EditMode cases plus other focused additions bring the authored suite to **81
  EditMode cases and 2 PlayMode cases**. **None was executed in Unity.** Headless graphics tests
  may be skipped; inspect XML and run shader/material tests with graphics before claiming a pass.
- Earlier Java 8/API34 compilation and eight pure JVM RGBA/YUV tests remain applicable to the
  unchanged Java source. No Android codec, camera or microphone was executed.

Pending: Windows PowerShell execution, Unity import/type compilation/tests, shader compilation,
Android Gradle/APK/merged manifest, read-only OnePlus reproduction, and any separately authorized
installation/acceptance of the newly built test APK. No real photo/video, decode/audio sync,
visible Fox alignment or measured device performance result exists from this environment.
