using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public class LensCatalogTests
    {
        private readonly Dictionary<string, int?> savedPreferences = new Dictionary<string, int?>();
        private bool hadRecent;
        private string savedRecent;

        [SetUp]
        public void PreserveUserPreferences()
        {
            savedPreferences.Clear();
            string consentKey = "crushx.lens.v02.remember";
            savedPreferences[consentKey] = PlayerPrefs.HasKey(consentKey) ? (int?)PlayerPrefs.GetInt(consentKey) : null;
            hadRecent = PlayerPrefs.HasKey("crushx.lens.v02.recent");
            savedRecent = PlayerPrefs.GetString("crushx.lens.v02.recent", string.Empty);
            foreach (LensManifest lens in LensCatalog.All)
                foreach (string kind in new[] { "fav.", "usage." })
                {
                    string key = "crushx.lens.v02." + kind + lens.Id;
                    savedPreferences[key] = PlayerPrefs.HasKey(key) ? (int?)PlayerPrefs.GetInt(key) : null;
                }
        }

        [TearDown]
        public void RestoreUserPreferences()
        {
            if (hadRecent) PlayerPrefs.SetString("crushx.lens.v02.recent", savedRecent);
            else PlayerPrefs.DeleteKey("crushx.lens.v02.recent");
            foreach (var item in savedPreferences)
                if (item.Value.HasValue) PlayerPrefs.SetInt(item.Key, item.Value.Value);
                else PlayerPrefs.DeleteKey(item.Key);
            PlayerPrefs.Save();
        }

        [Test]
        public void Catalog_PreservesOriginalEffectsAndAddsThreeImplementedFilters()
        {
            Assert.AreEqual(14, LensCatalog.All.Count);
            int procedural = 0, colorFilters = 0;
            var ids = new HashSet<string>();
            foreach (LensManifest lens in LensCatalog.All)
            {
                Assert.IsTrue(ids.Add(lens.Id));
                if (lens.SceneProvided) continue;
                if (lens.Implementation == LensImplementation.ProceduralPrototype) procedural++;
                if (lens.Implementation == LensImplementation.ColorFilter)
                {
                    colorFilters++;
                    Assert.IsTrue(typeof(ColorFilterLens).IsAssignableFrom(LensCatalog.ResolveType(lens.Id)));
                    Assert.AreEqual(TrackingCapabilities.None, lens.RequiredCapabilities);
                    Assert.AreEqual(LensVerification.NotTested, lens.Verification);
                }
                Assert.IsTrue(typeof(LensEffect).IsAssignableFrom(LensCatalog.ResolveType(lens.Id)));
            }
            Assert.AreEqual(10, procedural);
            Assert.AreEqual(3, colorFilters);
            Assert.IsTrue(LensCatalog.Find("fox-mask-3d").Value.SceneProvided);
        }

        [Test]
        public void ProceduralLens_BuildsRealGeometry()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
                if (lens.Implementation != LensImplementation.ProceduralPrototype) continue;
                var go = new GameObject("LensTest");
                var effect = (LensEffect)go.AddComponent(LensCatalog.ResolveType(lens.Id));
                effect.Build();
                Assert.Greater(go.GetComponentsInChildren<MeshRenderer>().Length, 0, lens.Id);
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void Favorite_AndRanking_ChangeAfterUse()
        {
            var ranking = new LensPersonalization();
            ranking.Reset();
            ranking.RecordUsage("dragon");
            ranking.ToggleFavorite("dragon");
            Assert.IsTrue(ranking.IsFavorite("dragon"));
            Assert.AreEqual("dragon", ranking.Ranked()[0].Id);
            ranking.Reset();
        }


        [Test]
        public void ImportedFoxMask_RequiresSceneController()
        {
            Assert.Throws<System.InvalidOperationException>(() => LensCatalog.ResolveType("fox-mask-3d"));
        }

        [TestCase(0, 0, -100, 0, 440, 1)]
        [TestCase(0, 0, 100, 0, 440, -1)]
        [TestCase(0, 0, 25, 0, 440, 0)]
        [TestCase(0, 0, 100, 100, 440, 0)]
        [TestCase(0, 0, 100, 0, 1440, 0)]
        public void SwipeDirection_UsesDistanceAndHorizontalIntent(float x0, float y0, float x1, float y1, float width, int expected)
        {
            Assert.AreEqual(expected, CrushXCameraSwipe.SwipeStep(new Vector2(x0,y0), new Vector2(x1,y1), width));
        }
        [Test]
        public void UnknownLensId_IsRejected()
        {
            Assert.Throws<System.ArgumentException>(() => LensCatalog.ResolveType("unlisted-lens"));
        }

        [Test]
        public void UsageHistory_IsOptInAndDisablingItPreservesFavorites()
        {
            var preferences = new LensPersonalization();
            preferences.Reset();
            preferences.SetUsageEnabled(false);
            preferences.RecordUsage("puppy");
            Assert.AreEqual(0, preferences.UsageCount("puppy"));
            Assert.AreEqual(0, preferences.RecentIds().Count);
            preferences.SetUsageEnabled(true);
            preferences.RecordUsage("puppy");
            preferences.RecordUsage("fox");
            preferences.RecordUsage("puppy");
            preferences.ToggleFavorite("puppy");
            Assert.AreEqual(2, preferences.UsageCount("puppy"));
            CollectionAssert.AreEqual(new[] { "puppy", "fox" }, preferences.RecentIds());
            preferences.SetUsageEnabled(false);
            Assert.AreEqual(0, preferences.UsageCount("puppy"));
            Assert.AreEqual(0, preferences.RecentIds().Count);
            Assert.IsTrue(preferences.IsFavorite("puppy"));
        }
    }
}
