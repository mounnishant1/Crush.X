using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public class FaceWarpFrameSourceTests
    {
        private static string Packet(int sequence, float confidence = .95f,
            float ageMilliseconds = 20f, bool hasFace = true)
        {
            return "{\"sequence\":" + sequence +
                ",\"hasFace\":" + (hasFace ? "true" : "false") +
                ",\"confidence\":" + confidence.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ",\"ageMilliseconds\":" + ageMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                ",\"leftEye\":{\"x\":0.35,\"y\":0.65}," +
                "\"rightEye\":{\"x\":0.65,\"y\":0.65}," +
                "\"mouth\":{\"x\":0.5,\"y\":0.42}," +
                "\"eyeRadius\":{\"x\":0.1,\"y\":0.08}," +
                "\"mouthRadius\":{\"x\":0.18,\"y\":0.13}}";
        }

        [Test]
        public void BigEyes_RequiresFreshRealFrame_AndDisablesOnLensSwitch()
        {
            var go = new GameObject("FaceWarpStateTest");
            try
            {
                var state = go.AddComponent<FaceWarpFrameSource>();
                state.SetLens("funny-big-eyes");
                Vector4 le, re, mouth;
                float es, ms;
                Assert.IsFalse(state.TryGetShaderParameters(10f, out le, out re,
                    out mouth, out es, out ms));
                Assert.IsTrue(state.TryApplyJson(Packet(1), 10f));
                Assert.IsTrue(state.TryGetShaderParameters(10.08f, out le, out re,
                    out mouth, out es, out ms));
                Assert.Greater(es, 0f);
                Assert.AreEqual(0f, ms);
                Assert.AreEqual(.35f, le.x, .001f);
                Assert.IsFalse(state.TryGetShaderParameters(10.20f, out le, out re,
                    out mouth, out es, out ms), "Old frames cannot warp current camera");

                state.SetLens("funny-jumbo-mouth");
                Assert.IsFalse(state.TryGetShaderParameters(10.10f, out le, out re,
                    out mouth, out es, out ms), "Lens switches invalidate earlier frames");
                Assert.IsTrue(state.TryApplyJson(Packet(1), 10.3f));
                Assert.IsTrue(state.TryGetShaderParameters(10.35f, out le, out re,
                    out mouth, out es, out ms));
                Assert.AreEqual(0f, es);
                Assert.Greater(ms, 0f);

                state.SetLens("funny-party-clown");
                Assert.IsFalse(state.HasFreshFrame(10.35f));
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void InvalidLowConfidenceAndOutOfOrderFramesNeverOverwriteValidFrame()
        {
            var go = new GameObject("InvalidFrames");
            try
            {
                var state = go.AddComponent<FaceWarpFrameSource>();
                state.SetLens("funny-big-eyes");
                Assert.IsTrue(state.TryApplyJson(Packet(2), 42f));
                Assert.IsFalse(state.TryApplyJson(Packet(1), 42.02f));
                Assert.IsFalse(state.TryApplyJson(Packet(3, .2f), 42.02f));
                Assert.IsFalse(state.TryApplyJson(Packet(3, .95f, 150f), 42.02f));
                Assert.IsFalse(state.TryApplyJson("{", 42.02f));
                Assert.IsTrue(state.HasFreshFrame(42.07f));

                Assert.IsTrue(state.TryApplyJson(Packet(3, .95f, 0f, false), 42.08f));
                Assert.IsFalse(state.HasFreshFrame(42.08f));
                Assert.IsFalse(state.TryApplyJson(Packet(3), 42.09f));
                Assert.IsTrue(state.TryApplyJson(Packet(4), 42.10f));
                state.SetIntensity(0f);
                Vector4 left, right, mouth;
                float eyes, lips;
                Assert.IsFalse(state.TryGetShaderParameters(42.11f, out left,
                    out right, out mouth, out eyes, out lips));
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void InvalidViewportCoordinatesAndRadiusAreRejected()
        {
            var go = new GameObject("WarpBounds");
            try
            {
                var state = go.AddComponent<FaceWarpFrameSource>();
                state.SetLens("funny-big-eyes");
                Assert.IsFalse(state.TryApplyJson(
                    Packet(1).Replace("\"x\":0.35", "\"x\":1.5"), 9f));
                Assert.IsFalse(state.TryApplyJson(
                    Packet(1).Replace("\"x\":0.1", "\"x\":0.9"), 9f));
                Assert.IsFalse(state.TryApplyJson(
                    Packet(1).Replace("\"x\":0.65", "\"x\":0.35"), 9f));
                Assert.IsTrue(state.TryApplyJson(Packet(1), 9f));
                state.Invalidate();
                Assert.IsFalse(state.HasFreshFrame(9.03f));
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
