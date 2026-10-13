using UnityEngine;

namespace CrushX.LensEngine
{
    public sealed class FaceTrackingManager : MonoBehaviour
    {
        public MonoBehaviour ProviderComponent;
        [Range(.01f, .5f)] public float PositionHalfLife = .06f;
        [Range(.01f, .5f)] public float RotationHalfLife = .045f;
        [Range(.05f, 1)] public float TrackingTimeout = .35f;
        [Range(0, 1)] public float MinimumConfidence = .4f;

        public FaceSample Current { get; private set; }
        public bool IsTracking { get; private set; }
        public string ProviderName { get { return provider == null ? "None" : provider.ProviderName; } }
        private ITrackingProvider provider;
        private float lastGoodAt = -100;
        private bool initialized;

        public void SetProvider(MonoBehaviour component)
        {
            ProviderComponent = component;
            provider = component as ITrackingProvider;
            Current = default;
            initialized = false;
            IsTracking = false;
        }

        private void Awake() { SetProvider(ProviderComponent); }

        private void Update()
        {
            if (provider == null && ProviderComponent != null) provider = ProviderComponent as ITrackingProvider;
            FaceSample incoming = default;
            bool good = provider != null && provider.TryGetFace(out incoming) && incoming.Valid && incoming.Confidence >= MinimumConfidence;
            if (good)
            {
                // Avoid interpolation from zero pose when first acquiring or after recovery.
                if (!initialized || Time.unscaledTime - lastGoodAt > TrackingTimeout)
                {
                    Current = incoming;
                    initialized = true;
                }
                else
                {
                    float dt = Mathf.Clamp(Time.unscaledDeltaTime, 0, .1f);
                    float p = 1 - Mathf.Pow(.5f, dt / PositionHalfLife);
                    float r = 1 - Mathf.Pow(.5f, dt / RotationHalfLife);
                    incoming.Position = Vector3.Lerp(Current.Position, incoming.Position, p);
                    incoming.Rotation = Quaternion.Slerp(Current.Rotation, incoming.Rotation, r);
                    Current = incoming;
                }
                lastGoodAt = Time.unscaledTime;
                IsTracking = true;
            }
            else
            {
                IsTracking = initialized && Time.unscaledTime - lastGoodAt < TrackingTimeout;
                if (!IsTracking) { initialized = false; Current = default; }
            }
        }
    }
}
