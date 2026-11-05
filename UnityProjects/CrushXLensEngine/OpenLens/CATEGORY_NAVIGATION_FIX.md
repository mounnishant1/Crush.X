# Crush.X camera — all lens categories / collection navigation fix

Source fix on isolated branch. Not a physical APK release.

## Seven exclusive source categories (37 existing lenses)

| Category | Count |
|---|---:|
| Animals | 3 |
| Beauty | 5 |
| Sci-Fi | 3 |
| Fantasy | 2 |
| Funny | 16 |
| Aesthetic | 4 |
| Alien | 4 |
| **Total** | **37** |

## Eleven selectable camera collections

`All`, `Beauty`, `Alien`, `Funny`, `Trending`, `Animals`, `Sci-Fi`, `Fantasy`, `Aesthetic`, `Favorites`, `Recent`.

- Unity camera UI now shows every collection as a horizontally scrollable chip, plus an always-visible `Browse` dropdown that displays all eleven options in responsive columns.
- All seven category filters are matched strictly to the original LensCategory enum (Sci-Fi label maps to SciFi enum). Each registered lens belongs to exactly one source category; other views do **not** add new catalog items.
- `Trending` is an existing curated/ranked view (currently nine offline fallback IDs); the same lens may appear in its original category and Trending.
- `Favorites` reads the existing device-local PlayerPrefs favorite flags.
- `Recent` uses a new bounded local list of up to twelve *unique* lens IDs, newest first. The history updates when a registered lens is selected and clears on Reset.
- Empty Favorites or Recent retains a working camera view and displays an explanatory empty message; it does not silently switch to All or crash. One-swipe-one-lens is a no-op when the visible collection is empty.
- Removing an active favorite from the Favorites view selects the next saved lens when available, or shows the empty message.
- Touch gestures originating in the expanded Browse menu cannot accidentally change the active lens, including a gesture that closes the menu.
- Existing beauty, funny, voice, capture and native UnitySendMessage bridge methods remain available.

## Verification

- 16/16 direct source consistency checks passed during authoring.
- `OpenLens/test_lens_static.py` contains additional source QA checks for the category registry, scroll/selection wiring, local preferences and drawer-origin swipe protection.
- `Assets/Tests/EditMode/LensCollectionNavigationTests.cs` has NUnit test cases for all seven exact category counts, complete 11-name registry, dynamic favorites, recent ordering/dedup/cap and reset.
- GitHub Actions source QA result should be checked on this PR; those tests are not Unity EditMode/PlayMode or Android verification.
- No Unity editor, Gradle, IL2CPP, ADB, OnePlus device or current Windows frontend build was executed. This repository branch contains Unity source rather than the newer Windows frontend Camera.jsx; latest F: source requires a separate conflict-safe integration.

## Next release acceptance checks

1. Run Unity Editor EditMode NUnit suite after importing branch and required packages.
2. Check on Android that tapping all eleven categories, dragging horizontal tabs, opening/closing Browse, Favorites heart and Recent do not overlap or mis-trigger preview swipe.
3. Confirm localized font widths and landscape/small screens; IMGUI is still a prototype pending production Canvas UI.
4. Confirm the active camera and new category controls are wired into the latest Windows React host if it uses a different UI. Do not mark production fixed based only on Unity source.

**No new third-party lens SDK is used, and the license/model release hold remains in force.**
