using NUnit.Framework;
using CrushX.LensEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class FaceMaskFitTests
    {
        [Test]
        public void CanonicalFace_PlacesMaskFrontSlightlyInFrontOfNose()
        {
            Assert.IsTrue(FaceMaskFit.TryTarget(-.0725f, .0725f, -.092f, -.0816f,
                out float scale, out float offset));
            Assert.That(scale, Is.EqualTo(1f).Within(.0001f));
            Assert.That(offset, Is.EqualTo(-.0154f).Within(.0001f));
        }

        [Test]
        public void FaceSizeChanges_AreClampedToAvoidExtremeScaling()
        {
            Assert.IsTrue(FaceMaskFit.TryTarget(-.04f, .04f, -.09f, -.08f,
                out float small, out _));
            Assert.AreEqual(.8f, small);
            Assert.IsTrue(FaceMaskFit.TryTarget(-.125f, .125f, -.1f, -.08f,
                out float large, out _));
            Assert.AreEqual(1.25f, large);
        }

        [Test]
        public void BadOrUninitializedGeometry_CannotMoveTheMask()
        {
            Assert.IsFalse(FaceMaskFit.TryTarget(0, 0, 0, -.08f, out _, out _));
            Assert.IsFalse(FaceMaskFit.TryTarget(float.NaN, .07f, -.09f, -.08f, out _, out _));
            Assert.IsFalse(FaceMaskFit.TryTarget(-.07f, .07f, float.PositiveInfinity, -.08f, out _, out _));
            Assert.IsFalse(FaceMaskFit.TryTarget(-.07f, .07f, -.09f, .03f, out _, out _));
        }
    }
}
