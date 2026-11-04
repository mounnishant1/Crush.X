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
        private Texture2D sliceDisc;
        private readonly Texture2D[] sliceShapes = new Texture2D[3];
        private Vector2 previousSlicePoint, lastTrailFrom, lastTrailTo;
        private double trailUntil;
        private bool slicingGesture;
        private bool highScoreSaved;
        public bool IsOpen { get; private set; }
        public LensMiniGameCore Game { get { return core; } }
        public bool IsCuttingGame { get { return IsOpen && core.IsPlaying && core.IsSlicingGame; } }

        public bool BeginCut(Vector2 screen)
        {
            if (!IsCuttingGame || core.Paused) return false;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            Rect area = CuttingArea(layout.Width, layout.Height);
            Vector2 point = layout.ToGui(screen, Screen.height);
            if (!area.Contains(point)) return false;
            core.Cutting.SetViewportAspect(area.width / area.height);
            if (!core.Cutting.BeginStroke((point.x - area.x) / area.width, (point.y - area.y) / area.height))
                return false;
            previousSlicePoint = point;
            slicingGesture = true;
            return true;
        }

        public void MoveCut(Vector2 screen)
        {
            if (!slicingGesture || !IsCuttingGame || core.Paused) return;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            Rect area = CuttingArea(layout.Width, layout.Height);
            Vector2 point = layout.ToGui(screen, Screen.height);
            point.x = Mathf.Clamp(point.x, area.xMin, area.xMax);
            point.y = Mathf.Clamp(point.y, area.yMin, area.yMax);
            if ((point - previousSlicePoint).sqrMagnitude < 9) return;
            core.Cutting.MoveStroke((previousSlicePoint.x - area.x) / area.width,
                (previousSlicePoint.y - area.y) / area.height,
                (point.x - area.x) / area.width, (point.y - area.y) / area.height);
            core.SyncCutting();
            lastTrailFrom = previousSlicePoint;
            lastTrailTo = point;
            trailUntil = Time.realtimeSinceStartupAsDouble + .14;
            previousSlicePoint = point;
        }

        public void EndCut(Vector2 screen, bool canceled)
        {
            if (!slicingGesture) return;
            if (!canceled) MoveCut(screen);
            if (canceled) core.Cutting.CancelStroke();
            else core.Cutting.EndStroke();
            slicingGesture = false;
            core.SyncCutting();
        }

        public void CancelCut()
        {
            if (!slicingGesture) return;
            core.Cutting.CancelStroke();
            slicingGesture = false;
        }

        private static Rect CuttingArea(float width, float height)
        {
            return new Rect(16, 234, Mathf.Max(1, width - 32), Mathf.Max(100, height - 372));
        }

        public void Dispose()
        {
            CancelCut();
            if (sliceDisc != null) { UnityEngine.Object.Destroy(sliceDisc); sliceDisc = null; }
            for (int i = 0; i < sliceShapes.Length; i++)
                if (sliceShapes[i] != null) { UnityEngine.Object.Destroy(sliceShapes[i]); sliceShapes[i] = null; }
        }

        public void OpenPanel()
        {
            now = Time.realtimeSinceStartupAsDouble;
            IsOpen = true;
            family = MiniGameFamily.Lens;
            core.ReturnToCatalog();
            CancelCut();
            catalogScroll = Vector2.zero;
            highScoreSaved = false;
        }

        public void ClosePanel()
        {
            IsOpen = false;
            CancelCut();
            core.ReturnToCatalog();
        }

        public bool Back()
        {
            if (!IsOpen) return false;
            if (core.Phase != MiniGamePhase.Catalog) { CancelCut(); core.ReturnToCatalog(); }
            else { CancelCut(); IsOpen = false; }
            return true;
        }

        public void FocusChanged(bool focused, double time)
        {
            if (!IsOpen) return;
            if (focused) core.Resume(time);
            else { CancelCut(); core.Pause(time); }
        }

        public void Update(double time, LensEngineBootstrap engine)
        {
            if (!IsOpen) return;
            now = time;
            core.Tick(now);
            if (core.Phase != MiniGamePhase.Playing && core.Phase != MiniGamePhase.Catalog && !highScoreSaved)
            {
                string key = "crushx.game.localhigh.v1." + core.Game;
                int old = PlayerPrefs.GetInt(key, 0);
                if (core.Score > old) { PlayerPrefs.SetInt(key, core.Score); PlayerPrefs.Save(); }
                highScoreSaved = true;
            }
            if (engine != null && engine.TrackingActive && core.IsPlaying && core.IsLensGame && !core.IsSlicingGame)
                core.ObserveFace(engine.CurrentFace.Expressions, true, now);
        }

        public void Draw(NativeCameraLayout layout, GUIStyle title, GUIStyle status,
            GUIStyle button, GUIStyle small, bool faceTracking)
        {
            float w = layout.Width, h = layout.Height;
            Color old = GUI.color;
            GUI.color = new Color(.035f, .04f, .075f,
                core.IsPlaying && core.IsSlicingGame ? .26f :
                    core.IsPlaying && core.IsLensGame ? .62f : .94f);
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
            if (GUI.Button(new Rect(12, 72, tabW, 46), "Lens Games (" + CountFamily(MiniGameFamily.Lens) + ")", button))
            { family = MiniGameFamily.Lens; catalogScroll = Vector2.zero; }
            GUI.backgroundColor = family == MiniGameFamily.Puzzle ? new Color(.92f, .27f, .62f) : Color.white;
            if (GUI.Button(new Rect(24 + tabW, 72, tabW, 46), "Puzzles (" + CountFamily(MiniGameFamily.Puzzle) + ")", button))
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
            float cellWidth = Mathf.Max(86, (w - 52) / 2f);
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
                    CancelCut();
                    highScoreSaved = false;
                    GUI.FocusControl(null);
                }
                index++;
            }
            GUI.EndScrollView();
        }

        private static int CountFamily(MiniGameFamily selected)
        {
            int count = 0;
            foreach (MiniGameDefinition entry in LensMiniGameCore.Catalog)
                if (entry.Family == selected) count++;
            return count;
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
            int best = PlayerPrefs.GetInt("crushx.game.localhigh.v1." + core.Game, 0);
            GUI.Label(new Rect(16, h - 38, w - 32, 26), "Local high score: " + best, small);

            if (core.Phase != MiniGamePhase.Playing)
            {
                GUI.Label(new Rect(20, h * .34f, w - 40, 88),
                    core.Phase == MiniGamePhase.Won ? "Challenge complete!" :
                        core.Phase == MiniGamePhase.Failed ? "Game over!" : "Time is up!", title);
                GUI.Label(new Rect(20, h * .48f, w - 40, 55),
                    "Final score: " + core.Score + "    Misses: " + core.Mistakes, status);
                if (GUI.Button(new Rect(22, h * .65f, w - 44, 56), "Play again", button))
                { CancelCut(); core.Start(def.Id, now); highScoreSaved = false; }
                if (GUI.Button(new Rect(22, h * .65f + 70, w - 44, 56), "All games", button))
                { CancelCut(); core.ReturnToCatalog(); }
                return;
            }

            if (core.IsSlicingGame)
                DrawCuttingGame(w, h, title, status, small);
            else if (def.Family == MiniGameFamily.Lens && def.Id != MiniGameId.TargetTap)
                DrawExpressionGame(w, h, title, status, button, small, faceTracking);
            else
                DrawBoardGame(w, h, title, status, button, small);

            if (GUI.Button(new Rect(20, h - 98, (w - 52) * .5f, 50), "Restart", button))
            { CancelCut(); core.Start(def.Id, now); highScoreSaved = false; }
            if (GUI.Button(new Rect(32 + (w - 52) * .5f, h - 98, (w - 52) * .5f, 50), "All games", button))
            { CancelCut(); core.ReturnToCatalog(); }
        }

        private void EnsureSliceDisc()
        {
            if (sliceDisc != null) return;
            const int n = 64;
            sliceDisc = new Texture2D(n, n, TextureFormat.RGBA32, false);
            sliceDisc.name = "CrushX_SliceDisc";
            var pixels = new Color[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = (x + .5f - n * .5f) / (n * .5f);
                    float dy = (y + .5f - n * .5f) / (n * .5f);
                    float radius = Mathf.Sqrt(dx * dx + dy * dy);
                    pixels[y * n + x] = new Color(1, 1, 1, Mathf.Clamp01((1 - radius) * 9));
                }
            sliceDisc.SetPixels(pixels);
            sliceDisc.Apply(false, true);
            for (int shape = 0; shape < 3; shape++)
            {
                Texture2D mask = new Texture2D(n, n, TextureFormat.RGBA32, false);
                mask.name = "CrushX_SliceShape_" + shape;
                var colored = new Color[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float dx = (x + .5f - n * .5f) / (n * .5f);
                        float dy = (y + .5f - n * .5f) / (n * .5f);
                        float distance = shape == 0 ? Mathf.Sqrt(dx * dx + dy * dy) :
                            shape == 1 ? Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dy)) * 1.14f :
                            Mathf.Max(-.82f - dy, dy - .86f, Mathf.Abs(dx) * 1.18f + dy * .61f - .41f) + 1;
                        colored[y * n + x] = new Color(1, 1, 1, Mathf.Clamp01((1 - distance) * 9));
                    }
                mask.SetPixels(colored);
                mask.Apply(false, true);
                sliceShapes[shape] = mask;
            }
        }

        private void DrawCuttingGame(float w, float h, GUIStyle title, GUIStyle status, GUIStyle small)
        {
            EnsureSliceDisc();
            SliceChallengeCore slicing = core.Cutting;
            Rect bounds = CuttingArea(w, h);
            slicing.SetViewportAspect(bounds.width / bounds.height);
            Color background = GUI.color;
            GUI.color = new Color(.045f, .06f, .10f, .18f);
            GUI.DrawTexture(bounds, Texture2D.whiteTexture);
            GUI.color = background;
            string rule = core.Game == MiniGameId.ColorCut
                ? "CUT ONLY COLOR " + (slicing.RequiredColor + 1)
                : core.Game == MiniGameId.ShapeCut
                    ? "CUT ONLY SHAPE " + (slicing.RequiredShape + 1)
                    : core.Game == MiniGameId.PrecisionCut ? "CUT THROUGH THE CENTER"
                    : "SLASH FRUITS. DO NOT HIT BOMBS.";
            GUI.Label(new Rect(18, 213, w - 36, 30), rule, small);
            Color old = GUI.color;
            foreach (SliceObject target in slicing.Objects)
            {
                float diameter = (float)(target.Radius * 2 * bounds.width);
                float cx = bounds.x + (float)target.X * bounds.width;
                float cy = bounds.y + (float)target.Y * bounds.height;
                Rect disk = new Rect(cx - diameter * .5f, cy - diameter * .5f, diameter, diameter);
                GUI.color = target.Bomb ? new Color(.18f, .2f, .25f) : SliceColor(target.ColorIndex);
                Texture2D sprite = core.Game == MiniGameId.ShapeCut && !target.Bomb
                    ? sliceShapes[target.ShapeIndex] : sliceDisc;
                GUI.DrawTexture(disk, sprite, ScaleMode.StretchToFill, true);
                GUI.color = Color.white;
                GUI.Label(disk, target.Bomb ? "!" :
                    core.Game == MiniGameId.ShapeCut ? (target.ShapeIndex + 1).ToString() :
                    core.Game == MiniGameId.ColorCut ? (target.ColorIndex + 1).ToString() : "●", status);
            }
            GUI.color = old;
            foreach (SliceImpact impact in slicing.Impacts)
            {
                float elapsed = (float)(now - impact.When);
                if (elapsed < 0 || elapsed > .5f) continue;
                float size = 32 * (1 - elapsed * .6f);
                float cx = bounds.x + (float)impact.X * bounds.width;
                float cy = bounds.y + (float)impact.Y * bounds.height;
                Color previous = GUI.color;
                Color tint = impact.Bad ? new Color(1, .22f, .22f) : SliceColor(impact.ColorIndex);
                tint.a = Mathf.Clamp01(1 - elapsed * 2);
                GUI.color = tint;
                GUI.DrawTexture(new Rect(cx - size - elapsed * 35, cy - size * .5f + elapsed * 40,
                    size, size), sliceDisc);
                GUI.DrawTexture(new Rect(cx + elapsed * 35, cy - size * .5f + elapsed * 40,
                    size, size), sliceDisc);
                GUI.color = previous;
            }
            if (now < trailUntil)
            {
                float dx = lastTrailTo.x - lastTrailFrom.x;
                float dy = lastTrailTo.y - lastTrailFrom.y;
                float length = Mathf.Sqrt(dx * dx + dy * dy);
                if (length > 1)
                {
                    Matrix4x4 matrix = GUI.matrix;
                    Color c = GUI.color;
                    GUI.color = new Color(.95f, .99f, 1, .96f);
                    GUIUtility.RotateAroundPivot(Mathf.Atan2(dy, dx) * Mathf.Rad2Deg, lastTrailFrom);
                    GUI.DrawTexture(new Rect(lastTrailFrom.x, lastTrailFrom.y - 2, length, 4), Texture2D.whiteTexture);
                    GUI.matrix = matrix;
                    GUI.color = c;
                }
            }
            GUI.Label(new Rect(16, h - 138, w - 32, 34),
                "Lives " + slicing.Lives + "   Cut " + slicing.Sliced + "/" + slicing.Goal +
                "   Best combo " + slicing.BestCombo, small);
            if (slicing.LastCombo >= 2)
                GUI.Label(new Rect(20, bounds.y + 20, w - 40, 40),
                    slicing.LastCombo + "x SLICE COMBO!", title);
        }

        private static Color SliceColor(int index)
        {
            switch (index)
            {
                case 0: return new Color(.95f, .3f, .37f);
                case 1: return new Color(.33f, .78f, .55f);
                case 2: return new Color(.98f, .7f, .24f);
                default: return new Color(.37f, .65f, 1f);
            }
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
