using System;

namespace CrushX.LensEngine
{
    public enum VideoReadbackPath { AsyncGpuReadback, SynchronousCompatibility }

    public readonly struct RecordingRateSelection
    {
        public readonly int RequestedFramesPerSecond, SelectedFramesPerSecond;
        public readonly VideoReadbackPath Path;
        public readonly string Reason;
        public RecordingRateSelection(int requested, int selected, VideoReadbackPath path, string reason)
        { RequestedFramesPerSecond = requested; SelectedFramesPerSecond = selected; Path = path; Reason = reason; }
    }

    /// <summary>Negotiates a target; selecting 30 is not evidence that a device delivered 30 frames/s.</summary>
    public static class RecordingFramePolicy
    {
        public const int MaximumFramesPerSecond = 30;
        public const int CompatibilityFramesPerSecond = 15;
        public static RecordingRateSelection Select(int requested, bool asynchronousReadbackSupported, bool allowCompatibility)
        {
            if (requested < 1 || requested > MaximumFramesPerSecond) throw new ArgumentOutOfRangeException(nameof(requested));
            if (asynchronousReadbackSupported)
                return new RecordingRateSelection(requested, requested, VideoReadbackPath.AsyncGpuReadback,
                    "Asynchronous GPU readback selected; actual encoded cadence requires measurement");
            if (!allowCompatibility) throw new NotSupportedException("Asynchronous GPU readback is unavailable; compatibility recording is disabled");
            return new RecordingRateSelection(requested, Math.Min(requested, CompatibilityFramesPerSecond), VideoReadbackPath.SynchronousCompatibility,
                "GPU readback is unavailable; explicit synchronous compatibility path is limited to 15 FPS");
        }
    }

    /// <summary>Deadlines stay on the original time grid. Late frames skip deadlines instead of creating duplicates.</summary>
    public sealed class RecordingFramePacer
    {
        private double origin, lastNow;
        private int fps;
        private long nextTick, lastImageSequence;
        private bool started;
        public long ScheduledFrames { get; private set; }
        public long SkippedDeadlines { get; private set; }

        public void Start(double now, int framesPerSecond)
        {
            RequireTime(now);
            if (framesPerSecond < 1 || framesPerSecond > RecordingFramePolicy.MaximumFramesPerSecond)
                throw new ArgumentOutOfRangeException(nameof(framesPerSecond));
            origin = lastNow = now; fps = framesPerSecond; nextTick = 0; lastImageSequence = -1;
            ScheduledFrames = SkippedDeadlines = 0; started = true;
        }

        public bool TrySchedule(double now, long imageSequence)
        {
            RequireTime(now);
            if (!started || now < lastNow) throw new InvalidOperationException("Recording pacing clock must be monotonic");
            lastNow = now;
            if (imageSequence < 0 || imageSequence <= lastImageSequence) return false;
            double elapsedTicks = (now - origin) * fps;
            if (elapsedTicks > long.MaxValue - 2) throw new ArgumentOutOfRangeException(nameof(now));
            long due = (long)Math.Floor(elapsedTicks + 1e-7);
            if (due < nextTick) return false;
            SkippedDeadlines += due - nextTick;
            nextTick = due + 1; lastImageSequence = imageSequence; ScheduledFrames++;
            return true;
        }

        private static void RequireTime(double now)
        { if (double.IsNaN(now) || double.IsInfinity(now) || now < 0) throw new ArgumentOutOfRangeException(nameof(now)); }
    }

    [Serializable]
    public sealed class VideoRecordingMetrics
    {
        public int RequestedFramesPerSecond, SelectedFramesPerSecond;
        public string ReadbackPath, SelectionReason, ReadbackRowLayout, AudioClockSource;
        public string DeviceModel, GraphicsApi, UnityVersion, EncoderName;
        public bool EncoderHardwareKnown, EncoderHardwareAccelerated;
        public long RenderedFrames, ReadbackRequests, ReadbackCompleted, ReadbackFailures,
            ReadbackBackpressureDrops, NativeBackpressureDrops, SubmittedFrames, EncodedFrames,
            EncoderDroppedFrames, SkippedDeadlines, NativeAcceptedFrames, NativeRejectedFrames, CodecQueuedFrames;
        public double CaptureElapsedSeconds, MeanReadbackLatencyMilliseconds, MaxReadbackLatencyMilliseconds,
            FirstEncodedPresentationSeconds, LastEncodedPresentationSeconds, AudioStartOffsetSeconds, NativeCaptureStopSeconds;
        public double EncodedPresentationFramesPerSecond;
        // True only after counters were read from a completed actual native recording, never from a requested rate.
        public bool NativeMeasurementsAvailable;

        public static double PresentationRate(long encodedFrames, double first, double last)
        {
            if (encodedFrames < 2 || double.IsNaN(first) || double.IsInfinity(first) || double.IsNaN(last) ||
                double.IsInfinity(last) || first < 0 || last <= first) return 0;
            return (encodedFrames - 1) / (last - first);
        }
    }
}
