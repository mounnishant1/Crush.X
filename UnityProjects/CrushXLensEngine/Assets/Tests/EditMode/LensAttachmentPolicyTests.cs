using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensAttachmentPolicyTests
    {
        [TestCase(.08f, .14814815f)]
        [TestCase(.145f, .2685185f)]
        [TestCase(.162f, .3f)]
        [TestCase(.25f, .46296296f)]
        public void ValidMeasuredWidthFitsProceduralHeadInMetres(float width, float expectedScale)
        {
            Assert.AreEqual(expectedScale, LensAttachmentPolicy.ProceduralScale(width, false), 1e-6);
        }

        [Test]
        public void InvalidMeasurementsUseReferenceWidthInsteadOfOversizedOrNonfiniteGeometry()
        {
            foreach (float invalid in new[] { 0f, -.1f, .079f, .251f, 100f, float.NaN, float.PositiveInfinity, float.NegativeInfinity })
                Assert.AreEqual(.2685185f, LensAttachmentPolicy.ProceduralScale(invalid, false), 1e-6);
        }

        [Test]
        public void ExplicitSyntheticDemoRetainsOriginalPrototypeScale()
        {
            foreach (float width in new[] { 0f, .08f, .145f, .25f, float.NaN, float.PositiveInfinity })
                Assert.AreEqual(1, LensAttachmentPolicy.ProceduralScale(width, true));
        }
    }
}
