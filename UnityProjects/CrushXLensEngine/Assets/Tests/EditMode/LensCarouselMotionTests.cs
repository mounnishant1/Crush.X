using System;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensCarouselMotionTests
    {
        [Test]
        public void Drag_FollowsTotalFingerDisplacementWithoutSelectingOrAccumulatingIt()
        {
            var motion = Create(12, 4);
            motion.BeginDrag();
            motion.Drag(-.4);
            Assert.That(motion.Position, Is.EqualTo(4.4).Within(1e-9));
            motion.Drag(-1.25);
            Assert.That(motion.Position, Is.EqualTo(5.25).Within(1e-9));
            Assert.AreEqual(4, motion.Target);
            motion.Tick(.5);
            Assert.That(motion.Position, Is.EqualTo(5.25).Within(1e-9));
            Assert.IsTrue(motion.IsDragging);
        }

        [Test]
        public void Release_SelectsNearestCellOnceAndStartsSpringAtTheFingerPosition()
        {
            var motion = Create(12, 4);
            motion.BeginDrag();
            motion.Drag(-1.65);
            double releasedPosition = motion.Position;
            Assert.AreEqual(6, motion.EndDrag());
            Assert.AreEqual(-1, motion.EndDrag());
            Assert.AreEqual(releasedPosition, motion.Position);
            Assert.AreEqual(6, motion.Target);
            motion.Tick(.016);
            Assert.That(motion.Position, Is.GreaterThan(releasedPosition).And.LessThan(6));
            motion.Tick(1);
            Assert.AreEqual(6, motion.Position);
            Assert.IsTrue(motion.IsSettled);
        }

        [Test]
        public void Cancel_ForFocusResizeOrMultitouchDoesNotCommitAndSpringsBack()
        {
            var motion = Create(12, 3);
            motion.BeginDrag();
            motion.Drag(-1.8);
            motion.CancelDrag();
            Assert.AreEqual(-1, motion.EndDrag());
            Assert.That(motion.Position, Is.EqualTo(4.8).Within(1e-9));
            Assert.AreEqual(3, motion.Target);
            motion.Tick(.016);
            Assert.That(motion.Position, Is.GreaterThan(3).And.LessThan(4.8));
            motion.Tick(1);
            Assert.AreEqual(3, motion.Position);
        }

        [Test]
        public void ExternalSelection_CancelsAnInFlightDragWithoutJumpingItsPosition()
        {
            var motion = Create(12, 3);
            motion.BeginDrag();
            motion.Drag(-.4);
            double position = motion.Position;
            motion.SelectIndex(6);
            Assert.AreEqual(position, motion.Position);
            Assert.IsFalse(motion.IsDragging);
            Assert.AreEqual(-1, motion.EndDrag());
            Assert.AreEqual(6, motion.Target);
            motion.Tick(1);
            Assert.AreEqual(6, motion.Position);
        }

        [Test]
        public void Selection_SpringsAcrossTheWrapWithoutRecenteringTheCardsOnRelease()
        {
            var motion = Create(6, 5);
            motion.BeginDrag();
            motion.Drag(-.75);
            Assert.AreEqual(0, motion.EndDrag());
            Assert.AreEqual(5.75, motion.Position);
            Assert.AreEqual(6, motion.Target);
            motion.Tick(.016);
            Assert.That(motion.Position, Is.GreaterThan(5.75).And.LessThan(6));
            motion.Tick(1);
            Assert.AreEqual(0, motion.Position); // A whole-turn rebase preserves all wrapped image positions.
        }

        [Test]
        public void RepeatedExplicitSteps_UseThePendingTargetAndKeepTheCurrentPosition()
        {
            var motion = Create(6, 5);
            motion.SelectIndex(0, 1);
            motion.Tick(.016);
            double position = motion.Position;
            motion.SelectIndex(1, 1);
            Assert.AreEqual(position, motion.Position);
            Assert.AreEqual(7, motion.Target);
            motion.SelectIndex(0, -1);
            Assert.AreEqual(6, motion.Target);
        }

        [Test]
        public void TappingAClippedWrapCopy_AnimatesFromTheSideThatWasTapped()
        {
            var rightCopy = Create(5, 0);
            var leftCopy = Create(5, 0);
            rightCopy.SelectIndex(3, 1);
            leftCopy.SelectIndex(3, -1);
            Assert.AreEqual(3, rightCopy.Target);
            Assert.AreEqual(-2, leftCopy.Target);
            Assert.AreEqual(0, rightCopy.Position);
            Assert.AreEqual(0, leftCopy.Position);
        }

        [Test]
        public void Spring_IsIndependentOfFrameRateForTheSameUnscaledElapsedTime()
        {
            var oneFrame = Create(12, 2);
            var manyFrames = Create(12, 2);
            oneFrame.SelectIndex(4);
            manyFrames.SelectIndex(4);
            oneFrame.Tick(.12);
            for (int frame = 0; frame < 12; frame++) manyFrames.Tick(.01);
            Assert.That(oneFrame.Position, Is.EqualTo(manyFrames.Position).Within(1e-10));
        }

        [TestCase(0, -1)]
        [TestCase(1, 0)]
        [TestCase(2, 0)]
        [TestCase(4, 0)]
        public void SmallResultSets_HaveFiniteEdgesAndDoNotRepeat(int count, int expectedRelease)
        {
            var motion = Create(count, -1);
            Assert.IsFalse(motion.Loops);
            motion.BeginDrag();
            motion.Drag(100);
            Assert.That(motion.Position, Is.GreaterThanOrEqualTo(-.3));
            Assert.AreEqual(expectedRelease, motion.EndDrag());
            motion.Tick(1);
            Assert.AreEqual(0, motion.Position);
        }

        [Test]
        public void TwoResults_ResistTheFarEdgeAndStillAllowExplicitWrappedNavigation()
        {
            var motion = Create(2, 1);
            motion.BeginDrag();
            motion.Drag(-100);
            Assert.That(motion.Position, Is.EqualTo(1.3).Within(1e-9));
            Assert.AreEqual(1, motion.EndDrag());
            motion.SelectIndex(0, 1);
            Assert.That(motion.Position, Is.EqualTo(1.3).Within(1e-9));
            Assert.AreEqual(0, motion.Target);
            motion.Tick(1);
            Assert.AreEqual(0, motion.Position);
        }

        [Test]
        public void Refresh_WhenTheActiveLensIsMissingStartsAtTheFirstResultAndCancelsOldDrag()
        {
            var motion = Create(12, 9);
            motion.BeginDrag();
            motion.Drag(-2);
            motion.Reset(6, -1);
            Assert.AreEqual(0, motion.Position);
            Assert.AreEqual(0, motion.Target);
            Assert.AreEqual(-1, motion.EndDrag());
            motion.SelectIndex(-1);
            motion.SelectIndex(6);
            Assert.AreEqual(0, motion.Target);
        }

        [TestCase(-1, 6, 5)]
        [TestCase(6, 6, 0)]
        [TestCase(-19, 6, 5)]
        [TestCase(10000000000d, 6, 4)]
        [TestCase(0, 0, -1)]
        public void WrappedIndex_HandlesEitherDirectionAndLongSessions(double coordinate, int count, int expected)
        { Assert.AreEqual(expected, LensCarouselMotion.WrappedIndex(coordinate, count)); }

        [Test]
        public void InvalidTimeOrDragValues_CannotCorruptTheAnimation()
        {
            var motion = Create(6, 2);
            motion.BeginDrag();
            motion.Drag(double.NaN);
            motion.Drag(double.PositiveInfinity);
            Assert.AreEqual(2, motion.Position);
            motion.CancelDrag();
            motion.SelectIndex(3);
            motion.Tick(double.NaN);
            motion.Tick(double.PositiveInfinity);
            motion.Tick(-1);
            Assert.AreEqual(2, motion.Position);
            Assert.AreEqual(3, motion.Target);
        }

        [Test]
        public void QuickFlick_ProjectsInFingerDirectionThenSmoothlySettles()
        {
            var motion = Create(12, 4);
            motion.BeginDrag();
            motion.Drag(-.35);
            Assert.AreEqual(6, motion.EndDrag(10));
            Assert.That(motion.Position, Is.EqualTo(4.35).Within(1e-9));
            motion.Tick(.016);
            Assert.That(motion.Position, Is.GreaterThan(4.35).And.LessThan(6));
            motion.Tick(1);
            Assert.AreEqual(6, motion.Position);
        }

        [Test]
        public void Flick_IsBoundedAndCannotProduceInvalidTargets()
        {
            var forward = Create(6, 0);
            forward.BeginDrag();
            forward.Drag(-.1);
            Assert.AreEqual(2, forward.EndDrag(double.MaxValue));
            var backward = Create(3, 1);
            backward.BeginDrag();
            backward.Drag(.1);
            Assert.AreEqual(0, backward.EndDrag(-10000));
            var invalid = Create(6, 1);
            invalid.BeginDrag();
            Assert.AreEqual(1, invalid.EndDrag(double.NaN));
        }

        private static LensCarouselMotion Create(int count, int selected)
        {
            var motion = new LensCarouselMotion();
            motion.Reset(count, selected);
            return motion;
        }
    }
}
