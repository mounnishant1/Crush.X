# Android build repair candidate — 17 October 2026

This branch is a **source repair candidate**, not a verified APK or a fix for the
separate OnePlus face-tracking / Fox-mask rendering failure. No production change
or device installation was made.

## Evidence supplied from the Windows workstation

- Unity: `6000.0.30f1`; project checkout reported as `F:\CXAR17`.
- Earlier C# player compile failure: `NativeCameraSkin.cs(88,19)` CS1061 on
  `GUIStyleState.scaledBackgrounds` (Editor-only property, unavailable in the
  Android player API surface).
- Microphone permission code emitted obsolete API warning CS0618 at
  `NativeMediaCapture.cs(152,13)`.
- A later build passed script compilation but failed under
  `Library/Bee/artifacts/Android/ManagedStripped` with
  `System.OutOfMemoryException` inside `UnityLinker.exe` / `UnityTypeMapStep`.
- Windows memory snapshot: ~7.88 GiB physical, ~0.64 GiB free physical,
  ~0.26 GiB free virtual; C: free 4.36 GiB, F: free 36.1 GiB.

These are two distinct failures seen at different build attempts. The log does
not establish an ARCore, Gradle, lens shader, or Android NDK defect.

## Changes in this review candidate

1. Preserve rounded Android camera styling with `GUIStyleState.background`,
   while clearing inherited `scaledBackgrounds` only in an Editor build.
2. Remove the deprecated `PermissionDeniedAndDontAskAgain` subscription.
   Continue handling ordinary Granted/Denied callbacks and the existing timeout;
   the user-facing silent-video fallback is preserved.
3. Add a **non-destructive** memory preflight to the checked Windows Unity
   runner whenever `-BuildAndroid` is requested. It records actual physical and
   virtual free-memory values, warns when limited, and blocks an obviously
   exhausted host before Unity import consumes minutes. The operational
   thresholds are heuristics, **not** Unity hardware minimum requirements.
   The explicit `-AllowLowMemory` flag allows a deliberate attempt.
4. Add source regression checks for the player/editor separation, permission
   subscription and build-preflight ordering.

## Remaining verification gates

- Source checks pass outside Unity, but **Unity compilation and Android IL2CPP
  build have not run** in this environment.
- On the Windows workstation, close heavyweight apps and restart if memory is
  exhausted. Check free virtual memory/pagefile and disk space. Do not delete
  caches or user files automatically. Run the existing isolated test-package
  build runner and save `memory-preflight.json`, logs, test XML and APK SHA256.
- Only then install the test APK on the selected OnePlus device. Verify front
  camera direction, AR subsystem running states, an actual tracked face, Fox
  attachment/material visibility, carousel and photo/video audio acceptance.
- A successful compile or APK alone **does not** establish Snapchat-level AR.

No new production endpoints, permissions, 3D assets, dependencies, packages,
unverified lenses or third-party proprietary content are introduced.
