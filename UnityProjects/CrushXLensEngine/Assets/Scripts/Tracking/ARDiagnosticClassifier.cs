namespace CrushX.LensEngine
{
    public enum ARDiagnosticOutcome
    {
        ManagerMissing, ManagerDisabled, PermissionDenied, LoaderMissing, SessionNotReady,
        CameraMismatch, SubsystemMissing, SubsystemStopped, NoFacesDetected, FacesNotTracking,
        Tracking, LensPrefabMissing, LensRendererUnavailable
    }

    public enum ARPermissionObservation { Unknown, Granted, Denied }
    public enum ARCameraObservation { Unknown, User, World }

    // Observations only. Missing data and elapsed time never establish unsupported hardware.
    public struct ARDiagnosticObservation
    {
        public bool ManagerPresent, ManagerEnabled;
        public ARPermissionObservation Permission;
        public bool LoaderInitializationComplete, LoaderPresent;
        public bool SessionPresent, SessionRunning, SessionAvailable;
        public bool SessionReportedUnsupported, ServiceNeedsInstall, ServiceInstalling;
        public bool CameraPresent, CameraRunning;
        public ARCameraObservation RequestedCamera, CurrentCamera;
        public bool FaceSubsystemPresent, FaceSubsystemRunning;
        public int FaceCount, TrackingFaceCount;
        public double ElapsedSeconds;
    }

    public static class ARDiagnosticClassifier
    {
        public static ARDiagnosticOutcome WithLensFailure(ARDiagnosticOutcome tracking, ARDiagnosticOutcome? failure,
            bool requiresFace, bool cameraReady)
        {
            return failure.HasValue && (tracking == ARDiagnosticOutcome.Tracking || (!requiresFace && cameraReady))
                ? failure.Value : tracking;
        }

        public static ARDiagnosticOutcome Classify(ARDiagnosticObservation value)
        {
            if (!value.ManagerPresent) return ARDiagnosticOutcome.ManagerMissing;
            if (!value.ManagerEnabled) return ARDiagnosticOutcome.ManagerDisabled;
            if (value.Permission == ARPermissionObservation.Denied) return ARDiagnosticOutcome.PermissionDenied;

            // ARCore front-camera world tracking may stay paused while Augmented Faces track.
            if (value.FaceSubsystemPresent && value.FaceSubsystemRunning && value.TrackingFaceCount > 0)
                return ARDiagnosticOutcome.Tracking;

            if (value.Permission != ARPermissionObservation.Granted || !value.LoaderInitializationComplete)
                return ARDiagnosticOutcome.SessionNotReady;
            if (!value.LoaderPresent) return ARDiagnosticOutcome.LoaderMissing;
            if (!value.SessionPresent || !value.SessionRunning || !value.SessionAvailable)
                return ARDiagnosticOutcome.SessionNotReady;
            if (!value.CameraPresent) return ARDiagnosticOutcome.SubsystemMissing;
            if (!value.CameraRunning) return ARDiagnosticOutcome.SubsystemStopped;
            if (value.RequestedCamera == ARCameraObservation.User && value.CurrentCamera == ARCameraObservation.World)
                return ARDiagnosticOutcome.CameraMismatch;
            if (value.CurrentCamera == ARCameraObservation.Unknown) return ARDiagnosticOutcome.SessionNotReady;
            if (!value.FaceSubsystemPresent) return ARDiagnosticOutcome.SubsystemMissing;
            if (!value.FaceSubsystemRunning) return ARDiagnosticOutcome.SubsystemStopped;
            return value.FaceCount == 0 ? ARDiagnosticOutcome.NoFacesDetected : ARDiagnosticOutcome.FacesNotTracking;
        }

        public static string Message(ARDiagnosticOutcome outcome)
        {
            switch (outcome)
            {
                case ARDiagnosticOutcome.Tracking: return "Face tracking active";
                case ARDiagnosticOutcome.NoFacesDetected: return "Bring your face into view";
                case ARDiagnosticOutcome.FacesNotTracking: return "Hold still while your face is found";
                case ARDiagnosticOutcome.PermissionDenied: return "Allow camera access in Android settings";
                case ARDiagnosticOutcome.SessionNotReady: return "Starting face tracking…";
                case ARDiagnosticOutcome.CameraMismatch: return "Waiting for the selfie camera";
                case ARDiagnosticOutcome.ManagerDisabled: return "Face tracking is paused";
                case ARDiagnosticOutcome.LensPrefabMissing: return "This lens is missing its effect asset";
                case ARDiagnosticOutcome.LensRendererUnavailable: return "This lens cannot render on the current setup";
                default: return "Face tracking is unavailable in this camera session";
            }
        }

        public static string Message(ARDiagnosticOutcome outcome, ARDiagnosticObservation observation)
        {
            if (outcome == ARDiagnosticOutcome.SessionNotReady)
            {
                if (observation.SessionReportedUnsupported) return "AR is unavailable in this camera session";
                if (observation.ServiceInstalling) return "Updating face tracking services…";
                if (observation.ServiceNeedsInstall) return "Install or update Google Play Services for AR";
                if (observation.Permission == ARPermissionObservation.Unknown) return "Allow camera access to start face tracking";
            }
            return Message(outcome);
        }
    }
}
