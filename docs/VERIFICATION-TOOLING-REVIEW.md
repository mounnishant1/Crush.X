# Verification tooling follow-up

This records the local verification phases before the user authorized GitHub sharing. Current publication/installation status is in [FINAL-LENS-ENGINE-STATUS.md](FINAL-LENS-ENGINE-STATUS.md).

16 October 2026. Continues local repair commit `3c8f637`. Nothing in this follow-up was pushed,
installed on Android, deployed or published. No AWS production operation or user-file deletion
was performed. The Windows runtime, Unity Editor, SDK/ADB and OnePlus remain unavailable here.

Three confirmed diagnostic defects were repaired before the device handoff:

1. Live Logcat previously could exit early, including exit code zero, while the collector returned
   success. It now distinguishes the requested deadline from a premature process exit, records
   elapsed time/exit reason, preserves full stdout/stderr/analysis/evidence, and returns a nonzero
   CLI status for incomplete capture. Stopping only the local ADB client at the deadline remains
   the normal completion path; logs/app data are never cleared.
2. `cmd package check-permission` is not a portable AOSP PackageManager shell command. The
   collector no longer invokes it. It retains raw per-user `dumpsys package`, camera app-ops and
   foreground-user context, and marks grant interpretation NOT_INTERPRETED/BLOCKED. App-ops
   alone is not proof of a runtime grant. Actual app-level permission diagnostics remain required.
3. A supported-camera-configuration query could permanently cache an empty/failed startup result.
   Development diagnostics now retry those observations only on bounded snapshots, invalidate
   after pause/resume/focus, and refresh on camera subsystem/direction changes even after the
   periodic snapshot budget. No AR configuration choice or camera operation was changed.

The Unity PowerShell runner now records passed, failed, skipped and inconclusive counts in
`test-summary.json` and the console. It rejects missing/malformed, empty, entirely skipped or
failing results. A suite with skipped graphics cases can pass its executed cases, but does not
claim the skipped shader/material checks ran.

## Checks actually performed

- **35 Python host cases passed:** 15 source/asset checks and 20 collector/evidence/guard checks.
  C# syntax parsing covers 46 files across six define configurations. This is not Unity compilation.
- **Six PowerShell result-reader cases passed** on PowerShell 7.4.6 for Linux: passing with a skip,
  failure, empty suite, entirely skipped suite, malformed XML and missing XML. Inputs are synthetic.
- All three PowerShell scripts and seven documented command blocks parse with that runtime.
  The separate PowerShell test script also executed. Windows PowerShell 5.1 was not run.
- **Three synthetic wrapper/process cases passed** using a fake ADB executable at a path with
  spaces: finite deadline succeeds; early exit zero and early exit error both fail and retain partial
  evidence. No Android command reached a real device. These are distinct from physical testing.
- Patch whitespace, Unity metadata/GUID checks and preservation of the native scene, XR settings,
  PlayerSettings and original Fox model/prefab/material/texture remain checked.

The portable Linux PowerShell archive was downloaded from the official PowerShell 7.4.6 release
and checked against its published SHA256:
`6f6015203c47806c5cc444c19d8ed019695e610fbd948154264bf9ca8e157561`.
The confined toolchain and synthetic evidence are workspace-only and are not shipped as app assets.

The authored Unity suites remain 81 EditMode and two PlayMode cases, **none executed inside Unity**. The later host-only subset run is described below. There is
no APK from this environment, no real captured media, no verified front-camera/face subsystem/Fox
alignment and no measured device performance. Original failure root cause remains NOT ESTABLISHED.

See [ANDROID-VERIFICATION.md](ANDROID-VERIFICATION.md) for Windows build/read-only device commands
and acceptance gates, and [OFFLINE-SOURCE-HANDOFF.md](OFFLINE-SOURCE-HANDOFF.md) for a verifiable
source transfer that does not push Git or alter the original Windows repository. Handoff preparation
is separate from copying/executing it on Windows.

## Further executable C# verification

The final source-only pass found no confirmed AR/Fox startup, provider, attachment or scene-reference
defect warranting another camera/XR configuration change. The Windows/OnePlus access limit persists.

`tools/check_ar_classifier.ps1` now compiles the unchanged application `ARDiagnosticClassifier.cs`
and existing `ARDiagnosticClassifierTests.cs`, using Roslyn in PowerShell 7.4.6/.NET 8.0.10 plus
NUnitLite 3.13.3. All **11 existing NUnit cases passed** on Linux, with zero failures/skips/inconclusive
cases. This is actual C# compilation/execution of those two files, without Unity DLLs or Unity stubs.
The cases cover unanswered/denied permission, loader readiness, requested/current camera mismatch,
face loss/recovery, world-session independence, service messages and renderer failures. They do not
initialize a camera or prove which branch the real OnePlus takes.

The helper preserves source SHA256 values, runtime/OS, full NUnit XML and `host-summary.json` in a
unique run directory. A separate copy with one deliberately failing assertion correctly returned
nonzero and recorded 10 passes/one failure; the repository fixture was unchanged. Independent
review found no material false-pass path. These 11 cases are a subset of the 81 authored EditMode
cases and must not be added again to the authored-test total. All Unity runner/device gates remain
unexecuted. The supplied NuGet dependencies are confined host tools, never Android assets.
