using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public class LensCatalogTests
    {
        [Test]
        public void Catalog_HasTenUniqueRunnableEffects()
        {
            Assert.AreEqual(10, LensCatalog.All.Count);
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
        public void UnknownLensId_IsRejected()
        {
            Assert.Throws<System.ArgumentException>(() => LensCatalog.ResolveType("unlisted-lens"));
        }
    }
}
