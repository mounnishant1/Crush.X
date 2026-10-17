using System;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class MediaCaptureTests
    {
        private string directory;

        [SetUp]
        public void SetUp()
        {
            directory = Path.Combine(Path.GetTempPath(), "crushx-capture-tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
        }

        [TearDown]
        public void TearDown() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

        [Test]
        public void ControlledPathsRejectSiblingPrefixAndTraversal()
        {
            Assert.IsTrue(CaptureFileValidation.IsControlledPath(Path.Combine(directory, "photo.png"), directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath(Path.Combine(directory + "-other", "photo.png"), directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath(Path.Combine(directory, "..", "outside.png"), directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath(null, directory));
        }

        [Test]
        public void PhotoValidationChecksSavedPngDimensionsAndTruncation()
        {
            var texture = new Texture2D(2, 4, TextureFormat.RGBA32, false);
            try
            {
                texture.SetPixels(new Color[8]); texture.Apply();
                string path = Path.Combine(directory, "actual.png");
                File.WriteAllBytes(path, texture.EncodeToPNG());
                Assert.IsTrue(CaptureFileValidation.IsPng(path, 2, 4));
                Assert.IsFalse(CaptureFileValidation.IsPng(path, 4, 2));
                File.WriteAllBytes(path, new byte[] { 137, 80, 78, 71 });
                Assert.IsFalse(CaptureFileValidation.IsPng(path, 2, 4));
                Assert.IsFalse(CaptureFileValidation.IsPng(Path.Combine(directory, "missing.png"), 2, 4));
            }
            finally { UnityEngine.Object.DestroyImmediate(texture); }
        }

        [Test]
        public void UnsupportedEditorVideoDoesNotPretendToRecord()
        {
            var go = new GameObject("CaptureServiceTest");
            try
            {
                var capture = go.AddComponent<NativeMediaCapture>();
                Assert.IsFalse(capture.SupportsVideo);
                string failure = null;
                capture.Failed += message => failure = message;
                capture.StartVideo(false);
                Assert.AreEqual(MediaCaptureState.Error, capture.CurrentState);
                Assert.AreEqual(capture.VideoCapabilityReason, failure);
                Assert.IsNull(capture.PendingMedia);
                capture.Retry();
                Assert.AreEqual(MediaCaptureState.Idle, capture.CurrentState);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [TestCase(MediaCaptureState.Preview, "EndShutter")]
        [TestCase(MediaCaptureState.Finalizing, "EndShutter")]
        [TestCase(MediaCaptureState.Preview, "OnApplicationPause")]
        [TestCase(MediaCaptureState.Finalizing, "OnApplicationPause")]
        [TestCase(MediaCaptureState.Preview, "OnApplicationFocus")]
        [TestCase(MediaCaptureState.Finalizing, "OnApplicationFocus")]
        [TestCase(MediaCaptureState.Preview, "OnDisable")]
        [TestCase(MediaCaptureState.Finalizing, "OnDisable")]
        public void CanceledShutterOrLifecycle_PreservesCompletedOrFinalizingVideo(MediaCaptureState state, string cancelMethod)
        {
            var go = new GameObject("Completed clip gesture test");
            try
            {
                var capture = go.AddComponent<NativeMediaCapture>();
                var ui = go.AddComponent<NativeLensUI>();
                typeof(NativeMediaCapture).GetProperty(nameof(NativeMediaCapture.CurrentState)).SetValue(capture, state);
                var pending = new MediaCaptureResult { MediaKind = "video" };
                typeof(NativeMediaCapture).GetProperty(nameof(NativeMediaCapture.PendingMedia)).SetValue(capture, pending);
                const BindingFlags fields = BindingFlags.NonPublic | BindingFlags.Instance;
                typeof(NativeLensUI).GetField("capture", fields).SetValue(ui, capture);
                var gesture = (ShutterGesture)typeof(NativeLensUI).GetField("shutterGesture", fields).GetValue(ui);
                gesture.Begin(0d);
                gesture.Poll(ShutterGesture.HoldSeconds, true);
                if (cancelMethod == "EndShutter") ui.EndShutter(true);
                else
                {
                    object[] arguments = cancelMethod == "OnDisable" ? null : new object[] { cancelMethod == "OnApplicationPause" };
                    typeof(NativeLensUI).GetMethod(cancelMethod, fields).Invoke(ui, arguments);
                }
                Assert.AreEqual(state, capture.CurrentState);
                Assert.AreSame(pending, capture.PendingMedia);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [Test]
        public void ReleaseWhilePreparingReportsTooShortWithoutPhotoFallback()
        {
            var go = new GameObject("Preparing clip release test");
            try
            {
                var capture = go.AddComponent<NativeMediaCapture>();
                var ui = go.AddComponent<NativeLensUI>();
                typeof(NativeMediaCapture).GetProperty(nameof(NativeMediaCapture.CurrentState)).SetValue(capture, MediaCaptureState.Preparing);
                const BindingFlags fields = BindingFlags.NonPublic | BindingFlags.Instance;
                typeof(NativeLensUI).GetField("capture", fields).SetValue(ui, capture);
                var gesture = (ShutterGesture)typeof(NativeLensUI).GetField("shutterGesture", fields).GetValue(ui);
                gesture.Begin(0d);
                gesture.Poll(ShutterGesture.HoldSeconds, true);
                ui.EndShutter(false);
                Assert.AreEqual(MediaCaptureState.Error, capture.CurrentState);
                Assert.That(capture.StatusMessage, Does.Contain("too short"));
                Assert.IsNull(capture.PendingMedia);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [Test]
        public void BackCancelsPendingShutterBeforeClosingSearchWithoutCapture()
        {
            var go = new GameObject("Back while holding shutter test");
            try
            {
                var capture = go.AddComponent<NativeMediaCapture>();
                var ui = go.AddComponent<NativeLensUI>();
                const BindingFlags fields = BindingFlags.NonPublic | BindingFlags.Instance;
                typeof(NativeLensUI).GetField("capture", fields).SetValue(ui, capture);
                typeof(NativeLensUI).GetField("searchVisible", fields).SetValue(ui, true);
                // Search closure calls carousel.SetQuery; use the component created during normal setup.
                var carousel = go.AddComponent<CrushXSmartCarousel>();
                typeof(NativeLensUI).GetField("carousel", fields).SetValue(ui, carousel);
                var gesture = (ShutterGesture)typeof(NativeLensUI).GetField("shutterGesture", fields).GetValue(ui);
                gesture.Begin(0d);
                typeof(NativeLensUI).GetMethod("Back", fields).Invoke(ui, null);
                Assert.IsFalse(gesture.IsHeld);
                Assert.AreEqual(ShutterAction.None, gesture.Poll(10d, true));
                Assert.AreEqual(MediaCaptureState.Idle, capture.CurrentState);
                Assert.IsNull(capture.PendingMedia);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [Test]
        public void MissingVideoPreview_DoesNotPretendToPlayOrAllocateATexture()
        {
            var go = new GameObject("Missing video preview test");
            try
            {
                var player = go.AddComponent<MediaPreviewPlayer>();
                string status = null;
                player.StatusChanged += message => status = message;
                player.Open(Path.Combine(directory, "missing.mp4"), 2, 4, false);
                Assert.IsFalse(player.IsPrepared);
                Assert.IsFalse(player.IsPlaying);
                Assert.IsNull(player.Texture);
                Assert.That(status, Does.Contain("draft retained"));
                player.TogglePlayback();
                player.StopAndRelease(); player.StopAndRelease();
                Assert.IsNull(player.Texture);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }
    }
}
