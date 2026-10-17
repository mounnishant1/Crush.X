using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using Unity.Collections;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using UnityEngine.XR.Management;
using Debug = UnityEngine.Debug;

namespace CrushX.LensEngine
{
    [Serializable]
    public sealed class ARDiagnosticBuildInfo
    {
        public int schemaVersion;
        public string buildId, commitSha, applicationVersion, packageId, unityVersion, buildUtc;
        public bool developmentBuild;
        public string arFoundationVersion, arCoreVersion, xrManagementVersion, inputSystemVersion, renderPipelineVersion;
    }

    // Status sampling is usable by release UI. Detailed collection and logging exist only in development/editor.
    [DisallowMultipleComponent]
    public sealed class ARTrackingDiagnostics : MonoBehaviour
    {
        public static ARTrackingDiagnostics Instance { get; private set; }
        public ARDiagnosticOutcome CurrentTrackingOutcome { get; private set; } = ARDiagnosticOutcome.SessionNotReady;
        public ARDiagnosticOutcome CurrentOutcome { get; private set; } = ARDiagnosticOutcome.SessionNotReady;
        public string CurrentMessage { get { return ARDiagnosticClassifier.Message(CurrentOutcome, LastObservation); } }
        public ARDiagnosticObservation LastObservation { get; private set; }

        private ARFaceManager faceManager;
        private ARCameraManager cameraManager;
        private ARSession session;
        private string selectedLens = string.Empty;
        private ARDiagnosticOutcome? lensFailure;
        private ARPermissionObservation permissionDecision;
        private float startedAt, nextSample;

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        private string lastSignature;
        private float nextSnapshot;
        private int periodicSnapshots;
        private string arService = "not queried";
        private string manufacturer = "unknown";
        private string supportedConfigurations = "not queried";
        private bool configurationsQueried;
        private string configurationCamera;
        private XRCameraSubsystem configurationSubsystem;
        private bool applicationPaused;
        private readonly StringBuilder faceStates = new StringBuilder();
        private readonly HashSet<string> collectionErrors = new HashSet<string>();
        private static readonly string logSessionId = Guid.NewGuid().ToString("N");
        private static long logRecordSequence;

        [Serializable]
        private sealed class CoreSnapshot
        {
            public string eventName, outcome, trackingOutcome, selectedLens, lensFailure, permission, sessionState, currentCamera;
            public bool managerPresent, managerEnabled, loaderReady, sessionRunning, cameraRunning, faceRunning;
            public int faceCount, trackingFaceCount;
        }

        [Serializable]
        private sealed class Snapshot
        {
            public string eventName, outcome, trackingOutcome, selectedLens, lensFailure, scene, permission, activeLoader, sessionState;
            public string sessionNotTrackingReason, nativeSessionNotTrackingReason, requestedCamera, currentCamera;
            public string requestedTrackingMode, currentTrackingMode, sessionRequestedFeatures, sessionConfiguration;
            public string availableSessionConfigurations, selectedCameraConfiguration, supportedCameraConfigurations;
            public string cameraSubsystemId, faceSubsystemId, sessionSubsystemId, perFaceStates;
            public string renderingPipeline, graphicsApi, gpu, arService;
            public bool loaderInitializationComplete, managerPresent, managerEnabled, sessionRunning;
            public bool cameraSubsystemPresent, cameraSubsystemRunning, cameraPermissionGranted;
            public bool faceSubsystemPresent, faceSubsystemRunning;
            public int faceCount, trackingFaceCount, requestedFaceCount, currentMaximumFaceCount, supportedFaceCount;
            public double elapsedSeconds;
        }
#endif

        private void Awake()
        {
            if (Instance != null && Instance != this) { enabled = false; return; }
            Instance = this;
            startedAt = Time.realtimeSinceStartup;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            try
            {
                ReadAndroidEnvironment();
                TextAsset asset = Resources.Load<TextAsset>("CrushXBuildInfo");
                string metadata = asset == null ? "unavailable (ad hoc build; exact commit/build ID unknown)" : asset.text;
                EmitDiagnostic("build", metadata);
                EmitDiagnostic("environment", JsonUtility.ToJson(new EnvironmentInfo
                {
                    applicationVersion = Application.version, packageId = Application.identifier,
                    unityVersion = Application.unityVersion, deviceModel = SystemInfo.deviceModel,
                    manufacturer = manufacturer, operatingSystem = SystemInfo.operatingSystem,
                    arService = arService, graphicsApi = SystemInfo.graphicsDeviceType.ToString(),
                    gpu = SystemInfo.graphicsDeviceName, pipeline = PipelineName()
                }));
                EmitDiagnostic("guidance", "Native ARCore configure/resume errors require full adb logcat; XRFaceSubsystem has no generic failureReason. Session tracking reasons describe the session, not face support.");
            }
            catch (Exception e) { ReportCollectionFailure(e); }
#endif
        }

        private void OnEnable()
        {
            if (Instance != this) return;
            ARSession.stateChanged += SessionStateChanged;
            SceneManager.sceneLoaded += SceneLoaded;
            RecordLifecycle("enabled");
        }

        private void OnDisable()
        {
            ARSession.stateChanged -= SessionStateChanged;
            SceneManager.sceneLoaded -= SceneLoaded;
            if (Instance == this) RecordLifecycle("disabled");
        }

        private void OnDestroy() { if (Instance == this) Instance = null; }
        private void OnApplicationPause(bool paused)
        {
            RecordLifecycle(paused ? "paused" : "resumed");
            nextSample = 0;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            applicationPaused = paused;
            InvalidateCameraConfigurations(paused ? "application paused" : "application resumed");
#endif
        }
        private void OnApplicationFocus(bool focused)
        {
            RecordLifecycle(focused ? "focused" : "unfocused");
            nextSample = 0;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (focused) InvalidateCameraConfigurations("application focused");
#endif
        }
        private void SceneLoaded(Scene scene, LoadSceneMode mode) { RecordLifecycle("sceneLoaded:" + scene.name + ":" + mode); nextSample = 0; }
        private void SessionStateChanged(ARSessionStateChangedEventArgs args) { nextSample = 0; }

        private void Update()
        {
            if (Instance != this || Time.realtimeSinceStartup < nextSample) return;
            nextSample = Time.realtimeSinceStartup + .5f;
            ResolveObjects();
            LastObservation = Observe();
            CurrentTrackingOutcome = ARDiagnosticClassifier.Classify(LastObservation);
            RefreshOutcome();
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (applicationPaused) return;
            string signature = selectedLens + "|" + lensFailure + "|" + CurrentOutcome + "|" + ARSession.state + "|" + ARSession.notTrackingReason + "|" +
                LastObservation.Permission + "|" + LastObservation.LoaderPresent + "|" + LastObservation.LoaderInitializationComplete + "|" +
                LastObservation.CameraPresent + "|" + LastObservation.CameraRunning + "|" + LastObservation.CurrentCamera + "|" +
                LastObservation.FaceSubsystemPresent + "|" + LastObservation.FaceSubsystemRunning + "|" + faceStates;
            bool cameraConfigurationChanged = !ReferenceEquals(configurationSubsystem, cameraManager == null ? null : cameraManager.subsystem) ||
                configurationCamera != (cameraManager == null ? "none" : cameraManager.currentFacingDirection.ToString());
            bool changed = signature != lastSignature || cameraConfigurationChanged;
            bool periodic = Time.realtimeSinceStartup >= nextSnapshot && periodicSnapshots < 12;
            if (changed || periodic)
            {
                if (periodic) periodicSnapshots++;
                WriteSnapshot(changed ? "transition" : "snapshot");
                lastSignature = signature;
                nextSnapshot = Time.realtimeSinceStartup + 15;
            }
#endif
        }

        private void ResolveObjects()
        {
            if (faceManager == null) faceManager = FindFirstObjectByType<ARFaceManager>(FindObjectsInactive.Include);
            if (cameraManager == null) cameraManager = FindFirstObjectByType<ARCameraManager>(FindObjectsInactive.Include);
            if (session == null) session = FindFirstObjectByType<ARSession>(FindObjectsInactive.Include);
        }

        private ARDiagnosticObservation Observe()
        {
            XRManagerSettings manager = XRGeneralSettings.Instance == null ? null : XRGeneralSettings.Instance.Manager;
            var value = new ARDiagnosticObservation
            {
                ManagerPresent = faceManager != null, ManagerEnabled = faceManager != null && faceManager.isActiveAndEnabled,
                Permission = ObservePermission(), LoaderInitializationComplete = manager != null && manager.isInitializationComplete,
                LoaderPresent = manager != null && manager.activeLoader != null,
                SessionPresent = session != null && session.subsystem != null,
                SessionRunning = session != null && session.subsystem != null && session.subsystem.running,
                SessionAvailable = ARSession.state == ARSessionState.Ready || ARSession.state == ARSessionState.SessionInitializing || ARSession.state == ARSessionState.SessionTracking,
                SessionReportedUnsupported = ARSession.state == ARSessionState.Unsupported,
                ServiceNeedsInstall = ARSession.state == ARSessionState.NeedsInstall,
                ServiceInstalling = ARSession.state == ARSessionState.Installing,
                CameraPresent = cameraManager != null && cameraManager.subsystem != null,
                CameraRunning = cameraManager != null && cameraManager.isActiveAndEnabled && cameraManager.subsystem != null && cameraManager.subsystem.running,
                RequestedCamera = cameraManager == null ? ARCameraObservation.Unknown : CameraObservation(cameraManager.requestedFacingDirection),
                CurrentCamera = cameraManager == null ? ARCameraObservation.Unknown : CameraObservation(cameraManager.currentFacingDirection),
                FaceSubsystemPresent = faceManager != null && faceManager.subsystem != null,
                FaceSubsystemRunning = faceManager != null && faceManager.subsystem != null && faceManager.subsystem.running,
                ElapsedSeconds = Time.realtimeSinceStartup - startedAt
            };
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            faceStates.Clear();
#endif
            if (faceManager != null)
                foreach (ARFace face in faceManager.trackables)
                {
                    if (face == null) continue;
                    value.FaceCount++;
                    if (face.trackingState == TrackingState.Tracking) value.TrackingFaceCount++;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                    faceStates.Append(face.trackableId).Append(':').Append(face.trackingState).Append(';');
#endif
                }
            return value;
        }

        private ARPermissionObservation ObservePermission()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Camera))
                return ARPermissionObservation.Granted;
            // False alone also describes an unanswered permission prompt. Do not invent denial.
            if (permissionDecision == ARPermissionObservation.Denied) return permissionDecision;
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                    if (activity.Call<bool>("shouldShowRequestPermissionRationale", UnityEngine.Android.Permission.Camera))
                        return ARPermissionObservation.Denied;
            }
            catch (Exception) { /* Grant remains unknown; no extra permission requests. */ }
            return ARPermissionObservation.Unknown;
#else
            return cameraManager != null && cameraManager.permissionGranted ? ARPermissionObservation.Granted : permissionDecision;
#endif
        }

        private static ARCameraObservation CameraObservation(CameraFacingDirection direction)
        {
            return direction == CameraFacingDirection.User ? ARCameraObservation.User :
                direction == CameraFacingDirection.World ? ARCameraObservation.World : ARCameraObservation.Unknown;
        }

        private void RefreshOutcome()
        {
            LensManifest? manifest = LensCatalog.Find(selectedLens);
            bool requiresFace = !manifest.HasValue || (manifest.Value.RequiredCapabilities &
                (TrackingCapabilities.FacePose | TrackingCapabilities.FaceMesh | TrackingCapabilities.Expressions)) != 0;
            CurrentOutcome = ARDiagnosticClassifier.WithLensFailure(CurrentTrackingOutcome, lensFailure, requiresFace,
                LastObservation.CameraRunning && LastObservation.Permission == ARPermissionObservation.Granted);
        }

        // Permission owners may report their existing callback here. This service never requests permissions.
        public static void RecordCameraPermissionResult(bool granted)
        {
            if (Instance != null) { Instance.permissionDecision = granted ? ARPermissionObservation.Granted : ARPermissionObservation.Denied; Instance.nextSample = 0; }
            LogEvent("cameraPermissionResult", granted ? "granted" : "denied");
        }

        public static void RecordLensSelection(string lensId, bool available, string detail = null)
        {
            if (Instance != null && available)
            {
                Instance.lensFailure = null;
                Instance.selectedLens = lensId ?? string.Empty;
                Instance.RefreshOutcome();
            }
            LogEvent("lensSelection", (lensId ?? "none") + " available=" + available + " " + detail);
        }

        public static void RecordLensStatus(string lensId, ARDiagnosticOutcome outcome, string detail)
        {
            if (Instance != null && string.Equals(Instance.selectedLens, lensId, StringComparison.Ordinal))
            {
                Instance.lensFailure = outcome == ARDiagnosticOutcome.LensPrefabMissing || outcome == ARDiagnosticOutcome.LensRendererUnavailable ? outcome : (ARDiagnosticOutcome?)null;
                Instance.RefreshOutcome();
            }
            LogEvent("lensStatus", lensId + " " + outcome + " " + detail, outcome.ToString());
        }

        public static void RecordLensRollback(string activeLensId, bool restored)
        {
            if (Instance != null)
            {
                // Restore the identity even when restoring its rendering failed. A rejected
                // candidate must not remain the selected lens in diagnostic snapshots.
                Instance.selectedLens = activeLensId ?? string.Empty;
                Instance.lensFailure = restored ? (ARDiagnosticOutcome?)null : ARDiagnosticOutcome.LensRendererUnavailable;
                Instance.RefreshOutcome();
            }
            LogEvent("lensRollback", (activeLensId ?? "none") + " restored=" + restored);
        }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD")]
        public static void RecordLifecycle(string transition) { LogEvent("lifecycle", transition + " scene=" + SceneManager.GetActiveScene().name); }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD")]
        public static void RecordFoxEvent(string eventName, ARFace face, GameObject instance, string detail = null)
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            try
            {
                var value = new StringBuilder();
                value.Append("face=").Append(face == null ? "none" : face.trackableId.ToString()).Append(" tracking=").Append(face == null ? "none" : face.trackingState.ToString());
                if (instance != null)
                {
                    Transform parent = instance.transform.parent;
                    value.Append(" instance=").Append(instance.GetInstanceID()).Append(" parent=").Append(parent == null ? "none" : parent.name)
                        .Append(" boundToFace=").Append(face != null && parent == face.transform)
                        .Append(" activeSelf=").Append(instance.activeSelf).Append(" activeInHierarchy=").Append(instance.activeInHierarchy)
                        .Append(" localPosition=").Append(instance.transform.localPosition).Append(" localRotation=").Append(instance.transform.localEulerAngles)
                        .Append(" localScale=").Append(instance.transform.localScale).Append(" pipeline=").Append(PipelineName());
                    Renderer[] renderers = instance.GetComponentsInChildren<Renderer>(true);
                    value.Append(" rendererCount=").Append(renderers.Length);
                    foreach (Renderer renderer in renderers)
                    {
                        value.Append(" [renderer=").Append(renderer.name).Append(" enabled=").Append(renderer.enabled)
                            .Append(" active=").Append(renderer.gameObject.activeInHierarchy).Append(" visibleAnyCamera=").Append(renderer.isVisible)
                            .Append(" bounds=").Append(renderer.bounds).Append(" layer=").Append(renderer.gameObject.layer);
                        foreach (Material material in renderer.sharedMaterials)
                            value.Append(" material=").Append(material == null ? "null" : material.name)
                                .Append(" shader=").Append(material == null || material.shader == null ? "null" : material.shader.name)
                                .Append(" supported=").Append(material != null && material.shader != null && material.shader.isSupported)
                                .Append(" renderQueue=").Append(material == null ? -1 : material.renderQueue);
                        value.Append(']');
                    }
                }
                LogEvent("fox:" + eventName, value + " " + detail);
            }
            catch (Exception e) { if (Instance != null) Instance.ReportCollectionFailure(e); }
#endif
        }

        [Conditional("UNITY_EDITOR"), Conditional("DEVELOPMENT_BUILD")]
        private static void LogEvent(string eventName, string detail, string outcome = null)
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            try
            {
                EmitDiagnostic("event", JsonUtility.ToJson(new EventInfo { eventName = eventName, detail = detail, outcome = outcome, elapsedSeconds = Time.realtimeSinceStartup }));
            }
            catch (Exception e) { if (Instance != null) Instance.ReportCollectionFailure(e); }
#endif
        }

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        [Serializable] private sealed class EventInfo { public string eventName, detail, outcome; public double elapsedSeconds; }
        [Serializable] private sealed class EnvironmentInfo
        {
            public string applicationVersion, packageId, unityVersion, deviceModel, manufacturer, operatingSystem, arService, graphicsApi, gpu, pipeline;
        }

        private static string PipelineName() { return GraphicsSettings.currentRenderPipeline == null ? "Built-in" : GraphicsSettings.currentRenderPipeline.GetType().FullName; }

        private static void EmitDiagnostic(string kind, string payload, CoreSnapshot core = null)
        {
            // Transport and summary failures must never escape into lens or tracking lifecycle code.
            try
            {
                string recordId = logSessionId + "-" + System.Threading.Interlocked.Increment(ref logRecordSequence).ToString("x");
                if (core != null)
                {
                    try { Debug.Log(ARDiagnosticLogProtocol.Core(recordId, JsonUtility.ToJson(core))); }
                    catch (Exception) { Debug.Log("[CrushX AR] diagnosticCoreUnavailable record=" + recordId); }
                }
                foreach (string line in ARDiagnosticLogProtocol.Packets(recordId, kind, payload)) Debug.Log(line);
            }
            catch (Exception)
            {
                try { Debug.LogWarning("[CrushX AR] diagnosticLoggingUnavailable"); }
                catch (Exception) { /* Diagnostics cannot interrupt the application. */ }
            }
        }

        private void ReportCollectionFailure(Exception exception)
        {
            try
            {
                if (collectionErrors.Add(exception.GetType().FullName))
                    EmitDiagnostic("collectionWarning", JsonUtility.ToJson(new EventInfo
                    {
                        eventName = "diagnosticCollectionUnavailable", detail = exception.GetType().Name,
                        elapsedSeconds = Time.realtimeSinceStartup
                    }));
            }
            catch (Exception) { /* Diagnostic error reporting is also best effort. */ }
        }

        private void ReadAndroidEnvironment()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var build = new AndroidJavaClass("android.os.Build")) manufacturer = build.GetStatic<string>("MANUFACTURER");
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                using (var packages = activity.Call<AndroidJavaObject>("getPackageManager"))
                using (var info = packages.Call<AndroidJavaObject>("getPackageInfo", "com.google.ar.core", 0))
                    arService = "com.google.ar.core versionName=" + info.Get<string>("versionName") + " versionCode=" + info.Get<int>("versionCode");
            }
            catch (Exception e) { arService = "unavailable to package query (absent or Android package visibility): " + e.GetType().Name; }
#else
            arService = "not Android runtime";
#endif
        }

        private void InvalidateCameraConfigurations(string reason)
        {
            configurationsQueried = false;
            configurationCamera = null;
            configurationSubsystem = null;
            supportedConfigurations = "not queried (" + reason + ")";
            // Resume/focus must produce one fresh snapshot even after the periodic budget is exhausted.
            lastSignature = null;
        }

        private void WriteSnapshot(string eventName)
        {
            try
            {
                XRManagerSettings manager = XRGeneralSettings.Instance == null ? null : XRGeneralSettings.Instance.Manager;
                var value = LastObservation;
                var camera = cameraManager == null ? null : cameraManager.subsystem;
                var faces = faceManager == null ? null : faceManager.subsystem;
                var nativeSession = session == null ? null : session.subsystem;
                string currentCamera = cameraManager == null ? "none" : cameraManager.currentFacingDirection.ToString();
                if (!ReferenceEquals(configurationSubsystem, camera) || configurationCamera != currentCamera)
                {
                    configurationsQueried = false;
                    configurationSubsystem = camera;
                    configurationCamera = currentCamera;
                    supportedConfigurations = "not queried (camera subsystem or direction changed)";
                }
                // Retry incomplete startup observations only when a bounded snapshot is already being written.
                if (!applicationPaused && camera != null && camera.running && !configurationsQueried)
                {
                    try
                    {
                        using (var configurations = cameraManager.GetConfigurations(Allocator.Temp))
                        {
                            var text = new StringBuilder();
                            foreach (var configuration in configurations) text.Append(configuration).Append(';');
                            configurationsQueried = configurations.Length > 0;
                            supportedConfigurations = configurationsQueried ? text.ToString() : "none reported (will retry on a later diagnostic snapshot)";
                        }
                    }
                    catch (Exception e)
                    {
                        configurationsQueried = false;
                        supportedConfigurations = "query unavailable: " + e.GetType().Name + " (will retry on a later diagnostic snapshot)";
                    }
                }
                string descriptors = "session not running";
                if (nativeSession != null && nativeSession.running)
                    try
                    {
                        using (var configurations = nativeSession.GetConfigurationDescriptors(Allocator.Temp))
                        {
                            var text = new StringBuilder();
                            foreach (var configuration in configurations)
                                text.Append("id=").Append(configuration.identifier).Append(" capabilities=").Append(configuration.capabilities).Append(" rank=").Append(configuration.rank).Append(';');
                            descriptors = text.Length == 0 ? "none reported" : text.ToString();
                        }
                    }
                    catch (Exception e) { descriptors = "query unavailable: " + e.GetType().Name; }

                var snapshot = new Snapshot
                {
                    eventName = eventName, outcome = CurrentOutcome.ToString(), trackingOutcome = CurrentTrackingOutcome.ToString(),
                    selectedLens = selectedLens, lensFailure = lensFailure.HasValue ? lensFailure.Value.ToString() : "none", scene = SceneManager.GetActiveScene().name,
                    permission = value.Permission == ARPermissionObservation.Unknown ? "notGrantedOrUnknownDecision (not proof of denial)" : value.Permission.ToString(),
                    activeLoader = manager == null || manager.activeLoader == null ? "none" : manager.activeLoader.GetType().FullName,
                    loaderInitializationComplete = value.LoaderInitializationComplete, managerPresent = value.ManagerPresent, managerEnabled = value.ManagerEnabled,
                    sessionState = ARSession.state.ToString(), sessionNotTrackingReason = ARSession.notTrackingReason.ToString(),
                    nativeSessionNotTrackingReason = nativeSession == null ? "unavailable" : nativeSession.notTrackingReason.ToString(),
                    sessionSubsystemId = nativeSession == null ? "none" : nativeSession.subsystemDescriptor.id, sessionRunning = value.SessionRunning,
                    requestedCamera = value.RequestedCamera.ToString(), currentCamera = currentCamera,
                    requestedTrackingMode = session == null ? "none" : session.requestedTrackingMode.ToString(), currentTrackingMode = session == null ? "none" : session.currentTrackingMode.ToString(),
                    sessionRequestedFeatures = nativeSession == null ? "unavailable" : nativeSession.requestedFeatures.ToString(),
                    sessionConfiguration = nativeSession == null || !nativeSession.currentConfiguration.HasValue ? "none" :
                        "id=" + nativeSession.currentConfiguration.Value.descriptor.identifier + " features=" + nativeSession.currentConfiguration.Value.features +
                        " capabilities=" + nativeSession.currentConfiguration.Value.descriptor.capabilities + " rank=" + nativeSession.currentConfiguration.Value.descriptor.rank,
                    availableSessionConfigurations = descriptors, selectedCameraConfiguration = cameraManager == null || !cameraManager.currentConfiguration.HasValue ? "none" : cameraManager.currentConfiguration.Value.ToString(),
                    supportedCameraConfigurations = supportedConfigurations, cameraSubsystemId = camera == null ? "none" : camera.subsystemDescriptor.id,
                    cameraSubsystemPresent = value.CameraPresent, cameraSubsystemRunning = value.CameraRunning, cameraPermissionGranted = cameraManager != null && cameraManager.permissionGranted,
                    faceSubsystemId = faces == null ? "none" : faces.subsystemDescriptor.id, faceSubsystemPresent = value.FaceSubsystemPresent, faceSubsystemRunning = value.FaceSubsystemRunning,
                    faceCount = value.FaceCount, trackingFaceCount = value.TrackingFaceCount, perFaceStates = faceStates.ToString(),
                    requestedFaceCount = faceManager == null ? 0 : faceManager.requestedMaximumFaceCount,
                    currentMaximumFaceCount = faceManager == null ? 0 : faceManager.currentMaximumFaceCount, supportedFaceCount = faceManager == null ? 0 : faceManager.supportedFaceCount,
                    renderingPipeline = PipelineName(), graphicsApi = SystemInfo.graphicsDeviceType.ToString(), gpu = SystemInfo.graphicsDeviceName,
                    arService = arService, elapsedSeconds = value.ElapsedSeconds
                };
                EmitDiagnostic("snapshot", JsonUtility.ToJson(snapshot), new CoreSnapshot
                {
                    eventName = eventName, outcome = CurrentOutcome.ToString(), trackingOutcome = CurrentTrackingOutcome.ToString(),
                    selectedLens = ARDiagnosticLogProtocol.SummaryValue(selectedLens), lensFailure = lensFailure.HasValue ? lensFailure.Value.ToString() : "none",
                    permission = value.Permission.ToString(), sessionState = ARSession.state.ToString(), currentCamera = currentCamera,
                    managerPresent = value.ManagerPresent, managerEnabled = value.ManagerEnabled,
                    loaderReady = value.LoaderInitializationComplete && value.LoaderPresent, sessionRunning = value.SessionRunning,
                    cameraRunning = value.CameraRunning, faceRunning = value.FaceSubsystemRunning,
                    faceCount = value.FaceCount, trackingFaceCount = value.TrackingFaceCount
                });
            }
            catch (Exception e)
            {
                ReportCollectionFailure(e);
            }
        }
#endif
    }
}
