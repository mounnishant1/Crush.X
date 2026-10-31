using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class FaceTrackingManagerTests
    {
        private GameObject owner;
        private FaceTrackingManager manager;
        [SetUp] public void SetUp() { owner = new GameObject("Tracking policy test"); manager = owner.AddComponent<FaceTrackingManager>(); }
        [TearDown] public void TearDown() { Object.DestroyImmediate(owner); }
        private static FaceSample Sample(double timestamp, ulong id, float x = 0)
        {
            return new FaceSample { Valid = true, Identity = new FaceIdentity(id, 1), Position = new Vector3(x, 0, 0),
                Rotation = Quaternion.identity, Confidence = .9f, Timestamp = timestamp, FaceWidthMeters = .145f };
        }

        [Test] public void SameIdentity_SmoothsPoseAndMeasuredWidth()
        {
            manager.PositionHalfLife = .06f;
            manager.ProcessSample(true, Sample(10, 1), 10);
            FaceSample moved = Sample(10.06, 1, 1); moved.FaceWidthMeters = .18f;
            manager.ProcessSample(true, moved, 10.06);
            Assert.That(manager.Current.Position.x, Is.EqualTo(.5f).Within(.001f));
            Assert.That(manager.Current.FaceWidthMeters, Is.EqualTo(.1625f).Within(.0001f));
        }

        [Test] public void IdentityChangeAndLongGap_SnapWithoutCrossFaceInterpolation()
        {
            manager.ProcessSample(true, Sample(10, 1), 10);
            manager.ProcessSample(true, Sample(10.01, 2, 3), 10.01);
            Assert.AreEqual(3, manager.Current.Position.x);
            manager.ProcessSample(true, Sample(11, 2, 5), 11);
            Assert.AreEqual(5, manager.Current.Position.x);
        }

        [Test] public void RepeatedFramesCannotKeepTrackingAlive()
        {
            manager.ProcessSample(true, Sample(10, 1), 10);
            manager.ProcessSample(true, Sample(10, 1), 10.3);
            Assert.IsFalse(manager.IsTracking);
            Assert.IsFalse(manager.Current.Valid);
        }

        [Test] public void BadPoseAndConfidenceCannotAcquireTracking()
        {
            FaceSample bad = Sample(10, 1); bad.Position.x = float.NaN;
            manager.ProcessSample(true, bad, 10); Assert.IsFalse(manager.IsTracking);
            bad = Sample(10, 1); bad.Rotation = default;
            manager.ProcessSample(true, bad, 10); Assert.IsFalse(manager.IsTracking);
            bad = Sample(10, 1); bad.Confidence = float.PositiveInfinity;
            manager.ProcessSample(true, bad, 10); Assert.IsFalse(manager.IsTracking);
            bad = Sample(10, 1); bad.Rotation = new Quaternion(0, 0, 0, 2);
            manager.ProcessSample(true, bad, 10);
            Assert.AreEqual(Quaternion.identity, manager.Current.Rotation);
        }

        [Test] public void UnavailableAndExpiredExpressionsCannotTriggerLegacyEffects()
        {
            FaceSample sample = Sample(10, 1); sample.MouthOpen = sample.Blink = 1;
            manager.ProcessSample(true, sample, 10);
            Assert.AreEqual(0, manager.Current.MouthOpen);
            sample = Sample(10.01, 1);
            sample.Expressions = new FaceExpressionSample { Available = FaceExpressionChannels.MouthOpen, MouthOpen = 1, Timestamp = 10.01 };
            manager.ProcessSample(true, sample, 10.01);
            Assert.IsTrue(manager.Current.Expressions.TryGet(ExpressionSignal.MouthOpen, out _));
            manager.ProcessSample(false, default, 10.2);
            Assert.IsTrue(manager.IsTracking, "Pose timeout is independent from expression timeout");
            Assert.IsFalse(manager.Current.Expressions.TryGet(ExpressionSignal.MouthOpen, out _));
            Assert.AreEqual(0, manager.Current.MouthOpen);
            manager.ResetTracking(); Assert.IsFalse(manager.IsTracking);
        }
    }
}
