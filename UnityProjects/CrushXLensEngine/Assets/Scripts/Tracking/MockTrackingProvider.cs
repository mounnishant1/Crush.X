using UnityEngine;

namespace CrushX.LensEngine
{
    // Explicit Editor / fallback provider. Never used as a substitute for actual device tracking proof.
    public sealed class MockTrackingProvider : MonoBehaviour, ITrackingProvider
    {
        [Range(0.05f, 1)] public float MotionAmplitude = .12f;
        public bool SimulateTrackingLoss;
        public string ProviderName { get { return "Editor Mock"; } }

        public bool TryGetFace(out FaceSample sample)
        {
            float t = Time.unscaledTime;
            sample = new FaceSample
            {
                Valid = !SimulateTrackingLoss,
                Position = new Vector3(Mathf.Sin(t * .63f) * MotionAmplitude, Mathf.Cos(t * .41f) * .04f, 0),
                Rotation = Quaternion.Euler(Mathf.Sin(t * .85f) * 8, Mathf.Cos(t * .67f) * 12, Mathf.Sin(t * .56f) * 6),
                Confidence = SimulateTrackingLoss ? 0 : .99f,
                MouthOpen = (Mathf.Sin(t * 1.9f) + 1) * .5f,
                Blink = Mathf.Sin(t * 2.9f) > .98f ? 1 : 0,
                Timestamp = Time.realtimeSinceStartupAsDouble
            };
            return sample.Valid;
        }
    }
}
