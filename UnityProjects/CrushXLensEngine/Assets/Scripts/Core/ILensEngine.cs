using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    [Serializable]
    public struct FaceSample
    {
        public bool Valid;
        public Vector3 Position;
        public Quaternion Rotation;
        public float Confidence;
        public float MouthOpen;  // 0..1, only meaningful with a provider that supports expressions.
        public float Blink;      // 0..1, only meaningful with a provider that supports expressions.
        public double Timestamp;
    }

    public interface ITrackingProvider
    {
        bool TryGetFace(out FaceSample sample);
        string ProviderName { get; }
    }

    public interface ILensEffect
    {
        string LensId { get; }
        void Build();
        void Animate(FaceSample face, float elapsedSeconds);
    }

    public enum LensCategory { Animals, Beauty, SciFi, Fantasy, Funny, Aesthetic }

    [Serializable]
    public struct LensManifest
    {
        public string Id;
        public string DisplayName;
        public LensCategory Category;
        public bool UsesExpressions;
        public string QualityTier;

        public LensManifest(string id, string name, LensCategory category, bool expressions)
        {
            Id = id;
            DisplayName = name;
            Category = category;
            UsesExpressions = expressions;
            QualityTier = "Procedural 3D prototype";
        }
    }
}
