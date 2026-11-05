using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Joins a real pose provider to an installed on-device blendshape source. This component does not
    /// contain a model or infer expressions; absent/mismatched/stale model outputs stay unavailable.
    /// </summary>
    public sealed class BlendshapeTrackingProvider : MonoBehaviour, ITrackingProvider, ITrackingCapabilitiesProvider
    {
        public MonoBehaviour PoseProviderComponent;
        public MonoBehaviour BlendshapeSourceComponent;
        [Range(.03f, .5f)] public float MaximumExpressionAge = .15f;
        [Range(.01f, .5f)] public float MaximumPoseSkew = .1f;
        [Range(0, 1)] public float MinimumModelConfidence = .5f;
        private readonly TrackingSampleGate gate = new TrackingSampleGate();
        private FaceExpressionSample cached;
        private MonoBehaviour boundPose, boundSource;
        // Stacking decorators cannot add a model capability and can create recursion cycles.
        private ITrackingProvider Pose { get { return PoseProviderComponent is BlendshapeTrackingProvider ? null : PoseProviderComponent as ITrackingProvider; } }
        private IOnDeviceBlendshapeSource Source { get { return BlendshapeSourceComponent as IOnDeviceBlendshapeSource; } }
        public string ProviderName { get { return "Local blendshape adapter + " + (Pose == null ? "no pose provider" : Pose.ProviderName); } }
        public bool CapabilitiesKnown { get { return Pose is ITrackingCapabilitiesProvider c && c.CapabilitiesKnown; } }
        public TrackingCapabilities Capabilities
        {
            get
            {
                TrackingCapabilities result = Pose is ITrackingCapabilitiesProvider c ? c.Capabilities : TrackingCapabilities.None;
                // The adapter owns expression validity; never inherit a stale capability from another decorator.
                result &= ~TrackingCapabilities.Expressions;
                if (Source != null && Source.IsRunning && BlendshapeSourceComponent != null && BlendshapeSourceComponent.isActiveAndEnabled &&
                    cached.Available != FaceExpressionChannels.None && gate.IsTrackingAt(Time.realtimeSinceStartupAsDouble, MaximumExpressionAge))
                    result |= TrackingCapabilities.Expressions;
                return result;
            }
        }

        public bool TryGetFace(out FaceSample sample)
        {
            sample = default;
            if (PoseProviderComponent != boundPose || BlendshapeSourceComponent != boundSource)
            { ResetExpressions(); boundPose = PoseProviderComponent; boundSource = BlendshapeSourceComponent; }
            if (Pose == null || PoseProviderComponent == null || !PoseProviderComponent.isActiveAndEnabled || !Pose.TryGetFace(out sample))
            { ResetExpressions(); return false; }
            sample.Expressions = default;
            sample.MouthOpen = sample.Blink = 0;
            double now = Time.realtimeSinceStartupAsDouble;
            IOnDeviceBlendshapeSource source = Source;
            if (source == null || BlendshapeSourceComponent == null || !BlendshapeSourceComponent.isActiveAndEnabled || !source.IsRunning)
            { ResetExpressions(); return sample.Valid; }
            if (sample.Identity != gate.Identity) ResetExpressions();
            if (source.TryGetBlendshapes(sample.Identity, out OnDeviceBlendshapeFrame model) &&
                BlendshapeFramePolicy.CanJoin(sample.Identity, sample.Timestamp, model, now, MaximumExpressionAge, MaximumPoseSkew, MinimumModelConfidence) &&
                BlendshapeExpressionMapper.TryMap(model.Coefficients, model.Timestamp, out FaceExpressionSample mapped) &&
                gate.TryAccept(model.Identity, model.Timestamp, now, model.Confidence, MaximumExpressionAge, MinimumModelConfidence, true, out _))
                cached = mapped;
            if (sample.Identity == gate.Identity && gate.IsTrackingAt(now, MaximumExpressionAge) &&
                System.Math.Abs(sample.Timestamp - gate.Timestamp) <= MaximumPoseSkew)
            {
                sample.Expressions = cached;
                sample.MouthOpen = cached.TryGet(ExpressionSignal.MouthOpen, out float mouth) ? mouth : 0;
                sample.Blink = cached.TryGet(ExpressionSignal.Blink, out float blink) ? blink : 0;
            }
            return sample.Valid;
        }

        private void ResetExpressions() { gate.Reset(); cached = default; }
        private void OnDisable() { ResetExpressions(); boundPose = boundSource = null; }
        private void OnApplicationPause(bool paused) { ResetExpressions(); }
    }
}
