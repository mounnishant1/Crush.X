using System;

namespace CrushX.LensEngine
{
    [Serializable]
    public struct FaceIdentity : IEquatable<FaceIdentity>
    {
        public ulong First;
        public ulong Second;
        public FaceIdentity(ulong first, ulong second) { First = first; Second = second; }
        public bool IsKnown { get { return First != 0 || Second != 0; } }
        public bool Equals(FaceIdentity other) { return First == other.First && Second == other.Second; }
        public override bool Equals(object value) { return value is FaceIdentity other && Equals(other); }
        public override int GetHashCode() { unchecked { return (First.GetHashCode() * 397) ^ Second.GetHashCode(); } }
        public static bool operator ==(FaceIdentity a, FaceIdentity b) { return a.Equals(b); }
        public static bool operator !=(FaceIdentity a, FaceIdentity b) { return !a.Equals(b); }
    }

    public enum TrackingSampleRejection { None, Invalid, LowConfidence, Stale, Future, RepeatedOrOutOfOrder }

    /// <summary>Monotonic local-clock policy. Re-polling an old inference result never extends its lifetime.</summary>
    public sealed class TrackingSampleGate
    {
        public const double FutureToleranceSeconds = .02;
        public FaceIdentity Identity { get; private set; }
        public double Timestamp { get; private set; } = double.NegativeInfinity;
        public bool HasSample { get; private set; }
        public TrackingSampleRejection LastRejection { get; private set; }

        public bool TryAccept(FaceIdentity identity, double timestamp, double now, float confidence,
            double maximumAge, float minimumConfidence, bool validPose, out bool resetInterpolation)
        {
            resetInterpolation = false;
            if (!validPose || !Finite(timestamp) || !Finite(now) || timestamp < 0 || now < 0 ||
                !Finite(confidence) || confidence < 0 || confidence > 1 ||
                !Finite(maximumAge) || maximumAge <= 0 || !Finite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1)
                return Reject(TrackingSampleRejection.Invalid);
            if (confidence < minimumConfidence) return Reject(TrackingSampleRejection.LowConfidence);
            if (timestamp > now + FutureToleranceSeconds) return Reject(TrackingSampleRejection.Future);
            if (now - timestamp >= maximumAge) return Reject(TrackingSampleRejection.Stale);
            bool sameIdentity = HasSample && identity == Identity;
            if (sameIdentity && timestamp <= Timestamp) return Reject(TrackingSampleRejection.RepeatedOrOutOfOrder);
            resetInterpolation = !sameIdentity || !IsTrackingAt(now, maximumAge);
            Identity = identity;
            Timestamp = timestamp;
            HasSample = true;
            LastRejection = TrackingSampleRejection.None;
            return true;
        }

        public bool IsTrackingAt(double now, double maximumAge)
        {
            return HasSample && Finite(now) && Finite(maximumAge) && maximumAge > 0 &&
                now + FutureToleranceSeconds >= Timestamp && now - Timestamp < maximumAge;
        }

        public void Reset()
        {
            HasSample = false;
            Identity = default;
            Timestamp = double.NegativeInfinity;
            LastRejection = TrackingSampleRejection.None;
        }

        private bool Reject(TrackingSampleRejection reason) { LastRejection = reason; return false; }
        public static bool Finite(double value) { return !double.IsNaN(value) && !double.IsInfinity(value); }
        public static float HalfLifeWeight(float deltaSeconds, float halfLife)
        {
            if (!Finite(deltaSeconds) || deltaSeconds <= 0) return 0;
            if (!Finite(halfLife) || halfLife <= 0) return 1;
            return (float)(1 - Math.Pow(.5, Math.Min(deltaSeconds, .1f) / halfLife));
        }
    }
}
