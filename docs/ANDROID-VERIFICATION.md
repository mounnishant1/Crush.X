# Windows and OnePlus verification handoff

15 October 2026. Windows 11 HP ZBook repository: `F:\CrushX-Git\Crush.X`.
Unity project: `F:\CrushX-Git\Crush.X\UnityProjects\CrushXLensEngine`.
Artifacts and caches below use `F:\CrushX-Temp`.

No Windows remote runtime is connected. This Linux session has no Unity Editor, Android SDK,
ADB, Windows drive or phone. None of the following Windows commands has been executed here.
The latest continuation is local source work, **not pushed to PR #4**. Transfer/review that source
before expecting these new scripts/features on Windows. The existing PR at `0843da3` does not
contain this continuation. Do not run a build on an unidentified checkout.

These instructions compile/test/build and collect read-only evidence. They do not install an APK,
clear logs/app data, delete files, force-stop apps, grant permissions, push Git, or deploy anything.
Open the already installed application manually for reproduction. Testing a newly built APK on
OnePlus requires separate installation authorization; an old installed APK cannot verify new repairs.

## 1. Identify the Windows source and installed Editor

Run in Windows PowerShell 5.1 or newer. Close the Unity Editor for this project before batch runs.
The Editor path below is a candidate; its existence and version must be verified.

```powershell
$ErrorActionPreference = 'Stop'
$repo = 'F:\CrushX-Git\Crush.X'
$project = Join-Path $repo 'UnityProjects\CrushXLensEngine'
$unity = 'F:\6000.0.30f1\Editor\Unity.exe'
if (!(Test-Path -LiteralPath $unity -PathType Leaf)) {
    throw 'Set $unity to the installed Unity 6000.0.30f1 Editor executable.'
}
Get-Content -LiteralPath (Join-Path $project 'ProjectSettings\ProjectVersion.txt')
(Get-Item -LiteralPath $unity).VersionInfo | Select-Object ProductVersion, FileVersion
& git -C $repo status --short
if ($LASTEXITCODE -ne 0) { throw 'Git source inspection failed.' }
& git -C $repo log -1 --format='%H %s'
if ($LASTEXITCODE -ne 0) { throw 'Git revision inspection failed.' }
```

Verify the reviewed branch/source, including local changes. The runner checks both the project
version and executable ProductVersion for `6000.0.30f1`, and stops before opening a mismatched
Editor. If Windows metadata does not expose that exact version, record the metadata and resolve
the installed Editor identity first; do not disable the guard merely to make a build proceed.
A licensed Editor with Android Build Support, SDK, NDK and JDK is required. No installer is invoked.

## 2. Compile, test, and build an isolated development APK

```powershell
powershell.exe -NoProfile -File (Join-Path $repo 'tools\run_unity_checks.ps1') `
    -Repository $repo -Unity $unity `
    -CacheRoot 'F:\CrushX-Temp\Caches' `
    -Artifacts 'F:\CrushX-Temp\UnityRuns' `
    -RunPlayMode -BuildAndroid -Package 'in.crushx.lens.pr3test'
if ($LASTEXITCODE -ne 0) { throw 'Unity stages failed; inspect the recorded log/XML files.' }
```

For compilation and EditMode only, omit `-RunPlayMode -BuildAndroid`. Stages are import/compile,
a nonempty passing EditMode suite, optional PlayMode, and optional development APK build. Each
Unity process has a finite timeout (45 minutes by default). The runner creates a unique evidence
folder and restores process environment values. TEMP/TMP, Gradle, UPM and GI overrides use F:.
Project Library/Temp remain within the F: project; this does not relocate all global Editor caches.
Headless graphics-dependent tests can be skipped: inspect the XML skipped count, and run those
material/shader tests in a graphics-capable Editor before recording them as passing.

The APK entry is `CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk`. Only isolated
`in.crushx.lens.pr3test[.suffix]` or `in.crushx.lens.devtest[.suffix]` IDs are accepted. Existing APK
paths are not overwritten. The builder restores temporary PlayerSettings and generated build-info
resources. A sidecar may exist after a failed build: verify the build summary and APK separately.

```powershell
Get-ChildItem -LiteralPath 'F:\CrushX-Temp\UnityRuns' -Filter 'CrushX-pr3test.apk' -Recurse -File |
    Select-Object FullName, Length, LastWriteTimeUtc
# Select the exact successful run; never assume the newest APK is the reviewed build.
$apk = Read-Host 'Paste the exact successfully built APK path'
Get-FileHash -Algorithm SHA256 -LiteralPath $apk
Get-Content -LiteralPath ($apk + '.build-info.json') -Raw
```

The sidecar and packaged `StreamingAssets/CrushXBuildInfo.json` identify build ID, full base SHA,
dirty flag, package, Unity/package versions and UTC time. A dirty flag means the SHA alone does not
identify the source: preserve the reviewed diff/new files too. APK build success does not establish
an installed build, front camera, face tracking, visible mask or usable media.

## 3. Identify ADB, the physical device, and the installed app

The wrapper discovers ADB from PATH, `ANDROID_SDK_ROOT`, `ANDROID_HOME` or the common local SDK.
This manual discovery also checks the selected Editor's bundled SDK, without assuming it exists.

```powershell
$adbCommand = Get-Command adb -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$adb = if ($adbCommand) { $adbCommand.Source } else { $null }
if (!$adb) {
    $sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
    if ($env:LOCALAPPDATA) { $sdkRoots += Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    foreach ($sdk in $sdkRoots) {
        if (!$sdk) { continue }
        $candidate = Join-Path $sdk 'platform-tools\adb.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $adb = $candidate; break }
    }
}
if (!$adb) {
    $candidate = Join-Path (Split-Path -Parent $unity) 'Data\PlaybackEngines\AndroidPlayer\SDK\platform-tools\adb.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $adb = $candidate }
}
if (!$adb) { throw 'Set $adb to the installed platform-tools\adb.exe.' }
& $adb devices -l
if ($LASTEXITCODE -ne 0) { throw 'ADB enumeration failed.' }
$serial = Read-Host 'Enter the actual authorized OnePlus device serial from the device list'
& $adb -s $serial shell getprop ro.product.model
& $adb -s $serial shell getprop ro.build.display.id
& $adb -s $serial shell am get-current-user
& $adb -s $serial shell pm list packages | Select-String -Pattern 'crush'
$package = Read-Host 'Enter the exact installed Crush.X package ID to inspect'
```

Confirm the selected device is the OnePlus 9 Pro. Do not infer its hardware ID from the marketing
name. The currently installed app may have a different ID than the newly built test package.
A package-list filter returning nothing does not establish absence; inspect the app's known package
identity. No command above launches, installs, removes, or changes the app.

## 4. Collect full, finite, read-only evidence

Python 3.10+ and Android platform-tools are required. The wrapper validates Python and accepts
an explicit `-Python` executable override. It also discovers aapt2/aapt/apkanalyzer where available.

```powershell
powershell.exe -NoProfile -File (Join-Path $repo 'tools\collect_android_evidence.ps1') `
    -Repository $repo -Adb $adb -Serial $serial -Package $package `
    -Seconds 60 -Artifacts 'F:\CrushX-Temp\DeviceEvidence'
if ($LASTEXITCODE -ne 0) { throw 'Collection failed; inspect the recorded evidence and errors.' }
```

Wait for **“Capturing 60s of full Logcat”** before manually reproducing launch → camera permission
→ Fox Mask selection → head movement → face loss/reacquisition → carousel → background/resume.
The collector saves a pre-run full Logcat snapshot, then full unfiltered live Logcat. It never clears
logs. It records actual device/OS/AR-service versions, installed package, resolved launch activity,
permission/app-op, memory/gfx observations, and pulls/hashes the installed base APK read-only.
Merged-manifest inspection is recorded when a manifest tool is available. Failed probes remain
failures; missing tools do not turn into passing checks. The camera permission probe uses the
observed foreground Android user, without a user-0 fallback. For work/managed profiles, corroborate
package per-user states and the actual app process user before attributing a grant failure.

If manifest inspection is needed for a separately built APK, rerun with `-Apk $apk` and the confirmed
`-ManifestTool 'EXACT\PATH\aapt2.exe'`. This records supplied/installed hashes and their comparison.
A supplied APK requires manifest inspection; omit `-Apk` for the first capture when that tool is not
available. Unity 6's configured Android entry mode is not proof of an installed launcher: use the
actual merged manifest and resolved activity. Do not assume `UnityPlayerActivity`.

The collector writes `evidence.json`, `logcat-before.txt`, `logcat-live.txt` and
`logcat-analysis.json`. Keep raw evidence local and review private content before sharing.
The parser preserves exact native errors and leaves root cause **NOT ESTABLISHED**. A log saying
`Tracking`, or `NotTrackingReason.Unsupported`, does not establish a visible mask or unsupported
hardware. ARCore front-camera world tracking can remain paused while Augmented Faces track.

## 5. Attribute the failure before changing AR configuration

Correlate one reproduced interval with the exact installed build ID/hash and raw native error lines.
Check in order:

1. Manifest CAMERA declaration, runtime grant/app-op, foreground/profile user, AR service version.
2. Active ARCore loader; session/camera/face subsystem IDs, present/running state and native errors.
3. Requested **and actual** User camera, selected/supported configurations and graphics API.
4. Face count, trackable IDs and per-face tracking state independently of world-session tracking.
5. Selected Fox ID, prefab/material, one instance bound to the tracked `ARFace.transform`, active
   hierarchy, renderers, shader support, culling/layer, transforms and visibly aligned geometry.

AR Foundation has no generic `XRFaceSubsystem.failureReason`; use the actual ARCore configure/
resume error from full Logcat. A supported-device listing is not a runtime initialization test.
Do not change session tracking mode, autofocus, chooser, camera pipeline or graphics API list based
only on the old generic status label. The smallest AR behavior fix must follow the observed failure.

## 6. Focused physical acceptance gates

Record each gate separately with build ID/hash, device/OS/AR-service versions, reproduction and
actual result. These gates are all **NOT RUN** for the new source in this session.

| Gate | Required observation |
| --- | --- |
| Startup and permissions | Cold/warm launch, grant/deny camera, actionable status, no crash; actual front camera confirmed. |
| Face initialization | ARCore loader and running face subsystem; exact native errors retained if initialization fails. World-session Tracking is not a face gate. |
| Fox visibility/binding | Exactly one moving, correctly aligned Fox per tracked face; no stale duplicate; verify renderer/material, scale, head rotation and culling. |
| Loss/recovery | Cover/remove face and reacquire; background/resume, lock/unlock and re-enter camera without stale anchors or frozen preview. |
| Existing carousel | Persistent visible carousel, taps and swipes, small lists, absent active item in search/favorites/recent; vertical drag does not select. |
| Timer/focus | 3/10-second countdown; notification/focus loss cancels countdown; no delayed capture after return. |
| Microphone preflight | Mic-on requests permission before shutter; grant/deny/don't-ask-again; no recording starts from permission callback; silent video still works. |
| Video completion | Release and 30-second auto-stop; stale touch cancellation/focus loss after completed Preview preserves the draft. |
| Media preview/save | Real photo and decoded MP4; play/pause/audio, Retry and explicit Save; recoverable save error preserves draft/playback; next capture has no stale error. |
| Color filters | Warm Cinema, Noir Film and Neon Duotone visibly distinct with no face in view; no old-filter contamination after switching to Fox/procedural lens; captured media includes grade. |
| Failure/rollback | Missing/unsupported shader rejects selection and preserves current lens; a failed restoration reports failure rather than claiming retention. |
| Output integrity | Inspect actual PNG/MP4 dimensions, orientation/mirroring, readable frames, durations/audio tracks and A/V sync. No overlay UI baked into media. |
| Performance | Record sustained real FPS/frame-time/memory/GC/battery/thermal behavior and recovery; probes alone are not measured acceptance. |

After separately authorized installation of the reviewed test build, repeat these gates against that
exact installed artifact. Preserve the existing working camera/carousel as independent regression
gates. No success claim or release should precede that execution.
