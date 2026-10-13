using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.LensEngine
{
    // AR Foundation 6.x adapter. Requires runtime XR Origin, AR Session and configured Android ARCore loader.
    // ARFace is a pose / face mesh source; expressions remain 0 until a separate blendshape provider is wired.
    public sealed class ARFoundationFaceProvider : MonoBehaviour, ITrackingProvider
    {
        public ARFaceManager FaceManager;
        public string ProviderName { get { return "AR Foundation face pose"; } }

        public bool TryGetFace(out FaceSample sample)
        {
            sample = default;
            if (FaceManager == null || !FaceManager.isActiveAndEnabled || FaceManager.subsystem == null || !FaceManager.subsystem.running)
                return false;
            foreach (ARFace face in FaceManager.trackables)
            {
                if (face == null || face.trackingState != TrackingState.Tracking) continue;
                sample = new FaceSample
                {
                    Valid = true,
                    Position = face.transform.position,
                    Rotation = face.transform.rotation,
                    Confidence = 1,
                    MouthOpen = 0,
                    Blink = 0,
                    Timestamp = Time.realtimeSinceStartupAsDouble
                };
                return true;
            }
            return false;
        }
    }
}
