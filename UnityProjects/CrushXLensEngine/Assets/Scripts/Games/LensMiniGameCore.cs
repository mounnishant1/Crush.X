using System;
using System.Collections.Generic;

namespace CrushX.LensEngine
{
    public enum MiniGameFamily { Lens, Puzzle }
    public enum MiniGamePhase { Catalog, Playing, Won, TimeUp, Failed }
    public enum MiniGameId
    {
        SmileRush, BlinkCatch, MouthPop, BrowJump, ExpressionCombo, FaceReflex, TargetTap,
        SlidingTiles, MemoryPairs, SequenceRecall, QuickMath, OddColor, WordScramble, MazeEscape,
        FruitRush, BombDodge, ColorCut, ShapeCut, PrecisionCut, SpeedSlice, ComboMaster
    }

    public sealed class MiniGameDefinition
    {
        public readonly MiniGameId Id;
        public readonly MiniGameFamily Family;
        public readonly string Name;
        public readonly string Help;
        public readonly int Seconds;
        public MiniGameDefinition(MiniGameId id, MiniGameFamily family, string name, string help, int seconds)
        {
            Id = id; Family = family; Name = name; Help = help; Seconds = seconds;
        }
    }

    // Pure state machine: no Unity scene, camera, backend or PlayerPrefs dependencies.
    // Tests can advance a clock and provide fresh face samples deterministically.
    public sealed class LensMiniGameCore
    {
        public static readonly IReadOnlyList<MiniGameDefinition> Catalog = Array.AsReadOnly(new[]
        {
            new MiniGameDefinition(MiniGameId.SmileRush, MiniGameFamily.Lens, "Smile Rush", "Smile to collect stars. Touch fallback supported.", 35),
            new MiniGameDefinition(MiniGameId.BlinkCatch, MiniGameFamily.Lens, "Blink Catch", "Blink to catch flying gems.", 35),
            new MiniGameDefinition(MiniGameId.MouthPop, MiniGameFamily.Lens, "Mouth Pop", "Open your mouth to pop bubbles.", 35),
            new MiniGameDefinition(MiniGameId.BrowJump, MiniGameFamily.Lens, "Brow Jump", "Raise your eyebrows to jump.", 35),
            new MiniGameDefinition(MiniGameId.ExpressionCombo, MiniGameFamily.Lens, "Expression Combo", "Follow the changing face-expression sequence.", 50),
            new MiniGameDefinition(MiniGameId.FaceReflex, MiniGameFamily.Lens, "Face Reflex", "Quickly perform the requested face move.", 40),
            new MiniGameDefinition(MiniGameId.TargetTap, MiniGameFamily.Lens, "AR Target Tap", "Hit the highlighted target over your camera.", 35),
            new MiniGameDefinition(MiniGameId.SlidingTiles, MiniGameFamily.Puzzle, "Sliding Tiles", "Slide the numbered tiles into order.", 120),
            new MiniGameDefinition(MiniGameId.MemoryPairs, MiniGameFamily.Puzzle, "Memory Match", "Turn over cards to find eight pairs.", 120),
            new MiniGameDefinition(MiniGameId.SequenceRecall, MiniGameFamily.Puzzle, "Color Sequence", "Remember, then repeat the color pattern.", 100),
            new MiniGameDefinition(MiniGameId.QuickMath, MiniGameFamily.Puzzle, "Quick Math", "Solve eight short number questions.", 90),
            new MiniGameDefinition(MiniGameId.OddColor, MiniGameFamily.Puzzle, "Odd One Out", "Find the different tile eight times.", 70),
            new MiniGameDefinition(MiniGameId.WordScramble, MiniGameFamily.Puzzle, "Word Scramble", "Unscramble letters and choose the right word.", 90),
            new MiniGameDefinition(MiniGameId.MazeEscape, MiniGameFamily.Puzzle, "Maze Escape", "Walk to the exit without touching walls.", 100),
            new MiniGameDefinition(MiniGameId.FruitRush, MiniGameFamily.Lens, "Fruit Rush", "Swipe across flying fruits; avoid bombs.", 60),
            new MiniGameDefinition(MiniGameId.BombDodge, MiniGameFamily.Lens, "Bomb Dodge", "Cut fruit and dodge extra bombs.", 60),
            new MiniGameDefinition(MiniGameId.ColorCut, MiniGameFamily.Lens, "Color Cut", "Cut only the displayed color.", 70),
            new MiniGameDefinition(MiniGameId.ShapeCut, MiniGameFamily.Lens, "Shape Cut", "Cut only the matching shape.", 70),
            new MiniGameDefinition(MiniGameId.PrecisionCut, MiniGameFamily.Lens, "Precision Cut", "Cut close to the center.", 75),
            new MiniGameDefinition(MiniGameId.SpeedSlice, MiniGameFamily.Lens, "Speed Slice", "Slice faster objects against the clock.", 50),
            new MiniGameDefinition(MiniGameId.ComboMaster, MiniGameFamily.Lens, "Combo Master", "Slice several objects in a single swipe.", 65)
        });

        private static readonly ExpressionSignal[] ComboSignals =
            { ExpressionSignal.Smile, ExpressionSignal.Blink, ExpressionSignal.MouthOpen, ExpressionSignal.BrowRaise };
        private static readonly string[] Words =
            { "LENS", "GAME", "STAR", "MOON", "BIRD", "FROG", "WAVE", "PIXEL", "CLOUD", "SMILE" };
        private static readonly int[] MazeWalls = { 6, 8, 11, 13, 16, 18 };

        private readonly Random random;
        private readonly SliceChallengeCore cutting;
        private readonly bool[] matched = new bool[16];
        private readonly int[] board = new int[25];
        private readonly int[] choices = new int[4];
        private readonly int[] sequence = new int[8];
        private double endAt, pausedAt = -1, revealUntil, flipBackAt = -1, lastFaceTimestamp = -1;
        private bool faceArmed = true;
        private int firstCard = -1, secondCard = -1, sequenceIndex, sequenceLength;
        private int goal, target, correctChoice, mazePosition;
        private string word = "", scrambled = "", prompt = "";

        public MiniGamePhase Phase { get; private set; } = MiniGamePhase.Catalog;
        public MiniGameId Game { get; private set; }
        public int Score { get; private set; }
        public int Moves { get; private set; }
        public int Progress { get; private set; }
        public int Mistakes { get; private set; }
        public bool Paused { get { return pausedAt >= 0; } }
        public int[] Board { get { return (int[])board.Clone(); } }
        public int[] Choices { get { return (int[])choices.Clone(); } }
        public int[] Sequence { get { return (int[])sequence.Clone(); } }
        public int Target { get { return target; } }
        public int MazePosition { get { return mazePosition; } }
        public int SequenceLength { get { return sequenceLength; } }
        public int SequenceIndex { get { return sequenceIndex; } }
        public string Prompt { get { return prompt; } }
        public string ScrambledWord { get { return scrambled; } }
        public bool IsPlaying { get { return Phase == MiniGamePhase.Playing; } }
        public bool IsSlicingGame { get { return Game >= MiniGameId.FruitRush && Game <= MiniGameId.ComboMaster; } }
        public SliceChallengeCore Cutting { get { return cutting; } }
        public void SyncCutting()
        {
            if (!IsPlaying || !IsSlicingGame) return;
            Score = cutting.Score;
            Progress = cutting.Sliced;
            Moves = cutting.Strokes;
            Mistakes = cutting.BombsHit;
            if (cutting.Won) Phase = MiniGamePhase.Won;
            else if (cutting.Failed) Phase = MiniGamePhase.Failed;
        }
        public bool IsLensGame { get { return Definition.Family == MiniGameFamily.Lens; } }
        public MiniGameDefinition Definition { get { return Catalog[(int)Game]; } }

        public LensMiniGameCore(int? seed = null)
        {
            random = seed.HasValue ? new Random(seed.Value) : new Random();
            cutting = new SliceChallengeCore(seed);
        }

        public static string SignalLabel(ExpressionSignal signal)
        {
            switch (signal)
            {
                case ExpressionSignal.Smile: return "Smile!";
                case ExpressionSignal.Blink: return "Blink!";
                case ExpressionSignal.MouthOpen: return "Open your mouth!";
                case ExpressionSignal.BrowRaise: return "Raise your eyebrows!";
                default: return "Tap!";
            }
        }

        public ExpressionSignal ExpectedSignal
        {
            get
            {
                switch (Game)
                {
                    case MiniGameId.SmileRush: return ExpressionSignal.Smile;
                    case MiniGameId.BlinkCatch: return ExpressionSignal.Blink;
                    case MiniGameId.MouthPop: return ExpressionSignal.MouthOpen;
                    case MiniGameId.BrowJump: return ExpressionSignal.BrowRaise;
                    case MiniGameId.ExpressionCombo: return ComboSignals[Progress % ComboSignals.Length];
                    case MiniGameId.FaceReflex: return ComboSignals[target % ComboSignals.Length];
                    default: return ExpressionSignal.Smile;
                }
            }
        }

        public void Start(MiniGameId id, double now)
        {
            if ((int)id < 0 || (int)id >= Catalog.Count) throw new ArgumentOutOfRangeException(nameof(id));
            Game = id;
            Phase = MiniGamePhase.Playing;
            Score = Moves = Progress = Mistakes = 0;
            pausedAt = -1; flipBackAt = -1; lastFaceTimestamp = -1; faceArmed = true;
            firstCard = secondCard = -1; sequenceIndex = 0; sequenceLength = 3;
            endAt = now + Definition.Seconds;
            prompt = "";
            Array.Clear(matched, 0, matched.Length);
            Array.Clear(board, 0, board.Length);
            Array.Clear(choices, 0, choices.Length);
            if (id == MiniGameId.SlidingTiles) InitializeTiles();
            if (id == MiniGameId.MemoryPairs) InitializeMemory();
            if (id == MiniGameId.SequenceRecall)
            {
                for (int i = 0; i < sequence.Length; i++) sequence[i] = random.Next(4);
                revealUntil = now + 3.0;
            }
            if (id == MiniGameId.QuickMath) NextMath();
            if (id == MiniGameId.WordScramble) NextWord();
            if (id == MiniGameId.TargetTap || id == MiniGameId.FaceReflex || id == MiniGameId.OddColor)
                target = random.Next(id == MiniGameId.FaceReflex ? 4 : 9);
            if (id == MiniGameId.MazeEscape) mazePosition = 0;
            if (IsSlicingGame) cutting.Start((SliceMode)((int)id - (int)MiniGameId.FruitRush), now);
            else cutting.Clear();
        }

        public void ReturnToCatalog()
        {
            Phase = MiniGamePhase.Catalog; pausedAt = -1;
            firstCard = secondCard = -1; lastFaceTimestamp = -1;
            cutting.Clear();
        }

        public void Pause(double now)
        {
            if (IsPlaying && pausedAt < 0) pausedAt = now;
        }

        public void Resume(double now)
        {
            if (pausedAt < 0) return;
            double dt = Math.Max(0, now - pausedAt);
            endAt += dt;
            if (flipBackAt >= 0) flipBackAt += dt;
            revealUntil += dt;
            cutting.ShiftClock(dt);
            pausedAt = -1;
        }

        public int SecondsLeft(double now)
        {
            if (Phase == MiniGamePhase.TimeUp) return 0;
            return (int)Math.Ceiling(Math.Max(0, endAt - (Paused ? pausedAt : now)));
        }

        public void Tick(double now)
        {
            if (!IsPlaying || Paused) return;
            if (now >= endAt) { Phase = MiniGamePhase.TimeUp; return; }
            if (IsSlicingGame)
            {
                cutting.Tick(now);
                SyncCutting();
            }
            if (flipBackAt >= 0 && now >= flipBackAt)
            {
                firstCard = secondCard = -1;
                flipBackAt = -1;
            }
        }

        public bool IsMemoryVisible(int index)
        {
            return index >= 0 && index < 16 &&
                (matched[index] || firstCard == index || secondCard == index);
        }

        public bool IsMatched(int index) { return index >= 0 && index < 16 && matched[index]; }
        public bool IsMazeWall(int index) { return Array.IndexOf(MazeWalls, index) >= 0; }
        public bool SequenceIsVisible(double now) { return IsPlaying && Game == MiniGameId.SequenceRecall && (Paused ? pausedAt : now) < revealUntil; }

        public void ObserveFace(FaceExpressionSample sample, bool tracking, double now)
        {
            if (!IsPlaying || Paused || !IsLensGame || Game == MiniGameId.TargetTap || IsSlicingGame || !tracking) return;
            if (double.IsNaN(sample.Timestamp) || double.IsInfinity(sample.Timestamp) ||
                sample.Timestamp <= lastFaceTimestamp || sample.Timestamp > now + .05 || now - sample.Timestamp > .15)
                return;
            lastFaceTimestamp = sample.Timestamp;
            if (!sample.TryGet(ExpectedSignal, out float strength)) return;
            if (strength <= .25f) { faceArmed = true; return; }
            if (strength >= .65f && faceArmed)
            {
                faceArmed = false;
                AdvanceLens(now);
            }
        }

        public bool TapFallback(double now)
        {
            if (!IsPlaying || Paused || !IsLensGame || Game == MiniGameId.TargetTap || IsSlicingGame) return false;
            Tick(now);
            if (!IsPlaying) return false;
            faceArmed = false;
            AdvanceLens(now);
            return true;
        }

        private void AdvanceLens(double now)
        {
            if (!IsPlaying) return;
            Score += 10; Progress++; Moves++;
            if (Game == MiniGameId.FaceReflex) target = (target + 1 + random.Next(3)) % 4;
            if (Progress >= (Game == MiniGameId.ExpressionCombo ? 8 : 10)) Win();
        }

        public bool TapCell(int index, double now)
        {
            if (!IsPlaying || Paused) return false;
            Tick(now);
            if (!IsPlaying) return false;
            switch (Game)
            {
                case MiniGameId.TargetTap:
                    if (index < 0 || index >= 9) return false;
                    Moves++;
                    if (index != target) { Mistakes++; return false; }
                    Score += 10; Progress++;
                    target = NextDifferent(9, target);
                    if (Progress >= 10) Win();
                    return true;
                case MiniGameId.SlidingTiles:
                    if (index < 0 || index >= 9) return false;
                    int empty = Array.IndexOf(board, 0, 0, 9);
                    if (!Adjacent(index, empty, 3)) return false;
                    Swap(board, index, empty); Moves++;
                    if (TilesSolved())
                    {
                        Score = Math.Max(10, 200 - Moves * 2); Win();
                    }
                    return true;
                case MiniGameId.MemoryPairs:
                    if (index < 0 || index >= 16 || matched[index] || index == firstCard || flipBackAt >= 0) return false;
                    Moves++;
                    if (firstCard < 0) { firstCard = index; return true; }
                    secondCard = index;
                    if (board[firstCard] == board[secondCard])
                    {
                        matched[firstCard] = matched[secondCard] = true;
                        Score += 20; Progress++;
                        firstCard = secondCard = -1;
                        if (Progress == 8) Win();
                    }
                    else { Mistakes++; flipBackAt = now + .8; }
                    return true;
                case MiniGameId.SequenceRecall:
                    if (index < 0 || index >= 4 || SequenceIsVisible(now)) return false;
                    Moves++;
                    if (index != sequence[sequenceIndex])
                    {
                        Mistakes++; sequenceIndex = 0; revealUntil = now + 2;
                        return false;
                    }
                    sequenceIndex++;
                    if (sequenceIndex >= sequenceLength)
                    {
                        Score += 15 * sequenceLength; Progress++;
                        sequenceIndex = 0; sequenceLength++;
                        if (sequenceLength > 7) Win();
                        else revealUntil = now + 2.5;
                    }
                    return true;
                case MiniGameId.QuickMath:
                    if (index < 0 || index >= 4) return false;
                    Moves++;
                    if (index != correctChoice) { Mistakes++; return false; }
                    Score += 15; Progress++;
                    if (Progress == 8) Win(); else NextMath();
                    return true;
                case MiniGameId.OddColor:
                    if (index < 0 || index >= 9) return false;
                    Moves++;
                    if (index != target) { Mistakes++; return false; }
                    Score += 15; Progress++;
                    if (Progress == 8) Win(); else target = NextDifferent(9, target);
                    return true;
                case MiniGameId.WordScramble:
                    if (index < 0 || index >= 4) return false;
                    Moves++;
                    if (index != correctChoice) { Mistakes++; return false; }
                    Score += 15; Progress++;
                    if (Progress == 8) Win(); else NextWord();
                    return true;
                case MiniGameId.MazeEscape:
                    if (index < 0 || index >= 25 || IsMazeWall(index) || !Adjacent(index, mazePosition, 5)) return false;
                    mazePosition = index; Moves++; Score += 2;
                    if (mazePosition == 24) { Score += 100; Win(); }
                    return true;
                default: return false;
            }
        }

        private void InitializeTiles()
        {
            for (int i = 0; i < 8; i++) board[i] = i + 1;
            board[8] = 0;
            int blank = 8, previous = -1;
            for (int n = 0; n < 95; n++)
            {
                var neighbors = new List<int>();
                for (int i = 0; i < 9; i++)
                    if (Adjacent(i, blank, 3) && i != previous) neighbors.Add(i);
                int next = neighbors[random.Next(neighbors.Count)];
                Swap(board, next, blank); previous = blank; blank = next;
            }
            if (TilesSolved()) { Swap(board, 7, 8); }
        }

        private bool TilesSolved()
        {
            for (int i = 0; i < 8; i++) if (board[i] != i + 1) return false;
            return board[8] == 0;
        }

        private void InitializeMemory()
        {
            for (int i = 0; i < 16; i++) board[i] = i % 8;
            Shuffle(board, 16);
        }

        private void NextMath()
        {
            int a = random.Next(2, 21), b = random.Next(2, 21);
            bool subtract = random.Next(2) == 0;
            if (subtract && b > a) { int t = a; a = b; b = t; }
            int answer = subtract ? a - b : a + b;
            prompt = a + (subtract ? " - " : " + ") + b + " = ?";
            correctChoice = random.Next(4);
            for (int i = 0; i < 4; i++) choices[i] = answer;
            for (int i = 0; i < 4; i++)
            {
                if (i == correctChoice) continue;
                int candidate;
                do { candidate = Math.Max(0, answer + random.Next(-9, 10)); }
                while (Array.IndexOf(choices, candidate, 0, i) >= 0 || candidate == answer);
                choices[i] = candidate;
            }
        }

        private void NextWord()
        {
            word = Words[random.Next(Words.Length)];
            scrambled = Scramble(word);
            correctChoice = random.Next(4);
            var used = new HashSet<string> { word };
            for (int i = 0; i < 4; i++)
            {
                if (i == correctChoice) { choices[i] = Array.IndexOf(Words, word); continue; }
                string next;
                do { next = Words[random.Next(Words.Length)]; } while (!used.Add(next));
                choices[i] = Array.IndexOf(Words, next);
            }
        }

        private string Scramble(string original)
        {
            char[] letters = original.ToCharArray();
            for (int attempt = 0; attempt < 8; attempt++)
            {
                for (int i = letters.Length - 1; i > 0; i--)
                {
                    int n = random.Next(i + 1);
                    char t = letters[i]; letters[i] = letters[n]; letters[n] = t;
                }
                string result = new string(letters);
                if (result != original) return result;
            }
            Array.Reverse(letters);
            return new string(letters);
        }

        public string ChoiceText(int index)
        {
            if (index < 0 || index >= 4) return "";
            if (Game == MiniGameId.WordScramble) return Words[choices[index]];
            return choices[index].ToString();
        }

        private int NextDifferent(int count, int previous)
        {
            return (previous + 1 + random.Next(count - 1)) % count;
        }

        private void Shuffle(int[] items, int length)
        {
            for (int i = length - 1; i > 0; i--)
            {
                int n = random.Next(i + 1);
                Swap(items, i, n);
            }
        }

        private static void Swap(int[] items, int a, int b)
        { int t = items[a]; items[a] = items[b]; items[b] = t; }

        private static bool Adjacent(int a, int b, int width)
        {
            return Math.Abs(a - b) == width ||
                (a / width == b / width && Math.Abs(a - b) == 1);
        }

        private void Win() { Phase = MiniGamePhase.Won; }
    }
}
