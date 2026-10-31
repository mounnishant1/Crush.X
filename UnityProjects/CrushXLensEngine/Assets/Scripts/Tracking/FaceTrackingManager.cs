using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    public sealed class FaceTrackingManager : MonoBehaviour
    {
        public MonoBehaviour ProviderComponent;
        [Range(.01f, .5f)] public float PositionHalfLife = .06f;
        [Range(.01f, .5f)] public float RotationHalfLife = .045f;
        [Range(.01f, .5f)] public float ExpressionHalfLife = .04f;
        [Range(.05f, 1)] public float TrackingTimeout = .22f;
        [Range(.03f, .5f)] public float ExpressionTimeout = .15f;
        [Range(0, 1)] public float MinimumConfidence = .4f;

        public FaceSample Current { get; private set; }
        public bool IsTracking { get; private set; }
        public TrackingSampleRejection LastRejection { get { return gate.LastRejection; } }
        public string ProviderName { get { return provider == null ? "None" : provider.ProviderName; } }
        private ITrackingProvider provider;
        private MonoBehaviour boundComponent;
        private double nextProviderErrorAt;
        private readonly TrackingSampleGate gate = new TrackingSampleGate();

        public void SetProvider(MonoBehaviour component)
        {
            ProviderComponent = component;
            boundComponent = component;
            provider = component as ITrackingProvider;
            ResetTracking();
        }

        public void ResetTracking()
        {
            Current = default;
            IsTracking = false;
            gate.Reset();
        }

        private void Awake() { SetProvider(ProviderComponent); }
        private void OnDisable() { ResetTracking(); }
        private void OnApplicationPause(bool paused) { ResetTracking(); }
        private void OnApplicationFocus(bool focused) { if (!focused) ResetTracking(); }

        private void Update()
        {
            if (ProviderComponent != boundComponent) SetProvider(ProviderComponent);
            FaceSample incoming = default;
            bool supplied = false;
            try
            {
                supplied = ProviderComponent != null && ProviderComponent.isActiveAndEnabled &&
                    provider != null && provider.TryGetFace(out incoming);
            }
            catch (Exception error)
            {
                // Still run expiry when an optional inference provider fails.
                if (Time.realtimeSinceStartupAsDouble >= nextProviderErrorAt)
                { nextProviderErrorAt = Time.realtimeSinceStartupAsDouble + 5; Debug.LogException(error); }
            }
            ProcessSample(supplied, incoming, Time.realtimeSinceStartupAsDouble);
        }

        // Deterministic entry used by both the runtime and lifecycle tests; it never creates tracking data.
        public void ProcessSample(bool supplied, FaceSample incoming, double now)
        {
            double timeout = TrackingSampleGate.Finite(TrackingTimeout) && TrackingTimeout > 0 ? TrackingTimeout : .22;
            float threshold = TrackingSampleGate.Finite(MinimumConfidence) ? Mathf.Clamp01(MinimumConfidence) : .4f;
            bool validPose = supplied && incoming.Valid && Finite(incoming.Position) && Normalize(ref incoming.Rotation);
            bool resetInterpolation = false;
            bool good = supplied && gate.TryAccept(incoming.Identity, incoming.Timestamp, now, incoming.Confidence,
                timeout, threshold, validPose, out resetInterpolation);
            // Keep the policy's identity decision explicit rather than infer it from world-space distance.
            if (good)
            {
                bool reset = resetInterpolation || !IsTracking || Current.Identity != incoming.Identity;
                float dt = (float)Math.Max(0, Math.Min(.1, incoming.Timestamp - Current.Timestamp));
                if (!TrackingSampleGate.Finite(incoming.FaceWidthMeters) || incoming.FaceWidthMeters < .08f || incoming.FaceWidthMeters > .25f)
                    incoming.FaceWidthMeters = 0;
                incoming.Expressions = FreshExpressions(incoming.Expressions, now);
                if (!reset)
                {
                    float p = TrackingSampleGate.HalfLifeWeight(dt, PositionHalfLife);
                    float r = TrackingSampleGate.HalfLifeWeight(dt, RotationHalfLife);
                    incoming.Position = Vector3.Lerp(Current.Position, incoming.Position, p);
                    incoming.Rotation = Quaternion.Slerp(Current.Rotation, incoming.Rotation, r);
                    if (incoming.FaceWidthMeters <= 0) incoming.FaceWidthMeters = Current.FaceWidthMeters;
                    else if (Current.FaceWidthMeters > 0)
                        incoming.FaceWidthMeters = Mathf.Lerp(Current.FaceWidthMeters, incoming.FaceWidthMeters, p);
                    incoming.Expressions = FaceExpressionSample.Smooth(Current.Expressions, incoming.Expressions,
                        TrackingSampleGate.HalfLifeWeight(dt, ExpressionHalfLife));
                }
                SetLegacyExpressions(ref incoming);
                Current = incoming;
            }
            else if (supplied && validPose && gate.LastRejection == TrackingSampleRejection.RepeatedOrOutOfOrder &&
                incoming.Identity == Current.Identity && incoming.Timestamp == Current.Timestamp && gate.IsTrackingAt(now, timeout))
            {
                // A local model may finish between AR pose events. Consume a genuinely newer
                // expression frame without refreshing the held pose's timestamp or lifetime.
                FaceExpressionSample expressions = FreshExpressions(incoming.Expressions, now);
                if (expressions.Available != FaceExpressionChannels.None && expressions.Timestamp > Current.Expressions.Timestamp)
                {
                    FaceSample held = Current;
                    float dt = (float)Math.Max(0, Math.Min(.1, expressions.Timestamp - held.Expressions.Timestamp));
                    held.Expressions = FaceExpressionSample.Smooth(held.Expressions, expressions,
                        TrackingSampleGate.HalfLifeWeight(dt, ExpressionHalfLife));
                    SetLegacyExpressions(ref held);
                    Current = held;
                }
            }
            IsTracking = gate.IsTrackingAt(now, timeout);
            if (!IsTracking) Current = default;
            else
            {
                FaceSample held = Current;
                held.Expressions = FreshExpressions(held.Expressions, now);
                SetLegacyExpressions(ref held);
                Current = held;
            }
        }

        private FaceExpressionSample FreshExpressions(FaceExpressionSample sample, double now)
        {
            double timeout = TrackingSampleGate.Finite(ExpressionTimeout) && ExpressionTimeout > 0 ? ExpressionTimeout : .15;
            if (!TrackingSampleGate.Finite(sample.Timestamp) || sample.Timestamp < 0 ||
                sample.Timestamp > now + TrackingSampleGate.FutureToleranceSeconds || now - sample.Timestamp >= timeout)
                return default;
            return sample.Sanitized();
        }

        private static void SetLegacyExpressions(ref FaceSample sample)
        {
            sample.MouthOpen = sample.Expressions.TryGet(ExpressionSignal.MouthOpen, out float mouth) ? mouth : 0;
            sample.Blink = sample.Expressions.TryGet(ExpressionSignal.Blink, out float blink) ? blink : 0;
        }

        private static bool Finite(Vector3 value)
        { return TrackingSampleGate.Finite(value.x) && TrackingSampleGate.Finite(value.y) && TrackingSampleGate.Finite(value.z); }

        private static bool Normalize(ref Quaternion value)
        {
            if (!TrackingSampleGate.Finite(value.x) || !TrackingSampleGate.Finite(value.y) ||
                !TrackingSampleGate.Finite(value.z) || !TrackingSampleGate.Finite(value.w)) return false;
            double norm = Math.Sqrt((double)value.x * value.x + (double)value.y * value.y + (double)value.z * value.z + (double)value.w * value.w);
            if (norm < 1e-8) return false;
            value = new Quaternion((float)(value.x / norm), (float)(value.y / norm), (float)(value.z / norm), (float)(value.w / norm));
            return true;
        }
    }
}
