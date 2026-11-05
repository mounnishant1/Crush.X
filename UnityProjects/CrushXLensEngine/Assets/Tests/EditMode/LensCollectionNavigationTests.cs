using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensCollectionNavigationTests
    {
        private LensPersonalization prefs;
        private List<LensManifest> ranked;
        private LensTrendFeed trending;

        [SetUp]
        public void SetUp()
        {
            prefs = new LensPersonalization();
            prefs.Reset();
            ranked = new List<LensManifest>(LensCatalog.All);
            trending = new LensTrendFeed();
        }

        [TearDown]
        public void TearDown() { prefs.Reset(); }

        private List<LensManifest> Browse(string name)
        {
            return LensDiscovery.Browse(name, ranked, trending,
                DateTimeOffset.UtcNow, prefs);
        }

        [Test]
        public void AllSevenRealCategoriesAreNavigableWithTheirExactCounts()
        {
            var expected = new Dictionary<string, int>
            {
                { "Animals", 3 }, { "Beauty", 5 },
                { "Sci-Fi", 3 }, { "Fantasy", 2 },
                { "Funny", 16 }, { "Aesthetic", 4 },
                { "Alien", 4 }
            };
            foreach (var pair in expected)
            {
                Assert.IsTrue(LensDiscovery.IsCollection(pair.Key), pair.Key);
                var found = Browse(pair.Key);
                Assert.AreEqual(pair.Value, found.Count, pair.Key);
                foreach (var lens in found)
                {
                    Assert.IsTrue(LensCatalog.Find(lens.Id).HasValue,
                        "Only registered original lenses can be discovered");
                }
            }
            Assert.AreEqual(37, Browse("All").Count);
        }

        [Test]
        public void NavigationIncludesSevenCategoriesAllTrendingFavoritesRecent()
        {
            Assert.AreEqual(11, LensDiscovery.Collections.Count);
            var unique = new HashSet<string>();
            foreach (string name in LensDiscovery.Collections)
            {
                Assert.IsTrue(unique.Add(name), "Duplicate category: " + name);
                Assert.IsTrue(LensDiscovery.IsCollection(name));
            }
            Assert.IsFalse(LensDiscovery.IsCollection("AlienGameFake"));
            Assert.IsFalse(LensDiscovery.IsCollection("sci-fi"));
            Assert.AreEqual(9, Browse("Trending").Count,
                "Trending is a view over existing lenses, not additional inventory");
            Assert.AreEqual(0, Browse("Favorites").Count);
            Assert.AreEqual(0, Browse("Recent").Count);
        }

        [Test]
        public void FavoritesCanBeAddedRemovedAndAreOnlyCatalogLenses()
        {
            prefs.ToggleFavorite("alien-classic");
            prefs.ToggleFavorite("cat-ears");
            prefs.ToggleFavorite("unknown-lens");
            var favorites = Browse("Favorites");
            Assert.AreEqual(2, favorites.Count);
            foreach (var item in favorites)
                Assert.IsTrue(prefs.IsFavorite(item.Id));
            prefs.ToggleFavorite("cat-ears");
            Assert.AreEqual(1, Browse("Favorites").Count);
            prefs.ToggleFavorite("alien-classic");
            Assert.AreEqual(0, Browse("Favorites").Count);
        }

        [Test]
        public void RecentsAreOrderedDeduplicatedAndBoundedToTwelve()
        {
            Assert.AreEqual(0, prefs.RecentIds().Count);
            prefs.RecordUsage("cat-ears");
            prefs.RecordUsage("dragon");
            prefs.RecordUsage("cat-ears");
            Assert.AreEqual("cat-ears", prefs.RecentIds()[0]);
            Assert.AreEqual("dragon", prefs.RecentIds()[1]);
            Assert.AreEqual(2, Browse("Recent").Count);
            Assert.AreEqual("cat-ears", Browse("Recent")[0].Id);
            prefs.RecordUsage("not-registered");
            Assert.AreEqual(2, Browse("Recent").Count);
            foreach (var lens in LensCatalog.All)
                prefs.RecordUsage(lens.Id);
            Assert.AreEqual(12, prefs.RecentIds().Count);
            Assert.AreEqual(LensCatalog.All[LensCatalog.All.Count - 1].Id,
                Browse("Recent")[0].Id);
            Assert.AreEqual(12, Browse("Recent").Count);
        }

        [Test]
        public void FavoritesAndRecentNeverLeakAcrossAuthenticatedAccounts()
        {
            try
            {
                Assert.IsTrue(prefs.ConfigureAccountScope("test-account-1"));
                prefs.Reset();
                prefs.ToggleFavorite("alien-classic");
                prefs.RecordUsage("dragon");
                Assert.AreEqual(1, Browse("Favorites").Count);
                Assert.AreEqual("dragon", Browse("Recent")[0].Id);

                Assert.IsTrue(prefs.ConfigureAccountScope("test-account-2"));
                prefs.Reset();
                Assert.AreEqual(0, Browse("Favorites").Count);
                Assert.AreEqual(0, Browse("Recent").Count);
                prefs.ToggleFavorite("cat-ears");

                Assert.IsTrue(prefs.ConfigureAccountScope("test-account-1"));
                Assert.AreEqual("alien-classic", Browse("Favorites")[0].Id);
                Assert.AreEqual("dragon", Browse("Recent")[0].Id);
                Assert.IsFalse(prefs.IsFavorite("cat-ears"));

                // Empty account ID is guest, not the previously signed-in user.
                Assert.IsTrue(prefs.ConfigureAccountScope(""));
                Assert.IsFalse(prefs.IsFavorite("alien-classic"));
                Assert.IsFalse(prefs.IsFavorite("cat-ears"));
                Assert.IsFalse(prefs.ConfigureAccountScope(new string('x', 129)));
            }
            finally
            {
                prefs.ConfigureAccountScope("test-account-1");
                prefs.Reset();
                prefs.ConfigureAccountScope("test-account-2");
                prefs.Reset();
                prefs.ConfigureAccountScope("");
                prefs.Reset();
            }
        }

        [Test]
        public void ResetClearsBothCollectionsButDoesNotDeleteTheLensCatalog()
        {
            prefs.ToggleFavorite("dragon");
            prefs.RecordUsage("dragon");
            Assert.AreEqual(1, Browse("Favorites").Count);
            Assert.AreEqual(1, Browse("Recent").Count);
            prefs.Reset();
            Assert.AreEqual(0, Browse("Favorites").Count);
            Assert.AreEqual(0, Browse("Recent").Count);
            Assert.AreEqual(37, Browse("All").Count);
        }
    }
}
