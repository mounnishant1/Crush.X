using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class FunnyGamesAndVoiceTests
    {
        private static FaceSample Face(float blink, float mouth) =>
            new FaceSample { Valid = true, Confidence = .95f,
                Blink = blink, MouthOpen = mouth };

        [Test]
        public void BlinkPopRequiresReleaseAndCountsOnlyNewRealEvents()
        {
            var g = new FunnyGameState();
            g.Reset(10f);
            Assert.IsFalse(g.Step(FunnyGameKind.BlinkPop, Face(1f, 0f), 10.1f),
                "An already held blink must not score at session start");
            Assert.IsFalse(g.Step(FunnyGameKind.BlinkPop, Face(0f, 0f), 10.2f));
            Assert.IsTrue(g.Step(FunnyGameKind.BlinkPop, Face(.9f, 0f), 10.3f));
            Assert.AreEqual(10, g.Score);
            for (int i = 0; i < 10; i++)
                Assert.IsFalse(g.Step(FunnyGameKind.BlinkPop,
                    Face(.9f, 0f), 10.31f + i * .01f));
            Assert.AreEqual(1, g.Attempts);
            Assert.IsFalse(g.Step(FunnyGameKind.BlinkPop, Face(0f, 0f), 10.7f));
            Assert.IsTrue(g.Step(FunnyGameKind.BlinkPop, Face(.95f, 0f), 10.8f));
            Assert.AreEqual(20, g.Score);
        }

        [Test]
        public void TrackingLossNeverConsumesTimeOrScoresWithoutRearming()
        {
            var g = new FunnyGameState();
            g.Reset(5f);
            g.Step(FunnyGameKind.MouthCatch, Face(0f, 0f), 5.1f);
            var invalid = Face(0f, .9f);
            invalid.Valid = false;
            Assert.IsFalse(g.Step(FunnyGameKind.MouthCatch, invalid, 5.2f));
            float before = g.RemainingSeconds;
            Assert.IsFalse(g.Step(FunnyGameKind.MouthCatch, invalid, 5.3f));
            Assert.AreEqual(before, g.RemainingSeconds, .0001f);
            Assert.IsFalse(g.Step(FunnyGameKind.MouthCatch, Face(0f, .9f), 5.4f),
                "Opening that persists across tracking loss must not score");
            Assert.IsFalse(g.Step(FunnyGameKind.MouthCatch, Face(0f, 0f), 5.5f));
            Assert.IsTrue(g.Step(FunnyGameKind.MouthCatch, Face(0f, .9f), 5.6f));
            Assert.AreEqual(5, g.Score);
        }

        [Test]
        public void AudioModesOnlyAcceptAllowlistedNamesAndClampWetMix()
        {
            var go = new GameObject("FunnyVoiceTest");
            try
            {
                var voice = go.AddComponent<FunnyVoiceEffects>();
                Assert.IsTrue(voice.SetMode("Robot"));
                Assert.AreEqual(FunnyVoiceMode.Robot, voice.Mode);
                Assert.IsTrue(voice.SetMode("Deep"));
                Assert.IsTrue(voice.SetMode("Space"));
                Assert.IsFalse(voice.SetMode("MagicPaidSDK"));
                voice.SetStrength(float.NaN);
                Assert.AreEqual(.72f, voice.Strength, .001f);
                voice.SetStrength(5f);
                Assert.AreEqual(1f, voice.Strength, .001f);
                voice.SetStrength(-3f);
                Assert.AreEqual(0f, voice.Strength, .001f);
                Assert.IsFalse(voice.IsPreviewRunning, "Never start a mic on component creation");
                voice.StopPreview();
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
