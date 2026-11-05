using System;

namespace CrushX.LensEngine.Creator
{
    /// <summary>Data-only preset over an installed lens. It never names a C# type or downloads an asset.</summary>
    [Serializable]
    public sealed class CreatorLensDocument
    {
        public int SchemaVersion = 1;
        public int Revision = 1;
        public string Id = "my-lens";
        public string DisplayName = "My Lens";
        public string BaseLensId = "cat-ears";
        public string Category = "Animals";
        public string Author = "";
        public string Description = "";
        public string AssetLicense = "Unreviewed";
        public string ThumbnailReference = "";
        public string Shader = "Installed";
        public string[] RequiredAssets = Array.Empty<string>();
        public CreatorEffectParameters Parameters = new CreatorEffectParameters();
        public CreatorExpressionRule[] ExpressionRules = Array.Empty<CreatorExpressionRule>();
    }

    [Serializable]
    public sealed class CreatorEffectParameters
    {
        public float Scale = 1;
        public float OffsetX, OffsetY, OffsetZ;
        public float RotationX, RotationY, RotationZ;
        public bool OverrideTint;
        public float TintRed = 1, TintGreen = 1, TintBlue = 1;
        public float PulseAmplitude;
        public float PulseHz = 1;
    }

    [Serializable]
    public sealed class CreatorExpressionRule
    {
        public string Expression = "MouthOpen";
        public float ActivateAbove = .65f;
        public float ReleaseBelow = .45f;
        public float ScaleMultiplier = 1.15f;
    }

    public sealed class CreatorValidationResult
    {
        public readonly string[] Errors;
        public bool IsValid { get { return Errors.Length == 0; } }
        public CreatorValidationResult(string[] errors) { Errors = errors; }
    }

    /// <summary>External moderation must approve the exact package hash; package self-claims are never trusted.</summary>
    public interface ICreatorPublishReview
    {
        bool HasApprovedReview(string packageSha256, out string receipt);
    }
}
