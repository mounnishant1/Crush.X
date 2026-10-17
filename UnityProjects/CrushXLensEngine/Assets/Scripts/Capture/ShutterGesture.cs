namespace CrushX.LensEngine
{
    [System.Flags]
    public enum ShutterAction
    {
        None = 0,
        Photo = 1,
        StartVideo = 2,
        StopVideo = 4,
        CancelVideo = 8,
        VideoUnavailable = 16
    }

    /// <summary>One decision per press, independent of rendering and input update order.</summary>
    public sealed class ShutterGesture
    {
        public const double HoldSeconds = .4d;
        public bool IsHeld { get; private set; }
        private bool holdDecided, videoRequested;
        private double pressedAt;

        public bool Begin(double now)
        {
            if (IsHeld) return false;
            IsHeld = true;
            holdDecided = false;
            videoRequested = false;
            pressedAt = now;
            return true;
        }

        public ShutterAction Poll(double now, bool supportsVideo)
        {
            if (!IsHeld || holdDecided || now < pressedAt + HoldSeconds) return ShutterAction.None;
            holdDecided = true;
            videoRequested = supportsVideo;
            return supportsVideo ? ShutterAction.StartVideo : ShutterAction.VideoUnavailable;
        }

        public ShutterAction End(double now, bool canceled, bool supportsVideo)
        {
            if (!IsHeld) return ShutterAction.None;
            // A late cancellation must never turn into a tap or start a new recording.
            ShutterAction action = canceled ? (videoRequested ? ShutterAction.CancelVideo : ShutterAction.None) : Poll(now, supportsVideo);
            if (!canceled)
            {
                if (videoRequested) action |= ShutterAction.StopVideo;
                else if (!holdDecided) action |= ShutterAction.Photo;
            }
            IsHeld = false;
            videoRequested = false;
            return action;
        }
    }
}
