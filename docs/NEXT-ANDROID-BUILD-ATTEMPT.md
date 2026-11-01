# Android build attempt — 1 November 2026

The preserved source baseline was branch
`feature/crushx-advanced-ar-lens-engine` at
`d18432820ebdcf2882b429cffe510ca89b24bf80`. The project pins Unity
`6000.0.30f1` (`62b05ba0686a`). No production service, installation or signing
configuration was changed.

## Actual environment and command results

The managed Linux environment is connected, with no configured Android/Unity
capabilities, credentials or outbound identities. Search of PATH and readable
standard installation directories found no Unity Editor, Unity Hub, Android SDK,
ADB, Gradle, JDK compiler or PowerShell. Java runtime 21 is present. No local Unity
licence-file candidate was observed; that observation is **not** a statement about
the user's licences or floating-licence entitlement. No licence contents were read.

An actual launch was attempted using the existing development APK build method:

```bash
Unity -batchmode -nographics -quit -projectPath /workspace/Crush.X/UnityProjects/CrushXLensEngine -buildTarget Android -executeMethod CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk -crushxApk /workspace/Crush.X/work/qa/results/android-build-attempt-tool/CrushX-devtest.apk -crushxPackage in.crushx.lens.devtest.advanced -crushxCommit d18432820ebdcf2882b429cffe510ca89b24bf80 -logFile /workspace/Crush.X/work/qa/results/android-build-attempt-tool/unity-build.log
```

Exact result: `FileNotFoundError: [Errno 2] No such file or directory: 'Unity'`.
The Unity process did not start, so no compiler, Gradle, shader, IL2CPP, licence
activation or Android build ran. The tool reports **BLOCKED before compilation**,
not a failed compilation or successful APK.

Independent command attempts returned:

| Command | Actual result |
| --- | --- |
| `adb devices -l` | `[Errno 2] No such file or directory: 'adb'` |
| `sdkmanager --list_installed` | `[Errno 2] No such file or directory: 'sdkmanager'` |
| `gradle --version` | `[Errno 2] No such file or directory: 'gradle'` |
| `javac -version` | `[Errno 2] No such file or directory: 'javac'` |
| `java -version` | Exit 0; OpenJDK runtime `21.0.12.1` |

**APK produced:** none. **APK path:** unavailable. **Device recording/FPS,
orientation, audio synchronization and Story/Reel integration:** unverified.
Installing a reference Android API JAR or host Java compiler is not an Android
SDK, Unity build or connected phone.

## Repeatable build-attempt tool

`tools/attempt_unity_android_build.py` records the exact source/command/errors in
a new local evidence directory. It never downloads an Editor, activates a licence,
installs an APK, pushes code or touches production. A finite timeout and isolated
test-package guard are enforced. Existing evidence and Unity project directories
cannot be used as overwrite destinations.

```bash
python tools/attempt_unity_android_build.py --unity /actual/licensed/6000.0.30f1/Editor/Unity --output work/android-build-new-attempt --attempt-build
```

On a supported host, it invokes the real existing Unity build method. A zero
process exit alone is insufficient: successful BuildReport, matching development
identity/commit/package, exact Unity 6000.0.30f1 version, APK ZIP/CRC and expected ARM64 IL2CPP entries must exist.
A completed build is labelled `BUILT_UNVERIFIED`, because installation and physical
acceptance are separate. The tool does not replace the existing EditMode/PlayMode
and device evidence procedures in `ADVANCED-AR-DEVICE-HANDOFF.md`.

## Tests actually executed

The original baseline was checked out in a detached worktree at the exact
`d184328` SHA. This prevented concurrent implementation changes from changing its
test inputs. All 32 existing check groups passed: **79 Python**, **130 portable
C#** (zero build warnings/errors), **52 Java host** cases (three existing YUV
deprecation warnings), **23 Node** cases, **17 JS syntax checks**, **nine
standalone JS suites**, and **two mocked browser suites**. There were no live
browser writes. These are host/source/mock results, not Android acceptance.

Eight additional build-tool tests passed. They test orchestration using explicitly
mocked process outcomes: missing executable, zero-exit/missing APK, timeout/error,
package/directory/timeout guards, preflight-only mode and malformed/mismatched
artifacts, including a mismatched Editor version. Their temporary structural fixtures are not application APKs and no
Unity build result is inferred from them.

Raw baseline logs are retained separately under
`work/qa/results/next-baseline/`. Exact tool discovery and launch errors are in
`work/qa/results/android-build-attempt/build-attempt.json` and
`work/qa/results/android-build-attempt-tool/build-attempt.json`. The latter attempt
records `sourceDirty=true` because this new build-attempt tool was not yet
committed; it does not pretend that an APK was compiled from a clean commit.
