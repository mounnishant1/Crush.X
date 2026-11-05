using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LiveFaceExpressionStateTests
    {
        private static string Good(int seq, string jaw = "0.8") =>
            "{\"sequence\":" + seq + ",\"hasFace\":true," +
            "\"confidence\":0.8,\"ageMilliseconds\":20," +
            "\"jawOpen\":" + jaw + ",\"eyeBlinkLeft\":0.7," +
            "\"eyeBlinkRight\":0.2,\"mouthSmileLeft\":0.6," +
            "\"mouthSmileRight\":0.8,\"browInnerUp\":0.1}";

        [Test]
        public void FreshNativeFramesDriveJawBlinkAndSmile()
        {
            var state = new LiveFaceExpressionState();
            Assert.IsTrue(state.TryApply(Good(1), 10f));
            float jaw, blink, smile, eyebrow;
            Assert.IsTrue(state.TryRead(10.06f, out jaw, out blink, out smile, out eyebrow));
            Assert.AreEqual(.8f, jaw, .001f);
            Assert.AreEqual(.7f, blink, .001f);
            Assert.AreEqual(.7f, smile, .001f);
            Assert.AreEqual(.1f, eyebrow, .001f);
        }

        [Test]
        public void NoFaceTimeoutAndBadFramesClearOrRejectExpressions()
        {
            var state = new LiveFaceExpressionState();
            Assert.IsTrue(state.TryApply(Good(9), 50f));
            float jaw, blink, smile, eyebrow;
            Assert.IsFalse(state.TryApply(Good(8), 50.01f));
            Assert.IsFalse(state.TryApply(Good(10, "1.7"), 50.01f));
            Assert.IsFalse(state.TryApply(Good(10, "-0.2"), 50.01f));
            Assert.IsFalse(state.TryApply("{", 50.01f));
            Assert.IsTrue(state.TryRead(50.05f, out jaw, out blink, out smile, out eyebrow));
            Assert.IsFalse(state.TryRead(50.2f, out jaw, out blink, out smile, out eyebrow));
            Assert.AreEqual(0f, jaw);
            Assert.IsTrue(state.TryApply("{\"sequence\":10,\"hasFace\":false}", 50.3f));
            Assert.IsFalse(state.TryRead(50.3f, out jaw, out blink, out smile, out eyebrow));
            Assert.IsFalse(state.TryApply(Good(10), 50.31f));
            state.Invalidate();
            Assert.IsTrue(state.TryApply(Good(1), 50.4f));
        }

        [Test]
        public void ADelayedFrameCannotReintroduceOldFacialEvents()
        {
            var state = new LiveFaceExpressionState();
            string stale = Good(1).Replace("\"ageMilliseconds\":20", "\"ageMilliseconds\":150");
            Assert.IsFalse(state.TryApply(stale, 100f));
            float jaw, blink, smile, eyebrow;
            Assert.IsFalse(state.TryRead(100f, out jaw, out blink, out smile, out eyebrow));
        }
    }
}
