using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace CrushX.LensEngine
{
    /// <summary>Exclusive camera owner. AR is attempted first; a native camera is opened only after AR releases
    /// its camera subsystem. Native fallback is camera preview only until a genuine CV provider is installed.</summary>
    [DisallowMultipleComponent]
    [DefaultExecutionOrder(-90)]
    public sealed class CameraSessionController : MonoBehaviour
    {
        private static CameraSessionController owner;
        public bool MirrorSelfiePreview = true;
        public Camera RenderCamera => renderCamera;
        public long CurrentImageFrameSequence => UsingNativeFallback ? nativeFrame : arFrame;
        public int Generation { get; private set; }
        public CameraSessionState State => policy.State;
        public bool RequestedFrontFacing { get; private set; } = true;
        public bool UsingNativeFallback => State == CameraSessionState.StartingNative || State == CameraSessionState.NativePreview;
        public bool PreviewReady => State == CameraSessionState.ArPreview || State == CameraSessionState.NativePreview;
        public bool ActualFrontFacing => UsingNativeFallback ? nativeFrontFacing : arCamera != null && arCamera.currentFacingDirection == CameraFacingDirection.User;
        public string LastError { get; private set; } = string.Empty;
        public string StatusMessage
        {
            get
            {
                if (!string.IsNullOrEmpty(LastError)) return LastError;
                switch (State)
                {
                    case CameraSessionState.WaitingForPermission: return "Camera access is required";
                    case CameraSessionState.StartingAr: return "Starting AR camera";
                    case CameraSessionState.ArPreview: return ActualFrontFacing ? "Front AR camera" : "Rear AR camera";
                    case CameraSessionState.ReleasingAr: return "Releasing AR camera for native preview";
                    case CameraSessionState.StartingNative: return "Starting native camera — face tracking unavailable";
                    case CameraSessionState.NativePreview: return (nativeFrontFacing ? "Front" : "Rear") + " native camera — face tracking unavailable";
                    case CameraSessionState.Suspended: return "Camera paused";
                    case CameraSessionState.Unavailable: return "Camera unavailable — tap Retry";
                    default: return "Preparing camera";
                }
            }
        }

        private readonly CameraRecoveryPolicy policy = new CameraRecoveryPolicy();
        private readonly CameraFrameFreshness arFreshness = new CameraFrameFreshness();
        private bool pendingArFrame;
        private ARCameraManager arCamera;
        private ARFaceManager arFaces;
        private ARSession arSession;
        private ARCameraBackground arBackground;
        private Camera renderCamera;
        private GameObject ownedRenderer;
        private WebCamTexture nativeCamera;
        private Material nativeMaterial;
        private CommandBuffer nativeBackground;
        private CameraClearFlags oldClearFlags;
        private bool changedClearFlags, nativeFrontFacing, paused, focused = true, restartingAr;
        private int restartAtFrame;
        private long arFrame, nativeFrame;
        private int lastSourceWidth, lastSourceHeight, lastScreenWidth, lastScreenHeight, lastRotation = -1;
        private bool lastVerticalMirror, lastSelfieMirror;

        private void Awake()
        {
            if (owner != null && owner != this)
            {
                Debug.LogError("[CrushX] A second camera owner was rejected");
                enabled = false;
                return;
            }
            owner = this;
        }

        private void OnEnable()
        {
            if (owner == this) Camera.onPostRender += ArCameraRendered;
        }

        public void Bind(ARCameraManager cameraManager, ARFaceManager faceManager)
        {
            if (arCamera != cameraManager)
            {
                Generation++;
                bool keepNative = nativeCamera != null || UsingNativeFallback;
                if (keepNative) StopNative();
                if (arCamera != null) arCamera.frameReceived -= ArFrameReceived;
                arCamera = cameraManager;
                if (arCamera != null)
                {
                    arCamera.frameReceived += ArFrameReceived;
                    arBackground = arCamera.GetComponent<ARCameraBackground>();
                    renderCamera = arCamera.GetComponent<Camera>();
                    arCamera.requestedFacingDirection = RequestedFrontFacing ? CameraFacingDirection.User : CameraFacingDirection.World;
                    if (ownedRenderer != null) { ownedRenderer.SetActive(false); Destroy(ownedRenderer); ownedRenderer = null; }
                }
                if (keepNative) policy.Retry(true);
            }
            arFaces = faceManager;
            if (arSession == null) arSession = FindFirstObjectByType<ARSession>(FindObjectsInactive.Include);
            if (renderCamera == null) renderCamera = Camera.main;
            // A host may create its rig after the native fallback began. Keep it disabled until an explicit AR retry.
            if (UsingNativeFallback || State == CameraSessionState.ReleasingAr) StopAr();
        }

        private void ArFrameReceived(ARCameraFrameEventArgs args)
        {
            bool texturesReady = args.textures != null && args.textures.Count > 0;
            if (texturesReady)
                foreach (Texture2D texture in args.textures)
                    if (texture == null) { texturesReady = false; break; }
            pendingArFrame = arFreshness.TryAccept(texturesReady, args.timestampNs, Time.realtimeSinceStartupAsDouble);
        }

        private void ArCameraRendered(Camera rendered)
        {
            if (rendered != renderCamera || !pendingArFrame) return;
            pendingArFrame = false;
            // ARCameraBackground can disable itself for an empty texture set even while frameReceived keeps firing.
            // Count only accepted sensor images after this camera's background reached its rendering callback.
            if (arCamera != null && arCamera.isActiveAndEnabled && arBackground != null && arBackground.isActiveAndEnabled &&
                arBackground.backgroundRenderingEnabled && arBackground.material != null &&
                arBackground.material.shader != null && arBackground.material.shader.isSupported)
                arFrame++;
        }

        public void Retry()
        {
            Generation++;
            StopResources();
            LastError = string.Empty;
            policy.Retry();
        }

        public bool SwitchCamera()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!Permission.HasUserAuthorizedPermission(Permission.Camera)) return false;
            bool requested = !RequestedFrontFacing;
            bool found = false;
            foreach (WebCamDevice device in WebCamTexture.devices)
                if (device.isFrontFacing == requested) { found = true; break; }
            if (!found) { LastError = "The other camera is unavailable on this device"; return false; }
            bool keepNative = UsingNativeFallback;
            StopResources();
            Generation++;
            RequestedFrontFacing = requested;
            LastError = string.Empty;
            policy.Retry(keepNative);
            return true;
#else
            LastError = "Camera switching requires an Android camera device";
            return false;
#endif
        }

        private void Update()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (owner != this) return;
            bool granted = Permission.HasUserAuthorizedPermission(Permission.Camera);
            bool foreground = !paused && focused && Application.isFocused;
            try
            {
            if (restartingAr && foreground && granted && Time.frameCount >= restartAtFrame)
            {
                restartingAr = false;
                StartAr();
            }
            if (nativeCamera != null && nativeCamera.isPlaying && nativeCamera.didUpdateThisFrame && nativeCamera.width > 16 && nativeCamera.height > 16)
            {
                nativeFrame++;
                UpdateNativeTransform();
            }
            var observation = new CameraSessionObservation
            {
                PermissionGranted = granted,
                Foreground = foreground,
                HasArRig = arCamera != null && arSession != null,
                ArRunning = AnyArCameraRunning(),
                ArFacingMatches = arCamera != null && arCamera.currentFacingDirection == (RequestedFrontFacing ? CameraFacingDirection.User : CameraFacingDirection.World),
                ArFrame = arFrame,
                NativePlaying = nativeCamera != null && nativeCamera.isPlaying,
                NativeFrame = nativeFrame
            };
            CameraSessionAction action = policy.Tick(observation, Time.realtimeSinceStartupAsDouble);
                switch (action)
                {
                    case CameraSessionAction.StopAll: StopResources(); break;
                    case CameraSessionAction.StartAr: StartAr(); break;
                    case CameraSessionAction.RestartAr:
                        StopAr(); restartingAr = true; restartAtFrame = Time.frameCount + 1; break;
                    case CameraSessionAction.StopAr: StopAr(); break;
                    case CameraSessionAction.StartNative: StartNative(); break;
                    case CameraSessionAction.RestartNative: StopNative(); StartNative(); break;
                }
                if (State == CameraSessionState.Unavailable && string.IsNullOrEmpty(LastError))
                    LastError = "Camera stopped delivering frames. Tap Retry to reopen it";
            }
            catch (Exception error)
            {
                StopResources();
                policy.Fail();
                LastError = "Camera unavailable: " + error.Message;
                Debug.LogWarning("[CrushX] " + LastError);
            }
#endif
        }

        private bool AnyArCameraRunning()
        {
            // No allocations in the steady frame loop; Bind rejects extra managers before opening a native camera.
            return arCamera != null && arCamera.subsystem != null && arCamera.subsystem.running;
        }

        private void StartAr()
        {
            StopNative();
            arFreshness.Reset();
            pendingArFrame = false;
            if (arCamera == null || arSession == null) throw new InvalidOperationException("The AR camera rig is unavailable");
            foreach (ARCameraManager other in FindObjectsByType<ARCameraManager>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                if (other != arCamera && other.isActiveAndEnabled)
                    throw new InvalidOperationException("The scene contains more than one active AR camera manager");
            arCamera.requestedFacingDirection = RequestedFrontFacing ? CameraFacingDirection.User : CameraFacingDirection.World;
            arSession.enabled = true;
            arCamera.enabled = true;
            if (arFaces != null) arFaces.enabled = RequestedFrontFacing;
            if (arBackground != null) arBackground.enabled = true;
            if (renderCamera != null) renderCamera.enabled = true;
        }

        private void StopAr()
        {
            restartingAr = false;
            pendingArFrame = false;
            if (arFaces != null) arFaces.enabled = false;
            if (arBackground != null) arBackground.enabled = false;
            if (arCamera != null) arCamera.enabled = false;
            if (arSession != null) arSession.enabled = false;
        }

        private void StartNative()
        {
            if (AnyArCameraRunning()) throw new InvalidOperationException("AR has not released the camera resource");
            foreach (ARCameraManager other in FindObjectsByType<ARCameraManager>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                if (other.subsystem != null && other.subsystem.running)
                    throw new InvalidOperationException("Another AR camera subsystem still owns the camera resource");
            if (GraphicsSettings.currentRenderPipeline != null)
                throw new InvalidOperationException("Native fallback needs a validated camera-background renderer for this SRP");
            if (renderCamera == null) renderCamera = Camera.main;
            if (renderCamera == null)
            {
                // A render-only camera does not open another hardware stream or simulate tracking.
                ownedRenderer = new GameObject("CrushX Native Preview Renderer");
                ownedRenderer.transform.SetParent(transform, false);
                ownedRenderer.tag = "MainCamera";
                renderCamera = ownedRenderer.AddComponent<Camera>();
                bool hasListener = false;
                foreach (AudioListener listener in FindObjectsByType<AudioListener>(FindObjectsSortMode.None))
                    if (listener.isActiveAndEnabled) { hasListener = true; break; }
                if (!hasListener) ownedRenderer.AddComponent<AudioListener>();
            }
            renderCamera.enabled = true;
            if (ownedRenderer != null)
            {
                AudioListener listener = ownedRenderer.GetComponent<AudioListener>();
                if (listener != null) listener.enabled = true;
            }
            WebCamDevice[] devices = WebCamTexture.devices;
            if (devices.Length == 0) throw new InvalidOperationException("No native camera was reported");
            int chosen = 0;
            for (int i = 0; i < devices.Length; i++) if (devices[i].isFrontFacing == RequestedFrontFacing) { chosen = i; break; }
            nativeFrontFacing = devices[chosen].isFrontFacing;
            RequestedFrontFacing = nativeFrontFacing;
            Shader shader = Resources.Load<Shader>("CrushXLenses/NativeCameraBackground");
            if (shader == null || !shader.isSupported) throw new InvalidOperationException("The native camera background shader is unavailable");
            nativeMaterial = new Material(shader) { name = "CrushX native camera background" };
            nativeCamera = new WebCamTexture(devices[chosen].name, 1280, 720, 30);
            nativeCamera.Play();
            oldClearFlags = renderCamera.clearFlags;
            changedClearFlags = true;
            renderCamera.clearFlags = CameraClearFlags.SolidColor;
            renderCamera.ResetProjectionMatrix();
            // CameraTarget is populated before opaque geometry; CaptureManager copies it at AfterEverything.
            nativeBackground = new CommandBuffer { name = "CrushX native preview before camera effects" };
            nativeBackground.Blit(nativeCamera, BuiltinRenderTextureType.CameraTarget, nativeMaterial);
            renderCamera.AddCommandBuffer(CameraEvent.BeforeForwardOpaque, nativeBackground);
            lastRotation = -1;
            UpdateNativeTransform();
        }

        private void UpdateNativeTransform()
        {
            if (nativeCamera == null || nativeMaterial == null || nativeCamera.width <= 16 || nativeCamera.height <= 16) return;
            int rotation = nativeCamera.videoRotationAngle;
            bool mirror = nativeFrontFacing && MirrorSelfiePreview;
            if (lastSourceWidth == nativeCamera.width && lastSourceHeight == nativeCamera.height &&
                lastScreenWidth == Screen.width && lastScreenHeight == Screen.height && lastRotation == rotation &&
                lastVerticalMirror == nativeCamera.videoVerticallyMirrored && lastSelfieMirror == mirror) return;
            CameraPreviewTransform.SourceUv(0, 0, nativeCamera.width, nativeCamera.height, Screen.width, Screen.height,
                rotation, nativeCamera.videoVerticallyMirrored, mirror, out double ox, out double oy);
            CameraPreviewTransform.SourceUv(1, 0, nativeCamera.width, nativeCamera.height, Screen.width, Screen.height,
                rotation, nativeCamera.videoVerticallyMirrored, mirror, out double xx, out double xy);
            CameraPreviewTransform.SourceUv(0, 1, nativeCamera.width, nativeCamera.height, Screen.width, Screen.height,
                rotation, nativeCamera.videoVerticallyMirrored, mirror, out double yx, out double yy);
            nativeMaterial.SetVector("_UvRow0", new Vector4((float)(xx - ox), (float)(yx - ox), (float)ox, 0));
            nativeMaterial.SetVector("_UvRow1", new Vector4((float)(xy - oy), (float)(yy - oy), (float)oy, 0));
            lastSourceWidth = nativeCamera.width; lastSourceHeight = nativeCamera.height;
            lastScreenWidth = Screen.width; lastScreenHeight = Screen.height; lastRotation = rotation;
            lastVerticalMirror = nativeCamera.videoVerticallyMirrored; lastSelfieMirror = mirror;
        }

        private void StopNative()
        {
            if (renderCamera != null && nativeBackground != null) renderCamera.RemoveCommandBuffer(CameraEvent.BeforeForwardOpaque, nativeBackground);
            nativeBackground?.Release(); nativeBackground = null;
            if (changedClearFlags && renderCamera != null) renderCamera.clearFlags = oldClearFlags;
            changedClearFlags = false;
            if (nativeCamera != null) { nativeCamera.Stop(); Destroy(nativeCamera); nativeCamera = null; }
            if (nativeMaterial != null) { Destroy(nativeMaterial); nativeMaterial = null; }
            if (ownedRenderer != null)
            {
                if (renderCamera != null) renderCamera.enabled = false;
                AudioListener listener = ownedRenderer.GetComponent<AudioListener>();
                if (listener != null) listener.enabled = false;
            }
        }

        private void StopResources() { StopNative(); StopAr(); }
        private void SuspendResources()
        {
            Generation++;
            bool keepNative = UsingNativeFallback;
            StopResources();
            policy.Retry(keepNative);
            policy.Tick(new CameraSessionObservation { Foreground = false }, Time.realtimeSinceStartupAsDouble);
        }
        private void OnApplicationPause(bool value) { paused = value; if (value && owner == this) SuspendResources(); }
        private void OnApplicationFocus(bool value) { focused = value; if (!value && owner == this) SuspendResources(); }
        private void OnDisable()
        {
            Camera.onPostRender -= ArCameraRendered;
            if (owner == this) SuspendResources();
        }
        private void OnDestroy()
        {
            Camera.onPostRender -= ArCameraRendered;
            if (arCamera != null) arCamera.frameReceived -= ArFrameReceived;
            if (owner == this) { StopResources(); owner = null; }
            if (ownedRenderer != null) { Destroy(ownedRenderer); ownedRenderer = null; }
        }
    }
}
