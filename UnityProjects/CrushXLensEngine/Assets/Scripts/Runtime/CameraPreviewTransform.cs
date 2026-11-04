using System;

namespace CrushX.LensEngine
{
    /// <summary>Bottom-left UV coordinates. Rotate sensor pixels clockwise, correct source vertical inversion,
    /// then mirror the upright selfie. Aspect-fill cropping preserves geometry without stretching.</summary>
    public static class CameraPreviewTransform
    {
        public static void SourceUv(double u, double v, int sourceWidth, int sourceHeight,
            int outputWidth, int outputHeight, int clockwiseDegrees, bool verticallyMirrored, bool mirrorSelfie,
            out double sourceU, out double sourceV)
        {
            if (sourceWidth <= 0 || sourceHeight <= 0 || outputWidth <= 0 || outputHeight <= 0)
                throw new ArgumentOutOfRangeException(nameof(sourceWidth));
            int rotation = ((clockwiseDegrees % 360) + 360) % 360;
            if (rotation % 90 != 0) throw new ArgumentException("Camera rotation must be a quarter turn", nameof(clockwiseDegrees));
            bool quarter = rotation == 90 || rotation == 270;
            double sourceAspect = quarter ? (double)sourceHeight / sourceWidth : (double)sourceWidth / sourceHeight;
            double outputAspect = (double)outputWidth / outputHeight;
            if (sourceAspect > outputAspect) u = .5 + (u - .5) * outputAspect / sourceAspect;
            else v = .5 + (v - .5) * sourceAspect / outputAspect;
            if (mirrorSelfie) u = 1 - u;
            switch (rotation)
            {
                case 90: sourceU = 1 - v; sourceV = u; break;
                case 180: sourceU = 1 - u; sourceV = 1 - v; break;
                case 270: sourceU = v; sourceV = 1 - u; break;
                default: sourceU = u; sourceV = v; break;
            }
            if (verticallyMirrored) sourceV = 1 - sourceV;
        }
    }
}
