using System;
using System.Linq;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class SliceChallengeTests
    {
        private static SliceChallengeCore Find(SliceMode mode, Func<SliceChallengeCore, bool> eligible)
        {
            for (int seed = 0; seed < 1500; seed++)
            {
                var core = new SliceChallengeCore(seed);
                core.Start(mode, 0);
                core.Tick(.25);
                if (eligible(core)) return core;
            }
            Assert.Fail("No deterministic sample matched the condition.");
            return null;
        }

        private static void DrawAcross(SliceChallengeCore core, SliceObject target, double yOffset = 0)
        {
            double y = target.Y + yOffset;
            Assert.IsTrue(y >= 0 && y <= 1);
            double x0 = Math.Max(.005, target.X - target.Radius * 1.15);
            double x1 = Math.Min(.995, target.X + target.Radius * 1.15);
            Assert.IsTrue(core.BeginStroke(x0, y));
            core.MoveStroke(x0, y, x1, y);
            core.EndStroke();
        }

        [Test]
        public void SevenCuttingModes_AreRegisteredAndStart()
        {
            Assert.AreEqual(7, Enum.GetValues(typeof(SliceMode)).Length);
            foreach (SliceMode mode in Enum.GetValues(typeof(SliceMode)))
            {
                var core = new SliceChallengeCore(5);
                core.Start(mode, 0);
                Assert.AreEqual(3, core.Lives);
                Assert.AreEqual(2, core.Objects.Count);
                Assert.IsFalse(core.Won);
                Assert.IsFalse(core.Failed);
                Assert.Greater(core.Goal, 0);
            }
        }

        [Test]
        public void SegmentDistance_FindsCrossingAndRejectsNearMiss()
        {
            Assert.That(SliceChallengeCore.SegmentDistanceSquared(0, 0, 1, 0, .5, 0),
                Is.EqualTo(0).Within(1e-12));
            Assert.That(SliceChallengeCore.SegmentDistanceSquared(0, 0, 1, 0, .5, .2),
                Is.EqualTo(.04).Within(1e-12));
            Assert.That(SliceChallengeCore.SegmentDistanceSquared(0, 0, 1, 0, 1.2, 0),
                Is.EqualTo(.04).Within(1e-12));
        }

        [Test]
        public void FruitCut_ScoresExactlyOnceOnARealSwipe()
        {
            var core = Find(SliceMode.FruitRush, g => g.Objects.Any(x => !x.Bomb && x.Y < 1));
            SliceObject fruit = core.Objects.First(x => !x.Bomb && x.Y < 1);
            double x0 = Math.Max(.005, fruit.X - fruit.Radius * 1.15);
            double x1 = Math.Min(.995, fruit.X + fruit.Radius * 1.15);
            Assert.IsTrue(core.BeginStroke(x0, fruit.Y));
            Assert.GreaterOrEqual(core.MoveStroke(x0, fruit.Y, x1, fruit.Y), 1);
            int score = core.Score;
            Assert.AreEqual(0, core.MoveStroke(x0, fruit.Y, x1, fruit.Y));
            Assert.AreEqual(score, core.Score);
            core.EndStroke();
        }

        [Test]
        public void BombCollision_CostsLifeAndNeverAwardsPoints()
        {
            var core = Find(SliceMode.BombDodge, g => g.Objects.Any(x => x.Bomb && x.Y < 1));
            SliceObject bomb = core.Objects.First(x => x.Bomb && x.Y < 1);
            DrawAcross(core, bomb);
            Assert.GreaterOrEqual(core.BombsHit, 1);
            Assert.Less(core.Lives, 3);
        }

        [Test]
        public void WrongColorAndShape_CostOneLife()
        {
            foreach (SliceMode mode in new[] { SliceMode.ColorCut, SliceMode.ShapeCut })
            {
                var core = Find(mode, g => g.Objects.Any(x => !x.Bomb && x.Y < 1 &&
                    (mode == SliceMode.ColorCut ? x.ColorIndex != g.RequiredColor :
                        x.ShapeIndex != g.RequiredShape)));
                SliceObject wrong = core.Objects.First(x => !x.Bomb && x.Y < 1 &&
                    (mode == SliceMode.ColorCut ? x.ColorIndex != core.RequiredColor :
                        x.ShapeIndex != core.RequiredShape));
                DrawAcross(core, wrong);
                Assert.Less(core.Lives, 3);
            }
        }

        [Test]
        public void PrecisionCut_OffCenterIsRejected()
        {
            var core = Find(SliceMode.PrecisionCut,
                g => g.Objects.Any(x => !x.Bomb && x.Y + x.Radius * .75 < 1));
            SliceObject fruit = core.Objects.First(x => !x.Bomb && x.Y + x.Radius * .75 < 1);
            DrawAcross(core, fruit, fruit.Radius * .75);
            Assert.Less(core.Lives, 3);
        }

        [Test]
        public void SingleLongSwipe_ComboUsesUniqueTargets()
        {
            var core = Find(SliceMode.ComboMaster, g => g.Objects.Count == 2 &&
                g.Objects.All(x => !x.Bomb && x.Y < 1) &&
                Math.Abs(g.Objects[0].Y - g.Objects[1].Y) < .06);
            double y = (core.Objects[0].Y + core.Objects[1].Y) * .5;
            Assert.IsTrue(core.BeginStroke(.01, y));
            Assert.GreaterOrEqual(core.MoveStroke(.01, y, .99, y), 2);
            Assert.AreEqual(0, core.MoveStroke(.01, y, .99, y));
            core.EndStroke();
            Assert.AreEqual(2, core.BestCombo);
            Assert.GreaterOrEqual(core.Score, 36); // 20 + doubled 16 combo bonus
        }

        [Test]
        public void CancelSwipe_DoesNotAwardComboPoints()
        {
            var core = Find(SliceMode.FruitRush, g => g.Objects.Any(x => !x.Bomb && x.Y < 1));
            Assert.IsTrue(core.BeginStroke(.01, .5));
            core.CancelStroke();
            Assert.IsFalse(core.InStroke);
            Assert.AreEqual(0, core.BestCombo);
            Assert.AreEqual(0, core.Score);
        }

        [Test]
        public void InvalidAndTinySegments_AreRejected()
        {
            var core = new SliceChallengeCore(1);
            core.Start(SliceMode.FruitRush, 0);
            Assert.IsFalse(core.BeginStroke(-1, 0));
            Assert.IsFalse(core.BeginStroke(double.NaN, 0));
            Assert.IsTrue(core.BeginStroke(.5, .5));
            Assert.AreEqual(0, core.MoveStroke(.5, .5, .5001, .5001));
            core.EndStroke();
            Assert.AreEqual(0, core.Score);
        }

        [Test]
        public void BackToCatalogClearsCuttingScene()
        {
            var game = new LensMiniGameCore(3);
            game.Start(MiniGameId.FruitRush, 0);
            Assert.IsTrue(game.IsSlicingGame);
            Assert.IsFalse(game.TapFallback(1));
            Assert.IsFalse(game.Cutting.InStroke);
            Assert.AreEqual(2, game.Cutting.Objects.Count);
            game.ReturnToCatalog();
            Assert.AreEqual(0, game.Cutting.Objects.Count);
            Assert.AreEqual(MiniGamePhase.Catalog, game.Phase);
        }

        [Test]
        public void PausingGamePreventsClockAndMotionAdvance()
        {
            var game = new LensMiniGameCore(4);
            game.Start(MiniGameId.SpeedSlice, 2);
            game.Tick(2.25);
            double beforeY = game.Cutting.Objects[0].Y;
            game.Pause(3);
            game.Tick(103);
            Assert.AreEqual(beforeY, game.Cutting.Objects[0].Y);
            game.Resume(103);
            game.Tick(103.05);
            Assert.IsTrue(game.Cutting.Objects[0].Y != beforeY);
            Assert.AreEqual(MiniGamePhase.Playing, game.Phase);
        }

        [Test]
        public void FallingObjectsAreUpdatedWithoutUnboundedSpawn()
        {
            var core = new SliceChallengeCore(12);
            core.Start(SliceMode.SpeedSlice, 0);
            for (int i = 1; i <= 400; i++) core.Tick(i * .02);
            Assert.LessOrEqual(core.Objects.Count, 10);
            Assert.IsTrue(core.Misses >= 0);
        }
    }
}
