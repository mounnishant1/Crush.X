# Crush.X Lens Engine — reliability source patch (16 October 2026)

This is a **development source candidate** based on the previously uploaded combined Crush.X ZIP. It has **not** been merged with newer changes on the user's Windows F: drive, compiled by the Unity Editor, built into a new APK or tested on the OnePlus 9 Pro. Production, AWS, Git remote and the installed phone apps remain unchanged.

## Changes

1. `LensEngineBootstrap.cs` retries binding an AR face manager and user-facing AR camera when the native rig appears after the engine's `Awake`; it reasserts an explicit user-camera request after returning to focus. It does not change ARCore configurations or pretend a rear-camera session supports face tracking. Android never creates the Editor demo camera, which could otherwise obscure a late AR feed.
2. `NativeLensUI.cs` recovers dependencies after an out-of-order startup rather than keeping the entire control layer hidden after one failed lookup. A clear initialization label is drawn while the control dependencies are unavailable.
3. `LensRuntimeEntry.cs` supplies a visible native UI recovery component only when the Android scene has no native UI, including inactive objects. The creation is logged to aid verification.
4. `CrushXSmartCarousel.cs` renders cached circular lens bubbles with a highlighted selection and text monograms; it keeps the existing filtered order, safe-area geometry, swipe owner and tap hit targets. The original catalog still contains 11 items and lacks most authored thumbnail assets. No decorative controls advertise features that do not exist.
5. `FoxMaskARLens.cs` exposes explicit local position/rotation/scale calibration for measurement on a real tracked face. Defaults preserve the imported prefab. A missing newly serialized scale field also keeps the original scale. No arbitrary Fox alignment adjustment was applied.
6. Added an EditMode geometric assertion and source regression tests for late startup/recovery/calibration entry points.
7. Added a category selector to the lens camera. Categories are computed from the **11 genuinely installed catalog entries**; the selector wraps through All, Animals, Beauty, Sci-Fi, Fantasy and Aesthetic. Category selections combine with Favorites, Recent and case-insensitive Search, rather than returning uninstalled Gaming/Anime/Cinematic entries.
8. Moved search/tabs up to reserve a separate category row, preserving explicit separation from the swipe carousel and shutter. The Recent view refreshes when a lens is selected by another UI path or a host command. Added Unity EditMode cases for wraparound, combined filters and nonoverlapping layout plus Python source checks.

## Verification in this environment

- `PYTHONPATH=/tmp/crushx-csharp-parse-deps python3 tools/check_all.py`: **38 Python checks passed, 0 skipped**. The C# source parser covers the six existing preprocessor configurations; this is **not Unity typechecking/compilation**.
- Application JavaScript syntax: **PASS**.
- No browser Chromium, Unity Editor/Android modules, Android SDK/ADB, phone or live staging backend was available. The corresponding checks are still **NOT TESTED**, not PASS.

## Required Windows validation before installation or merge

1. Save the current `F:\CrushX-Git\Crush.X` branch/commit and `git status --short`, especially the newer sliding/physics and local lens edits. Compare file-by-file and merge selectively without clobbering user work.
2. Run Unity 6000.0.30f1 import/compilation, all EditMode and PlayMode tests, and the guarded Android development build in `tools/run_unity_checks.ps1`; retain logs, test XML, merged manifest, package ID and APK SHA-256.
3. Only after explicit approval, test that **front** camera is selected on OnePlus 9 Pro, `ARFaceManager.subsystem.running` is true and at least one face reaches `Tracking`; then verify Fox renders and aligns while moving.
4. Verify that the circular lens carousel stays visible when tracking is absent; supports taps/swipes/favorites/search, category cycling and Recent updates; does not overlap category buttons/shutter/safe areas; and recovers across pause/resume/orientation changes.
5. Test actual PNG and MP4 output, optional microphone, preview/save/retry, sound synchronization and 5+ minute FPS/temperature/memory profiling; these are not certified by this patch.

**Known remaining scope:** Camera/ARCore native root cause, validated Fox offsets, authored thumbnails, production Canvas UI, hand/expression provider, gallery, full composer host, AURA-X live voice, premium 160-lens assets, and Android release quality. Keep the PR and release gates blocked until physical evidence is recorded.
