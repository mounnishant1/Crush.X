using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class MultiFaceFunnyTests
    {
        private static string Faces(int seq)
        {
            return "{\"sequence\":" + seq + ",\"hasFace\":true," +
                "\"ageMilliseconds\":18,\"faces\":[" +
                "{\"x\":0.28,\"y\":0.54,\"size\":0.15}," +
                "{\"x\":0.72,\"y\":0.59,\"size\":0.16}]}";
        }

        [Test]
        public void TwoFreshFacesVisibleAndStaleFacesDisappear()
        {
            var host = new GameObject("multiFaceTest");
            try
            {
                var state = host.AddComponent<MultiFaceFunnyOverlay>();
                Assert.IsFalse(state.Apply("", 10f));
                Assert.IsTrue(state.Apply(Faces(1), 10f));
                Assert.AreEqual(2, state.VisibleFaces(10.04f));
                Assert.AreEqual(0, state.VisibleFaces(10.20f));
                Assert.IsFalse(state.Apply(Faces(1), 10.21f));
                Assert.IsTrue(state.Apply(Faces(2), 10.22f));
                Assert.AreEqual(2, state.VisibleFaces(10.24f));
                Assert.IsTrue(state.Apply(
                    "{\"sequence\":3,\"hasFace\":false}", 10.25f));
                Assert.AreEqual(0, state.VisibleFaces(10.25f));
            }
            finally { Object.DestroyImmediate(host); }
        }

        [Test]
        public void InvalidFacesAndInvalidAgeNeverReplaceGoodData()
        {
            var host = new GameObject("invalidMultiFaceTest");
            try
            {
                var state = host.AddComponent<MultiFaceFunnyOverlay>();
                Assert.IsTrue(state.Apply(Faces(1), 5f));
                Assert.IsFalse(state.Apply(
                    Faces(2).Replace("\"x\":0.28", "\"x\":7.5"), 5.01f));
                Assert.IsFalse(state.Apply(
                    Faces(2).Replace("\"ageMilliseconds\":18",
                        "\"ageMilliseconds\":210"), 5.02f));
                Assert.IsFalse(state.Apply("{", 5.03f));
                Assert.AreEqual(2, state.VisibleFaces(5.06f));
                state.Invalidate();
                Assert.AreEqual(0, state.VisibleFaces(5.06f));
            }
            finally { Object.DestroyImmediate(host); }
        }

        [Test]
        public void NewGameAndGroupEffectsAreRegistered()
        {
            Assert.AreEqual(typeof(BlinkPopFunnyLens),
                LensCatalog.ResolveType("funny-game-blinkpop"));
            Assert.AreEqual(typeof(MouthCatchFunnyLens),
                LensCatalog.ResolveType("funny-game-mouthcatch"));
            Assert.AreEqual(typeof(GroupPartyFunnyLens),
                LensCatalog.ResolveType("funny-group-party"));
        }
    }
}
