using System;

namespace CrushX.LensEngine
{
    public enum CaptureMirrorMode { MatchPreview, FlipHorizontally }

    /// <summary>Shared capture transitions and liveness rules; independent of rendering and Android codecs.</summary>
    public static class CaptureLifecyclePolicy
    {
        public static bool CanBegin(MediaCaptureState state) => state == MediaCaptureState.Idle || state == MediaCaptureState.Error;
        public static bool CanCancelShutter(MediaCaptureState state) => state == MediaCaptureState.Preparing || state == MediaCaptureState.Recording;
        public static bool IsInFlight(MediaCaptureState state) => state == MediaCaptureState.Preparing
            || state == MediaCaptureState.CapturingPhoto || state == MediaCaptureState.Recording || state == MediaCaptureState.Finalizing;

        public static bool CanTransition(MediaCaptureState current, MediaCaptureState next, bool restoringCompletedDraft = false)
        {
            if (!Enum.IsDefined(typeof(MediaCaptureState), current) || !Enum.IsDefined(typeof(MediaCaptureState), next)) return false;
            if (current == next || next == MediaCaptureState.Idle || next == MediaCaptureState.Error) return true;
            switch (current)
            {
                case MediaCaptureState.Idle:
                case MediaCaptureState.Error:
                    return next == MediaCaptureState.Preparing || next == MediaCaptureState.CapturingPhoto
                        || (restoringCompletedDraft && next == MediaCaptureState.Preview);
                case MediaCaptureState.Preparing: return next == MediaCaptureState.Recording;
                case MediaCaptureState.CapturingPhoto: return next == MediaCaptureState.Preview;
                case MediaCaptureState.Recording: return next == MediaCaptureState.Finalizing;
                case MediaCaptureState.Finalizing: return next == MediaCaptureState.Preview;
                default: return false;
            }
        }
    }

    /// <summary>A rendered callback alone does not prove capture progress. Both accepted frames and
    /// actual encoder output must advance. Counters are monotonically increasing within one recording.</summary>
    public sealed class CaptureFrameProgressPolicy
    {
        public const double TimeoutSeconds = 3d;
        private double lastAcceptedAt, lastEncodedAt;
        private long accepted, encoded;
        private bool started;

        public void Start(double now)
        {
            RequireTime(now);
            started = true; accepted = encoded = 0;
            lastAcceptedAt = lastEncodedAt = now;
        }

        public void Observe(double now, long acceptedFrames, long encodedFrames)
        {
            RequireTime(now);
            if (!started || now < Math.Max(lastAcceptedAt, lastEncodedAt)) throw new InvalidOperationException("Capture clock did not advance monotonically");
            if (acceptedFrames < accepted || encodedFrames < encoded || encodedFrames > acceptedFrames)
                throw new InvalidOperationException("Recorder frame counters are inconsistent");
            if (acceptedFrames > accepted) lastAcceptedAt = now;
            if (encodedFrames > encoded) lastEncodedAt = now;
            accepted = acceptedFrames; encoded = encodedFrames;
        }

        public string Failure(double now)
        {
            RequireTime(now);
            if (!started) throw new InvalidOperationException("Capture progress has not started");
            if (now - lastAcceptedAt >= TimeoutSeconds) return "Recording stopped receiving rendered frames";
            if (now - lastEncodedAt >= TimeoutSeconds) return "Video encoder stopped producing encoded frames";
            return null;
        }

        private static void RequireTime(double now)
        {
            if (double.IsNaN(now) || double.IsInfinity(now) || now < 0) throw new ArgumentOutOfRangeException(nameof(now));
        }
    }
}
