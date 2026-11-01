using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class ShutterGestureTests
    {
        [TestCase(true)]
        [TestCase(false)]
        public void ShortTapTakesExactlyOnePhotoRegardlessOfVideoSupport(bool supportsVideo)
        {
            var gesture = new ShutterGesture();
            Assert.IsTrue(gesture.Begin(10d));
            Assert.AreEqual(ShutterAction.None, gesture.Poll(10.1d, supportsVideo));
            Assert.AreEqual(ShutterAction.Photo, gesture.End(10.2d, false, supportsVideo));
            Assert.AreEqual(ShutterAction.None, gesture.End(10.3d, false, supportsVideo));
            Assert.IsFalse(gesture.IsHeld);
        }

        [Test]
        public void HoldStartsVideoOnceAndReleaseStopsItWithoutTakingAPhoto()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.StartVideo, gesture.Poll(ShutterGesture.HoldSeconds, true));
            Assert.AreEqual(ShutterAction.None, gesture.Poll(1d, true));
            Assert.AreEqual(ShutterAction.None, gesture.Poll(20d, true));
            Assert.AreEqual(ShutterAction.StopVideo, gesture.End(21d, false, true));
            Assert.AreEqual(ShutterAction.None, gesture.End(22d, false, true));
        }

        [Test]
        public void ReleaseCrossingThresholdBetweenUpdatesRequestsVideoAndStopExactlyOnce()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.None, gesture.Poll(.39d, true));
            Assert.AreEqual(ShutterAction.StartVideo | ShutterAction.StopVideo,
                gesture.End(ShutterGesture.HoldSeconds, false, true));
            Assert.AreEqual(ShutterAction.None, gesture.Poll(1d, true));
            Assert.AreEqual(ShutterAction.None, gesture.End(1d, false, true));
        }

        [Test]
        public void ReleaseWhileVideoIsPreparingRequestsStopWithoutPhotoOrAnotherStart()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.StartVideo, gesture.Poll(.4d, true));
            Assert.AreEqual(ShutterAction.StopVideo, gesture.End(.41d, false, true));
        }

        [Test]
        public void UnsupportedHoldReportsUnavailableOnceAndNeverFallsBackToPhoto()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.VideoUnavailable, gesture.Poll(.4d, false));
            Assert.AreEqual(ShutterAction.None, gesture.Poll(.8d, false));
            Assert.AreEqual(ShutterAction.None, gesture.End(1d, false, false));
            Assert.AreEqual(ShutterAction.None, gesture.End(2d, false, false));
        }

        [Test]
        public void UnsupportedHoldReleasedBetweenUpdatesReportsUnavailableWithoutPhoto()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.VideoUnavailable, gesture.End(.4d, false, false));
            Assert.AreEqual(ShutterAction.None, gesture.End(1d, false, false));
        }

        [TestCase(.1d)]
        [TestCase(10d)]
        public void CanceledGestureNeverStartsACaptureEvenWhenThresholdPassed(double endAt)
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(ShutterAction.None, gesture.End(endAt, true, true));
            Assert.AreEqual(ShutterAction.None, gesture.End(endAt, false, true));
        }

        [Test]
        public void CanceledStartedVideoRequestsDiscardOnceWithoutPhoto()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            gesture.Poll(.4d, true);
            Assert.AreEqual(ShutterAction.CancelVideo, gesture.End(1d, true, true));
            Assert.AreEqual(ShutterAction.None, gesture.End(2d, true, true));
        }

        [Test]
        public void CancelAfterUnavailableDoesNotStartOrStopAnEncoder()
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            gesture.Poll(.4d, false);
            Assert.AreEqual(ShutterAction.None, gesture.End(1d, true, false));
        }

        [Test]
        public void DuplicateBeginDoesNotResetHoldAndNextGestureIsIndependent()
        {
            var gesture = new ShutterGesture();
            Assert.IsTrue(gesture.Begin(0d));
            Assert.IsFalse(gesture.Begin(.3d));
            Assert.AreEqual(ShutterAction.StartVideo, gesture.Poll(.4d, true));
            gesture.End(.5d, true, true);
            Assert.IsTrue(gesture.Begin(1d));
            Assert.AreEqual(ShutterAction.Photo, gesture.End(1.1d, false, true));
        }

        [TestCase(.399d, ShutterAction.Photo)]
        [TestCase(.4d, ShutterAction.StartVideo | ShutterAction.StopVideo)]
        [TestCase(.401d, ShutterAction.StartVideo | ShutterAction.StopVideo)]
        public void HoldThresholdIsInclusiveOnRelease(double elapsed, ShutterAction expected)
        {
            var gesture = new ShutterGesture();
            gesture.Begin(0d);
            Assert.AreEqual(expected, gesture.End(elapsed, false, true));
        }
    }
}
