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

        [Test]
        public void MissingVideoPreviewRetainsDraftAndDoesNotPretendToPlay()
        {
            var go = new GameObject("Missing video preview test");
            try
            {
                var player = go.AddComponent<MediaPreviewPlayer>();
                string status = null; player.StatusChanged += message => status = message;
                player.Open(Path.Combine(directory, "missing.mp4"), 2, 4, false);
                Assert.IsFalse(player.IsPrepared); Assert.IsFalse(player.IsPlaying); Assert.IsNull(player.Texture);
                Assert.That(status, Does.Contain("draft retained"));
                player.TogglePlayback(); player.StopAndRelease(); player.StopAndRelease();
                Assert.IsNull(player.Texture);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [Test]
        public void GalleryExportInEditorDoesNotReturnAFakeContentUri()
        {
            var go = new GameObject("Unsupported gallery test");
            try
            {
                var capture = go.AddComponent<NativeMediaCapture>(); string failure = null;
                capture.Failed += message => failure = message;
                Assert.IsFalse(capture.SupportsGalleryExport);
                capture.ExportLastSavedToGallery();
                Assert.IsNotEmpty(failure); Assert.IsNull(capture.LastGalleryUri); Assert.IsFalse(capture.GalleryExporting);
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        [Test]
        public void SaveFailureAndDisablePreserveCompletedPrivateDraft()
        {
            string draftRoot = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "drafts");
            string savedRoot = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "saved");
            string name = "qa-" + Guid.NewGuid().ToString("N") + ".png";
            string source = Path.Combine(draftRoot, name), destination = Path.Combine(savedRoot, name);
            var go = new GameObject("Retained photo draft test");
            var texture = new Texture2D(2, 4, TextureFormat.RGBA32, false);
            try
            {
                Directory.CreateDirectory(draftRoot); Directory.CreateDirectory(savedRoot);
                // A conflicting directory makes the real File.Move fail without special platform permissions.
                texture.SetPixels(new Color[8]); texture.Apply();
                Directory.CreateDirectory(destination); File.WriteAllBytes(source, texture.EncodeToPNG());
                var capture = go.AddComponent<NativeMediaCapture>();
                var media = new MediaCaptureResult { Path = source, MediaKind = "photo", MimeType = "image/png", Width = 2, Height = 4 };
                typeof(NativeMediaCapture).GetProperty(nameof(NativeMediaCapture.CurrentState)).SetValue(capture, MediaCaptureState.Preview);
                typeof(NativeMediaCapture).GetProperty(nameof(NativeMediaCapture.PendingMedia)).SetValue(capture, media);
                const BindingFlags flags = BindingFlags.NonPublic | BindingFlags.Instance;
                typeof(NativeMediaCapture).GetField("draftPath", flags).SetValue(capture, source);
                capture.SavePreview();
                Assert.AreEqual(MediaCaptureState.Preview, capture.CurrentState);
                Assert.AreSame(media, capture.PendingMedia); Assert.IsTrue(File.Exists(source));
                Assert.That(capture.StatusMessage, Does.Contain("retained for retry"));
                typeof(NativeMediaCapture).GetMethod("OnDisable", flags).Invoke(capture, null);
                Assert.AreEqual(MediaCaptureState.Preview, capture.CurrentState);
                Assert.AreSame(media, capture.PendingMedia); Assert.IsTrue(File.Exists(source));
                capture.Retry(); Assert.IsFalse(File.Exists(source));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
                UnityEngine.Object.DestroyImmediate(texture);
                if (File.Exists(source)) File.Delete(source);
                if (Directory.Exists(destination)) Directory.Delete(destination);
            }
        }
    }
}
