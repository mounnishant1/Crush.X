using System;

namespace CrushX.LensEngine
{
    /// <summary>Distance never changes the number of lenses selected by one release.</summary>
    public static class LensSwipePolicy
    {
        public static int Step(double deltaX, double deltaY, double screenWidth)
        {
            if (!Finite(deltaX) || !Finite(deltaY) || !Finite(screenWidth) || screenWidth <= 0) return 0;
            double threshold = Math.Max(65d, screenWidth * .12d);
            if (Math.Abs(deltaX) < threshold || Math.Abs(deltaY) > Math.Abs(deltaX) * .7d) return 0;
            return deltaX < 0 ? 1 : -1;
        }

        public static bool IsTap(double deltaX, double deltaY, double scale)
        {
            return Finite(deltaX) && Finite(deltaY) && Finite(scale) && scale > 0 &&
                deltaX * deltaX + deltaY * deltaY <= 18d * 18d * scale * scale;
        }

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
