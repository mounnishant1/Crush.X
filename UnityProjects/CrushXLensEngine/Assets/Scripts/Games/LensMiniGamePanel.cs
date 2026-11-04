using UnityEngine;

namespace CrushX.LensEngine
{
    // Full-safe-area camera overlay. No independent touch listener: all buttons are IMGUI
    // and NativeLensUI blocks the underlying camera swipe/shutter while this page is open.
    public sealed class LensMiniGamePanel
    {
        private readonly LensMiniGameCore core = new LensMiniGameCore();
        private MiniGameFamily family = MiniGameFamily.Lens;
        private Vector2 catalogScroll;
        private double now;
        public bool IsOpen { get; private set; }
        public LensMiniGameCore Game { get { return core; } }

        public void OpenPanel()
        {
            now = Time.realtimeSinceStartupAsDouble;
            IsOpen = true;
            family = MiniGameFamily.Lens;
            core.ReturnToCatalog();
            catalogScroll = Vector2.zero;
        }

        public void ClosePanel()
        {
            IsOpen = false;
            core.ReturnToCatalog();
        }

        public bool Back()
        {
            if (!IsOpen) return false;
            if (core.Phase != MiniGamePhase.Catalog) core.ReturnToCatalog();
            else IsOpen = false;
            return true;
        }

        public void FocusChanged(bool focused, double time)
        {
            if (!IsOpen) return;
            if (focused) core.Resume(time);
            else core.Pause(time);
        }

        public void Update(double time, LensEngineBootstrap engine)
        {
            if (!IsOpen) return;
            now = time;
            core.Tick(now);
            if (engine != null && engine.TrackingActive && core.IsPlaying && core.IsLensGame)
                core.ObserveFace(engine.CurrentFace.Expressions, true, now);
        }

        public void Draw(NativeCameraLayout layout, GUIStyle title, GUIStyle status,
            GUIStyle button, GUIStyle small, bool faceTracking)
        {
            float w = layout.Width, h = layout.Height;
            Color old = GUI.color;
            GUI.color = new Color(.035f, .04f, .075f, .94f);
            GUI.DrawTexture(layout.Bounds, Texture2D.whiteTexture);
            GUI.color = old;

            if (GUI.Button(new Rect(12, 12, 82, 46), "Back", button)) Back();
            GUI.Label(new Rect(100, 12, Mathf.Max(100, w - 112), 44), "Crush.X Games", title);

            if (core.Phase == MiniGamePhase.Catalog) DrawCatalog(w, h, title, status, button, small);
            else DrawGame(w, h, title, status, button, small, faceTracking);
        }

        private void DrawCatalog(float w, float h, GUIStyle title,
            GUIStyle status, GUIStyle button, GUIStyle small)
        {
            float gap = 8;
            float tabW = (w - 36) * .5f;
            Color old = GUI.backgroundColor;
            GUI.backgroundColor = family == MiniGameFamily.Lens ? new Color(.92f, .27f, .62f) : Color.white;
            if (GUI.Button(new Rect(12, 72, tabW, 46), "AR Lens Games (7)", button))
            { family = MiniGameFamily.Lens; catalogScroll = Vector2.zero; }
            GUI.backgroundColor = family == MiniGameFamily.Puzzle ? new Color(.92f, .27f, .62f) : Color.white;
            if (GUI.Button(new Rect(24 + tabW, 72, tabW, 46), "Puzzles (7)", button))
            { family = MiniGameFamily.Puzzle; catalogScroll = Vector2.zero; }
            GUI.backgroundColor = old;
            GUI.Label(new Rect(15, 124, w - 30, 29),
                family == MiniGameFamily.Lens ? "Camera games · Face / touch controls" :
                    "Brain games · Touch controls · Offline play", small);
            float viewportHeight = Mathf.Max(110, h - 176);
            int count = 0;
            foreach (MiniGameDefinition def in LensMiniGameCore.Catalog)
                if (def.Family == family) count++;
            int rows = (count + 1) / 2;
            float cellWidth = Mathf.Max(86, (w - 47) / 2f);
            float contentHeight = rows * 100 + 10;
            Rect viewport = new Rect(12, 158, w - 24, viewportHeight);
            catalogScroll = GUI.BeginScrollView(viewport, catalogScroll,
                new Rect(0, 0, w - 40, Mathf.Max(viewportHeight, contentHeight)));
            int index = 0;
            foreach (MiniGameDefinition def in LensMiniGameCore.Catalog)
            {
                if (def.Family != family) continue;
                int row = index / 2, col = index % 2;
                Rect card = new Rect(4 + col * (cellWidth + gap), 6 + row * 100, cellWidth, 88);
                string label = def.Name + "\n" + def.Seconds + " sec";
                if (GUI.Button(card, label, button))
                {
                    core.Start(def.Id, now);
                    GUI.FocusControl(null);
                }
                index++;
            }
            GUI.EndScrollView();
        }

        private void DrawGame(float w, float h, GUIStyle title,
            GUIStyle status, GUIStyle button, GUIStyle small, bool faceTracking)
        {
            MiniGameDefinition def = core.Definition;
            GUI.Label(new Rect(14, 70, w - 28, 46), def.Name, title);
            GUI.Label(new Rect(16, 118, w - 32, 46), def.Help, small);
            GUI.Label(new Rect(16, 166, w - 32, 44),
                "Score " + core.Score + "    Moves " + core.Moves +
                "    Time " + core.SecondsLeft(now) + "s", status);

            if (core.Phase != MiniGamePhase.Playing)
            {
                GUI.Label(new Rect(20, h * .34f, w - 40, 88),
                    core.Phase == MiniGamePhase.Won ? "Challenge complete!" : "Time is up!", title);
                GUI.Label(new Rect(20, h * .48f, w - 40, 55),
                    "Final score: " + core.Score + "    Misses: " + core.Mistakes, status);
                if (GUI.Button(new Rect(22, h * .65f, w - 44, 56), "Play again", button))
                    core.Start(def.Id, now);
                if (GUI.Button(new Rect(22, h * .65f + 70, w - 44, 56), "All games", button))
                    core.ReturnToCatalog();
                return;
            }

            if (def.Family == MiniGameFamily.Lens && def.Id != MiniGameId.TargetTap)
                DrawExpressionGame(w, h, title, status, button, small, faceTracking);
            else
                DrawBoardGame(w, h, title, status, button, small);

            if (GUI.Button(new Rect(20, h - 98, (w - 52) * .5f, 50), "Restart", button))
                core.Start(def.Id, now);
            if (GUI.Button(new Rect(32 + (w - 52) * .5f, h - 98, (w - 52) * .5f, 50), "All games", button))
                core.ReturnToCatalog();
        }

        private void DrawExpressionGame(float w, float h, GUIStyle title,
            GUIStyle status, GUIStyle button, GUIStyle small, bool faceTracking)
        {
            GUI.Label(new Rect(22, h * .29f, w - 44, 80), LensMiniGameCore.SignalLabel(core.ExpectedSignal), title);
            GUI.Label(new Rect(22, h * .43f, w - 44, 75),
                "Progress " + core.Progress + " / " + (core.Game == MiniGameId.ExpressionCombo ? 8 : 10), status);
            GUI.Label(new Rect(22, h * .52f, w - 44, 56),
                faceTracking ? "Live face tracking · Or tap below" :
                    "Face tracking not available · Use touch", small);
            if (GUI.Button(new Rect(30, h * .64f, w - 60, 62), "Tap to perform action", button))
                core.TapFallback(now);
        }

        private void DrawBoardGame(float w, float h, GUIStyle title,
            GUIStyle status, GUIStyle button, GUIStyle small)
        {
            int columns = 3, rows = 3;
            switch (core.Game)
            {
                case MiniGameId.MemoryPairs: columns = rows = 4; break;
                case MiniGameId.SequenceRecall:
                case MiniGameId.QuickMath:
                case MiniGameId.WordScramble: columns = rows = 2; break;
                case MiniGameId.MazeEscape: columns = rows = 5; break;
            }
            if (core.Game == MiniGameId.QuickMath)
                GUI.Label(new Rect(20, 210, w - 40, 45), core.Prompt, title);
            if (core.Game == MiniGameId.WordScramble)
                GUI.Label(new Rect(20, 210, w - 40, 45), core.ScrambledWord, title);
            if (core.Game == MiniGameId.SequenceRecall)
            {
                string hint = "Repeat " + core.SequenceLength + " colors";
                if (core.SequenceIsVisible(now))
                {
                    int[] seq = core.Sequence;
                    hint = "Remember: ";
                    for (int i = 0; i < core.SequenceLength; i++) hint += (seq[i] + 1) + " ";
                }
                GUI.Label(new Rect(18, 207, w - 36, 60), hint, status);
            }
            if (core.Game == MiniGameId.MazeEscape)
                GUI.Label(new Rect(18, 205, w - 36, 46), "S = start, E = exit, X = wall", small);

            float spaceTop = core.Game == MiniGameId.TargetTap || core.Game == MiniGameId.OddColor ? 235 : 276;
            float available = Mathf.Max(170, h - spaceTop - 125);
            float gap = Mathf.Clamp(w * .015f, 4, 9);
            float size = Mathf.Min((w - 34 - (columns - 1) * gap) / columns,
                (available - (rows - 1) * gap) / rows);
            size = Mathf.Max(20, size);
            float left = (w - (size * columns + gap * (columns - 1))) * .5f;
            float top = spaceTop + (available - (size * rows + gap * (rows - 1))) * .5f;
            int[] board = core.Board;
            int length = columns * rows;
            for (int i = 0; i < length; i++)
            {
                int cell = i; // capture only this value on click
                string label = "";
                Color oldColor = GUI.backgroundColor;
                switch (core.Game)
                {
                    case MiniGameId.SlidingTiles: label = board[i] == 0 ? " " : board[i].ToString(); break;
                    case MiniGameId.MemoryPairs:
                        label = core.IsMemoryVisible(i) ? (board[i] + 1).ToString() : "?";
                        if (core.IsMatched(i)) GUI.backgroundColor = new Color(.3f, .85f, .5f);
                        break;
                    case MiniGameId.SequenceRecall:
                        label = (i + 1).ToString();
                        GUI.backgroundColor = Palette(i);
                        break;
                    case MiniGameId.QuickMath:
                    case MiniGameId.WordScramble: label = core.ChoiceText(i); break;
                    case MiniGameId.OddColor:
                    case MiniGameId.TargetTap:
                        label = core.Target == i ? "★" : "·";
                        GUI.backgroundColor = core.Target == i ? new Color(.98f, .65f, .2f) : new Color(.32f, .44f, .68f);
                        break;
                    case MiniGameId.MazeEscape:
                        label = core.MazePosition == i ? "S" : i == 24 ? "E" : core.IsMazeWall(i) ? "X" : "·";
                        if (core.IsMazeWall(i)) GUI.backgroundColor = new Color(.3f, .35f, .42f);
                        if (core.MazePosition == i) GUI.backgroundColor = new Color(.35f, .82f, .56f);
                        break;
                }
                Rect rect = new Rect(left + (i % columns) * (size + gap),
                    top + (i / columns) * (size + gap), size, size);
                bool clicked = GUI.Button(rect, label, button);
                GUI.backgroundColor = oldColor;
                if (clicked) core.TapCell(cell, now);
            }
            string progress = "Solved " + core.Progress + "    Misses " + core.Mistakes;
            if (core.Game == MiniGameId.MazeEscape) progress = "Reach E from S using adjacent tiles";
            if (core.Game == MiniGameId.SlidingTiles) progress = "Make 1-8 in order with the empty tile last";
            GUI.Label(new Rect(12, h - 145, w - 24, 38), progress, small);
        }

        private static Color Palette(int index)
        {
            switch (index)
            {
                case 0: return new Color(.93f, .35f, .41f);
                case 1: return new Color(.36f, .62f, .98f);
                case 2: return new Color(.31f, .75f, .52f);
                default: return new Color(.94f, .76f, .3f);
            }
        }
    }
}
