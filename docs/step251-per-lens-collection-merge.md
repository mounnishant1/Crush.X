# Step251 latest integration — per-lens Save to Collection port

Integration base: `integration/all-chats-step251-20261104`; isolated candidate: `integration/step251-per-lens-collection-port-20261105`. Do not confuse this GitHub integration with the user's newer Windows `F:` work tree: that directory is not mounted and has not been changed.

## Why this is a port, not a wholesale branch merge

PR #90 is stacked on #89 -> #88 -> #87 -> #86 -> #85 -> #82 -> #81 -> #80 -> #79 -> #78, based on the much smaller 2026-10-13 mainline. Latest Step251 integration has an advanced CameraSessionController, NativeMediaCapture, swipe ownership, custom imported FoxMask, camera permission gates, privacy-opt-in Recents and several hundred other commits. Blindly merging the entire stacked feature branch would replace or collide with those newer components.

This isolated port reuses the **custom collections storage and per-lens save interactions**, but adapts them to the latest `NativeLensUI` / `CrushXSmartCarousel`. It does not force the previous prototype's separate UI Toolkit overlay or overwrite the latest camera scene.

## Current user flow (11 installed lenses)

1. Open any real installed lens and press **Save to** beside the name above the shutter.
2. A camera-modal sheet displays all private folders for the current account, with **+ Add** / **✓ Saved** toggles. Tap again to remove membership. The original lens remains in All.
3. Enter a unique collection name, then **Create + Add**. Folder + first lens save in one validated PlayerPrefs write.
4. Use **Manage folders** to select a folder, reorder folders, rename or use two-step deletion confirmation. Open a folder in the existing native carousel; its stored lens order is respected.
5. When the sheet is open, it blocks `CrushXCameraSwipe` and `CrushXSmartCarousel` touch ownership. On Back, pause, focus loss, lens change or account change, it closes. Native photo/video/shutter flow is untouched.

## Storage and privacy

- Separately account-scoped local PlayerPrefs keys `crushx.lens.v03.<SHA256-prefix>.custom.collections`; guest scope uses `guest`.
- Authenticated host must call `CrushXLensReceiver.SetLensAccountScope(stableAuthenticatedAccountId)` on login/account switch, and send empty string on logout. Do not pass arbitrary nickname or unverified client account ID.
- No raw account ID is stored. The scope revision immediately invalidates any open collection sheet and switches private folders.
- 20 folders maximum, 64 registered lens IDs maximum per folder (currently 11 installed), name max 32 code units, 32 KiB JSON cap. Only exact `LensCatalog` IDs are accepted. Duplicates, invalid names, reserved category names and unapproved model/asset imports rejected.
- Latest Step251 v02 Favorites/Recent **consent and ranking behavior is preserved and not migrated**. Only new custom folders use v03 account scoping. Legacy favorites remain device-local per their existing behavior; separate owner-reviewed work would be needed to migrate them safely.
- Local device only. No cloud sync, share links, external lens downloads or third-party camera SDK.

## Exact existing systems intentionally preserved

- `LensCatalog.cs`: 11 registered installed lenses, including scene-provided `fox-mask-3d`; does **not** claim prototype 37-lens pack is present here.
- `LensPersonalization.cs`: usage permission gate and favorites untouched.
- `NativeMediaCapture.cs`, `CaptureManager.cs`, `CameraSessionController.cs`, `CrushXCameraPermissionGate.cs`, `CrushXCameraSwipe.cs`, `NativeCameraLayout.cs`, AR scene, Unity XR project settings: untouched.
- Existing `NativeLensUI.cs`, `CrushXSmartCarousel.cs`, `LensEngineBootstrap.cs` and `UnityLensReceiver.cs`: minimal additive integration wiring.

## QA and gate

- `python -B tools/test_latest_lens_collection_integration.py -v` tests source integration, camera/capture/consent preservation, catalog and per-lens features.
- `Assets/Tests/EditMode/LatestLensCollectionIntegrationTests.cs` provides authored Unity NUnit tests for per-lens create/save, duplicate avoidance, scene lens, account scope, reorder and modal invalidation. These are not equivalent to executed Unity Editor tests.
- Running Unity 6 compile/EditMode/PlayMode, native Android/IL2CPP APK and OnePlus 9 Pro UI/keyboard/gesture tests are still required before a production release.
- If additional 37-lens prototype effects from #78–90 are desired in the latest AR engine, they require a separate conflict-safe lens catalog + native shader/capture integration and licensing/device validation. This merge ports the requested **per-lens collection option** only.
- GitHub source merge is NOT a merge into the user's unmounted Windows `F:` source or a deployment.
