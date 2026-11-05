using System;
using System.IO;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class CapturePolicyTests
    {
        [TestCase(MediaCaptureState.Idle, MediaCaptureState.Preparing)]
        [TestCase(MediaCaptureState.Preparing, MediaCaptureState.Recording)]
        [TestCase(MediaCaptureState.Recording, MediaCaptureState.Finalizing)]
        [TestCase(MediaCaptureState.Finalizing, MediaCaptureState.Preview)]
        [TestCase(MediaCaptureState.CapturingPhoto, MediaCaptureState.Preview)]
        [TestCase(MediaCaptureState.Preview, MediaCaptureState.Idle)]
        public void RealCaptureTransitionsAreAllowed(MediaCaptureState from, MediaCaptureState to)
        { Assert.IsTrue(CaptureLifecyclePolicy.CanTransition(from, to)); }

        [TestCase(MediaCaptureState.Idle, MediaCaptureState.Recording)]
        [TestCase(MediaCaptureState.Preparing, MediaCaptureState.Preview)]
        [TestCase(MediaCaptureState.Recording, MediaCaptureState.Preview)]
        [TestCase(MediaCaptureState.Preview, MediaCaptureState.Recording)]
        public void OutputCannotSkipEncodingAndFinalization(MediaCaptureState from, MediaCaptureState to)
        { Assert.IsFalse(CaptureLifecyclePolicy.CanTransition(from, to)); }

        [Test]
        public void OnlyExplicitCompletedDraftRecoveryCanRestorePreviewFromIdle()
        {
            Assert.IsFalse(CaptureLifecyclePolicy.CanTransition(MediaCaptureState.Idle, MediaCaptureState.Preview));
            Assert.IsTrue(CaptureLifecyclePolicy.CanTransition(MediaCaptureState.Idle, MediaCaptureState.Preview, true));
            Assert.IsFalse(CaptureLifecyclePolicy.CanTransition((MediaCaptureState)999, MediaCaptureState.Idle));
            Assert.IsFalse(CaptureLifecyclePolicy.CanCancelShutter(MediaCaptureState.Finalizing));
            Assert.IsFalse(CaptureLifecyclePolicy.CanCancelShutter(MediaCaptureState.Preview));
            Assert.IsTrue(CaptureLifecyclePolicy.CanCancelShutter(MediaCaptureState.Preparing));
        }

        [Test]
        public void ReceivingRenderCallbacksWithoutSubmittedFramesTimesOut()
        {
            var progress = new CaptureFrameProgressPolicy(); progress.Start(100);
            progress.Observe(102, 0, 0);
            Assert.IsNull(progress.Failure(102.99));
            Assert.That(progress.Failure(103), Does.Contain("rendered frames"));
        }

        [Test]
        public void AcceptedFramesDoNotHideAnEncoderStall()
        {
            var progress = new CaptureFrameProgressPolicy(); progress.Start(0);
            progress.Observe(1, 2, 0); progress.Observe(2.9, 3, 0);
            Assert.That(progress.Failure(3), Does.Contain("encoded frames"));
        }

        [Test]
        public void RepeatedCountersDoNotRefreshTheWatchdogAndANewRecordingResetsIt()
        {
            var progress = new CaptureFrameProgressPolicy(); progress.Start(0);
            progress.Observe(1, 2, 1); progress.Observe(3.99, 2, 1);
            Assert.IsNull(progress.Failure(3.99));
            Assert.IsNotNull(progress.Failure(4));
            progress.Start(5); progress.Observe(6, 1, 1);
            Assert.IsNull(progress.Failure(8.99));
        }

        [Test]
        public void InvalidNativeCountersAndClockInputsFailInsteadOfExtendingRecording()
        {
            var progress = new CaptureFrameProgressPolicy();
            Assert.Throws<ArgumentOutOfRangeException>(() => progress.Start(double.NaN));
            progress.Start(10); progress.Observe(11, 2, 1);
            Assert.Throws<InvalidOperationException>(() => progress.Observe(12, 1, 1));
            Assert.Throws<InvalidOperationException>(() => progress.Observe(12, 2, 3));
            Assert.Throws<InvalidOperationException>(() => progress.Observe(9, 2, 1));
        }
    }

    public sealed class CaptureContainerTests
    {
        private string directory;
        [SetUp] public void SetUp() { directory = Path.Combine(Path.GetTempPath(), "crushx-containers-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); }
        [TearDown] public void TearDown() { Directory.Delete(directory, true); }

        [Test]
        public void PngRequiresCompleteChunksAndTerminalImageEnd()
        {
            byte[] png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=");
            string file = Path.Combine(directory, "photo.png"); File.WriteAllBytes(file, png);
            Assert.IsTrue(CaptureFileValidation.IsPng(file, 1, 1));
            Assert.IsFalse(CaptureFileValidation.IsPng(file, 2, 1));
            for (int size = 0; size < png.Length; size++)
            { File.WriteAllBytes(file, new ArraySegment<byte>(png, 0, size).ToArray()); Assert.IsFalse(CaptureFileValidation.IsPng(file, 1, 1), "Accepted truncated PNG length " + size); }
            png[33] = 255; File.WriteAllBytes(file, png);
            Assert.IsFalse(CaptureFileValidation.IsPng(file, 1, 1));
        }

        [Test]
        public void Mp4RejectsMissingMetadataTruncationAndOverflowingBoxLengths()
        {
            // These boxes exercise container structure only; they are not represented as playable media.
            byte[] boxes = new byte[128]; WriteBox(boxes, 0, 24, "ftyp"); WriteBox(boxes, 24, 32, "mdat"); WriteBox(boxes, 56, 72, "moov");
            string file = Path.Combine(directory, "structure.mp4"); File.WriteAllBytes(file, boxes);
            Assert.IsTrue(CaptureFileValidation.IsMp4(file));
            boxes[60] = (byte)'f'; File.WriteAllBytes(file, boxes); Assert.IsFalse(CaptureFileValidation.IsMp4(file));
            WriteBox(boxes, 56, 73, "moov"); File.WriteAllBytes(file, boxes); Assert.IsFalse(CaptureFileValidation.IsMp4(file));
            boxes[56] = 255; File.WriteAllBytes(file, boxes); Assert.IsFalse(CaptureFileValidation.IsMp4(file));
            File.WriteAllBytes(file, new byte[256]); Assert.IsFalse(CaptureFileValidation.IsMp4(file));
        }

        [Test]
        public void ControlledPathsFailClosedOnMalformedRelativeAndSiblingPaths()
        {
            Assert.IsFalse(CaptureFileValidation.IsControlledPath("relative.png", directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath("\0", directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath(Path.Combine(directory + "-other", "file.png"), directory));
            Assert.IsFalse(CaptureFileValidation.IsControlledPath(Path.Combine(directory, "..", "file.png"), directory));
            Assert.IsTrue(CaptureFileValidation.IsControlledPath(Path.Combine(directory, "file.png"), directory));
        }

        private static void WriteBox(byte[] bytes, int offset, int length, string type)
        {
            bytes[offset] = (byte)(length >> 24); bytes[offset + 1] = (byte)(length >> 16); bytes[offset + 2] = (byte)(length >> 8); bytes[offset + 3] = (byte)length;
            for (int index = 0; index < 4; index++) bytes[offset + 4 + index] = (byte)type[index];
        }
    }
}
