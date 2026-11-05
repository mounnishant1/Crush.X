# Crush.X Draft PR #1 — verification and local fixes

Review date: 15 October 2026 (Asia/Kolkata).

PR: https://github.com/mounnishant1/Crush.X/pull/1
Base: `a4135f99987601e3fbcf6bbaa0b5af8c7598e8e1`
Reviewed head: `38e5af356667209a48720d01e4749a3580e1a5b9`
Project: `UnityProjects/CrushXLensEngine`; configured Editor: **6000.0.30f1**.

At completion of the original review, PR #1 was open, draft, and unmerged at the head listed above. The fixes were first prepared in the existing local review checkout and supplied patch/snapshot. The user subsequently authorized transfer to a separate review branch and a new draft PR targeting the original feature branch. That transfer does not merge or modify the original feature branch. No deployment, app-content publication or paid service is authorized. The earlier web-app changes in the separate main checkout remain preserved.

## PASS — actually executed checks

| Check | Result and limits |
| --- | --- |
| New source/asset regression suite on repaired checkout | **15/15 passed.** Source structure/configuration checks, not Unity runtime tests. |
| C# syntax parsing | All **22 C# files**, with four Android/editor and modern/legacy input preprocessor configurations. Tree-sitter syntax parsing only; no C# type resolution, Unity compilation or linking. |
| Asset metadata and scene references | All **80 Assets .meta files** retained; no duplicate GUIDs or missing adjacent assets. Enabled build-scene paths match case and scene GUIDs. Local scene/prefab file IDs resolve. Known local GUID targets resolve. |
| Fox Mask source assets | OBJ vertex/UV/normal indices validated; MTL/texture links exist; JPG/PNG signatures valid; prefab points to the model and material GUIDs. OBJ has 49,980 vertices and 60,827 faces. This is not proof of successful Unity import, rendering, alignment or mobile performance. |
| Dependency/configuration consistency | Manifest direct versions match lock file/depth. AR Foundation/ARCore 6.0.8, URP 17.0.3 and Input System 1.11.2 retained/configured. Android API minimum 24 and ARM64 retained; IL2CPP explicit. This does not prove package restore or build compatibility. |
| Existing PR web smoke test | HTTP/title, login/register toggle, default state and no JavaScript exceptions passed. Cognito/Lucide/Tailwind scripts loaded. No real login or cloud mutation. Runner was the pre-existing environment `cloud-onboarding/crushx/smoke.cjs`, against a temporary localhost-only server serving this PR checkout. |
| Existing local web account-flow suite | Passed in the earlier main checkout: mocked standard login, MFA, session restore, account isolation, escaping, logout, token refresh, upload ownership, invalid responses and switching account during upload. These separate web fixes are not represented as merged into PR #1. |
| Existing inventory tool unit test | 1/1 passed in the earlier main checkout; read-only calls and secret-field exclusion tested with mocks. No AWS inventory run. |
| Patch hygiene and preservation | Git diff whitespace check passed. Existing `.meta`, `.obj`, image and `.prefab` files are byte-unchanged relative to PR head. Neither existing build scene was removed. |

## FAIL — defects confirmed in the original PR head

The new source suite run against the **unmodified PR snapshot** produced **5 PASS / 10 FAIL**. These are newly added regression checks of the source, not failed Unity builds or executed device tests. The following fixes are supplied locally; the remote draft still contains its original code.

| Confirmed defect | Local fix |
| --- | --- |
| Android XR provider has automatic loading and running disabled | Enable auto-loading/running for Android only; retain the existing ARCore loader and Standalone configuration. |
| Build starts in `CrushXStartup`, which has no AR rig and no transition to the native scene | Android startup routes to the already enabled `CrushXNativeAR` scene; a scene-loaded hook initializes the runtime/receiver. Editor mock startup and both scene entries remain. |
| Fox Mask is absent from the shared lens catalog, while its separate bridge enables the mask on startup | Add a scene-backed `fox-mask-3d` entry and an assembly-safe `ISceneLens` contract. Switching any lens updates the bridge, unavailable imported lenses are rejected before destroying the active effect, and the saved scene no longer enables Fox as an unconditional overlay. |
| Fox controller returns early when the face manager is disabled; existing mask instances can remain attached to stale faces | Clear tracked instances when the manager/subsystem is unavailable or stopped; continue to require real `TrackingState.Tracking`. |
| Imported Fox material is URP while the project and quality settings select Built-in rendering | Choose compatible shaders based on the active pipeline. Runtime material copies preserve textures and are destroyed with the controller; installer uses the same pipeline choice. Actual rendering remains unverified. |
| Swipe logic is duplicated between NativeLensUI and a separate camera swipe component; the latter treats canceled touches as completed swipes and is not wired into the saved UI | NativeLensUI ensures one camera-swipe component at runtime, including already serialized scene instances, and no longer steps lenses itself. Swipe component handles cancellation/multi-touch and ignores drags starting over controls. Modern input is configured explicitly; legacy handling remains guarded as a fallback. |
| Smart carousel re-ranks after every selection and independently from engine navigation | Use one stable browse list for swipe and carousel. Usage is still saved for the next session; explicit favorite/reset can re-rank. This prevents navigation loops caused by a selected lens moving to the front. |
| A static two-ear resource prefab silently replaces the existing animated procedural Cat lens | Keep resource-prefab overrides as an explicit `PreferResourcePrefabs` option, off by default. Preserve all ten procedural effects, the original resource prefab and imported Fox as a separate scene-backed option. |
| Scene generators use `Assets/Scenes` instead of existing `Assets/SCENES`; mock scene generator replaces the entire build-scene list | Match the checked-in path casing and append missing scene entries without deleting existing scenes. Native scene generator includes the existing Fox bridge/prefab when available. |
| Native UI button strings contain corrupted UTF-8 | Replace with plain Back/Favorite/Photo labels. |
| Optional SnapAR test effect allocates a new unmanaged Material for every generated part on every lens change | Reuse the existing pipeline-aware shared material cache. No measured performance/memory pass is claimed. |
| Original ranking test resets persistent user favorites/usage | Snapshot affected PlayerPrefs before each EditMode test and restore them afterward. |

Android input is set to Input System rather than Both, with an explicit runtime assembly reference and direct package dependency. ARM64's IL2CPP selection is explicit. These are configuration fixes/hardening, not a claim that an Android build was attempted or failed.

## SKIPPED — not executed and not passed

- **Unity Editor compilation:** no Unity Editor executable was found in the available environment. Syntax parsing does not replace it.
- **Unity EditMode tests:** all **10 current NUnit cases** (including the original geometry/ranking checks plus new imported-lens/swipe cases) require Unity. None was executed here.
- **Unity package restore, shader compilation and asset import:** no Unity Library/import database. **96 non-local/non-built-in GUIDs** in serialized assets remain unresolved by this source-only inspection; many may be package assets, but they must not all be assumed valid. Imported OBJ mesh subobject file IDs likewise require the actual Unity importer.
- **Android APK/AAB build:** Unity Android Build Support/SDK/NDK toolchain unavailable; no APK was built.
- **Real-device camera permissions and ARCore startup, front-camera tracking/reacquisition, Fox alignment/rendering/occlusion, swipe/carousel/shutter/native exit behavior:** no Android device/ADB available.
- **Runtime performance, GPU/frame timing, battery and memory:** no Unity player/device run or profiler measurements.
- **Native host callback/gallery/cloud capture integration:** the repository capture API requests an asynchronous screenshot; the returned path is not proof that the file exists yet. Native host integration is not supplied or validated by this review.

**Release verdict:** source fixes are ready for Unity validation. PR #1 is not release-verified and should remain a draft until the skipped gates are executed successfully.

## Reproduce source checks

From the review snapshot root:

```sh
python -m pip install -r tests/requirements-source.txt
python tests/test_unity_source.py
```

Without the optional parser, the syntax test reports SKIPPED. Source checks still do not compile Unity.

After installing the configured Unity Editor and using a licensed local installation, run Unity EditMode tests (adapt the executable path for the OS):

```sh
Unity -batchmode -nographics -projectPath UnityProjects/CrushXLensEngine -runTests -testPlatform EditMode -testResults work/unity-editmode.xml -logFile work/unity-editmode.log
```

Inspect the actual process exit code, XML and Editor log; do not treat command invocation as a pass. Then execute an Android development build and the device checks listed above. No Unity installer/license service was invoked during this review.
