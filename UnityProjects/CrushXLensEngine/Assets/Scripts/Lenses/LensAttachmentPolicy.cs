namespace CrushX.LensEngine
{
    /// <summary>Converts the existing 0.54-unit prototype head to metre-based AR face coordinates.
    /// Imported prefabs retain their authored scale and must not use this conversion.</summary>
    public static class LensAttachmentPolicy
    {
        public const float PrototypeFaceWidth = .54f;
        public const float ReferenceFaceWidthMeters = .145f;

        public static float ProceduralScale(float faceWidthMeters, bool synthetic)
        {
            if (synthetic) return 1;
            float width = TrackingSampleGate.Finite(faceWidthMeters) && faceWidthMeters >= .08f && faceWidthMeters <= .25f
                ? faceWidthMeters : ReferenceFaceWidthMeters;
            return width / PrototypeFaceWidth;
        }
    }
}
