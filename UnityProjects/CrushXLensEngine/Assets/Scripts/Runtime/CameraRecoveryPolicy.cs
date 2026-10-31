using System;

namespace CrushX.LensEngine
{
    public enum CameraSessionState { Idle, WaitingForPermission, StartingAr, ArPreview, ReleasingAr, StartingNative, NativePreview, Suspended, Unavailable }
    public enum CameraSessionAction { None, StopAll, StartAr, RestartAr, StopAr, StartNative, RestartNative }

    public struct CameraSessionObservation
    {
        public bool PermissionGranted, Foreground, HasArRig, ArRunning, ArFacingMatches, NativePlaying;
        public long ArFrame, NativeFrame;
    }

    /// <summary>Monotonic, bounded camera recovery policy. A face detection result never proves camera readiness.</summary>
    public sealed class CameraRecoveryPolicy
    {
        public CameraSessionState State { get; private set; }
        public double StartupTimeout = 8;
        public double FrameTimeout = 3;
        public double ReleaseTimeout = 3;
        public int MaxRecoveries = 1;
        private double enteredAt, lastFrameAt;
        private long arFrame, nativeFrame;
        private int arRecoveries, nativeRecoveries;
        private bool preferNative;

        public void Fail() { State = CameraSessionState.Unavailable; }

        public void Retry(bool useNative = false)
        {
            State = CameraSessionState.Idle;
            arRecoveries = nativeRecoveries = 0;
            preferNative = useNative;
        }

        public CameraSessionAction Tick(CameraSessionObservation observation, double now)
        {
            if (double.IsNaN(now) || double.IsInfinity(now) || now < 0) throw new ArgumentOutOfRangeException(nameof(now));
            if (!observation.Foreground || !observation.PermissionGranted)
            {
                var target = !observation.Foreground ? CameraSessionState.Suspended : CameraSessionState.WaitingForPermission;
                bool stop = State != target;
                State = target;
                return stop ? CameraSessionAction.StopAll : CameraSessionAction.None;
            }
            if (State == CameraSessionState.Idle || State == CameraSessionState.Suspended || State == CameraSessionState.WaitingForPermission)
            {
                arRecoveries = nativeRecoveries = 0;
                if (observation.HasArRig && !preferNative)
                {
                    Enter(CameraSessionState.StartingAr, now);
                    arFrame = observation.ArFrame;
                    return CameraSessionAction.StartAr;
                }
                Enter(CameraSessionState.ReleasingAr, now);
                return CameraSessionAction.StopAr;
            }
            if (State == CameraSessionState.StartingAr || State == CameraSessionState.ArPreview)
            {
                if (observation.ArRunning && observation.ArFacingMatches && observation.ArFrame != arFrame)
                {
                    arFrame = observation.ArFrame;
                    lastFrameAt = now;
                    State = CameraSessionState.ArPreview;
                }
                double elapsed = State == CameraSessionState.ArPreview ? now - lastFrameAt : now - enteredAt;
                double timeout = State == CameraSessionState.ArPreview ? Positive(FrameTimeout, 3) : Positive(StartupTimeout, 8);
                if (elapsed < timeout) return CameraSessionAction.None;
                if (arRecoveries++ < Math.Max(0, MaxRecoveries))
                {
                    Enter(CameraSessionState.StartingAr, now);
                    arFrame = observation.ArFrame;
                    return CameraSessionAction.RestartAr;
                }
                Enter(CameraSessionState.ReleasingAr, now);
                return CameraSessionAction.StopAr;
            }
            if (State == CameraSessionState.ReleasingAr)
            {
                // Never request the native camera until the AR camera subsystem actually stopped.
                if (!observation.ArRunning)
                {
                    Enter(CameraSessionState.StartingNative, now);
                    nativeFrame = observation.NativeFrame;
                    return CameraSessionAction.StartNative;
                }
                if (now - enteredAt >= Positive(ReleaseTimeout, 3))
                {
                    State = CameraSessionState.Unavailable;
                    return CameraSessionAction.StopAll;
                }
                return CameraSessionAction.None;
            }
            if (State == CameraSessionState.StartingNative || State == CameraSessionState.NativePreview)
            {
                if (observation.NativePlaying && observation.NativeFrame != nativeFrame)
                {
                    nativeFrame = observation.NativeFrame;
                    lastFrameAt = now;
                    State = CameraSessionState.NativePreview;
                }
                double elapsed = State == CameraSessionState.NativePreview ? now - lastFrameAt : now - enteredAt;
                double timeout = State == CameraSessionState.NativePreview ? Positive(FrameTimeout, 3) : Positive(StartupTimeout, 8);
                if (elapsed < timeout) return CameraSessionAction.None;
                if (nativeRecoveries++ < Math.Max(0, MaxRecoveries))
                {
                    Enter(CameraSessionState.StartingNative, now);
                    nativeFrame = observation.NativeFrame;
                    return CameraSessionAction.RestartNative;
                }
                State = CameraSessionState.Unavailable;
                return CameraSessionAction.StopAll;
            }
            return CameraSessionAction.None;
        }

        private void Enter(CameraSessionState state, double now) { State = state; enteredAt = lastFrameAt = now; }
        private static double Positive(double value, double fallback) => double.IsNaN(value) || double.IsInfinity(value) || value <= 0 ? fallback : value;
    }
}
