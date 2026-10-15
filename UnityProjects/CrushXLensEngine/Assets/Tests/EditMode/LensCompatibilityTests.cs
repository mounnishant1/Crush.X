using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensCompatibilityTests
    {
        [TestCase("cinema-warm")]
        [TestCase("noir-film")]
        [TestCase("neon-duotone")]
        public void ColorFilter_DoesNotWaitForUnavailableTrackingCapabilities(string id)
        {
            var result = LensCompatibility.Evaluate(LensCatalog.Find(id).Value, false, TrackingCapabilities.None);
            Assert.IsTrue(result.CanSelect);
            Assert.IsFalse(result.PendingCapabilities);
            Assert.AreEqual(TrackingCapabilities.None, result.MissingRequired);
        }

        [Test]
        public void UninitializedProvider_AllowsSelectionWhileCapabilitiesArePending()
        {
            var result = LensCompatibility.Evaluate(LensCatalog.Find("fox-mask-3d").Value, false, TrackingCapabilities.None);
            Assert.IsTrue(result.CanSelect);
            Assert.IsTrue(result.PendingCapabilities);
        }

        [Test]
        public void KnownProviderWithoutRequiredPose_RejectsFaceLens()
        {
            var result = LensCompatibility.Evaluate(LensCatalog.Find("fox-mask-3d").Value, true, TrackingCapabilities.Hands);
            Assert.IsFalse(result.CanSelect);
            Assert.AreEqual(TrackingCapabilities.FacePose, result.MissingRequired);
        }

        [Test]
        public void MissingOptionalExpressions_DoesNotInventDataOrRejectPoseEffect()
        {
            var result = LensCompatibility.Evaluate(LensCatalog.Find("puppy").Value, true, TrackingCapabilities.FacePose);
            Assert.IsTrue(result.CanSelect);
            Assert.AreEqual(TrackingCapabilities.Expressions, result.MissingOptional);
        }

        [TestCase(" FOX-MASK-3D ", "fox-mask-3d")]
        [TestCase(null, "")]
        public void IdNormalization_IsDeterministic(string input, string expected)
        { Assert.AreEqual(expected, LensCompatibility.NormalizeId(input)); }

        [Test]
        public void Catalog_DoesNotClaimDeviceVerificationOrMeasuredPerformance()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
                Assert.AreNotEqual(LensVerification.DeviceVerified, lens.Verification);
                Assert.IsFalse(lens.PerformanceMeasured);
                Assert.IsNotEmpty(lens.EffectAssetReference);
            }
        }
    }
}
