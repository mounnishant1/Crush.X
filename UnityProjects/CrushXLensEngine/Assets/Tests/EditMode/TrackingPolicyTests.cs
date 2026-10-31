using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class TrackingSampleGateHostTests
    {
        private static readonly FaceIdentity First = new FaceIdentity(1, 2);
        private static readonly FaceIdentity Other = new FaceIdentity(1, 3);

        [Test]
        public void RepeatedInferenceCannotExtendTrackingLifetime()
        {
            var gate = new TrackingSampleGate();
            Assert.IsTrue(gate.TryAccept(First, 10, 10, .9f, .35, .4f, true, out bool reset));
            Assert.IsTrue(reset);
            Assert.IsFalse(gate.TryAccept(First, 10, 10.2, .9f, .35, .4f, true, out reset));
            Assert.AreEqual(TrackingSampleRejection.RepeatedOrOutOfOrder, gate.LastRejection);
            Assert.AreEqual(10, gate.Timestamp);
            Assert.IsTrue(gate.IsTrackingAt(10.34, .35));
            Assert.IsFalse(gate.IsTrackingAt(10.36, .35));
        }

        [Test]
        public void FreshSampleInterpolatesButIdentityChangeAndReacquisitionSnap()
        {
            var gate = new TrackingSampleGate();
            gate.TryAccept(First, 1, 1, 1, .35, .4f, true, out _);
            Assert.IsTrue(gate.TryAccept(First, 1.1, 1.1, 1, .35, .4f, true, out bool reset));
            Assert.IsFalse(reset);
            Assert.IsTrue(gate.TryAccept(Other, 1.1, 1.1, 1, .35, .4f, true, out reset));
            Assert.IsTrue(reset, "A new face at the same inference frame must not blend from another face");
            Assert.IsTrue(gate.TryAccept(Other, 2, 2, 1, .35, .4f, true, out reset));
            Assert.IsTrue(reset, "A face found after the grace window must not interpolate from its old pose");
            gate.Reset();
            Assert.IsFalse(gate.HasSample);
            Assert.AreEqual(default(FaceIdentity), gate.Identity);
            Assert.IsFalse(gate.IsTrackingAt(2, .35));
        }

        [Test]
        public void OutOfOrderLowConfidenceAndStaleSamplesNeverReplaceAcceptedIdentity()
        {
            var gate = new TrackingSampleGate();
            gate.TryAccept(First, 3, 3, 1, .35, .4f, true, out _);
            Assert.IsFalse(gate.TryAccept(First, 2.9, 3.1, 1, .35, .4f, true, out _));
            Assert.AreEqual(TrackingSampleRejection.RepeatedOrOutOfOrder, gate.LastRejection);
            Assert.IsFalse(gate.TryAccept(Other, 3.1, 3.1, .39f, .35, .4f, true, out _));
            Assert.AreEqual(TrackingSampleRejection.LowConfidence, gate.LastRejection);
            Assert.IsFalse(gate.TryAccept(Other, 3.2, 4, 1, .35, .4f, true, out _));
            Assert.AreEqual(TrackingSampleRejection.Stale, gate.LastRejection);
            Assert.AreEqual(First, gate.Identity);
            Assert.AreEqual(3, gate.Timestamp);
        }

        [Test]
        public void FutureTimestampAllowanceIsBounded()
        {
            var gate = new TrackingSampleGate();
            Assert.IsTrue(gate.TryAccept(First, 4.01, 4, 1, .35, .4f, true, out _));
            Assert.IsTrue(gate.IsTrackingAt(4, .35));
            Assert.IsFalse(gate.TryAccept(First, 4.1, 4, 1, .35, .4f, true, out _));
            Assert.AreEqual(TrackingSampleRejection.Future, gate.LastRejection);
        }

        [Test]
        public void InvalidPoseTimestampConfidenceAndConfigurationAreRejected()
        {
            var gate = new TrackingSampleGate();
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity, -1 })
            {
                Assert.IsFalse(gate.TryAccept(First, invalid, 3, 1, .35, .4f, true, out _));
                Assert.IsFalse(gate.TryAccept(First, 3, invalid, 1, .35, .4f, true, out _));
                Assert.IsFalse(gate.TryAccept(First, 3, 3, 1, invalid, .4f, true, out _));
            }
            foreach (float invalid in new[] { float.NaN, float.PositiveInfinity, -1f, 1.1f })
            {
                Assert.IsFalse(gate.TryAccept(First, 3, 3, invalid, .35, .4f, true, out _));
                Assert.IsFalse(gate.TryAccept(First, 3, 3, 1, .35, invalid, true, out _));
            }
            Assert.IsFalse(gate.TryAccept(First, 3, 3, 1, 0, .4f, true, out _));
            Assert.IsFalse(gate.TryAccept(First, 3, 3, 1, .35, .4f, false, out _));
            Assert.IsFalse(gate.HasSample);
        }

        [Test]
        public void HalfLifeWeightIsFrameRateAwareAndHandlesBadConfiguration()
        {
            Assert.AreEqual(.5f, TrackingSampleGate.HalfLifeWeight(.05f, .05f), 1e-6);
            float twoSteps = 1 - (1 - TrackingSampleGate.HalfLifeWeight(.025f, .05f)) *
                (1 - TrackingSampleGate.HalfLifeWeight(.025f, .05f));
            Assert.AreEqual(.5f, twoSteps, 1e-6);
            Assert.AreEqual(0, TrackingSampleGate.HalfLifeWeight(0, .05f));
            Assert.AreEqual(0, TrackingSampleGate.HalfLifeWeight(float.NaN, .05f));
            Assert.AreEqual(1, TrackingSampleGate.HalfLifeWeight(.01f, 0));
            Assert.AreEqual(1, TrackingSampleGate.HalfLifeWeight(.01f, float.NaN));
            Assert.AreEqual(TrackingSampleGate.HalfLifeWeight(.1f, .05f), TrackingSampleGate.HalfLifeWeight(100, .05f));
        }
    }

}
