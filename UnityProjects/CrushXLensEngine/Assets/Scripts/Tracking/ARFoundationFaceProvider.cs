using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.LensEngine
{
    // AR Foundation 6.x adapter. Requires runtime XR Origin, AR Session and configured Android ARCore loader.
    // ARFace is a pose / face mesh source; expressions remain 0 until a separate blendshape provider is wired.
    public sealed class ARFoundationFaceProvider : MonoBehaviour, ITrackingProvider, ITrackingCapabilitiesProvider
    {
        public ARFaceManager FaceManager;
        public string ProviderName { get { return "AR Foundation face pose"; } }
        public bool CapabilitiesKnown { get { return FaceManager != null && FaceManager.subsystem != null && FaceManager.subsystem.subsystemDescriptor != null; } }
        public TrackingCapabilities Capabilities
        {
            get
            {
                if (!CapabilitiesKnown) return TrackingCapabilities.None;
                var descriptor = FaceManager.subsystem.subsystemDescriptor;
                TrackingCapabilities value = descriptor.supportsFacePose ? TrackingCapabilities.FacePose : TrackingCapabilities.None;
                if (descriptor.supportsFaceMeshVerticesAndIndices) value |= TrackingCapabilities.FaceMesh;
                return value;
            }
        }
        public ARDiagnosticOutcome CurrentOutcome { get; private set; } = ARDiagnosticOutcome.SessionNotReady;

        public bool TryGetFace(out FaceSample sample)
        {
            sample = default;
            if (FaceManager == null) { CurrentOutcome = ARDiagnosticOutcome.ManagerMissing; return false; }
            if (!FaceManager.isActiveAndEnabled) { CurrentOutcome = ARDiagnosticOutcome.ManagerDisabled; return false; }
            if (FaceManager.subsystem == null) { CurrentOutcome = ARDiagnosticOutcome.SubsystemMissing; return false; }
            if (!FaceManager.subsystem.running) { CurrentOutcome = ARDiagnosticOutcome.SubsystemStopped; return false; }
            int faceCount = 0;
            foreach (ARFace face in FaceManager.trackables)
            {
                if (face == null) continue;
                faceCount++;
                if (face.trackingState != TrackingState.Tracking) continue;
                // ARCore supplies the mesh in local, meter-based face coordinates. Use its
                // width to size procedural masks for the actual face, not the Editor demo.
                float faceWidth = 0f;
                var vertices = face.vertices;
                if (vertices.IsCreated && vertices.Length >= 3)
                {
                    float minX = float.PositiveInfinity, maxX = float.NegativeInfinity;
                    for (int i = 0; i < vertices.Length; i++)
                    {
                        float x = vertices[i].x;
                        if (float.IsNaN(x) || float.IsInfinity(x)) continue;
                        minX = Mathf.Min(minX, x);
                        maxX = Mathf.Max(maxX, x);
                    }
                    if (FaceMaskFit.TryRelativeScale(maxX - minX, out _))
                        faceWidth = maxX - minX;
                }
                sample = new FaceSample
                {
                    Valid = true,
                    Position = face.transform.position,
                    Rotation = face.transform.rotation,
                    Confidence = 1,
                    MouthOpen = 0,
                    Blink = 0,
                    FaceWidthMeters = faceWidth,
                    Timestamp = Time.realtimeSinceStartupAsDouble
                };
                CurrentOutcome = ARDiagnosticOutcome.Tracking;
                return true;
            }
            CurrentOutcome = faceCount == 0 ? ARDiagnosticOutcome.NoFacesDetected : ARDiagnosticOutcome.FacesNotTracking;
            return false;
        }
    }
}
