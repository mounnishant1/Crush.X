using System;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensSwipePolicyHostTests
    {
        [TestCase(-65d, 0d, 320d, 1)]
        [TestCase(65d, 0d, 320d, -1)]
        [TestCase(-100000d, 0d, 320d, 1)]
        [TestCase(100000d, 0d, 320d, -1)]
        [TestCase(-64d, 0d, 320d, 0)]
        [TestCase(-120d, 0d, 1000d, 1)]
        [TestCase(-119d, 0d, 1000d, 0)]
        [TestCase(-100d, 71d, 320d, 0)]
        [TestCase(-100d, 70d, 320d, 1)]
        [TestCase(0d, 100000d, 320d, 0)]
        public void OneReleaseMovesAtMostOneLens(double dx, double dy, double width, int expected)
            => Assert.AreEqual(expected, LensSwipePolicy.Step(dx, dy, width));

        [Test]
        public void InvalidInputsNeverCreateSwipe()
        {
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity })
            {
                Assert.AreEqual(0, LensSwipePolicy.Step(invalid, 0, 320));
                Assert.AreEqual(0, LensSwipePolicy.Step(-100, invalid, 320));
                Assert.AreEqual(0, LensSwipePolicy.Step(-100, 0, invalid));
                Assert.IsFalse(LensSwipePolicy.IsTap(invalid, 0, 1));
                Assert.IsFalse(LensSwipePolicy.IsTap(0, invalid, 1));
                Assert.IsFalse(LensSwipePolicy.IsTap(0, 0, invalid));
            }
            Assert.AreEqual(0, LensSwipePolicy.Step(-100, 0, 0));
            Assert.AreEqual(0, LensSwipePolicy.Step(-100, 0, -320));
        }

        [Test]
        public void TapRadiusScalesWithDisplayAndRejectsInvalidScale()
        {
            Assert.IsTrue(LensSwipePolicy.IsTap(18, 0, 1));
            Assert.IsFalse(LensSwipePolicy.IsTap(18.01, 0, 1));
            Assert.IsTrue(LensSwipePolicy.IsTap(36, 0, 2));
            Assert.IsFalse(LensSwipePolicy.IsTap(36.01, 0, 2));
            Assert.IsFalse(LensSwipePolicy.IsTap(18, 18, 1));
            Assert.IsFalse(LensSwipePolicy.IsTap(0, 0, 0));
            Assert.IsFalse(LensSwipePolicy.IsTap(0, 0, -1));
        }
    }

    public sealed class CameraRecoveryHostTests
    {
        private static CameraSessionObservation Ready(bool ar = true) => new CameraSessionObservation
        { PermissionGranted = true, Foreground = true, HasArRig = ar, ArFacingMatches = true };

        [Test]
        public void PermissionAndForegroundGateOwnershipAndResume()
        {
            var policy = new CameraRecoveryPolicy();
            var observation = Ready();
            observation.PermissionGranted = false;
            Assert.AreEqual(CameraSessionAction.StopAll, policy.Tick(observation, 0));
            Assert.AreEqual(CameraSessionState.WaitingForPermission, policy.State);
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 1));
            observation.PermissionGranted = true;
            Assert.AreEqual(CameraSessionAction.StartAr, policy.Tick(observation, 2));
            observation.Foreground = false;
            Assert.AreEqual(CameraSessionAction.StopAll, policy.Tick(observation, 3));
            Assert.AreEqual(CameraSessionState.Suspended, policy.State);
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 4));
            observation.Foreground = true;
            Assert.AreEqual(CameraSessionAction.StartAr, policy.Tick(observation, 5));
        }

        [Test]
        public void ActualFacingAndNewFrameAreRequiredForArPreview()
        {
            var policy = new CameraRecoveryPolicy();
            var observation = Ready();
            policy.Tick(observation, 0);
            observation.ArRunning = true;
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 1));
            Assert.AreEqual(CameraSessionState.StartingAr, policy.State);
            observation.ArFrame = 1;
            observation.ArFacingMatches = false;
            policy.Tick(observation, 2);
            Assert.AreEqual(CameraSessionState.StartingAr, policy.State);
            observation.ArFacingMatches = true;
            policy.Tick(observation, 3);
            Assert.AreEqual(CameraSessionState.ArPreview, policy.State);
        }

        [Test]
        public void FrozenPreviewGetsOneRecoveryThenReleasesBeforeNative()
        {
            var policy = new CameraRecoveryPolicy();
            var observation = Ready();
            Assert.AreEqual(CameraSessionAction.StartAr, policy.Tick(observation, 0));
            observation.ArRunning = true;
            observation.ArFrame = 1;
            policy.Tick(observation, 1);
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 3.99));
            Assert.AreEqual(CameraSessionAction.RestartAr, policy.Tick(observation, 4));
            Assert.AreEqual(CameraSessionAction.StopAr, policy.Tick(observation, 12));
            Assert.AreEqual(CameraSessionState.ReleasingAr, policy.State);
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 13));
            observation.ArRunning = false;
            Assert.AreEqual(CameraSessionAction.StartNative, policy.Tick(observation, 14));
            Assert.AreEqual(CameraSessionState.StartingNative, policy.State);
        }

        [Test]
        public void FallbackNeverOpensNativeWhileArStillOwnsCamera()
        {
            var policy = new CameraRecoveryPolicy { MaxRecoveries = 0 };
            var observation = Ready();
            observation.ArRunning = true;
            policy.Tick(observation, 0);
            Assert.AreEqual(CameraSessionAction.StopAr, policy.Tick(observation, 8));
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 10.99));
            Assert.AreEqual(CameraSessionAction.StopAll, policy.Tick(observation, 11));
            Assert.AreEqual(CameraSessionState.Unavailable, policy.State);
            Assert.AreEqual(CameraSessionAction.None, policy.Tick(observation, 20));
        }

        [Test]
        public void MissingArRigUsesNativeAndBoundsRecovery()
        {
            var policy = new CameraRecoveryPolicy();
            var observation = Ready(false);
            Assert.AreEqual(CameraSessionAction.StopAr, policy.Tick(observation, 0));
            Assert.AreEqual(CameraSessionAction.StartNative, policy.Tick(observation, 1));
            observation.NativePlaying = true;
            observation.NativeFrame = 1;
            policy.Tick(observation, 2);
            Assert.AreEqual(CameraSessionState.NativePreview, policy.State);
            Assert.AreEqual(CameraSessionAction.RestartNative, policy.Tick(observation, 5));
            Assert.AreEqual(CameraSessionAction.StopAll, policy.Tick(observation, 13));
            Assert.AreEqual(CameraSessionState.Unavailable, policy.State);
            policy.Retry(true);
            observation.HasArRig = true;
            Assert.AreEqual(CameraSessionAction.StopAr, policy.Tick(observation, 14));
            Assert.AreEqual(CameraSessionAction.StartNative, policy.Tick(observation, 15));
        }

        [Test]
        public void InvalidTimeoutConfigurationUsesBoundedDefaults()
        {
            var policy = new CameraRecoveryPolicy { StartupTimeout = double.NaN, ReleaseTimeout = -1, MaxRecoveries = -1 };
            var observation = Ready();
            observation.ArRunning = true;
            policy.Tick(observation, 0);
            Assert.AreEqual(CameraSessionAction.StopAr, policy.Tick(observation, 8));
            Assert.AreEqual(CameraSessionAction.StopAll, policy.Tick(observation, 11));
            Assert.Throws<ArgumentOutOfRangeException>(() => policy.Tick(observation, double.NaN));
            Assert.Throws<ArgumentOutOfRangeException>(() => policy.Tick(observation, double.PositiveInfinity));
            Assert.Throws<ArgumentOutOfRangeException>(() => policy.Tick(observation, -1));
        }
    }

    public sealed class CameraPreviewTransformHostTests
    {
        [TestCase(0, .2d, .3d)]
        [TestCase(90, .7d, .2d)]
        [TestCase(180, .8d, .7d)]
        [TestCase(270, .3d, .8d)]
        [TestCase(-90, .3d, .8d)]
        [TestCase(450, .7d, .2d)]
        public void QuarterTurnsHaveKnownAsymmetricPixelLocations(int rotation, double expectedU, double expectedV)
        {
            CameraPreviewTransform.SourceUv(.2, .3, 100, 100, 100, 100, rotation, false, false, out double u, out double v);
            Assert.AreEqual(expectedU, u, 1e-12);
            Assert.AreEqual(expectedV, v, 1e-12);
        }

        [TestCase(0, .8d, .7d)]
        [TestCase(90, .7d, .2d)]
        [TestCase(180, .2d, .3d)]
        [TestCase(270, .3d, .8d)]
        public void SensorVerticalFlipAndUprightSelfieMirrorComposeInCorrectOrder(int rotation, double expectedU, double expectedV)
        {
            CameraPreviewTransform.SourceUv(.2, .3, 100, 100, 100, 100, rotation, true, true, out double u, out double v);
            Assert.AreEqual(expectedU, u, 1e-12);
            Assert.AreEqual(expectedV, v, 1e-12);
        }

        [Test]
        public void PortraitAspectFillCropsInsteadOfStretching()
        {
            CameraPreviewTransform.SourceUv(0, 0, 1920, 1080, 1080, 1920, 0, false, false, out double u, out double v);
            Assert.AreEqual(.341796875, u, 1e-12);
            Assert.AreEqual(0, v, 1e-12);
            CameraPreviewTransform.SourceUv(0, 0, 1920, 1080, 1080, 1920, 90, false, false, out u, out v);
            Assert.AreEqual(1, u, 1e-12);
            Assert.AreEqual(0, v, 1e-12);
        }

        [Test]
        public void InvalidDimensionsOrNonQuarterTurnFail()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => CameraPreviewTransform.SourceUv(0, 0, 0, 100, 100, 100, 0, false, false, out _, out _));
            Assert.Throws<ArgumentException>(() => CameraPreviewTransform.SourceUv(0, 0, 100, 100, 100, 100, 45, false, false, out _, out _));
        }
    }
}
