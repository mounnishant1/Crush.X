# Crush.X native lens engineering status

15 October 2026. Branch: `codex/crushx-final-lens-engine`.

This is an implemented **development candidate**, not a production-ready release.
The latest continuation is local only; PR #4 remains at `0843da3`. No further Git push or
APK installation is authorized for this round. See [LOCAL-CONTINUATION.md](LOCAL-CONTINUATION.md). The OnePlus
back-camera/face-tracking failure has **not** been reproduced or assigned an exact native failure
reason in this environment. Physical acceptance remains blocked. No production AWS, API, auth,
database, upload, store deployment, merge, or user-content publication was performed.

## Baseline and provenance

- Original workspace/main: `a4135f99987601e3fbcf6bbaa0b5af8c7598e8e1`, clean and preserved.
- Appropriate feature baseline: PR #3, `446459fec20103fc007d38268ab763a7e9b3939d`, still draft/unmerged
  at investigation. Work uses a separate worktree/branch based on that exact source.
- Unity 6000.0.30f1; AR Foundation/ARCore 6.0.8; XR Management 4.5.2;
  Input System 1.11.2; URP package 17.0.3. Configured active pipeline is Built-in.
- This execution environment is Linux. The Windows F: repository/Editor, a Unity license/Editor,
  Android SDK/ADB, and an attached phone are unavailable. Java runtime and ffprobe are available.
  Confined ECJ and API34 reference jars were used only for host Java validation; they are not shipped.
- Android build settings select Unity 6 entry mode `androidApplicationEntry: 2`. There is no generated
  APK/merged application manifest here, so the installed launch activity cannot be asserted.
- `LensRuntimeEntry` routes Android `CrushXStartup` to enabled `Assets/SCENES/CrushXNativeAR.unity`.
  This scene owns the AR rig, engine, UI and Fox bridge. Bootstrap creates the AR face provider.
- The repository has a standalone web UI with upload infrastructure, but no native host launcher,
  authenticated native composer implementation, licensed music integration, or AURA-X runtime.
  No new live service calls or guessed host routes were introduced.
- Legacy mock/procedural/resource/SnapAR implementations remain. Android ordinary players never
  substitute the Editor/Standalone mock provider for an unavailable AR provider.

## Implementation commits

| Commit | Scope |
| --- | --- |
| `af21887f23c335d5d231b0ba631abc69213da99f` | AR diagnostics, capability provider, tracker reset, guarded build/device evidence tools |
| `04cb0dcf8b1227bc956ec6131335a7f4866788a1` | Rendered photo drafts and bounded Android AVC/AAC capture |
| `8d170687468b06c26dd113498ef3200d2a49eba5` | Fox attachment/material ownership, safe-area UI/gestures, lens capabilities, explicit local workflows and tests |
| `dbd3ede1e10f3330b4251f67a3990285d9ac0bec` | Conservative verification metadata, permission focus recovery and local usage queries |

The prior documentation commit `0843da3` recorded the first report. The current local continuation
adds capture/permission/focus fixes, video playback, three camera filters and Windows handoff tooling.
Use `git log 446459f..HEAD` for the exact final branch history.
See [CHANGED-FILES.md](CHANGED-FILES.md) for every added/modified file.

## AR investigation and actual repairs

PR #3 already has an assigned ARCore loader, enabled Android XR auto-start, active ARSession,
XR Origin and ARFaceManager, requested maximum face count 1, assigned face prefab, and requested
User camera. That establishes configuration requests, not actual device initialization.
The camera permission flow is provided by ARCore; the lack of custom request code is not a finding
of missing permission. The actual merged manifest and runtime grant remain unverified.

`ARFoundationFaceProvider` requires a running face subsystem and a face in Tracking. The old UI
collapsed missing manager, missing/stopped subsystem and no tracked face into one label. Fox selection
can succeed independently of tracking, and Fox intentionally waits for a real tracked face.
No ordinary world anchor is needed or added. Face tracking remains independent of world positional
tracking success. No `XRFaceSubsystem.failureReason` property was invented.

The new diagnostic service reports build/commit/package metadata; device/AR-service versions when
queryable; permission observations; loader and session state/reasons; requested/current direction,
tracking modes and selected/supported configurations; camera/face subsystem identity/running state;
face counts/IDs/states; pipeline/GPU; lens/Fox binding and renderer observations; scene/lifecycle.
Logs are transition-based with bounded periodic snapshots. Detailed queries/logging are compiled for
development/Editor only. Release UI can use the conservative classifier. Raw native configure/resume
errors are captured separately by full Logcat, never synthesized from a status label.

Confirmed source defects repaired:

- Deferred destruction could leave an old Fox instance active until frame end. Attachments now hide
  immediately before destruction, reconcile by trackable ID, clear on pause/disable/loss and rebind
  while preserving prefab scale. No alignment/scale guess was applied.
- Runtime fallback shader lookup lacked an explicit Built-in build reference. A Resources Standard
  material and shared compatible material cache preserve texture/tint and have explicit disposal.
  Actual shader stripping was not proven to be the reported device cause.
- Small filtered carousel lists could produce negative wrapped indices. Wrapping now handles small
  lists and integer extremes. Drawing and touch hit testing share safe-area coordinates.
- Carousel and camera/shutter gestures now have a single owner. Drag release does not also tap a
  GUI button. Canceled/multi-touch gestures, pause/focus loss and resolution changes cancel safely.
- Controls are independent of face detection. Search, Favorites and opt-in device-local Recent tabs,
  timer, long-press recording and private media preview/retry/save use real implemented actions.
- Lens construction happens before the old effect is destroyed; build/selection failure retains the
  previous selection. Required/optional provider capabilities are distinct; ARCore claims no
  expression or hand data. Catalog verification defaults to NotTested.
- Photo capture no longer returns an unfinished save path or requires a tracked face. Android capture
  requires a granted, running camera. Actual completion events follow file validation.
- Scene generation now enables the native build-scene entry rather than adding it disabled.

The reported actual rear-camera selection, absent Fox alignment and missing device carousel remain
unresolved physical observations. The positional tracking request and graphics API list were not
changed speculatively. The list is GLES3 first, Vulkan second; collect actual graphics API and
configuration before deciding whether to remove an unused fallback or change chooser/mode behavior.

## Lens inventory and limits

There are **14 catalog entries**, not 160 completed lenses:

| Kind | Count | Evidence and limitations |
| --- | --- | --- |
| Procedural 3D prototypes | 10 | Animated Cat, Playful Puppy, Cyber Visor, Fox Spirit, Holographic Crown, Butterfly Wings, Robo Helmet, Celestial Halo, Neon Glow Mask, Dragon Breath. Real geometry/animation source exists; Android rendering/alignment is not verified. |
| Imported 3D face asset | 1 | Fox Mask 3D. Existing OBJ/material/texture/prefab references retained. Source OBJ has 49,980 vertices and 60,827 faces; actual imported subobjects and rendered triangle cost require Unity. |
| Native lenses verified on this physical device in this work | 0 | No device was accessible. |
| Native color filters implemented/verified | 3 / 0 | Warm Cinema, Noir Film and Neon Duotone use an actual Built-in fullscreen shader; Unity shader compilation and physical rendering remain unverified. |
| Reliable expression/hand providers | 0 / 0 | ARCore face pose/mesh capability is distinct from expressions or hands. |
| Authored thumbnail assets | 1 | Existing Fox thumbnail; procedural preview thumbnails remain missing. |
| Additional finished premium lenses | 0 | The remaining catalog target requires real assets/effects and independent validation. |

The manifest now records required/optional tracking capabilities, implementation kind, asset/preview
references, quality description, compatibility/minimum API, verification level and explicitly unknown
performance estimates. These fields do not manufacture assets or measured budgets. Existing imported
assets are preserved; no proprietary third-party lens assets or songs were added.

## Media and integration behavior

Photo/recording capture copies the configured Built-in camera framebuffer before IMGUI overlays.
Photo PNG drafts are header/dimension checked and previewed before explicit private Save. The old
`CaptureManager.SavePhoto` wrapper returns null; consume `PreviewReady`/`MediaSaved` for completion.

The Android source library probes an advertised planar/NV12 AVC encoder and records actual rendered
RGBA frames with optional authorized microphone AAC into MP4. It bounds the pending frame queue,
recording duration to 30 seconds, output to at most 1280 pixels on either side and target capture to
15 FPS. This is a conservative CPU readback implementation, not a measured high-performance GPU
encoder. It handles microphone denial with silent video, initialization/finalization timeouts,
cancellation/interruption and resource cleanup. MediaExtractor checks tracks/dimensions/readable
samples/positive duration and rejects large audio/video duration differences. This is not proof of
decoded playback, lip sync or correct selfie orientation. The local continuation adds VideoPlayer
playback with pause/play and optional audio; a rendered poster remains the fallback on decode failure.
No actual video playback was executed in this environment.
SRP capture explicitly reports unsupported until a validated renderer feature exists.

`LensWorkflowBridge` accepts validated local search/recommend/select/most-used/draft commands and
records completed saved media. `LensNaturalLanguage` is a small deterministic vocabulary, not a
connected AI model or selfie analysis. It rejects unbacked trend claims and publishing/sending
requests. A draft command creates editable local metadata only. `ILensComposerHost` is an explicit
extension point; no host adapter is registered in this repository, so Story/Reel/Snap/Chat/Feed
navigation and cross-package file transfer remain incomplete. No content is automatically sent.

Favorites are explicit; usage/history collection is off until the user enables the on-device Recent
setting. Disabling clears usage/history while retaining favorites. Active browsing order stays stable.
No music catalog, real trend source, AURA-X service or AI Lens Factory was fabricated or deployed.

Development performance probes record actual sampled FPS, p95/max frame time, memory/GC and battery
observations when the player runs. Economy/Balanced/High geometry budgets bound generated ring
segments; they are not benchmarked device ratings. No device performance/thermal data was captured.
Camera switching and flash controls remain unimplemented rather than exposing ineffective controls.

## Verification actually performed

| Check | Status | Evidence |
| --- | --- | --- |
| Python source/asset suite | PASS | 15 cases; 46 C# files parsed under six define configurations (including Android development and Android-target Editor), asset/GUID/build-scene/dependency checks. No Unity type resolution or compilation. |
| Python evidence/guard/timeout suite | PASS | 17 cases with subprocess/device mocks; verifies no default device writes, exact package/build checks, raw error retention and finite capture. |
| Java compilation | PASS | ECJ Java 8 target against Android API34 classes. Three explicit YUV color-format deprecation warnings remain. Not an APK/Gradle build. |
| Pure JVM RGBA/YUV tests | PASS | 8 conversion/chroma/row-orientation cases; no Android codec executed. |
| Patch whitespace and metadata | PASS | Complete diff whitespace check and asset meta/GUID checks. Existing asset metadata and model/prefab bytes preserved. |
| Unity import/typecheck/EditMode | BLOCKED | Editor/license/toolchain unavailable; 81 EditMode cases defined, none executed. |
| Unity PlayMode | BLOCKED | 2 coroutine lifecycle cases defined, none executed. |
| Windows PowerShell runner | NOT TESTED | Target Windows/F: environment unavailable. |
| Android Gradle/APK/merged manifest | BLOCKED | Unity Android Build Support/SDK unavailable. No APK path or installed build exists from this work. |
| OnePlus camera/tracking/Fox/input/lifecycle | BLOCKED | No connected device/ADB; exact hardware model ID, OxygenOS and installed AR service/build details unknown. |
| Real captured PNG/MP4, ffprobe/playback/audio | BLOCKED | No camera/native runtime output exists to inspect. ffprobe presence does not establish media success. |
| Sustained FPS/memory/thermal | BLOCKED | No real player/device run or profiler measurement. |

Host tests total **32 passed**, not a sum inflated by rerunning them. Java cases are separately 8.
No Unity or physical acceptance result has been converted into PASS.

## Feature-status matrix

| Feature | Status | Remaining work |
| --- | --- | --- |
| Development diagnostics/evidence | PARTIAL | Source implemented/host tooling tested; observe actual player logs. |
| Actual front-camera AR initialization | BLOCKED | Reproduce and correlate selected configuration/native errors on OnePlus. |
| Fox attachment/material lifecycle | PARTIAL | Source repaired; Unity/device visibility, alignment, scale and occlusion unverified. |
| Carousel/search/favorites/recent/timer | PARTIAL | Source implemented; Unity/input/safe-area device tests pending. |
| Modular catalog/capability/lifecycle system | PARTIAL | 14 implemented entries; missing previews/content and native verification. |
| Photo pipeline | PARTIAL | Implemented; real file/orientation/mirroring acceptance pending. |
| Video/microphone pipeline | PARTIAL | Java compile/conversion checks passed; codecs/playback/sync/performance pending; local playback source implemented, not executed. |
| Camera switching/flash/music | PARTIAL | No validated provider/host implementation supplied. |
| Social composers | PARTIAL | Local drafts and host interface implemented; actual host integrations absent. |
| AURA-X lens controls | PARTIAL | Local command surface/vocabulary implemented; real AURA-X adapter absent. |
| 160 premium lenses / AI Lens Factory | PARTIAL | Separate long-term acceptance target; no extra placeholder entries/candidates counted. |
| Android release readiness | BLOCKED | Unity build and all independent OnePlus acceptance gates remain. |

## Continue on the actual workstation

See [ANDROID-VERIFICATION.md](ANDROID-VERIFICATION.md) for exact F: cache/build and guarded device
collection commands. Run `tools/run_unity_checks.ps1 -BuildAndroid -RunPlayMode` with the configured
licensed Editor/Android support. Inspect XML/log/build results, not command invocation alone. Inspect
the actual merged launch manifest. Then collect a finite full Logcat while executing each physical
acceptance item. Preserve build metadata/APK hash, actual serial/model/OS/AR-service versions and
exact error lines. The next behavioral camera fix must follow those observations.

Do not merge/release this draft while physical acceptance is blocked. A new device run must verify
actual User camera, running face subsystem, Tracking face, one visibly aligned moving Fox, persistent
ring/tap/swipe, lifecycle recovery, genuine media files and measured performance independently.

## Rollback

No deployment or device install occurred here. The original workspace and PR #3 branch are untouched.
To reverse code on a clean dedicated branch without discarding user work, first create a rollback
branch from this feature head, then review `git revert --no-commit 446459f..HEAD` and commit the
reversal. Do not hard-reset a shared worktree or force-push. Reverting returns to the prior source
baseline; it does not assert that the prior APK met device acceptance.
