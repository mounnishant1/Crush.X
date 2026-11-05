using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class OriginalBeautyStateTests
    {
        private static string TrackingPacket(int sequence)
        {
            return "{\"sequence\":" + sequence +
                ",\"hasFace\":true,\"confidence\":0.9,\"ageMilliseconds\":15," +
                "\"leftEye\":{\"x\":0.36,\"y\":0.66}," +
                "\"rightEye\":{\"x\":0.64,\"y\":0.66}," +
                "\"mouth\":{\"x\":0.5,\"y\":0.42}," +
                "\"eyeRadius\":{\"x\":0.10,\"y\":0.075}," +
                "\"mouthRadius\":{\"x\":0.17,\"y\":0.10}}";
        }

        [Test]
        public void GlowRequiresFreshTrackedFaceAndOffersConservativeMask()
        {
            var go = new GameObject("BeautyTest");
            try
            {
                var source = go.AddComponent<FaceWarpFrameSource>();
                source.SetLens("beauty-glow");
                Vector4 face, eyeL, eyeR, mouth;
                float intensity;
                int mode;
                Assert.IsFalse(source.TryGetBeautyParameters(5f, out face, out eyeL,
                    out eyeR, out mouth, out intensity, out mode));
                Assert.IsTrue(source.TryApplyJson(TrackingPacket(1), 5f));
                Assert.IsTrue(source.TryGetBeautyParameters(5.05f, out face, out eyeL,
                    out eyeR, out mouth, out intensity, out mode));
                Assert.AreEqual(1, mode);
                Assert.AreEqual(.52f, intensity, .001f);
                Assert.Greater(face.z, .09f);
                Assert.Greater(face.w, .10f);
                Assert.AreEqual(.36f, eyeL.x, .001f);
                Assert.IsFalse(source.TryGetBeautyParameters(5.21f, out face,
                    out eyeL, out eyeR, out mouth, out intensity, out mode));
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void BlushModeSwitchAndOffRemoveStaleBeauty()
        {
            var go = new GameObject("BeautyModeTest");
            try
            {
                var source = go.AddComponent<FaceWarpFrameSource>();
                source.SetLens("beauty-glow");
                Assert.IsTrue(source.TryApplyJson(TrackingPacket(1), 20f));
                source.SetLens("beauty-blush");
                Vector4 face, eyeL, eyeR, mouth;
                float intensity;
                int mode;
                Assert.IsFalse(source.TryGetBeautyParameters(20.03f, out face,
                    out eyeL, out eyeR, out mouth, out intensity, out mode));
                Assert.IsTrue(source.TryApplyJson(TrackingPacket(1), 20.06f));
                Assert.IsTrue(source.TryGetBeautyParameters(20.08f, out face,
                    out eyeL, out eyeR, out mouth, out intensity, out mode));
                Assert.AreEqual(2, mode);
                source.SetLens("alien-classic");
                Assert.IsFalse(source.TryGetBeautyParameters(20.09f, out face,
                    out eyeL, out eyeR, out mouth, out intensity, out mode));
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void IntensityAndFaceLossAreFailClosed()
        {
            var go = new GameObject("BeautyIntensityTest");
            try
            {
                var source = go.AddComponent<FaceWarpFrameSource>();
                source.SetLens("beauty-glow");
                source.SetBeautyIntensity(float.NaN);
                Assert.AreEqual(.52f, source.BeautyIntensity, .001f);
                source.SetBeautyIntensity(10f);
                Assert.AreEqual(1f, source.BeautyIntensity, .001f);
                source.SetBeautyIntensity(-2f);
                Assert.AreEqual(0f, source.BeautyIntensity, .001f);
                source.SetBeautyIntensity(.5f);
                Assert.IsTrue(source.TryApplyJson(TrackingPacket(4), 10f));
                Assert.IsTrue(source.TryApplyJson(
                    "{\"sequence\":5,\"hasFace\":false}", 10.01f));
                Vector4 face, eyeL, eyeR, mouth;
                float intensity;
                int mode;
                Assert.IsFalse(source.TryGetBeautyParameters(10.02f, out face,
                    out eyeL, out eyeR, out mouth, out intensity, out mode));
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void DistortionAndBeautyNeverRunForSameLens()
        {
            var go = new GameObject("IsolationTest");
            try
            {
                var source = go.AddComponent<FaceWarpFrameSource>();
                source.SetLens("beauty-glow");
                source.TryApplyJson(TrackingPacket(1), 10f);
                Vector4 eyeL, eyeR, mouth;
                float eyeStrength, mouthStrength;
                Assert.IsFalse(source.TryGetShaderParameters(10.02f, out eyeL,
                    out eyeR, out mouth, out eyeStrength, out mouthStrength));
                source.SetLens("funny-big-eyes");
                source.TryApplyJson(TrackingPacket(1), 11f);
                Vector4 face;
                float beautyAmount;
                int beautyMode;
                Assert.IsFalse(source.TryGetBeautyParameters(11.01f, out face,
                    out eyeL, out eyeR, out mouth, out beautyAmount, out beautyMode));
                Assert.IsTrue(source.TryGetShaderParameters(11.01f, out eyeL,
                    out eyeR, out mouth, out eyeStrength, out mouthStrength));
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
