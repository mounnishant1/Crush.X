using System;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class NativeCameraInteractionTests
    {
        [TestCase(-2, 1, 0)]
        [TestCase(-2, 2, 0)]
        [TestCase(-1, 2, 1)]
        [TestCase(int.MinValue, 3, 1)]
        [TestCase(5, 0, -1)]
        public void CircularIndex_HandlesSmallListsAndOverflow(int index, int count, int expected)
        { Assert.AreEqual(expected, CrushXSmartCarousel.WrappedIndex(index, count)); }

        [Test]
        public void SafeArea_DrawingAndTouchCoordinatesAgree()
        {
            var layout = NativeCameraLayout.Create(1440, 3200, new Rect(0, 100, 1440, 3000));
            Rect shutter = layout.Shutter;
            Vector2 pixel = layout.Origin + shutter.center * layout.Scale;
            Vector2 gui = layout.ToGui(new Vector2(pixel.x, 3200 - pixel.y), 3200);
            Assert.That(gui.x, Is.EqualTo(shutter.center.x).Within(.001f));
            Assert.That(gui.y, Is.EqualTo(shutter.center.y).Within(.001f));
            Assert.That(layout.Origin.y, Is.EqualTo(100f));
            Assert.IsFalse(layout.CameraGesture(false).Overlaps(layout.Carousel));
            Assert.IsFalse(layout.CameraGesture(false).Overlaps(layout.Categories));
            Assert.IsFalse(layout.Tabs.Overlaps(layout.Categories));
            Assert.IsFalse(layout.Categories.Overlaps(layout.Carousel));
            Assert.IsFalse(layout.Favorite.Overlaps(layout.Shutter));
        }

        [Test]
        public void Filtering_UsesOnlyExistingFavoritesAndDeduplicatedRecentIds()
        {
            var favorites = CrushXSmartCarousel.BuildResults(LensCatalog.All, LensBrowseFilter.Favorites, "", id => id == "fox", null);
            Assert.AreEqual(1, favorites.Count);
            Assert.AreEqual("fox", favorites[0].Id);
            var recents = CrushXSmartCarousel.BuildResults(LensCatalog.All, LensBrowseFilter.Recent, "", null,
                new[] { "missing", "puppy", "puppy", "fox" });
            Assert.AreEqual(2, recents.Count);
            Assert.AreEqual("puppy", recents[0].Id);
            Assert.AreEqual("fox", recents[1].Id);
        }

        [Test]
        public void Search_IsCaseInsensitiveAndDoesNotMutateBrowseOrder()
        {
            string first = LensCatalog.All[0].Id;
            var matches = CrushXSmartCarousel.BuildResults(LensCatalog.All, LensBrowseFilter.All, "FOX MASK", null, null);
            Assert.AreEqual(1, matches.Count);
            Assert.AreEqual("fox-mask-3d", matches[0].Id);
            Assert.AreEqual(first, LensCatalog.All[0].Id);
        }

        [Test]
        public void Categories_AreRealCatalogCategoriesAndWrapThroughAll()
        {
            var categories = CrushXSmartCarousel.AvailableCategories(LensCatalog.All);
            CollectionAssert.AreEqual(new[] { LensCategory.Animals, LensCategory.Beauty,
                LensCategory.SciFi, LensCategory.Fantasy, LensCategory.Aesthetic }, categories);
            Assert.AreEqual(LensCategory.Animals, CrushXSmartCarousel.NextCategory(categories, null, 1));
            Assert.IsNull(CrushXSmartCarousel.NextCategory(categories, LensCategory.Animals, -1));
            Assert.AreEqual(LensCategory.Aesthetic, CrushXSmartCarousel.NextCategory(categories, null, -1));
            Assert.IsNull(CrushXSmartCarousel.NextCategory(categories, LensCategory.Aesthetic, 1));
            Assert.IsNull(CrushXSmartCarousel.NextCategory(Array.Empty<LensCategory>(), null, 1));
        }

        [Test]
        public void CategoryCombinesWithFavoritesRecentAndSearch()
        {
            var favoriteAnimals = CrushXSmartCarousel.BuildResults(LensCatalog.All,
                LensBrowseFilter.Favorites, "fox", id => id == "fox" || id == "cyber-visor",
                null, LensCategory.Animals);
            Assert.AreEqual(1, favoriteAnimals.Count);
            Assert.AreEqual("fox", favoriteAnimals[0].Id);
            var recentAnimals = CrushXSmartCarousel.BuildResults(LensCatalog.All,
                LensBrowseFilter.Recent, "", null, new[] { "cyber-visor", "puppy", "puppy", "fox" }, LensCategory.Animals);
            Assert.AreEqual(2, recentAnimals.Count);
            Assert.AreEqual("puppy", recentAnimals[0].Id);
            Assert.AreEqual("fox", recentAnimals[1].Id);
            var unavailable = CrushXSmartCarousel.BuildResults(LensCatalog.All,
                LensBrowseFilter.All, "", null, null, LensCategory.Gaming);
            Assert.IsEmpty(unavailable);
        }

        [Test]
        public void DragIsNotTap_AndVerticalMotionIsNotSwipe()
        {
            Assert.IsFalse(CrushXCameraSwipe.IsTap(Vector2.zero, new Vector2(100, 0), 1));
            Assert.AreEqual(0, CrushXCameraSwipe.SwipeStep(Vector2.zero, new Vector2(90, 200), 440));
        }

        [Test]
        public void CircularLensBubbles_FitWithinTheirExistingTouchTargets()
        {
            Rect bounds = new Rect(0, 0, 440, 88);
            for (int slot = 0; slot < 5; slot++)
            {
                Rect card = CrushXSmartCarousel.CardRect(bounds, slot, 5);
                Rect bubble = CrushXSmartCarousel.BubbleRect(card);
                Assert.Greater(bubble.width, 0);
                Assert.That(bubble.xMin, Is.GreaterThanOrEqualTo(card.xMin));
                Assert.That(bubble.xMax, Is.LessThanOrEqualTo(card.xMax));
                Assert.That(bubble.yMin, Is.GreaterThanOrEqualTo(card.yMin));
                Assert.That(bubble.yMax + 29f, Is.LessThanOrEqualTo(card.yMax));
            }
        }
    }
}
