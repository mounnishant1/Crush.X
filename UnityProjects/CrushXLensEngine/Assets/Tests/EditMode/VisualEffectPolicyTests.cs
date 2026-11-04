using System;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class VisualEffectPolicyTests
    {
        [Test]
        public void BeautyBoundsPreserveNeutralAndRejectNonfiniteValues()
        {
            Assert.AreEqual(0, VisualEffectPolicy.Unit(-1));
            Assert.AreEqual(.4, VisualEffectPolicy.Unit(.4));
            Assert.AreEqual(1, VisualEffectPolicy.Unit(2));
            foreach (double invalid in new[] { double.NaN, double.PositiveInfinity, double.NegativeInfinity })
            {
                Assert.AreEqual(0, VisualEffectPolicy.Unit(invalid));
                Assert.AreEqual(0, VisualEffectPolicy.SmoothingStrength(invalid));
                Assert.AreEqual(0, VisualEffectPolicy.BlurRadius(invalid));
            }
            Assert.AreEqual(0, VisualEffectPolicy.SmoothingStrength(0));
            Assert.AreEqual(.65, VisualEffectPolicy.SmoothingStrength(10));
            Assert.AreEqual(8, VisualEffectPolicy.BlurRadius(100));
            Assert.AreEqual(5, VisualEffectPolicy.TapCount(0));
            Assert.AreEqual(9, VisualEffectPolicy.TapCount(1));
            Assert.AreEqual(13, VisualEffectPolicy.TapCount(2));
            Assert.AreEqual(9, VisualEffectPolicy.TapCount(int.MaxValue));
        }

        [Test]
        public void MasksMustBelongToTheSameCameraAndCorrectedViewport()
        {
            Assert.IsTrue(Valid(7, 1080, 1920));
            Assert.IsFalse(Valid(8, 1080, 1920));
            Assert.IsFalse(Valid(7, 1920, 1080));
            Assert.IsFalse(Valid(7, 540, 960));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(0, 1080, 1920, 0, 1080, 1920, 10, 10, 9));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 0, 1920, 7, 0, 1920, 10, 10, 9));
        }

        [Test]
        public void FrozenFutureAndOutOfOrderMasksNeverRefreshTheGate()
        {
            Assert.IsTrue(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10, 10.2, 9));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10, 10.251, 9));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10, 10, 10));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 9.9, 10, 10));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10.1, 10, 9));
            Assert.IsTrue(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10, 10, double.NegativeInfinity));
            Assert.IsFalse(VisualEffectPolicy.ValidFrame(7, 1080, 1920, 7, 1080, 1920, 10, 10, double.NaN));
        }

        [Test]
        public void FreshnessConfigurationCannotExtendMaskLifetimeBeyondHalfASecond()
        {
            Assert.IsFalse(VisualEffectPolicy.Fresh(10, 10.51, 100));
            Assert.IsTrue(VisualEffectPolicy.Fresh(10, 10.49, 100));
            Assert.IsFalse(VisualEffectPolicy.Fresh(10, 10, 0));
            Assert.IsFalse(VisualEffectPolicy.Fresh(10, 10, double.NaN));
            Assert.IsFalse(VisualEffectPolicy.Fresh(10, double.NaN));
            Assert.IsFalse(VisualEffectPolicy.Fresh(double.PositiveInfinity, 10));
            Assert.IsFalse(VisualEffectPolicy.Fresh(-1, 0));
        }

        [Test]
        public void CameraGradesCycleOnceAndInvalidValuesRemainNeutral()
        {
            var value = CameraColorGrade.None;
            value = VisualEffectPolicy.NextGrade(value);
            Assert.AreEqual(CameraColorGrade.WarmCinema, value);
            value = VisualEffectPolicy.NextGrade(value);
            Assert.AreEqual(CameraColorGrade.Noir, value);
            value = VisualEffectPolicy.NextGrade(value);
            Assert.AreEqual(CameraColorGrade.NeonDuotone, value);
            Assert.AreEqual(CameraColorGrade.None, VisualEffectPolicy.NextGrade(value));
            Assert.AreEqual(CameraColorGrade.None, VisualEffectPolicy.ValidGrade((CameraColorGrade)int.MaxValue));
            Assert.AreEqual(CameraColorGrade.None, VisualEffectPolicy.ValidGrade((CameraColorGrade)(-1)));
        }

        private static bool Valid(int camera, int width, int height) =>
            VisualEffectPolicy.ValidFrame(7, 1080, 1920, camera, width, height, 10, 10, 9);
    }
}
