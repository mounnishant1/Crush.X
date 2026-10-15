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
                Assert.IsNotEmpty(failure);
                Assert.IsNull(capture.PendingMedia);
                capture.Retry();
                Assert.AreEqual(MediaCaptureState.Idle, capture.CurrentState);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [TestCase(MediaCaptureState.Preview)]
        [TestCase(MediaCaptureState.Finalizing)]
        public void CanceledStaleShutter_PreservesCompletedOrFinalizingVideo(MediaCaptureState state)
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
                typeof(NativeLensUI).GetField("shutterHeld", fields).SetValue(ui, true);
                typeof(NativeLensUI).GetField("videoStarted", fields).SetValue(ui, true);
                ui.EndShutter(true);
                Assert.AreEqual(state, capture.CurrentState);
                Assert.AreSame(pending, capture.PendingMedia);
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
