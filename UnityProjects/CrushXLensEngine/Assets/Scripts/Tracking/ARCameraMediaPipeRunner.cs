using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Samples the EXISTING ARCameraManager CPU image at a bounded rate, converts
    /// to 256x256 RGBA and hands it to a dedicated Android inference worker.
    /// No second camera is opened. Unity rendering never waits for inference.
    /// </summary>
    public sealed class ARCameraMediaPipeRunner : MonoBehaviour
    {
        public ARCameraManager CameraManager;
        public LensEngineBootstrap Engine;

        [Range(5f, 15f)] public float MaximumInferenceFps = 10f;
        [Tooltip("Calibrate orientation against the actual ARCameraBackground on Android.")]
        public int RotationDegrees = 0;
        public bool MirrorForPreview = false;
        public bool IsReady { get; private set; }

        private readonly object gate = new object();
        private byte[] convertedFrame;
        private float lastCaptureAt = -999f;
        private volatile bool conversionPending;
        private bool initializationAttempted;
        private volatile bool stopped;
        private bool started;
        private int conversionEpoch;

        public bool SetCameraAlignment(int rotationDegrees, bool mirrorPreview)
        {
            if (rotationDegrees != 0 && rotationDegrees != 90 &&
                rotationDegrees != 180 && rotationDegrees != 270) return false;
            if (RotationDegrees == rotationDegrees && MirrorForPreview == mirrorPreview)
                return true;
            RotationDegrees = rotationDegrees;
            MirrorForPreview = mirrorPreview;
            conversionEpoch++;
            lock (gate) convertedFrame = null;
            if (Engine != null) Engine.ClearAllTrackingFrames();
            return true;
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        private AndroidJavaObject native;
#endif

        private void Start()
        {
            started = true;
            StartNative();
        }

        private void OnEnable()
        {
            if (started) StartNative();
        }

        private void StartNative()
        {
            stopped = false;
            IsReady = false;
            conversionEpoch++;
            initializationAttempted = false;
            if (CameraManager == null) CameraManager = FindFirstObjectByType<ARCameraManager>();
            if (Engine == null) Engine = FindFirstObjectByType<LensEngineBootstrap>();
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                {
                    native = new AndroidJavaObject(
                        "com.crushx.lens.CrushXFaceLandmarkerBridge");
                    initializationAttempted = native.Call<bool>(
                        "initialize", activity, "face_landmarker.task");
                }
            }
            catch (AndroidJavaException error)
            {
                Debug.LogWarning("MediaPipe initialization unavailable: " +
                    error.GetType().Name);
                initializationAttempted = false;
            }
#endif
        }

        private void Update()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (native == null || !initializationAttempted || stopped || Engine == null)
                return;
            bool ready;
            try { ready = native.Call<bool>("isReady"); }
            catch (AndroidJavaException) { ready = false; }
            if (ready != IsReady)
            {
                IsReady = ready;
                Engine.SetPreciseTrackingAvailable(ready);
            }
            if (!ready) return;

            // Drain last inference output on the Unity thread; processing and
            // packet age validation remain downstream of the native JNI worker.
            try
            {
                string result = native.Call<string>("pollLatest");
                if (!string.IsNullOrEmpty(result))
                    Engine.PushMediaPipeResult(result);
                string faces = native.Call<string>("pollLatestFaces");
                if (!string.IsNullOrEmpty(faces))
                    Engine.PushMultiFaceResult(faces);
            }
            catch (AndroidJavaException error)
            {
                Debug.LogWarning("MediaPipe output failed: " + error.GetType().Name);
                Engine.SetPreciseTrackingAvailable(false);
                IsReady = false;
                return;
            }

            byte[] readyBytes = null;
            lock (gate)
            {
                if (convertedFrame != null)
                {
                    readyBytes = convertedFrame;
                    convertedFrame = null;
                }
            }
            if (readyBytes != null)
            {
                try
                {
                    // The worker is at most one frame deep and rejects busy calls.
                    native.Call<bool>("submitFrame", readyBytes, 256, 256,
                        RotationDegrees, MirrorForPreview);
                }
                catch (AndroidJavaException error)
                {
                    Debug.LogWarning("MediaPipe frame submission failed: " +
                        error.GetType().Name);
                }
            }
#endif

            if (!IsReady || CameraManager == null ||
                !CameraManager.isActiveAndEnabled ||
                Time.unscaledTime - lastCaptureAt <
                1f / Mathf.Max(5f, MaximumInferenceFps) ||
                conversionPending) return;

            // Never retain the native CPU image: async conversion copies it.
            if (!CameraManager.TryAcquireLatestCpuImage(out XRCpuImage cpuImage))
                return;
            try
            {
                var conversion = new XRCpuImage.ConversionParams
                {
                    inputRect = new RectInt(0, 0, cpuImage.width, cpuImage.height),
                    outputDimensions = new Vector2Int(256, 256),
                    outputFormat = TextureFormat.RGBA32,
                    transformation = XRCpuImage.Transformation.None
                };
                conversionPending = true;
                lastCaptureAt = Time.unscaledTime;
                int captureEpoch = conversionEpoch;
                cpuImage.ConvertAsync(conversion,
                    (status, parameters, data) =>
                        OnConverted(captureEpoch, status, parameters, data));
            }
            catch (System.Exception error)
            {
                conversionPending = false;
                Debug.LogWarning("Face frame conversion error: " + error.GetType().Name);
            }
            finally { cpuImage.Dispose(); }
        }

        private void OnConverted(int captureEpoch, XRCpuImage.AsyncConversionStatus status,
            XRCpuImage.ConversionParams parameters, NativeArray<byte> data)
        {
            try
            {
                if (!stopped && captureEpoch == conversionEpoch &&
                    status == XRCpuImage.AsyncConversionStatus.Ready &&
                    data.IsCreated && data.Length == 256 * 256 * 4)
                {
                    var bytes = data.ToArray();
                    lock (gate) convertedFrame = bytes;
                }
            }
            finally
            {
                if (captureEpoch == conversionEpoch)
                    conversionPending = false;
            }
        }

        private void OnDisable() { StopNative(); }
        private void OnDestroy() { StopNative(); }

        private void StopNative()
        {
            if (stopped) return;
            stopped = true;
            conversionEpoch++;
            conversionPending = false;
            initializationAttempted = false;
            lock (gate) convertedFrame = null;
            if (Engine != null) Engine.SetPreciseTrackingAvailable(false);
#if UNITY_ANDROID && !UNITY_EDITOR
            if (native != null)
            {
                try { native.Call("close"); }
                catch (AndroidJavaException) { }
                native.Dispose();
                native = null;
            }
#endif
            IsReady = false;
        }
    }
}
