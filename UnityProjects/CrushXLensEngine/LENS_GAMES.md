# Crush.X · Lens Games and Puzzles (isolated feature)

## Entry point

In the Unity native camera choose **Games** (top bar). The full-screen safe-area Games page has **AR Lens Games (7)** and **Puzzles (7)** tabs. Start a game, tap **Back** to return to the catalog and **Back** again to return to Camera. **Restart** resets the current game; **All games** returns to the catalog.

## Lens games (7)

Smile Rush, Blink Catch, Mouth Pop, Brow Jump, Expression Combo, Face Reflex and AR Target Tap. Face games read only fresh, valid expression samples from the existing LensEngineBootstrap tracking path. A rising-edge latch prevents a held expression or repeated stale frame from awarding multiple points. Face tracking unavailable? The on-screen fallback button still makes these playable. Target Tap always uses touch.

## Puzzle games (7)

Sliding Tiles (a solvable 3×3 shuffle), Memory Match (8 pairs), Color Sequence (memorize and repeat a rising sequence), Quick Math (multiple choice), Odd One Out (9-card visual targets), Word Scramble (choose the correctly unscrambled word), and Maze Escape (adjacent moves only). Time, score, moves, restart and end-state are handled locally; no online access or camera permission is required by the pure game core.

## Safety and lifecycle

All camera swipes and shutter interactions are blocked while the game page is open, and unblocked on exit. The camera/game page is not drawn while a preview or camera-permission prompt is active. Game time pauses during application backgrounding and resumes on focus. The core does not collect telemetry, store face coefficients, submit scores to a leaderboard, issue currency or use the backend. This is a first-pass native Unity IMGUI implementation, not yet a final polished production Canvas UI. Front camera and real face tracking depend on the existing native tracking and runtime gates.

## Verification required before release

1. Run **Unity EditMode Tests** (LensMiniGameTests and existing camera interaction suites).
2. Run Unity compile/build in project **UnityProjects/CrushXLensEngine** using the pinned Unity version.
3. Build the integrated Android APK (Unity + frontend native container) and exercise all 14 games on the actual OnePlus 9 Pro.
4. Confirm safe-area layout, 60/30 FPS performance, touch ownership, screen Back, app interruption, camera permissions, live face gestures, camera-preview and capture behavior.
5. Verify final design parity, localized copy, sound/haptics and any opt-in leaderboard/friends sharing separately. Those are not implemented in this branch.

**Scope:** isolated feature branch only. Does not modify production services or deploy an APK.
