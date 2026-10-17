# OnePlus device review: presentation and diagnostic repairs

Status: source repair candidate for review. The Fox Mask device failure remains unresolved.
This candidate has not been compiled by Unity, built as an APK, or installed on the phone.
The existing photographed APK does not contain these changes.

## Evidence and established causes

The supplied `logcat-analysis.json` describes package `in.crushx.lens.pr3test`, Unity
6000.0.30f1, OnePlus LE2121, Android 14/API 34, ARCore service 1.57.262640093,
OpenGLES3/Adreno 660 and Built-in rendering. It reports Granted camera permission,
ARCoreLoader, requested/current User camera and a selected configuration containing
FaceTracking. It observes SessionNotReady followed by NoFacesDetected, with cat-ears
selected, then an unfocus/pause roughly nine seconds after startup. The uploaded
screenshots subsequently show Animated Cat, a photo preview, and Fox Mask 3D selected.
They do not establish a tracked face, an attachment, visible alignment or camera direction.

The following causes are established before modifying their code:

1. NativeLensUI independently draws tracking status and the capture controller's idle
   `Ready` message. This produces the contradictory status in the screenshots.
   Temporary lens notices can also obscure capture errors.
2. Both supplied transition message bodies end mid-JSON at exactly 1,023 UTF-8 bytes.
   The collector retains matching raw lines without shortening them. The original
   logger sends the entire large snapshot as one Unity message, placing configuration
   strings before face counts and subsystem booleans. This loses essential evidence in
   the observed Android logging path. Raw pretty-printed build metadata also leaves only
   its first line tagged, so the parser retains `build {` without build identity.
3. The interface uses default IMGUI button/box styles, large text and text-only cards.
   Selection wording does not distinguish selection from waiting for tracking.

The underlying AR failure is **not established**. `SessionInitializing`, RotationOnly
and pause-related vendor camera disconnects are not proof of Augmented Faces failure.
No generic XRFaceSubsystem failureReason API exists. The original trace never records
a Fox selection; unconditional Fox lifecycle events do not establish that it was selected.
The screenshot of Fox selection is later evidence, not proof that the earlier capture
contains that selection. The reported APK has sourceDirty=true and its exact source
identity/diff remains unverified. The reported 73 passing Windows EditMode cases apply
to that earlier checkout, not to this candidate.

## Review candidate

- Replace default control backgrounds with a shared rounded dark style; reduce label
  sizes and give cards static lens identifiers. These badges are labels, not previews
  of a rendered effect. Preserve browsing order, tap rectangles and gesture ownership.
- Suppress idle capture's generic Ready message. Keep informative save/microphone
  messages and prioritize capture progress/errors over informational lens notices.
  Say explicitly when a selected lens is waiting for face tracking or camera startup.
- Emit a readable bounded core snapshot and complete tagged diagnostic packets. Each
  protocol message is at most 800 UTF-8 bytes, below the observed truncation boundary.
  Base64 packets preserve multiline metadata and Unicode without splitting characters.
  Record IDs, part counts and byte counts permit reassembly and explicit loss detection.
  Lens changes request a fresh diagnostic snapshot; transport failures stay nonfatal.
- Reassemble complete records in the collector, retain raw lines, flag missing,
  conflicting or truncated data and avoid double-counting core/full snapshot outcomes.
  The app's own explanatory ARCore guidance is no longer a native-error observation.

This candidate does not change AR configuration, permission requests, camera direction,
Fox assets, face attachment logic, capture behavior, dependencies or production systems.
The shared skin is still IMGUI; it is not a complete native product redesign or a claim
of Snapchat quality.

## Validation completed here

- 44 Python source/asset/collector tests passed, including nine added protocol cases.
- Four actual pure C# protocol NUnit tests compiled and passed on host .NET/Roslyn,
  without Unity stubs. They cover byte limits, long Unicode/multiline round trips,
  empty payloads, invalid headers and bounded readable summaries.
- C# syntax parsing passed across six existing build-define combinations. This is
  syntax validation, not Unity type/API compilation.
- Six added UI notice regression cases require Windows Unity execution.
- Whitespace/GUID checks passed; independent source review found no blocking UI issue.
- Re-parsing the uploaded trace preserved its two observed outcomes, flagged three
  incomplete legacy records and removed the self-generated guidance false positive.

## Windows and physical-device gates

First obtain/review this candidate in an isolated source copy; do not reset the existing
dirty Windows checkout or assume the earlier APK contains these fixes. Then run the
existing runner against that copy. This command builds/tests source only:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $review = Read-Host 'Full path to the reviewed source copy containing this candidate'
    $runner = Join-Path $review 'tools\run_unity_checks.ps1'
    if (!(Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'Review runner missing.' }
    powershell.exe -NoProfile -File $runner -Repository $review `
        -Unity 'F:\6000.0.30f1\Editor\Unity.exe' `
        -CacheRoot 'F:\CrushX-Temp\Caches' -Artifacts 'F:\CrushX-Temp\UnityRuns' `
        -RunPlayMode -BuildAndroid -Package 'in.crushx.lens.pr3test'
    if ($LASTEXITCODE -ne 0) { throw 'Unity verification failed; preserve its logs and XML.' }
}
```

Confirm actual free disk space before building; do not delete files automatically.
Keep the new build summary, sidecar, exact source diff/status, test XML, warnings,
actual APK length and SHA256. Use the existing guarded collector only with the actual
current wireless serial and exact LE2121 model; never reuse an expired port blindly.

The remaining acceptance tests are focused:

1. Cold-open the isolated test app. Verify front-camera orientation by observing the
   person looking at the screen; correlate requested/current direction and native data.
   Confirm permission, ARSession/XR Origin managers, loader and subsystem running states
   in complete reconstructed diagnostics with no missing packet records.
2. Keep a face centered in ordinary even light, select Fox Mask 3D explicitly and keep
   the app foreground for at least 30 seconds. Record faceCount, trackingFaceCount,
   perFaceStates, selection and Fox binding/renderer events. Verify the visible mask
   follows translation and head rotation; selection alone is not a pass.
3. Remove the face, reacquire it, then background/resume. Require hidden stale geometry,
   a fresh correct attachment and no duplication. Correlate any configure/resume error
   with its exact native ARCore status and timestamp.
4. Exercise tap/swipe/search/Favorites/Recent/timer once, including canceled gestures.
   Verify no accidental capture/selection and no contradictory Ready status.
5. Capture/retry/save a photo with the visibly aligned mask. Verify preview and reopened
   saved media, not just file existence. Test video only if its runtime capability is
   available; measure actual playback/orientation/audio rather than infer support.

If complete logs show zero faces, investigate detection/native pipeline first. If a
tracked face exists but no attachment is created, investigate selection/binding. If an
attachment is active but invisible, inspect transform, renderer, material/shader and
camera visibility. Choose the smallest AR change only after identifying that boundary.
No device or visual acceptance result is claimed by this review candidate.
