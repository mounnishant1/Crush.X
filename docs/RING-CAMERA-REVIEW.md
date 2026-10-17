# Circular lens camera review candidate

This source candidate adds the requested circular controls. It is not a verified APK.
Windows Unity compilation, cover rendering and real OnePlus acceptance remain pending.
The reported problem is now: the live preview shows a moving face with Fox selected,
but no mask appears. The actual AR failure reason is still not established.

## Source changes

- Circular cover thumbnails, finger-following carousel motion and an unscaled spring
  that settles on release. Selection commits once; drawing and tapping use the same
  animated circles. At least five results wrap; one to four remain unique with resisted
  drag edges. Main-camera swipes still advance the selected lens.
- Selected cover inside the shutter's outer ring. Tap for one photo; hold at least
  0.4 seconds for one video attempt; release to stop. Recording has a red center and
  clockwise duration ring. Timer, microphone preflight, cancellation and previews remain.
- Unsupported long holds report the actual cached video capability reason instead of
  silently taking a photo. A release while the encoder is preparing reports too short;
  it does not keep recording after release. Back cancels a pending shutter decision.
- Focus, multitouch, safe-area, orientation and size changes cancel gestures safely.
- Editor cover generator renders real procedural effects on a neutral mannequin,
  applies the actual color-filter materials, and uses the existing Fox thumbnail.
  It generates missing 256px circular PNGs and preserves existing covers. These images
  are cover art, not photographs or evidence of device tracking.
- The APK builder rejects missing cover resources instead of shipping an all-placeholder
  browser. The generator creates source assets only when explicitly requested.

The AR scene, permissions, front-camera selection, tracking provider, Fox prefab and
attachment logic are preserved. A new source audit found no confirmed code defect that
explains zero face trackables. No speculative tracking-mode or ARCore change was made.
The prior logging repair remains included so full native/subsystem/binding observations
can be collected from the candidate after it is built.

## Completed checks

- 44 Python source/asset/collector checks passed, including six C# preprocessor targets.
- 15 actual pure shutter NUnit cases passed on host .NET/Roslyn without Unity stubs.
- 20 actual pure carousel motion NUnit cases passed on host .NET/Roslyn without Unity stubs.
- PowerShell parsing, whitespace/GUID checks and independent source reviews passed.
- The less common Editor scene-mask/camera setters were checked against the exact
  Unity 6000.0.30f1 public C# reference, commit 52fbc41fb5dda2b8b683a108afb2b39c91802617.

These checks do not substitute for Unity API compilation, GPU cover rendering, Android
codec execution or touch/visual/performance tests on the phone. Added Unity integration
cases for shutter cancellation, Back and early release have not been run here.

## Windows build

Use an isolated review copy, preserving the existing dirty repository. Close any Editor
already using that copy. Check actual free C:/F: space first; nothing here deletes caches.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $review = Read-Host 'Full path to this reviewed source copy'
    powershell.exe -NoProfile -File (Join-Path $review 'tools\run_unity_checks.ps1') `
        -Repository $review -Unity 'F:\6000.0.30f1\Editor\Unity.exe' `
        -CacheRoot 'F:\CrushX-Temp\Caches' -Artifacts 'F:\CrushX-Temp\UnityRuns' `
        -GenerateLensCovers -RunPlayMode -BuildAndroid -Package 'in.crushx.lens.pr3test'
    if ($LASTEXITCODE -ne 0) { throw 'Build/check failed; preserve the logs and XML.' }
}
```

Cover generation needs a real graphics device; that one stage omits -nographics. Generated
PNGs/metas remain in Assets/Resources/CrushXLensCovers and are recorded in post-generation
source status. They make sourceDirty true; do not conceal or reset those changes. Re-running
preserves existing covers. Manually review generated art before accepting the candidate.

## Focused OnePlus checks

1. Verify cold-start preview and front-camera orientation with a visible moving face.
   Select Fox explicitly and keep the app foreground 30–60 seconds during full Logcat
   capture. Match the new build/package ID. Do not reuse an expired wireless port.
2. Inspect complete reconstructed core/full snapshots: permission, manager, camera/face
   subsystem running states, faceCount and trackingFaceCount. If zero faces persist,
   correlate exact native ARCore configure/resume errors. If a tracked face exists,
   inspect Fox attachment creation, transforms, renderers and shader/material state.
3. Check cover images, continuous drag and snapping, circular taps, quick repeated swipes,
   wrapped seams, filtered small/empty results and external lens selection. No stale tap
   may select a different image than the one displayed.
4. Tap once: exactly one photo preview. Hold beyond 0.4 seconds: video attempt, then stop
   on release. Confirm duration ring and real MP4 playback/orientation/audio. If video is
   unavailable, record the exact [CrushX Capture] reason; a photo must not appear instead.
5. Check release at the threshold, release during preparation, timer, microphone prompt,
   Back, multitouch and background/resume. No delayed capture, empty accepted clip, stale
   face geometry or duplicate attachments. Verify saved media by reopening it.

No source publication, deployment, production operation or APK installation is performed
by the build runner. Physical verification remains a separate required result.
