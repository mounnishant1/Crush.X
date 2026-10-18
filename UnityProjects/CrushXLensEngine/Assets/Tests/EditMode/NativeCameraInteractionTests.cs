using System;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

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

        [TestCase(-1, 1, 3, 0)]
        [TestCase(-1, -1, 3, 2)]
        [TestCase(0, -1, 3, 2)]
        [TestCase(2, 1, 3, 0)]
        [TestCase(-1, 1, 1, 0)]
        [TestCase(-1, 1, 0, -1)]
        public void FilteredNavigation_EntersFirstOrLastResultWhenActiveLensIsAbsent(int current, int direction, int count, int expected)
        { Assert.AreEqual(expected, CrushXSmartCarousel.NextResultIndex(current, direction, count)); }

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
        public void DragIsNotTap_AndVerticalMotionIsNotSwipe()
        {
            Assert.IsFalse(CrushXCameraSwipe.IsTap(Vector2.zero, new Vector2(100, 0), 1));
            Assert.AreEqual(0, CrushXCameraSwipe.SwipeStep(Vector2.zero, new Vector2(90, 200), 440));
        }

        [Test]
        public void CameraFlip_UsesActualFacingDirectionAndRejectsUnknownDirections()
        {
            Assert.AreEqual(CameraFacingDirection.World, NativeLensUI.OppositeFacing(CameraFacingDirection.User));
            Assert.AreEqual(CameraFacingDirection.User, NativeLensUI.OppositeFacing(CameraFacingDirection.World));
            Assert.AreEqual(CameraFacingDirection.None, NativeLensUI.OppositeFacing(CameraFacingDirection.None));
        }

        [Test]
        public void AutoSliding_StopsDuringUserInputAndDoesNotCycleFaceLensesOnRearCamera()
        {
            Assert.IsTrue(CrushXSmartCarousel.CanAutoAdvance(3, true, false, false, false, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(1, true, false, false, false, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(3, false, false, false, false, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(3, true, true, false, false, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(3, true, false, true, false, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(3, true, false, false, true, false));
            Assert.IsFalse(CrushXSmartCarousel.CanAutoAdvance(3, true, false, false, false, true));
        }

        [TestCase("", MediaCaptureState.Idle, "Ready", "")]
        [TestCase("Saved to favorites", MediaCaptureState.Idle, "Ready", "Saved to favorites")]
        [TestCase("", MediaCaptureState.Idle, "Saved privately on this device", "Saved privately on this device")]
        [TestCase("", MediaCaptureState.Idle, "Microphone access allowed", "Microphone access allowed")]
        [TestCase("Saved to favorites", MediaCaptureState.Error, "Photo capture failed", "Photo capture failed")]
        [TestCase("Saved to favorites", MediaCaptureState.Finalizing, "Finishing MP4", "Finishing MP4")]
        public void CameraNotice_DoesNotClaimIdleCaptureMeansTrackingReadyOrHideCaptureErrors(
            string lensNotice, MediaCaptureState state, string message, string expected)
        {
            Assert.AreEqual(expected, NativeLensUI.ComposeCameraNotice(lensNotice, state, message));
        }
    }
}
