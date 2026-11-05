using System;

namespace CrushX.LensEngine
{
    public enum CameraColorGrade { None, WarmCinema, Noir, NeonDuotone }

    /// <summary>Mask registration and bounded GPU parameters. No inference or Unity stand-ins.</summary>
    public static class VisualEffectPolicy
    {
        public const double DefaultMaskAge = .25;
        public const double FutureTolerance = .02;

        public static double Unit(double value) => Finite(value) ? Math.Max(0, Math.Min(1, value)) : 0;
        public static double SmoothingStrength(double value) => Unit(value) * .65;
        public static double BlurRadius(double value) => Unit(value) * 8;
        public static int TapCount(int quality) => quality == 0 ? 5 : quality == 2 ? 13 : 9;
        public static CameraColorGrade ValidGrade(CameraColorGrade value) =>
            value >= CameraColorGrade.None && value <= CameraColorGrade.NeonDuotone ? value : CameraColorGrade.None;
        public static CameraColorGrade NextGrade(CameraColorGrade value) =>
            (CameraColorGrade)(((int)ValidGrade(value) + 1) % 4);

        public static bool Fresh(double timestamp, double now, double maxAge = DefaultMaskAge)
        {
            if (!Finite(timestamp) || !Finite(now) || !Finite(maxAge) || timestamp < 0 || now < 0 || maxAge <= 0)
                return false;
            return timestamp <= now + FutureTolerance && now - timestamp <= Math.Min(.5, maxAge);
        }

        public static bool ValidFrame(int expectedCamera, int expectedWidth, int expectedHeight,
            int sourceCamera, int sourceWidth, int sourceHeight, double timestamp, double now,
            double lastTimestamp, double maxAge = DefaultMaskAge)
        {
            if (expectedCamera == 0 || expectedWidth <= 0 || expectedHeight <= 0 ||
                sourceCamera != expectedCamera || sourceWidth != expectedWidth || sourceHeight != expectedHeight ||
                double.IsNaN(lastTimestamp) || double.IsPositiveInfinity(lastTimestamp) || timestamp <= lastTimestamp)
                return false;
            return Fresh(timestamp, now, maxAge);
        }

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
