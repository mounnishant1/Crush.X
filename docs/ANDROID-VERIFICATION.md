# Android development evidence and OnePlus acceptance

These tools prepare reproducible evidence. Host checks, Unity compilation, a successful APK build,
an ARSession state, and a `Tracking` log are separate observations. None verifies a visible,
correctly aligned Fox Mask without a physical-device test. Do not interpret
`NotTrackingReason.Unsupported` as unsupported device hardware.

## Current prerequisite limits

The engineering environment has no Unity 6000.0.30f1 Editor, Android SDK, ADB, attached phone,
or Windows F: drive. Unity/Android/device execution is **BLOCKED** here. The PowerShell runner
and Unity build entry have not been executed in their target environment. Host Python tests
verify evidence parsing and install guards only. The OnePlus 9 Pro is an ARCore-supported model;
the actual phone's OS, AR service, selected camera and subsystem initialization still need capture.

## Windows Unity checks and development APK

From the repository, with Unity closed and Android Build Support/SDK/NDK/JDK installed:

```powershell
pwsh -File tools/run_unity_checks.ps1 -BuildAndroid
```

The default Editor is `F:\6000.0.30f1\Editor\Unity.exe`. Override `-Repository`, `-Unity`,
`-CacheRoot`, and `-Artifacts` if needed. TEMP/TMP, Gradle, UPM and GI cache overrides live
under `F:\CrushX-Caches`; timestamped APKs, reports and logs use `F:\CrushX-Artifacts`.
The script restores process environment values. It does not relocate an existing Unity Library
or global Editor caches. Keep the repository/project itself on F: for project Library/Temp.
It fails if the configured drive is missing instead of falling back to C:.

Stages are import/compile, nonempty passing EditMode suite, optional `-RunPlayMode`, then
optional development APK build. Each Unity process has a finite timeout (default 45 minutes).
No install, automatic app launch, deployment or publishing occurs. Keep Unity/Gradle logs for
diagnosis. No build can succeed without a valid local Unity license and Android toolchain.

The batch entry is `CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk`. It requires
Android to be selected, an enabled native scene, and an exact source SHA. It accepts only
`in.crushx.lens.pr3test[.suffix]` or `in.crushx.lens.devtest[.suffix]`. Existing APK/evidence
paths are preserved. APKs use development mode/default development signing.

`<apk>.build-info.json` records build ID, full commit, dirty-worktree flag, package, Unity and
package versions, UTC timestamp and development status. The identical JSON is packaged as
`Resources/CrushXBuildInfo.json` and inspectable raw `StreamingAssets/CrushXBuildInfo.json`;
previous source resource bytes/meta and temporary PlayerSettings
are restored in `finally`. A sidecar is written even if building fails: inspect the build summary
and APK existence before treating it as a build artifact. The dirty flag means the SHA is a base
revision, not a claim that the worktree equals that revision. Commit or archive the reviewed diff
with the evidence to reproduce a dirty-source build.

## Read-only device capture

Use Python **3.10+** and Android platform-tools. Authorize the USB debugging prompt normally.
Determine the actual serial and model; do not infer a OnePlus model identifier from its marketing name:

```powershell
adb devices -l
adb -s SERIAL shell getprop ro.product.model
python tools/collect_android_evidence.py --serial SERIAL --seconds 60 --output F:\CrushX-Artifacts\device-run-001
```

The output directory must not already exist. With `--serial` omitted, read-only capture requires
exactly one authorized device. Reproduce launch → permission → Fox selection → head movement →
face loss/reacquisition → carousel → background/resume during the finite capture window.
The collector never clears logs/data, grants permissions, restarts AR services, force-stops apps,
uninstalls apps, or modifies production infrastructure. Default capture does not install or launch.

It records full, unfiltered Logcat before/during reproduction; device/Android build; Google Play
Services for AR package; installed app package/version; resolved launcher activity; camera
permission/app-op; memory and graphics snapshots. It pulls the selected app's base APK read-only,
hashes it and inspects its merged manifest when SDK `aapt2`, `aapt`, or `apkanalyzer` is available.
Pass `--manifest-tool` explicitly if needed. Missing/unsupported probe commands remain recorded
with exit code/stderr; they are not converted into passing results. Unsupported manifest inspection
does not invalidate captured Logcat. `gfxinfo` snapshots are observations, not Unity GPU/FPS proof.

For offline APK evidence, add `--apk PATH_TO_APK`; actual manifest inspection is required.
An installed/supplied hash comparison is recorded when both artifacts are available. The project
uses Unity 6's configured Android entry mode; trust the merged manifest and resolved installed
activity rather than assuming `UnityPlayerActivity`.

Full device logs can contain private data. Evidence and pulled APKs belong in a local ignored
work/build directory. Review and redact before sharing; do not commit them. The JSON parser
preserves exact native error observations and leaves root cause **NOT ESTABLISHED** until
correlated with the reproduction and runtime states.

## Optional guarded test installation

Only use the verified development test package. This is the only device-write operation:

```powershell
python tools/collect_android_evidence.py --serial SERIAL --expected-model EXACT_MODEL `
  --install --apk F:\CrushX-Artifacts\RUN\CrushX-pr3test.apk `
  --build-info F:\CrushX-Artifacts\RUN\CrushX-pr3test.apk.build-info.json `
  --package in.crushx.lens.pr3test --seconds 60 --output F:\CrushX-Artifacts\device-run-002
```

The guard requires explicit authorized serial, exact current model, actual APK manifest package,
isolated test package, full SHA/build ID and development sidecar. It also compares the full packaged
raw build JSON (or inspects legacy Unity asset bytes), preventing an unrelated sidecar from
authorizing install even with compressed Unity data.
It fails closed if identity cannot be inspected. It runs only `adb -s SERIAL install -r APK`;
no downgrade, uninstall, clearing or permission grant flags. A failed install is preserved in evidence.
Manually open the test app after install. No production-package APK is permitted.

Existing capture can be analyzed without a phone:

```powershell
python tools/collect_android_evidence.py --parse-log F:\CrushX-Artifacts\device-run-001\logcat-live.txt
python -m unittest discover -s tests -v
```

## Focused physical acceptance record

Use only **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED**, or **PARTIAL**. Start unperformed rows as
NOT TESTED. Record device serial/model (keep private), OxygenOS/Android, AR service version,
APK SHA256, package/version/build ID/commit, exact reproduction steps and time span.

| Check | Required independent evidence |
| --- | --- |
| Correct build/launch | Installed APK hash matches supplied APK; runtime metadata and resolved launch activity match. |
| Permission | Fresh appropriate test installation prompts; denial gives useful state; grant/reopen recovers. Do not clear valuable data. |
| Actual selfie camera | Requested and current facing direction `User`, selected/supported configuration; visually confirm selfie preview. |
| XR initialization | Active ARCore loader, camera/face subsystem IDs and running flags; correlate session/native errors. |
| Face acquisition | Face count and trackable ID enter `Tracking`; no dependence on world positional tracking success. |
| Fox rendering | Exactly one visible mask for each tracked face; correct parent, activation, renderer and supported shaders. |
| Alignment | Face/head rotation, scale and orientation verified visually on the actual device. |
| Loss/reacquisition | Hide/remove on loss, recover without duplicate/stale masks; matching lifecycle logs. |
| Ring/input | Controls remain visible without a face; tap and swipe once per gesture; Fox ↔ procedural switches correctly. |
| Lifecycle | Background/resume and camera exit/reentry repeatedly recover without camera contention/leaks. |
| Photos | Inspect saved actual rendered output, dimensions, orientation and selfie mirroring. |
| Video/audio | Inspect nonempty playable MP4 with rendered effects and authorized synchronized audio; denial/interruption handled. |
| Stability/performance | Explain native critical errors; record sustained device frame time/FPS, memory and thermal observations. |

Google ARCore front-camera sessions do not provide ordinary world-camera tracking. A paused world
camera is not sufficient proof of failed Augmented Faces. Inspect actual face `TrackingState` and
native errors. Never add an ordinary world anchor to compensate for absent face tracking.
