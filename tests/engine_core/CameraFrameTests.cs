using System;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class CameraFrameFreshnessTests
    {
        [Test]
        public void EmptyTextureEventsCannotRefreshWatchdogOrConsumeTimestamp()
        {
            var gate = new CameraFrameFreshness();
            Assert.IsFalse(gate.TryAccept(false, 100, 1));
            Assert.IsTrue(gate.TryAccept(true, 100, 1));
            Assert.IsFalse(gate.TryAccept(false, 200, 2));
            Assert.IsTrue(gate.TryAccept(true, 200, 2));
        }

        [Test]
        public void RepeatedOrRegressingSensorImageIsNotANewFrame()
        {
            var gate = new CameraFrameFreshness();
            Assert.IsTrue(gate.TryAccept(true, 100, 1));
            Assert.IsFalse(gate.TryAccept(true, 100, 2));
            Assert.IsFalse(gate.TryAccept(true, 99, 3));
            Assert.IsFalse(gate.TryAccept(true, null, 4));
            Assert.IsTrue(gate.TryAccept(true, 101, 5));
        }

        [Test]
        public void InvalidReceiptOrSensorTimeDoesNotCorruptAcceptedState()
        {
            var gate = new CameraFrameFreshness();
            Assert.IsFalse(gate.TryAccept(true, -1, 0));
            Assert.IsTrue(gate.TryAccept(true, 0, 0));
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, -1d, 0d })
                Assert.IsFalse(gate.TryAccept(true, 1, invalid));
            Assert.IsTrue(gate.TryAccept(true, 1, 1));
        }

        [Test]
        public void UntimestampedProviderUsesMonotonicReceiptsUntilSensorTimeExists()
        {
            var gate = new CameraFrameFreshness();
            Assert.IsTrue(gate.TryAccept(true, null, 0));
            Assert.IsFalse(gate.TryAccept(true, null, 0));
            Assert.IsTrue(gate.TryAccept(true, null, 1));
            Assert.IsFalse(gate.TryAccept(true, null, .5));
            Assert.IsTrue(gate.TryAccept(true, 10, 2));
            Assert.IsFalse(gate.TryAccept(true, null, 3));
        }

        [Test]
        public void ExplicitSessionResetAllowsProviderClockRestart()
        {
            var gate = new CameraFrameFreshness();
            Assert.IsTrue(gate.TryAccept(true, 1000, 10));
            Assert.IsFalse(gate.TryAccept(true, 1, 11));
            gate.Reset();
            Assert.IsTrue(gate.TryAccept(true, 1, 11));
            Assert.IsFalse(gate.TryAccept(true, 1, 12));
        }

        [Test]
        public void RepeatedImageEventsLeadToBoundedCameraRecovery()
        {
            var gate = new CameraFrameFreshness();
            var policy = new CameraRecoveryPolicy { MaxRecoveries = 0 };
            var observation = new CameraSessionObservation
            { PermissionGranted = true, Foreground = true, HasArRig = true, ArRunning = true, ArFacingMatches = true };
            Assert.AreEqual(CameraSessionAction.StartAr, policy.Tick(observation, 0));
            if (gate.TryAccept(true, 100, 1)) observation.ArFrame++;
            policy.Tick(observation, 1);
            Assert.AreEqual(CameraSessionState.ArPreview, policy.State);
            for (int now = 2; now <= 4; now++)
            {
                if (gate.TryAccept(true, 100, now)) observation.ArFrame++;
                var action = policy.Tick(observation, now);
                Assert.AreEqual(now == 4 ? CameraSessionAction.StopAr : CameraSessionAction.None, action);
            }
            Assert.AreEqual(CameraSessionState.ReleasingAr, policy.State);
        }
    }
}
