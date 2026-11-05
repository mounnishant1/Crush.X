using System;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class RecordingFramePolicyTests
    {
        [TestCase(30, true, true, 30, VideoReadbackPath.AsyncGpuReadback)]
        [TestCase(24, true, true, 24, VideoReadbackPath.AsyncGpuReadback)]
        [TestCase(30, false, true, 15, VideoReadbackPath.SynchronousCompatibility)]
        [TestCase(10, false, true, 10, VideoReadbackPath.SynchronousCompatibility)]
        public void RateSelectionIsExplicitAndDoesNotPretendCompatibilityIsThirty(int requested, bool asyncSupported,
            bool allowCompatibility, int selected, VideoReadbackPath path)
        {
            RecordingRateSelection result = RecordingFramePolicy.Select(requested, asyncSupported, allowCompatibility);
            Assert.AreEqual(requested, result.RequestedFramesPerSecond);
            Assert.AreEqual(selected, result.SelectedFramesPerSecond);
            Assert.AreEqual(path, result.Path);
            Assert.IsNotEmpty(result.Reason);
        }

        [TestCase(0)] [TestCase(-1)] [TestCase(31)]
        public void UnsupportedRatesAreRejected(int requested)
        { Assert.Throws<ArgumentOutOfRangeException>(() => RecordingFramePolicy.Select(requested, true, true)); }

        [Test]
        public void DisallowedCompatibilityFailsWithoutFakeThirtyProfile()
        { Assert.Throws<NotSupportedException>(() => RecordingFramePolicy.Select(30, false, false)); }

        [Test]
        public void SixtyRenderCallbacksWithThirtyUniqueImagesScheduleExactlyThirtyInputs()
        {
            var pacer = new RecordingFramePacer(); pacer.Start(10, 30);
            int scheduled = 0;
            for (int render = 0; render < 60; render++)
                if (pacer.TrySchedule(10 + render / 60d, render / 2)) scheduled++;
            Assert.AreEqual(30, scheduled);
            Assert.AreEqual(0, pacer.SkippedDeadlines);
            // This proves scheduling math, not camera delivery or real encoding throughput.
        }

        [Test]
        public void DelayedFrameSkipsDeadlinesWithoutBurstOrDuplicateImage()
        {
            var pacer = new RecordingFramePacer(); pacer.Start(1, 30);
            Assert.IsTrue(pacer.TrySchedule(1, 100));
            Assert.IsTrue(pacer.TrySchedule(1.2, 101));
            Assert.AreEqual(5, pacer.SkippedDeadlines);
            Assert.IsFalse(pacer.TrySchedule(1.2, 102));
            Assert.IsFalse(pacer.TrySchedule(1.3, 101));
            Assert.IsTrue(pacer.TrySchedule(1.3, 103));
            Assert.AreEqual(3, pacer.ScheduledFrames);
        }

        [Test]
        public void DeadlineGridDoesNotAccumulatePerFrameReadbackTime()
        {
            var pacer = new RecordingFramePacer(); pacer.Start(10, 30);
            int count = 0;
            // Every producer callback arrives 4ms later than the ideal grid, then stays on it.
            for (int i = 0; i < 300; i++) if (pacer.TrySchedule(10.004 + i / 30d, i)) count++;
            Assert.AreEqual(300, count);
            Assert.AreEqual(0, pacer.SkippedDeadlines);
        }

        [Test]
        public void PacerRejectsInvalidAndRegressingClocks()
        {
            var pacer = new RecordingFramePacer();
            Assert.Throws<ArgumentOutOfRangeException>(() => pacer.Start(double.NaN, 30));
            Assert.Throws<ArgumentOutOfRangeException>(() => pacer.Start(0, 31));
            pacer.Start(1, 30);
            Assert.IsFalse(pacer.TrySchedule(1, -1));
            Assert.Throws<ArgumentOutOfRangeException>(() => pacer.TrySchedule(double.PositiveInfinity, 1));
            Assert.Throws<InvalidOperationException>(() => pacer.TrySchedule(.9, 1));
        }

        [TestCase(301L, 0d, 10d, 30d)]
        [TestCase(151L, 0d, 10d, 15d)]
        [TestCase(1L, 0d, 10d, 0d)]
        [TestCase(300L, 5d, 5d, 0d)]
        public void EncodedPresentationRateUsesActualFrameCountAndSpan(long count, double first, double last, double expected)
        { Assert.AreEqual(expected, VideoRecordingMetrics.PresentationRate(count, first, last)); }

        [Test]
        public void NonfinitePresentationMetricsCannotBecomeSuccessfulFrameRate()
        {
            Assert.AreEqual(0, VideoRecordingMetrics.PresentationRate(100, double.NaN, 10));
            Assert.AreEqual(0, VideoRecordingMetrics.PresentationRate(100, 0, double.PositiveInfinity));
            Assert.IsFalse(new VideoRecordingMetrics().NativeMeasurementsAvailable);
        }
    }
}
