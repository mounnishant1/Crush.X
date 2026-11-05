using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensCustomCollectionsTests
    {
        private LensPersonalization prefs;
        private LensCustomCollections store;
        private string accountName;

        [SetUp]
        public void SetUp()
        {
            accountName = "custom-collection-tests-" + Guid.NewGuid().ToString("N");
            prefs = new LensPersonalization();
            Assert.IsTrue(prefs.ConfigureAccountScope(accountName));
            store = prefs.CustomCollections;
            store.ClearAllCurrentAccountCollections();
            prefs.Reset();
        }

        [TearDown]
        public void TearDown()
        {
            prefs.ConfigureAccountScope(accountName);
            store.ClearAllCurrentAccountCollections();
            prefs.Reset();
        }

        [Test]
        public void CreatesRenamesAndDeletesOnlyCustomFolders()
        {
            string id;
            Assert.IsTrue(store.TryCreate(" My Beauty ", out id));
            Assert.IsTrue(LensCustomCollections.IsCustomId(id));
            Assert.AreEqual("My Beauty", store.Get(id).name);
            Assert.IsTrue(store.Rename(id, "Beauty For Me"));
            Assert.AreEqual("Beauty For Me", store.Get(id).name);
            Assert.IsTrue(store.Delete(id));
            Assert.IsNull(store.Get(id));
            Assert.AreEqual(37, LensCatalog.All.Count,
                "Deleting a folder never removes an original lens");
        }

        [Test]
        public void RejectsDuplicateSystemNamesUnsafeNamesAndUnknownIds()
        {
            string id;
            Assert.IsFalse(store.TryCreate("", out id));
            Assert.IsFalse(store.TryCreate("All", out id));
            Assert.IsFalse(store.TryCreate("fAvOrItEs", out id));
            Assert.IsFalse(store.TryCreate("recent", out id));
            Assert.IsFalse(store.TryCreate(new string('x', 33), out id));
            Assert.IsFalse(store.TryCreate("Sneaky\u202Ename", out id));
            Assert.IsFalse(store.TryCreate("Invalid\nName", out id));
            Assert.IsTrue(store.TryCreate("Party Lenses", out id));
            Assert.IsFalse(store.TryCreate("party lenses", out id));
            Assert.IsFalse(store.Rename(id, "Trending"));
            Assert.IsFalse(store.Rename(id, "Bad\u202DLabel"));
            Assert.IsFalse(store.Delete("user:unknown"));
            Assert.IsFalse(store.AddLens(id, "invented-fake-lens"));
        }

        [Test]
        public void OrderedFolderMembersAreAllowlistedNoDuplicateAndMovable()
        {
            string id;
            Assert.IsTrue(store.TryCreate("My Comedy", out id));
            Assert.IsTrue(store.AddLens(id, "funny-big-eyes"));
            Assert.IsTrue(store.AddLens(id, "funny-jumbo-mouth"));
            Assert.IsFalse(store.AddLens(id, "funny-jumbo-mouth"));
            Assert.IsFalse(store.AddLens(id, "random-remote-script"));
            Assert.AreEqual(2, store.Get(id).lensIds.Count);
            Assert.IsTrue(store.MoveLens(id, "funny-jumbo-mouth", -1));
            Assert.AreEqual("funny-jumbo-mouth", store.Get(id).lensIds[0]);
            Assert.IsFalse(store.MoveLens(id, "funny-jumbo-mouth", -1));
            Assert.IsTrue(store.RemoveLens(id, "funny-big-eyes"));
            Assert.IsFalse(store.RemoveLens(id, "funny-big-eyes"));
            Assert.AreEqual(1, store.Get(id).lensIds.Count);

            var ranked = new List<LensManifest>(LensCatalog.All);
            var visible = LensDiscovery.Browse(id, ranked, new LensTrendFeed(),
                DateTimeOffset.UtcNow, prefs);
            Assert.AreEqual(1, visible.Count);
            Assert.AreEqual("funny-jumbo-mouth", visible[0].Id);
        }

        [Test]
        public void FolderAndLensOrderingIsIndependentOfCatalogRanking()
        {
            string first, second;
            Assert.IsTrue(store.TryCreate("Evening", out first));
            Assert.IsTrue(store.TryCreate("Morning", out second));
            Assert.IsTrue(store.MoveCollection(second, -1));
            Assert.AreEqual(second, store.All()[0].id);
            Assert.IsFalse(store.MoveCollection(second, -1));
            Assert.IsTrue(store.AddLens(second, "dragon"));
            Assert.IsTrue(store.AddLens(second, "cat-ears"));
            Assert.AreEqual("dragon", store.Get(second).lensIds[0]);
            Assert.AreEqual("cat-ears", store.Get(second).lensIds[1]);
            Assert.IsTrue(store.MoveLens(second, "cat-ears", -1));
            Assert.AreEqual("cat-ears", store.Get(second).lensIds[0]);
            Assert.AreEqual(37, LensCatalog.All.Count);
        }

        [Test]
        public void LimitsPreventUnboundedFolderAndLensStorage()
        {
            string id;
            Assert.IsTrue(store.TryCreate("Folder Zero", out id));
            foreach (LensManifest lens in LensCatalog.All)
                Assert.IsTrue(store.AddLens(id, lens.Id), lens.Id);
            Assert.AreEqual(37, store.Get(id).lensIds.Count);
            Assert.IsFalse(store.AddLens(id, "cat-ears"));
            for (int i = 1; i < LensCustomCollections.MaximumCollections; i++)
                Assert.IsTrue(store.TryCreate("Folder " + i, out id));
            Assert.AreEqual(20, store.All().Count);
            Assert.IsFalse(store.TryCreate("Over Limit", out id));
        }

        [Test]
        public void FolderPersistenceIsPerAccountAndRankingResetKeepsFolders()
        {
            string id;
            Assert.IsTrue(store.TryCreate("Private", out id));
            Assert.IsTrue(store.AddLens(id, "dragon"));
            var reloaded = new LensPersonalization();
            Assert.IsTrue(reloaded.ConfigureAccountScope(accountName));
            Assert.AreEqual("Private", reloaded.CustomCollections.Get(id).name);
            prefs.Reset(); // favorite/usage reset is intentionally non-destructive
            Assert.AreEqual(1, store.Get(id).lensIds.Count);

            string second = accountName + "-other";
            try
            {
                Assert.IsTrue(prefs.ConfigureAccountScope(second));
                Assert.AreEqual(0, store.All().Count);
                string theirId;
                Assert.IsTrue(store.TryCreate("Other user", out theirId));
                Assert.IsTrue(prefs.ConfigureAccountScope(accountName));
                Assert.AreEqual(1, store.All().Count);
                Assert.IsNull(store.Get(theirId));
                Assert.AreEqual("dragon", store.Get(id).lensIds[0]);
            }
            finally
            {
                prefs.ConfigureAccountScope(second);
                store.ClearAllCurrentAccountCollections();
                prefs.ConfigureAccountScope(accountName);
            }
        }

        [Test]
        public void MalformedStoreFailsClosedAndDoesNotOverwriteUserData()
        {
            string scope;
            using (var sha = SHA256.Create())
                scope = BitConverter.ToString(
                    sha.ComputeHash(Encoding.UTF8.GetBytes(accountName)))
                    .Replace("-", "").Substring(0, 32).ToLowerInvariant();
            string key = "crushx.lens.v03." + scope + ".custom.collections";
            PlayerPrefs.SetString(key, "{not json");
            PlayerPrefs.Save();
            Assert.IsFalse(store.IsHealthy);
            string id;
            Assert.IsFalse(store.TryCreate("Should not overwrite", out id));
            Assert.AreEqual("{not json", PlayerPrefs.GetString(key));
            // TearDown explicitly removes the intentionally invalid test data.
        }

        [Test]
        public void PerLensQuickSaveCreatesFolderAndMembershipInOneWrite()
        {
            string folderId;
            Assert.IsTrue(store.TryCreateWithLens(
                "My Beauty", "beauty-glow", out folderId));
            Assert.IsTrue(LensCustomCollections.IsCustomId(folderId));
            Assert.IsTrue(store.ContainsLens(folderId, "beauty-glow"));
            Assert.AreEqual(1, store.Get(folderId).lensIds.Count);
            Assert.AreEqual("beauty-glow", store.Get(folderId).lensIds[0]);
            Assert.AreEqual(1, store.All().Count);
            Assert.IsFalse(store.TryCreateWithLens(
                "My Beauty", "beauty-glow", out folderId),
                "Duplicate name must never create another folder");
            Assert.AreEqual(1, store.All().Count);
            Assert.IsFalse(store.TryCreateWithLens(
                "Untrusted", "remote-ar-script", out folderId),
                "Unknown lens must never leave an empty folder behind");
            Assert.AreEqual(1, store.All().Count);
        }

        [Test]
        public void PerLensMembershipCanBeSavedAcrossMultipleFoldersIndependently()
        {
            string first, second;
            Assert.IsTrue(store.TryCreate("My Beauty", out first));
            Assert.IsTrue(store.TryCreate("Party", out second));
            Assert.IsTrue(store.AddLens(first, "beauty-glow"));
            Assert.IsTrue(store.AddLens(second, "beauty-glow"));
            Assert.IsTrue(store.ContainsLens(first, "beauty-glow"));
            Assert.IsTrue(store.ContainsLens(second, "beauty-glow"));
            Assert.IsFalse(store.AddLens(first, "beauty-glow"),
                "Saved lens must not duplicate when pressed twice");
            Assert.IsTrue(store.RemoveLens(first, "beauty-glow"));
            Assert.IsFalse(store.ContainsLens(first, "beauty-glow"));
            Assert.IsTrue(store.ContainsLens(second, "beauty-glow"));
            Assert.AreEqual(37, LensCatalog.All.Count);
        }

        [Test]
        public void QuickSaveMembershipRemainsIsolatedDuringAccountChanges()
        {
            string firstId;
            Assert.IsTrue(store.TryCreateWithLens(
                "Private party", "funny-jumbo-mouth", out firstId));
            string secondAccount = accountName + "-switch";
            try
            {
                Assert.IsTrue(prefs.ConfigureAccountScope(secondAccount));
                Assert.IsFalse(store.ContainsLens(firstId, "funny-jumbo-mouth"));
                string secondId;
                Assert.IsTrue(store.TryCreateWithLens(
                    "Another party", "funny-jumbo-mouth", out secondId));
                Assert.IsTrue(store.ContainsLens(secondId, "funny-jumbo-mouth"));
                Assert.IsTrue(prefs.ConfigureAccountScope(accountName));
                Assert.IsTrue(store.ContainsLens(firstId, "funny-jumbo-mouth"));
                Assert.IsFalse(store.ContainsLens(secondId, "funny-jumbo-mouth"));
            }
            finally
            {
                prefs.ConfigureAccountScope(secondAccount);
                store.ClearAllCurrentAccountCollections();
                prefs.ConfigureAccountScope(accountName);
            }
        }

        [Test]
        public void SnapshotsCannotBeUsedToMutateStoreWithoutApi()
        {
            string id;
            Assert.IsTrue(store.TryCreate("Saved", out id));
            Assert.IsTrue(store.AddLens(id, "dragon"));
            var snapshot = store.Get(id);
            snapshot.name = "Corrupted externally";
            snapshot.lensIds.Add("bad");
            Assert.AreEqual("Saved", store.Get(id).name);
            Assert.AreEqual(1, store.Get(id).lensIds.Count);
        }
    }
}
