# Crush.X — production camera category navigation (isolated branch)

Status: **Source implementation + cloud source regression tests; not a signed or physical-device-approved release.**

## User-facing navigation

- Seven exclusive categories (37 original catalog entries): Animals 3, Beauty 5, Sci-Fi 3, Fantasy 2, Funny 16, Aesthetic 4, Alien 4.
- Eleven accessible collections: `All`, `Beauty`, `Alien`, `Funny`, `Trending`, `Animals`, `Sci-Fi`, `Fantasy`, `Aesthetic`, `Favorites`, `Recent`.
- New `LensCameraProductionUI` uses Unity 6 runtime UI Toolkit (UIDocument/PanelSettings), horizontal touch ScrollView, Browse drawer, 44-point buttons, Screen.safeArea layout, and normal input-system pointer events.
- Photo, favorite, previous/next, original beauty/funny intensity, optional microphone start/stop/voice mode, and game score controls remain in one camera surface.
- Pointer interaction on category tabs and expanded drawer does not advance the lens. Genuine preview swipes advance at most one lens. Multi-touch cancels pending preview gesture.
- Selected collection and current favorite/voice state highlighted; empty Favorites/Recent have explanatory text.
- Existing NativeLensUI/IMGUI remains a fail-safe fallback if UIDocument has no valid panel. Do not ship both overlapping overlays.

## Account isolation (NEW, behavioral change)

- Earlier `crushx.lens.v02.*` stored favorites/recent under a single shared device prefix. Those records cannot be safely attributed to the correct signed-in user.
- New `crushx.lens.v03.<digest>.*` stores favorites, recent IDs and usage per account; account ID is SHA-256-digested into a shortened stable storage scope. Guest receives a separate scope.
- Authenticated host MUST call `CrushXLensReceiver.SetLensAccountScope(opaqueStableUserID)` whenever a user signs in or switches account, and `SetLensAccountScope("")` on sign-out. Use the authenticated stable account identifier, not a nickname or unverified user-input field.
- **No auto-migration of v02 shared preferences**. The old unscoped values remain untouched; they are deliberately not imported to avoid crossing accounts. Plan an explicit owner-reviewed one-time migration for users whose provenance can be proven.
- Programmatic initial lens selection and account-switch selection no longer silently add themselves to Recent. Real user lens selection updates a capped, deduplicated list of 12.
- `Reset()` clears only the currently selected account scope; it must never erase someone else's preference records.

## Unity installation — isolated environment only

1. Work from this branch in a separate Unity 6000.0.30f1 checkout; preserve newer Windows `F:` sources and all unmerged work.
2. In Unity Editor open an AR scene containing `ARCameraManager` and `LensEngineBootstrap`; select `CrushX > Lens Engine > Install Production Camera UI`. This creates an idempotent `Assets/CrushXGenerated/CrushXCameraProductionPanel.asset` (UI Toolkit PanelSettings) and a `CrushX Production Camera UI` GameObject + UIDocument.
3. Alternatively `CrushX > Lens Engine > Create Native Android AR Scene` now calls the production UI installer before saving the generated AR scene. An opt-in local CI runner can generate that scene in isolation.
4. The non-mutating `CrushXLensReleasePreflight` checks that PanelSettings exists and the native AR scene references `LensCameraProductionUI` by GUID. It fails when UI is not installed, rather than treating the C# file alone as complete.
5. Confirm Android 14 input-system event routing. Unity UI Toolkit can use the configured Input System automatically, but an added uGUI EventSystem or other panels can affect pointer order. Check the actual app before claiming touch correctness.

## QA acceptance matrix — not completed by source commits

| Test | Required outcome | Status |
|---|---|---|
| Unity C# compile / EditMode / PlayMode | Zero errors; all collection and account-scope tests pass | Not run |
| GitHub static source policy CI | Python tests pass | Run after PR |
| Android portrait notch, gesture bar and font scale | No clipped header/footer or overlay | Not run |
| All 11 collections + horizontal scroll + Browse | Tap correct category with no false preview swipe | Not run |
| Favorite/recent after restart, sign-out and account switch | No cross-user leakage; newest recents first | Not run |
| Android camera screenshot, photo, Story/Reel/MP4 | Original AR filters rendered consistently | Not run |
| ARM64 IL2CPP/Gradle OnePlus 9 Pro touch and thermal | Device verified 30fps goal | Not run |
| Approved model + legal/NOTICE | Authorized model/license receipts, actual inference | Hold |
| Latest Windows React host integration | Correct Camera.jsx/Unity entry point, no duplicate UI | Not present in this GitHub branch |

## Verification commands

- Source policy: `python OpenLens/check_free_stack.py` and `python OpenLens/test_lens_static.py -v`.
- Isolated Unity/Android: `./OpenLens/run_lens_qa.ps1 -ConfigureURP -GenerateNativeARScene -RunTests -RunDevGate -ExportAndroid -BuildGradleApk -ConfirmIsolatedSource`.
- Device acceptance requires a physical Android device, permission prompts, screenshot/video review and ADB/Unity logs; these cannot be claimed merely by code review.

## Licensing / references

- No new third-party AR or beauty runtime SDK was installed. All eleven collection labels and screen visual controls belong to Crush.X.
- [Unity 6 UIDocument](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/uielements/uidocument)
- [Unity 6 PanelSettings](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/uielements/panelsettings)
- [Unity 6 runtime input system](https://docs.unity.com/en-us/engine/6000.0/manual/uitoolkits/uielements/uie-support-for-runtime-ui/uie-render-runtime-ui/uie-runtime-event-system)
- [Unity Screen.safeArea](https://docs.unity.com/en-us/engine/6000.5/script-reference/unityengine/screen/safearea)
