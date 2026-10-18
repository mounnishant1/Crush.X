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
        public float FaceWidthMeters; // 0 when no usable face mesh is available.
        public double Timestamp;
    }

    public interface ITrackingProvider
    {
        bool TryGetFace(out FaceSample sample);
        string ProviderName { get; }
    }

    [Flags]
    public enum TrackingCapabilities
    {
        None = 0, FacePose = 1, FaceMesh = 2, Expressions = 4, Hands = 8, WorldTracking = 16
    }

    public interface ITrackingCapabilitiesProvider
    {
        bool CapabilitiesKnown { get; }
        TrackingCapabilities Capabilities { get; }
    }

    public enum LensRuntimeState { Unselected, Loading, WaitingForTracking, Active, Unavailable, Failed }
    public enum LensImplementation { ProceduralPrototype, Imported3D, ColorFilter }
    public enum LensVerification { NotTested, SourceChecked, DeviceVerified }

    // Scene-provided lenses can live outside the runtime assembly (e.g. imported assets).
    public interface ISceneLens
    {
        string LensId { get; }
        bool IsAvailable { get; }
        void SelectLens(string id);
    }

    public interface ILensEffect
    {
        string LensId { get; }
        void Build();
        void Animate(FaceSample face, float elapsedSeconds);
    }

    public enum LensCategory { Animals, Beauty, SciFi, Fantasy, Funny, Aesthetic, Gaming, Anime, Masks, Cinematic, Creative }

    [Serializable]
    public struct LensManifest
    {
        public string Id;
        public string DisplayName;
        public LensCategory Category;
        public bool UsesExpressions;
        public string QualityTier;
        public bool SceneProvided;
        public TrackingCapabilities RequiredCapabilities;
        public TrackingCapabilities OptionalCapabilities;
        public LensImplementation Implementation;
        public LensVerification Verification;
        public string PreviewAssetPath;
        public string EffectAssetReference;
        public string Compatibility;
        public int MinimumAndroidApi;
        public int EstimatedRendererCount;
        public int EstimatedTriangles;
        public bool PerformanceMeasured;

        public LensManifest(string id, string name, LensCategory category, bool expressions, bool sceneProvided = false)
        {
            Id = id;
            DisplayName = name;
            Category = category;
            UsesExpressions = expressions;
            SceneProvided = sceneProvided;
            QualityTier = sceneProvided ? "Imported AR scene lens" : "Procedural 3D prototype";
            RequiredCapabilities = TrackingCapabilities.FacePose;
            OptionalCapabilities = expressions ? TrackingCapabilities.Expressions : TrackingCapabilities.None;
            Implementation = sceneProvided ? LensImplementation.Imported3D : LensImplementation.ProceduralPrototype;
            Verification = LensVerification.NotTested;
            PreviewAssetPath = sceneProvided ? "Assets/CrushX/ImportedLenses/FoxMask/Model/FoxMask_Thumbnail.png" : string.Empty;
            EffectAssetReference = sceneProvided ? "Assets/CrushX/ImportedLenses/FoxMask/FoxMask_AR.prefab" : "procedural:" + id;
            Compatibility = "Requires an initialized face-pose provider; Android rendering not device-verified";
            MinimumAndroidApi = 24;
            EstimatedRendererCount = 0; // Unknown until imported/built; zero is not a measured budget.
            EstimatedTriangles = 0;
            PerformanceMeasured = false;
        }
    }
}
