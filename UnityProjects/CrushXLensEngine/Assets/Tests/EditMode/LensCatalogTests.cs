using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public class LensCatalogTests
    {
        [Test]
        public void Catalog_HasTwentyTwoUniqueRunnableEffects()
        {
            Assert.AreEqual(22, LensCatalog.All.Count);
            var ids = new HashSet<string>();
            foreach (LensManifest lens in LensCatalog.All)
            {
                Assert.IsTrue(ids.Add(lens.Id));
                Assert.IsTrue(typeof(LensEffect).IsAssignableFrom(LensCatalog.ResolveType(lens.Id)));
            }
        }

        [Test]
        public void ProceduralLens_BuildsRealGeometry()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
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
        public void Discovery_ExposesBeautyAlienAndOfflineTrending()
        {
            var ranked = new List<LensManifest>(LensCatalog.All);
            var feed = new LensTrendFeed();
            var now = System.DateTimeOffset.UtcNow;
            var beauty = LensDiscovery.Browse("Beauty", ranked, feed, now);
            var alien = LensDiscovery.Browse("Alien", ranked, feed, now);
            var trending = LensDiscovery.Browse("Trending", ranked, feed, now);
            Assert.GreaterOrEqual(beauty.Count, 4);
            Assert.AreEqual(4, alien.Count);
            Assert.GreaterOrEqual(trending.Count, 4);
            foreach (var lens in beauty) Assert.AreEqual(LensCategory.Beauty, lens.Category);
            foreach (var lens in alien) Assert.AreEqual(LensCategory.Alien, lens.Category);
            Assert.AreEqual("trend-hearts", trending[0].Id);
            Assert.AreEqual(0, LensDiscovery.Browse("invalid", ranked, feed, now).Count);
        }

        [Test]
        public void Trends_AcceptAllowlistedRankedFeedButNotUnknownOrExpired()
        {
            var now = new System.DateTimeOffset(2026, 11, 5, 10, 0, 0, System.TimeSpan.Zero);
            var future = now.AddHours(12).ToString("yyyy-MM-ddTHH:mm:ssZ",
                System.Globalization.CultureInfo.InvariantCulture);
            var feed = new LensTrendFeed();
            string trusted = "{\\\"expiresUtc\\\":\\\"" + future +
                "\\\",\\\"items\\\":[{\\\"id\\\":\\\"alien-classic\\\",\\\"score\\\":90}," +
                "{\\\"id\\\":\\\"beauty-glow\\\",\\\"score\\\":100}]}";
            Assert.IsTrue(feed.TryApplyTrustedSnapshot(trusted, now));
            Assert.AreEqual("beauty-glow", feed.CurrentIds(now)[0]);
            Assert.AreEqual("alien-classic", feed.CurrentIds(now)[1]);

            string unknown = trusted.Replace("alien-classic", "not-an-installed-lens");
            Assert.IsFalse(feed.TryApplyTrustedSnapshot(unknown, now));
            Assert.AreEqual("beauty-glow", feed.CurrentIds(now)[0],
                "A rejected feed must not discard a previously validated snapshot");
            Assert.AreEqual("trend-hearts", feed.CurrentIds(now.AddDays(2))[0],
                "Expired rankings must fall back to curated local picks");
        }

        [Test]
        public void UnknownLensId_IsRejected()
        {
            Assert.Throws<System.ArgumentException>(() => LensCatalog.ResolveType("unlisted-lens"));
        }
    }
}
