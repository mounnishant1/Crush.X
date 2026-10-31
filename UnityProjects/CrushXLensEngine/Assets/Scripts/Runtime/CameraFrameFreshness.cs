using System;

namespace CrushX.LensEngine
{
    /// <summary>A frame callback is not proof of new image data. Prefer provider sensor timestamps;
    /// providers without timestamps can only be checked for monotonic callback receipts.</summary>
    public sealed class CameraFrameFreshness
    {
        private bool accepted, timestamped;
        private double lastReceipt;
        private long lastTimestamp;

        public void Reset()
        {
            accepted = timestamped = false;
            lastReceipt = 0;
            lastTimestamp = 0;
        }

        public bool TryAccept(bool textureReady, long? timestampNs, double receiptSeconds)
        {
            if (!textureReady || double.IsNaN(receiptSeconds) || double.IsInfinity(receiptSeconds) || receiptSeconds < 0)
                return false;
            if (accepted && receiptSeconds <= lastReceipt) return false;
            // Once a source supplies sensor time, missing values must not turn repeated stale events into fresh data.
            if (timestamped && !timestampNs.HasValue) return false;
            if (timestampNs.HasValue)
            {
                if (timestampNs.Value < 0 || (timestamped && timestampNs.Value <= lastTimestamp)) return false;
                lastTimestamp = timestampNs.Value;
                timestamped = true;
            }
            accepted = true;
            lastReceipt = receiptSeconds;
            return true;
        }
    }
}
