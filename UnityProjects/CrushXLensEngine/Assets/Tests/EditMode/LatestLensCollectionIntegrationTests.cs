using System;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class LatestLensCollectionIntegrationTests
    {
        private LensCustomCollections collections;
        private string account;

        [SetUp]
        public void SetUp()
        {
            account = "latest-lens-collection-qa-" + Guid.NewGuid().ToString("N");
            collections = new LensCustomCollections();
            Assert.IsTrue(collections.ConfigureAccountScope(account));
            collections.ClearAllCurrentAccountCollections();
        }

        [TearDown]
        public void TearDown()
        {
            collections.ConfigureAccountScope(account);
            collections.ClearAllCurrentAccountCollections();
        }

        [Test]
        public void LatestInstalledCatalogAndSceneLensRemainUntouched()
        {
            Assert.AreEqual(11, LensCatalog.All.Count);
            Assert.IsTrue(LensCatalog.Find("fox-mask-3d").Value.SceneProvided);
            Assert.IsTrue(LensCatalog.Find("cat-ears").HasValue);
        }

        [Test]
        public void PerLensCreateAndSaveIsSingleOperation()
        {
            string id;
            Assert.IsTrue(collections.TryCreateWithLens("My Beauty", "butterfly", out id));
            Assert.IsTrue(LensCustomCollections.IsCustomId(id));
            Assert.AreEqual("My Beauty", collections.Get(id).name);
            Assert.IsTrue(collections.ContainsLens(id, "butterfly"));
            Assert.AreEqual(1, collections.Get(id).lensIds.Count);
            Assert.IsFalse(collections.TryCreateWithLens("My Beauty", "butterfly", out id));
            Assert.IsFalse(collections.TryCreateWithLens("Unknown",
                "remote-unapproved-lens", out id));
            Assert.AreEqual(1, collections.All().Count);
        }

        [Test]
        public void CanSaveTheSameLensIntoMultiplePrivateFolders()
        {
            string a, b;
            Assert.IsTrue(collections.TryCreate("Beauty", out a) == false,
                "A category name must not be shadowed");
            Assert.IsTrue(collections.TryCreate("Beauty Picks", out a));
            Assert.IsTrue(collections.TryCreate("Party", out b));
            Assert.IsTrue(collections.AddLens(a, "puppy"));
            Assert.IsTrue(collections.AddLens(b, "puppy"));
            Assert.IsFalse(collections.AddLens(a, "puppy"));
            Assert.IsTrue(collections.RemoveLens(a, "puppy"));
            Assert.IsFalse(collections.ContainsLens(a, "puppy"));
            Assert.IsTrue(collections.ContainsLens(b, "puppy"));
            Assert.AreEqual(11, LensCatalog.All.Count);
        }

        [Test]
        public void StoreWorksWithImportedSceneLensesButNeverImportsAssets()
        {
            string id;
            Assert.IsTrue(collections.TryCreateWithLens("My Fox", "fox-mask-3d", out id));
            Assert.IsTrue(collections.ContainsLens(id, "fox-mask-3d"));
            Assert.IsFalse(collections.AddLens(id, "some-stranger-plugin"));
        }

        [Test]
        public void ValidatesNamesAndPersistsExplicitFolderOrder()
        {
            string a, b;
            Assert.IsFalse(collections.TryCreate("Recent", out a));
            Assert.IsFalse(collections.TryCreate("Gaming", out a));
            Assert.IsFalse(collections.TryCreate("Sci-Fi", out a));
            Assert.IsFalse(collections.TryCreate("Unsafe\u202Elabel", out a));
            Assert.IsTrue(collections.TryCreate("Best Funny", out a));
            Assert.IsTrue(collections.TryCreate("Party Lenses", out b));
            Assert.IsFalse(collections.TryCreate("best funny", out b));
            Assert.IsTrue(collections.MoveCollection(b, -1));
            Assert.AreEqual(b, collections.All()[0].id);
            Assert.IsTrue(collections.AddLens(a, "puppy"));
            Assert.IsTrue(collections.AddLens(a, "cat-ears"));
            Assert.IsTrue(collections.MoveLens(a, "cat-ears", -1));
            Assert.AreEqual("cat-ears", collections.Get(a).lensIds[0]);
            Assert.IsTrue(collections.Rename(a, "My Animals"));
            Assert.AreEqual("My Animals", collections.Get(a).name);
            Assert.IsTrue(collections.Delete(a));
            Assert.AreEqual(1, collections.All().Count);
        }

        [Test]
        public void SnapshotAndAccountScopeDoNotLeakOrCrossMutate()
        {
            string id;
            Assert.IsTrue(collections.TryCreateWithLens("Personal", "puppy", out id));
            var snapshot = collections.Get(id);
            snapshot.lensIds.Clear();
            snapshot.name = "Altered";
            Assert.AreEqual("Personal", collections.Get(id).name);
            Assert.AreEqual(1, collections.Get(id).lensIds.Count);

            string otherAccount = account + "-other";
            try
            {
                Assert.IsTrue(collections.ConfigureAccountScope(otherAccount));
                Assert.AreEqual(0, collections.All().Count);
                string other;
                Assert.IsTrue(collections.TryCreate("Other", out other));
                Assert.IsTrue(collections.ConfigureAccountScope(account));
                Assert.IsNull(collections.Get(other));
                Assert.IsTrue(collections.ContainsLens(id, "puppy"));
            }
            finally
            {
                collections.ConfigureAccountScope(otherAccount);
                collections.ClearAllCurrentAccountCollections();
                collections.ConfigureAccountScope(account);
            }
        }

        [Test]
        public void SheetBecomesInvalidIfLensOrAuthenticatedScopeChanges()
        {
            string id;
            Assert.IsTrue(collections.TryCreate("Camera Saves", out id));
            var sheet = new LensCollectionSheet(collections);
            Assert.IsTrue(sheet.Open("cat-ears", 42));
            Assert.IsTrue(sheet.Matches("cat-ears", 42));
            Assert.IsFalse(sheet.Matches("puppy", 42));
            Assert.IsFalse(sheet.Matches("cat-ears", 43));
            sheet.Close();
            Assert.IsFalse(sheet.IsOpen);
            Assert.IsFalse(sheet.Open("unknown-lens", 42));
        }

        [Test]
        public void ExplicitDeletionAndBoundariesDoNotChangeInstalledAssets()
        {
            string id;
            Assert.IsTrue(collections.TryCreateWithLens("Original", "dragon", out id));
            for (int i = 1; i < LensCustomCollections.MaximumCollections; i++)
            {
                string next;
                Assert.IsTrue(collections.TryCreate("F" + i, out next));
            }
            Assert.AreEqual(20, collections.All().Count);
            Assert.IsFalse(collections.TryCreate("Too many", out id));
            collections.ClearAllCurrentAccountCollections();
            Assert.AreEqual(0, collections.All().Count);
            Assert.AreEqual(11, LensCatalog.All.Count);
        }
    }
}
