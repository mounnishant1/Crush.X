# Crush.X — private custom lens collections

Code branch: `feature/crushx-custom-lens-collections-20261105`, based on production-navigation draft PR #88. **Not yet a shipped or device-tested build.**

## In-app flow

1. Open Crush.X Camera → **Folders** (top right, beside Browse). The management overlay blocks camera swipe underneath.
2. Enter a unique name such as `My Beauty`, `Best Funny` or `Party Lenses`, then tap **Create collection**. Names are 1–32 Unicode UTF-16 code units, trimmed and normalized. Reserved system names, invalid controls and bidi overrides are rejected.
3. Select a folder. Tap **Add current lens** to save the currently selected original lens, or use **Find a lens to add** to search the allowlisted 37-lens catalog by name/id.
4. Saved lenses appear in order. Use ↑/↓ to rearrange lens order; × removes a lens from the folder without deleting the original lens.
5. Use Rename, Open, folder ↑/↓ reorder and two-tap Confirm delete. Folder deletion never deletes the underlying catalog lens or another user's folders.
6. All saved folders show as chips after the existing 11 built-in collections and inside Browse. A folder can be empty without crashing or silently switching to All.

## Persisted data boundaries

- Hard maximum: **20 custom folders per account**, **37 known catalog lenses per folder**, local JSON record maximum 32,768 characters.
- IDs are `user:` + a random 32-character lower-case hexadecimal GUID. Renaming preserves the stable ID and associations. Names are not used as storage identifiers.
- Uses the exact same account-scoped `LensPersonalization` v03 key derivation as Favorites/Recent, stored in Unity PlayerPrefs as `custom.collections` for that account. A guest uses a distinct guest scope.
- Critical host obligation: after authenticated sign-in or switching accounts, call Unity receiver `SetLensAccountScope(opaqueAuthenticatedUserId)`; call it with empty string on sign-out. Otherwise the Unity camera uses **guest** storage.
- Current implementation is **local to this device**. It does not sync across devices, share collections by link, publish assets, send biometric data or call backend APIs. For server sync, add a separately authenticated consent-driven endpoint and conflict resolution before claiming cross-device support.
- Invalid/corrupt saved JSON is rejected rather than silently overwritten. Every mutation validates the exact owner account scope, collection ID, name constraints, and lens allowlist.
- `ResetRanking()` clears favorites, recent and usage; it intentionally does **not** erase explicitly saved folders. A separate explicit destructive operation deletes all current-account folders.
- Older unscoped v02 data is not migrated: it cannot be reliably assigned to a user. Existing authenticated v03 favorites remain unaffected.

## QA and Android release

- New Unity EditMode tests: `LensCustomCollectionsTests.cs` covers create/rename/delete, reserved/duplicate names, Unicode, add/remove/reorder, quotas, persistence across instances, account switch, malformed JSON fail-closed and defensive snapshots.
- Source-level automated Python regression test includes runtime wiring, collection revision UI refresh, stable catalog count, multi-account storage and Unity meta files.
- **No Unity Editor compile or OnePlus 9 Pro touchscreen test has been performed from ChatGPT.** Pending: font/scaling, keyboard focus, modal interactions, crash recovery, IL2CPP APK and data persistence after real reinstall / app upgrade.
- Existing broader lens release hold remains: Face Landmarker model license and packaging, true camera frame orientation, rendered screenshot/MP4 consistency, sustained FPS, correct Android host integration.

## Optional isolated verification

    python OpenLens/test_lens_static.py -v

    .\OpenLens\run_lens_qa.ps1 -ConfigureURP -GenerateNativeARScene -RunTests -RunDevGate -ExportAndroid -BuildGradleApk -ConfirmIsolatedSource

Use a separate checkout and adequate disk space; do not overwrite latest Windows `F:` source or merge to main without the owner's approval.
