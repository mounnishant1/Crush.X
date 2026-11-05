# Crush.X Camera — per-lens Add to Collection

Branch: `feature/crushx-per-lens-add-to-collection-20261105` (stacked on #89). This is an isolated **source change**, not an installed release APK.

## How it works

1. Open any registered lens in the native Unity camera and tap **Save to** directly next to Favorite (♡). This is separate from the global Favorites toggle.
2. A full-screen, touch-blocking **bottom sheet** shows the lens name and all of the current authenticated account's private folders. No need to navigate away to the Folders manager.
3. Tap `+ Add` beside any folder. It immediately persists this lens ID in that folder and changes the row to `✓ Saved`. Tap again to remove only this membership; the original lens remains in All.
4. Tap **Create & add this lens** after entering a new folder name to create a private folder with this lens in **one atomic local write**. The new folder is immediately available in category chips, Browse and Folders manager.
5. Close the sheet to resume preview; the camera's one-swipe-one-lens input is blocked while the sheet is visible, and touch controls remain separated from preview hit regions.

## Limits and privacy

- Uses existing custom folder limits: 20 folders per account, up to 37 unique pre-installed lens IDs per folder, 32-character normalized name, duplicate and reserved-name prevention.
- One lens can be saved to **multiple folders**. Adding the same lens twice to one folder does not create duplicates.
- `LensCatalog.Find` allowlist is mandatory for every write. Third-party lens files/scripts cannot be added via this option.
- Device-local `PlayerPrefs` under the current authenticated account scope; no sync, URL sharing or upload is implied.
- The sheet pins its lens ID and account-scope revision at opening. An external native account switch or lens navigation invalidates/closes the sheet and prevents a stale tap from saving to the wrong account.
- A folder row only toggles membership after querying current stored state, not an old UI snapshot. Folder full state is disabled for new adds; already-saved members can still be removed.
- Empty state: if no folders exist, the user sees a creation prompt and Create & add field. All changes are persistent across camera reopening while the app's account scope stays stable.

## Implementation references

- `Assets/Scripts/Runtime/LensCameraProductionUI.cs`: **Save to** button, modal mount, preview swipe isolation, safe area.
- `Assets/Scripts/Runtime/LensCameraProductionUI.QuickSave.cs`: bottom sheet, saved checkmarks, folder toggle, create + add and invalidation on account switch.
- `Assets/Scripts/Runtime/LensEngineBootstrap.cs`: membership lookup, atomic quick-create-and-add and account revision.
- `Assets/Scripts/Runtime/LensCustomCollections.cs`: validated atomic `TryCreateWithLens` and scoped `ContainsLens`.
- `Assets/Tests/EditMode/LensCustomCollectionsTests.cs`: authored Unity EditMode coverage for atomic create, duplicate/unknown ID handling, multiple folders and account isolation.
- `OpenLens/test_lens_static.py`: GitHub source policy assertions.

## Not yet verified

- The GitHub Actions source policy only checks source consistency; it is **not** a Unity compilation or physical touch test.
- Test on a real OnePlus 9 Pro: normal lens, funny/beauty/alien, portrait safe-area, folder full, opening/closing without accidental camera swipe, selecting another lens while modal is open, account switch while modal is open, persistence after app restart.
- Check Android soft keyboard not covering the inline Create & add controls at various font scales; physical QA is required.
- Latest Windows `F:` frontend and native host may use a different camera control entry point and are not changed by this branch. Integration requires owner-approved conflict-safe merge.
- Model/URP/IL2CPP build, face tracking, video/MP4 parity and APK production gates from previous PRs remain blocked until real testing.
