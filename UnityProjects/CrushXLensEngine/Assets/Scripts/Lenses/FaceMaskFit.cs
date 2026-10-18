using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Conservative fitting of a rigid face mask to ARCore's local face mesh.
    /// The reference width is an initial calibration, not a claim of per-device accuracy.
    /// </summary>
    public static class FaceMaskFit
    {
        private const float ReferenceFaceWidthMeters = .145f;
        private const float SurfaceClearanceMeters = .005f;

        public static bool TryTarget(float faceMinX, float faceMaxX, float faceFrontZ,
            float modelFrontZ, out float relativeScale, out float depthOffset)
        {
            relativeScale = 1f;
            depthOffset = 0f;
            if (!Finite(faceMinX) || !Finite(faceMaxX) || !Finite(faceFrontZ) || !Finite(modelFrontZ))
                return false;

            float width = faceMaxX - faceMinX;
            // Reject uninitialized and wildly implausible provider geometry rather than
            // stretching a mask over a transient/invalid face mesh.
            if (width < .08f || width > .25f || faceFrontZ < -.25f || faceFrontZ > .08f ||
                modelFrontZ > -.005f || modelFrontZ < -.25f) return false;

            relativeScale = Mathf.Clamp(width / ReferenceFaceWidthMeters, .8f, 1.25f);
            // ARCore's negative Z faces the camera. Align the mask's foremost surface
            // just ahead of the nose, while keeping corrections safely bounded.
            depthOffset = Mathf.Clamp(faceFrontZ - modelFrontZ * relativeScale -
                SurfaceClearanceMeters, -.045f, .045f);
            return true;
        }

        private static bool Finite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }
    }
}
