using System;
using System.Collections.Generic;

namespace CrushX.LensEngine
{
    public enum SliceMode
    {
        FruitRush, BombDodge, ColorCut, ShapeCut, PrecisionCut, SpeedSlice, ComboMaster
    }

    public sealed class SliceObject
    {
        public int Id { get; internal set; }
        public double X { get; internal set; }
        public double Y { get; internal set; }
        public double Radius { get; internal set; }
        public int ColorIndex { get; internal set; }
        public int ShapeIndex { get; internal set; }
        public bool Bomb { get; internal set; }
        internal double Vx, Vy;
    }

    // Deterministic normalized-coordinate cutting simulation. The UI owns touch routing and
    // paints objects; the core never accesses camera images, face identity or network services.
    public sealed class SliceChallengeCore
    {
        private readonly Random rng;
        private readonly List<SliceObject> objects = new List<SliceObject>();
        private readonly IReadOnlyList<SliceObject> exposedObjects;
        private double lastTime, nextSpawn;
        private int serial, strokeHits;
        private bool strokeActive;

        public SliceMode Mode { get; private set; }
        public int Score { get; private set; }
        public int Sliced { get; private set; }
        public int BombsHit { get; private set; }
        public int Misses { get; private set; }
        public int Lives { get; private set; }
        public int Strokes { get; private set; }
        public int LastCombo { get; private set; }
        public int BestCombo { get; private set; }
        public int RequiredColor { get; private set; }
        public int RequiredShape { get; private set; }
        public bool Won { get; private set; }
        public bool Failed { get; private set; }
        public bool InStroke { get { return strokeActive; } }
        public IReadOnlyList<SliceObject> Objects { get { return exposedObjects; } }
        public int Goal { get { return Mode == SliceMode.SpeedSlice ? 32 : 22; } }

        public SliceChallengeCore(int? seed = null)
        {
            rng = seed.HasValue ? new Random(seed.Value) : new Random();
            exposedObjects = objects.AsReadOnly();
        }

        public void Start(SliceMode mode, double now)
        {
            if (!Finite(now)) throw new ArgumentException("Time must be finite", nameof(now));
            Mode = mode;
            Score = Sliced = BombsHit = Misses = Strokes = LastCombo = BestCombo = 0;
            Lives = 3;
            Won = Failed = false;
            strokeActive = false;
            strokeHits = 0;
            objects.Clear();
            serial = 0;
            lastTime = now;
            nextSpawn = now + .75;
            RequiredColor = rng.Next(4);
            RequiredShape = rng.Next(3);
            Spawn();
            Spawn();
        }

        public void Clear()
        {
            strokeActive = false;
            objects.Clear();
            Won = Failed = false;
        }

        public void ShiftClock(double seconds)
        {
            if (!Finite(seconds) || seconds < 0) return;
            lastTime += seconds;
            nextSpawn += seconds;
        }

        public void Tick(double now)
        {
            if (Won || Failed || !Finite(now) || now <= lastTime) return;
            double dt = Math.Min(.12, now - lastTime);
            lastTime = now;
            for (int i = objects.Count - 1; i >= 0; i--)
            {
                SliceObject target = objects[i];
                target.X += target.Vx * dt;
                target.Y += target.Vy * dt;
                target.Vy += 1.25 * dt;
                if (target.Y < 1.18 && target.X > -.17 && target.X < 1.17) continue;
                objects.RemoveAt(i);
                if (!target.Bomb && IsCorrect(target))
                {
                    Misses++;
                    if (Misses >= 12) { Failed = true; break; }
                }
            }
            if (Failed) return;
            if (now >= nextSpawn)
            {
                int cap = Mode == SliceMode.SpeedSlice ? 10 : 8;
                if (objects.Count < cap) Spawn();
                nextSpawn = now + (Mode == SliceMode.SpeedSlice ? .26 : Mode == SliceMode.ComboMaster ? .38 : .55);
            }
        }

        public bool BeginStroke(double x, double y)
        {
            if (Won || Failed || strokeActive || !Inside(x, y)) return false;
            strokeActive = true;
            strokeHits = 0;
            LastCombo = 0;
            Strokes++;
            return true;
        }

        public int MoveStroke(double x0, double y0, double x1, double y1)
        {
            if (!strokeActive || Won || Failed || !Inside(x0, y0) || !Inside(x1, y1)) return 0;
            double len2 = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0);
            if (len2 < .00025) return 0; // ignore jitter/tap, require real slicing motion
            int hits = 0;
            for (int i = objects.Count - 1; i >= 0; i--)
            {
                SliceObject o = objects[i];
                double dist2 = SegmentDistanceSquared(x0, y0, x1, y1, o.X, o.Y);
                if (dist2 > o.Radius * o.Radius) continue;
                objects.RemoveAt(i); // target cannot score twice in a swipe
                if (o.Bomb)
                {
                    BombsHit++;
                    Lives--;
                    Score = Math.Max(0, Score - 25);
                }
                else if (!IsCorrect(o) ||
                    (Mode == SliceMode.PrecisionCut && dist2 > o.Radius * o.Radius * .16))
                {
                    Lives--;
                    Score = Math.Max(0, Score - 10);
                }
                else
                {
                    int points = Mode == SliceMode.PrecisionCut ? 20 : 10;
                    Score += points;
                    Sliced++;
                    hits++;
                    strokeHits++;
                    if (Mode == SliceMode.ColorCut && Sliced % 5 == 0) RequiredColor = (RequiredColor + 1) % 4;
                    if (Mode == SliceMode.ShapeCut && Sliced % 5 == 0) RequiredShape = (RequiredShape + 1) % 3;
                }
                if (Lives <= 0) { Failed = true; break; }
                if (Sliced >= Goal) { Won = true; break; }
            }
            return hits;
        }

        public void EndStroke()
        {
            if (!strokeActive) return;
            strokeActive = false;
            LastCombo = strokeHits;
            BestCombo = Math.Max(BestCombo, LastCombo);
            if (strokeHits >= 2)
            {
                int bonus = (strokeHits - 1) * 8;
                if (Mode == SliceMode.ComboMaster) bonus *= 2;
                Score += bonus;
            }
            strokeHits = 0;
        }

        public void CancelStroke()
        {
            strokeActive = false;
            strokeHits = 0;
            LastCombo = 0;
        }

        public bool SliceForTest(double x0, double y0, double x1, double y1)
        {
            if (!BeginStroke(x0, y0)) return false;
            int hits = MoveStroke(x0, y0, x1, y1);
            EndStroke();
            return hits > 0;
        }

        public static double SegmentDistanceSquared(double ax, double ay, double bx,
            double by, double px, double py)
        {
            double dx = bx - ax, dy = by - ay;
            double len2 = dx * dx + dy * dy;
            double t = len2 < 1e-12 ? 0 : Math.Max(0, Math.Min(1,
                ((px - ax) * dx + (py - ay) * dy) / len2));
            double ex = ax + t * dx - px, ey = ay + t * dy - py;
            return ex * ex + ey * ey;
        }

        private bool IsCorrect(SliceObject target)
        {
            if (Mode == SliceMode.ColorCut) return target.ColorIndex == RequiredColor;
            if (Mode == SliceMode.ShapeCut) return target.ShapeIndex == RequiredShape;
            return true;
        }

        private static bool Inside(double x, double y)
        {
            return Finite(x) && Finite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
        }

        private static bool Finite(double n) { return !double.IsNaN(n) && !double.IsInfinity(n); }

        private void Spawn()
        {
            bool bomb = rng.NextDouble() <
                (Mode == SliceMode.BombDodge ? .38 : Mode == SliceMode.SpeedSlice ? .14 : .13);
            objects.Add(new SliceObject
            {
                Id = ++serial,
                X = .12 + rng.NextDouble() * .76,
                Y = .96 + rng.NextDouble() * .1,
                Radius = .055 + rng.NextDouble() * .028,
                ColorIndex = rng.Next(4),
                ShapeIndex = rng.Next(3),
                Bomb = bomb,
                Vx = (rng.NextDouble() - .5) * .10,
                Vy = -.78 - rng.NextDouble() * .3
            });
        }
    }
}
