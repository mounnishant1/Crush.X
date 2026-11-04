using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.LensEngine
{
    // AR Foundation 6.x pose/mesh adapter. ARCore does not provide blendshape coefficients here.
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
        private ARFace selectedFace;
        private ARFaceManager boundManager;
        private double observedAt;
        private Vector3 observedPosition;
        private Quaternion observedRotation;
        private float observedWidth;

        public bool TryGetFace(out FaceSample sample)
        {
            sample = default;
            if (FaceManager != boundManager) { ReleaseFace(); boundManager = FaceManager; }
            if (FaceManager == null) return Unavailable(ARDiagnosticOutcome.ManagerMissing);
            if (!FaceManager.isActiveAndEnabled) return Unavailable(ARDiagnosticOutcome.ManagerDisabled);
            if (FaceManager.subsystem == null) return Unavailable(ARDiagnosticOutcome.SubsystemMissing);
            if (!FaceManager.subsystem.running) return Unavailable(ARDiagnosticOutcome.SubsystemStopped);
            int faceCount = 0;
            ARFace candidate = null;
            bool retained = false;
            foreach (ARFace face in FaceManager.trackables)
            {
                if (face == null) continue;
                faceCount++;
                if (face.trackingState != TrackingState.Tracking) continue;
                if (face == selectedFace) { candidate = face; retained = true; }
                else if (!retained && (candidate == null || Earlier(face.trackableId, candidate.trackableId))) candidate = face;
            }
            if (candidate == null)
                return Unavailable(faceCount == 0 ? ARDiagnosticOutcome.NoFacesDetected : ARDiagnosticOutcome.FacesNotTracking);
            if (candidate != selectedFace)
            {
                ReleaseFace();
                selectedFace = candidate;
                // Receipt time of a real AR observation, not a sensor exposure timestamp.
                CaptureObservation();
                selectedFace.updated += OnFaceUpdated;
            }
            sample = new FaceSample
            {
                Valid = true,
                Identity = new FaceIdentity(candidate.trackableId.subId1, candidate.trackableId.subId2),
                Position = observedPosition,
                Rotation = observedRotation,
                Confidence = 1, // TrackingState.Tracking mapped to valid; not a measured model probability.
                ConfidenceIsMeasured = false,
                FaceWidthMeters = observedWidth,
                Timestamp = observedAt
            };
            CurrentOutcome = ARDiagnosticOutcome.Tracking;
            return true;
        }

        private static bool Earlier(TrackableId a, TrackableId b)
        { return a.subId1 < b.subId1 || (a.subId1 == b.subId1 && a.subId2 < b.subId2); }
        private bool Unavailable(ARDiagnosticOutcome outcome)
        { ReleaseFace(); CurrentOutcome = outcome; return false; }
        private void OnFaceUpdated(ARFaceUpdatedEventArgs args)
        { if (args.face == selectedFace) CaptureObservation(); }
        private void CaptureObservation()
        {
            if (selectedFace == null) return;
            observedAt = Time.realtimeSinceStartupAsDouble;
            observedPosition = selectedFace.transform.position;
            observedRotation = selectedFace.transform.rotation;
            observedWidth = 0;
            var vertices = selectedFace.vertices;
            if (!vertices.IsCreated || vertices.Length < 3) return;
            float minX = float.PositiveInfinity, maxX = float.NegativeInfinity;
            for (int i = 0; i < vertices.Length; i++)
            {
                float x = vertices[i].x;
                if (!TrackingSampleGate.Finite(x)) continue;
                minX = Mathf.Min(minX, x); maxX = Mathf.Max(maxX, x);
            }
            float width = maxX - minX;
            if (TrackingSampleGate.Finite(width) && width >= .08f && width <= .25f) observedWidth = width;
        }
        private void ReleaseFace()
        {
            if (selectedFace != null) selectedFace.updated -= OnFaceUpdated;
            selectedFace = null;
            observedAt = 0;
        }
        private void OnDisable() { ReleaseFace(); boundManager = null; }
        private void OnApplicationPause(bool paused) { ReleaseFace(); }
        private void OnDestroy() { ReleaseFace(); }
    }
}
