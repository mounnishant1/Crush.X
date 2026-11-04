using UnityEngine;

namespace CrushX.LensEngine
{
    // Explicit Editor / fallback provider. Never used as a substitute for actual device tracking proof.
    public sealed class MockTrackingProvider : MonoBehaviour, ITrackingProvider, ITrackingCapabilitiesProvider
    {
        [Range(0.05f, 1)] public float MotionAmplitude = .12f;
        public bool SimulateTrackingLoss;
        public string ProviderName { get { return "Editor Mock"; } }
        public bool CapabilitiesKnown { get { return true; } }
        public TrackingCapabilities Capabilities { get { return TrackingCapabilities.FacePose | TrackingCapabilities.Expressions; } }

        public bool TryGetFace(out FaceSample sample)
        {
            float t = Time.unscaledTime;
            double timestamp = Time.realtimeSinceStartupAsDouble;
            float mouth = (Mathf.Sin(t * 1.9f) + 1) * .5f;
            float blink = Mathf.Sin(t * 2.9f) > .98f ? 1 : 0;
            sample = new FaceSample
            {
                Valid = !SimulateTrackingLoss,
                Identity = new FaceIdentity(1, 1), // Explicit synthetic identity, never a device result.
                Position = new Vector3(Mathf.Sin(t * .63f) * MotionAmplitude, Mathf.Cos(t * .41f) * .04f, 0),
                Rotation = Quaternion.Euler(Mathf.Sin(t * .85f) * 8, Mathf.Cos(t * .67f) * 12, Mathf.Sin(t * .56f) * 6),
                Confidence = SimulateTrackingLoss ? 0 : .99f,
                MouthOpen = mouth,
                Blink = blink,
                Expressions = new FaceExpressionSample
                {
                    Available = FaceExpressionChannels.MouthOpen | FaceExpressionChannels.BlinkLeft | FaceExpressionChannels.BlinkRight,
                    MouthOpen = mouth, BlinkLeft = blink, BlinkRight = blink, Timestamp = timestamp
                },
                Timestamp = timestamp
            };
            return sample.Valid;
        }
    }
}
