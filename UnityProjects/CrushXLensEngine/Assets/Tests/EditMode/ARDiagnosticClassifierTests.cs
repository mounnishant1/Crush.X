using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public class ARDiagnosticClassifierTests
    {
        [TestCase(false, true, ARDiagnosticOutcome.LensRendererUnavailable)]
        [TestCase(false, false, ARDiagnosticOutcome.NoFacesDetected)]
        [TestCase(true, true, ARDiagnosticOutcome.NoFacesDetected)]
        public void LensFailure_UsesCameraReadinessForNoFaceEffects(bool requiresFace, bool cameraReady, ARDiagnosticOutcome expected)
        {
            Assert.AreEqual(expected, ARDiagnosticClassifier.WithLensFailure(ARDiagnosticOutcome.NoFacesDetected,
                ARDiagnosticOutcome.LensRendererUnavailable, requiresFace, cameraReady));
        }

        private static ARDiagnosticObservation Ready()
        {
            return new ARDiagnosticObservation
            {
                ManagerPresent = true, ManagerEnabled = true, Permission = ARPermissionObservation.Granted,
                LoaderInitializationComplete = true, LoaderPresent = true,
                SessionPresent = true, SessionRunning = true, SessionAvailable = true,
                CameraPresent = true, CameraRunning = true, RequestedCamera = ARCameraObservation.User, CurrentCamera = ARCameraObservation.User,
                FaceSubsystemPresent = true, FaceSubsystemRunning = true
            };
        }

        [Test]
        public void UnansweredPermissionPrompt_IsPendingInsteadOfDenied()
        {
            var value = Ready(); value.Permission = ARPermissionObservation.Unknown;
            value.LoaderInitializationComplete = false; value.LoaderPresent = false;
            Assert.AreEqual(ARDiagnosticOutcome.SessionNotReady, ARDiagnosticClassifier.Classify(value));
            value.Permission = ARPermissionObservation.Denied;
            Assert.AreEqual(ARDiagnosticOutcome.PermissionDenied, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void LoaderMissing_IsReportedOnlyAfterInitializationCompletes()
        {
            var value = Ready(); value.LoaderPresent = false; value.LoaderInitializationComplete = false;
            Assert.AreEqual(ARDiagnosticOutcome.SessionNotReady, ARDiagnosticClassifier.Classify(value));
            value.LoaderInitializationComplete = true;
            Assert.AreEqual(ARDiagnosticOutcome.LoaderMissing, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void TrackingFaces_DoNotRequireWorldSessionReadiness()
        {
            var value = Ready(); value.SessionAvailable = false; value.SessionRunning = false;
            value.FaceCount = 1; value.TrackingFaceCount = 1;
            Assert.AreEqual(ARDiagnosticOutcome.Tracking, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void CameraRequest_DoesNotEstablishActualSelfieCamera()
        {
            var value = Ready(); value.CurrentCamera = ARCameraObservation.Unknown;
            Assert.AreEqual(ARDiagnosticOutcome.SessionNotReady, ARDiagnosticClassifier.Classify(value));
            value.CurrentCamera = ARCameraObservation.World;
            Assert.AreEqual(ARDiagnosticOutcome.CameraMismatch, ARDiagnosticClassifier.Classify(value));
            value.CurrentCamera = ARCameraObservation.User;
            Assert.AreEqual(ARDiagnosticOutcome.NoFacesDetected, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void FacesDetected_LimitedThenTrackingThenLost_AreDistinct()
        {
            var value = Ready();
            Assert.AreEqual(ARDiagnosticOutcome.NoFacesDetected, ARDiagnosticClassifier.Classify(value));
            value.FaceCount = 1;
            Assert.AreEqual(ARDiagnosticOutcome.FacesNotTracking, ARDiagnosticClassifier.Classify(value));
            value.TrackingFaceCount = 1;
            Assert.AreEqual(ARDiagnosticOutcome.Tracking, ARDiagnosticClassifier.Classify(value));
            value.FaceCount = 0; value.TrackingFaceCount = 0;
            Assert.AreEqual(ARDiagnosticOutcome.NoFacesDetected, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void LongStartupTimeout_DoesNotProveUnsupportedHardware()
        {
            var value = Ready(); value.SessionAvailable = false; value.ElapsedSeconds = 300;
            Assert.AreEqual(ARDiagnosticOutcome.SessionNotReady, ARDiagnosticClassifier.Classify(value));
        }

        [Test]
        public void ExplicitProviderServiceStates_HaveActionableMessages()
        {
            var value = Ready(); value.SessionAvailable = false; value.ServiceNeedsInstall = true;
            Assert.That(ARDiagnosticClassifier.Message(ARDiagnosticOutcome.SessionNotReady, value), Does.Contain("Install or update"));
            value.ServiceNeedsInstall = false; value.SessionReportedUnsupported = true;
            Assert.That(ARDiagnosticClassifier.Message(ARDiagnosticOutcome.SessionNotReady, value), Does.Contain("camera session"));
            Assert.That(ARDiagnosticClassifier.Message(ARDiagnosticOutcome.SessionNotReady, value), Does.Not.Contain("device"));
        }

        [Test]
        public void MissingDisabledAndStoppedManagers_AreDifferentObservations()
        {
            var value = Ready(); value.ManagerPresent = false;
            Assert.AreEqual(ARDiagnosticOutcome.ManagerMissing, ARDiagnosticClassifier.Classify(value));
            value.ManagerPresent = true; value.ManagerEnabled = false;
            Assert.AreEqual(ARDiagnosticOutcome.ManagerDisabled, ARDiagnosticClassifier.Classify(value));
            value.ManagerEnabled = true; value.FaceSubsystemPresent = false;
            Assert.AreEqual(ARDiagnosticOutcome.SubsystemMissing, ARDiagnosticClassifier.Classify(value));
            value.FaceSubsystemPresent = true; value.FaceSubsystemRunning = false;
            Assert.AreEqual(ARDiagnosticOutcome.SubsystemStopped, ARDiagnosticClassifier.Classify(value));
        }
    }
}
