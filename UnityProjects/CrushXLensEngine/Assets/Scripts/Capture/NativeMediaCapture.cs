using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace CrushX.LensEngine
{
    /// <summary>
    /// Captures the camera framebuffer before overlay UI. Configured Built-in renderer only;
    /// an SRP needs a renderer feature rather than silently producing an incorrect screenshot.
    /// Files stay private drafts until the user explicitly chooses SavePreview.
    /// </summary>
    public sealed class NativeMediaCapture : MonoBehaviour
    {
        public const float MaxRecordingSeconds = 30f;
        private const int VideoFps = 15;
        private const int VideoLongestSide = 1280;
        public MediaCaptureState CurrentState { get; private set; }
        public Texture2D PreviewTexture { get; private set; }
        public Texture DisplayPreviewTexture { get { return playback != null && playback.Texture != null ? playback.Texture : PreviewTexture; } }
        public bool PreviewPlaybackReady { get { return playback != null && playback.IsPrepared; } }
        public bool PreviewPlaying { get { return playback != null && playback.IsPlaying; } }
        public MediaCaptureResult PendingMedia { get; private set; }
        public string StatusMessage { get; private set; } = "Ready";
        public bool SuppressUi => false;
        public bool WaitingForMicrophonePermission { get; private set; }
        public float RecordingSeconds => CurrentState == MediaCaptureState.Recording
            ? Mathf.Max(0f, Time.realtimeSinceStartup - recordingStarted) : 0f;
        public bool SupportsVideo => VideoCapability(out _);
        public bool MicrophoneGranted
        {
            get
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                return Permission.HasUserAuthorizedPermission(Permission.Microphone);
#else
                return false;
#endif
            }
        }
        public event Action<MediaCaptureState> StateChanged;
        public event Action<MediaCaptureResult> PreviewReady;
        public event Action<MediaCaptureResult> MediaSaved;
        public event Action<string> Failed;

        private LensEngineBootstrap engine;
        private Camera sourceCamera;
        private CommandBuffer copyFrame;
        private RenderTexture frame;
        private Texture2D pixels;
        private byte[] rgbaBuffer;
        private int width, height, screenWidth, screenHeight, generation;
        private int framesCopied, lastReadFrame;
        private float recordingStarted;
        private string draftPath;
        private bool capabilityChecked, videoSupported;
        private string capabilityReason;
        private bool requestedMicrophone;
        private bool lifecycleStopping;
        private string captureLensId;
        private MediaPreviewPlayer playback;
#if UNITY_ANDROID && !UNITY_EDITOR
        private AndroidJavaObject recorder;
#endif

        private string DraftDirectory => Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "drafts");
        private string SavedDirectory => Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "saved");

        public static NativeMediaCapture GetOrCreate(LensEngineBootstrap owner)
        {
            if (owner == null) return null;
            var service = owner.GetComponent<NativeMediaCapture>();
            if (service == null) service = owner.gameObject.AddComponent<NativeMediaCapture>();
            service.engine = owner;
            return service;
        }

        public void RequestPhoto()
        {
            if (!CanBegin()) return;
            captureLensId = engine != null ? engine.ActiveId : string.Empty;
            SetState(MediaCaptureState.CapturingPhoto, "Capturing camera and lens");
            StartCoroutine(CapturePhoto(++generation));
        }

        private IEnumerator CapturePhoto(int token)
        {
            if (!PrepareFrame(2048)) yield break;
            int initialFrame = framesCopied;
            float deadline = Time.realtimeSinceStartup + 3f;
            while (framesCopied == initialFrame && Time.realtimeSinceStartup < deadline)
            {
                yield return new WaitForEndOfFrame();
                if (token != generation) yield break;
            }
            if (framesCopied == initialFrame) { Fail("Camera did not render a capture frame"); yield break; }
            if (screenWidth != Screen.width || screenHeight != Screen.height)
            { Fail("Photo interrupted because screen orientation or dimensions changed"); yield break; }
            try
            {
                ReadFrame();
                var data = pixels.EncodeToPNG();
                if (data == null || data.Length == 0) throw new IOException("PNG encoder returned no image");
                draftPath = NewDraftPath(".png");
                File.WriteAllBytes(draftPath, data);
                if (!CaptureFileValidation.IsPng(draftPath, width, height)) throw new IOException("PNG dimensions/header validation failed");
                PendingMedia = NewResult("photo", "image/png", false, 0d);
                SetPreviewFromPixels();
                ReleaseFrame();
                SetState(MediaCaptureState.Preview, "Photo preview — Retry or Save");
                Notify(PreviewReady, PendingMedia);
            }
            catch (Exception ex) { Fail("Photo capture failed: " + ex.Message); }
        }

        public void StartVideo(bool microphone)
        {
            if (!CanBegin()) return;
            if (!VideoCapability(out string reason)) { Fail(reason); return; }
            captureLensId = engine != null ? engine.ActiveId : string.Empty;
            requestedMicrophone = microphone;
            SetState(MediaCaptureState.Preparing, "Preparing video");
            StartCoroutine(RecordVideo(++generation));
        }

        public void RequestMicrophoneAccess()
        {
            if (!CanBegin() || WaitingForMicrophonePermission) return;
            if (MicrophoneGranted) { StatusMessage = "Microphone access allowed"; return; }
#if UNITY_ANDROID && !UNITY_EDITOR
            SetState(MediaCaptureState.Preparing, "Allow microphone access before recording");
            WaitingForMicrophonePermission = true;
            StartCoroutine(MicrophonePermission(++generation));
#else
            StatusMessage = "Microphone capture requires the Android recording pipeline";
#endif
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        private IEnumerator MicrophonePermission(int token)
        {
            bool answered = false;
            var callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += _ => answered = true;
            callbacks.PermissionDenied += _ => answered = true;
            callbacks.PermissionDeniedAndDontAskAgain += _ => answered = true;
            Permission.RequestUserPermission(Permission.Microphone, callbacks);
            float deadline = Time.realtimeSinceStartup + 30f;
            while (!answered && Time.realtimeSinceStartup < deadline)
            {
                yield return null;
                if (token != generation) yield break;
            }
            float focusDeadline = Time.realtimeSinceStartup + 3f;
            while (answered && !Application.isFocused && Time.realtimeSinceStartup < focusDeadline)
            {
                yield return null;
                if (token != generation) yield break;
            }
            WaitingForMicrophonePermission = false;
            if (!answered) { SetState(MediaCaptureState.Idle, "Microphone request timed out; video can record without audio"); yield break; }
            SetState(MediaCaptureState.Idle, MicrophoneGranted ? "Microphone ready — hold the shutter to record" : "Microphone not allowed — video will record without audio");
        }
#endif

        private IEnumerator RecordVideo(int token)
        {
            bool audio = requestedMicrophone;
#if UNITY_ANDROID && !UNITY_EDITOR
            audio = audio && MicrophoneGranted; // Permissions are requested explicitly before a shutter gesture.
            if (token != generation) yield break;
            // Freeze pixel dimensions/orientation for this clip; rotation cancels it rather than
            // stretching frames or pretending that a corrupt clip is a completed recording.
            if (!PrepareFrame(VideoLongestSide)) yield break;
            bool started = false;
            try
            {
                draftPath = NewDraftPath(".mp4");
                recorder = new AndroidJavaObject("in.crushx.lens.capture.CrushXMediaRecorder");
                recorder.Call("start", draftPath, width, height, VideoFps, audio);
                started = true;
            }
            catch (Exception ex) { Fail("Video preparation failed: " + ex.Message); }
            if (!started) yield break;
            float prepareDeadline = Time.realtimeSinceStartup + 8f;
            while (CurrentState == MediaCaptureState.Preparing)
            {
                if (token != generation) yield break;
                string nativeState = NativeState();
                if (nativeState == "error") { Fail(NativeError()); yield break; }
                if (nativeState == "recording") break;
                if (Time.realtimeSinceStartup > prepareDeadline) { Fail("Video encoder initialization timed out"); yield break; }
                yield return null;
            }
            recordingStarted = Time.realtimeSinceStartup;
            SetState(MediaCaptureState.Recording, audio ? "Recording with microphone" : "Recording without microphone audio");
            float nextFrame = 0f;
            while (CurrentState == MediaCaptureState.Recording)
            {
                yield return new WaitForEndOfFrame();
                if (token != generation) yield break;
                if (screenWidth != Screen.width || screenHeight != Screen.height)
                { Fail("Recording cancelled because screen orientation or dimensions changed"); yield break; }
                if (NativeState() == "error") { Fail(NativeError()); yield break; }
                if (RecordingSeconds >= MaxRecordingSeconds) { StopVideo(); break; }
                if (RecordingSeconds < nextFrame || framesCopied == lastReadFrame) continue;
                nextFrame = RecordingSeconds + 1f / VideoFps;
                bool read = false;
                try
                {
                    // One native pending frame is allowed; a busy encoder drops a frame rather
                    // than growing an unbounded queue or blocking the camera indefinitely.
                    if (!recorder.Call<bool>("canAcceptFrame")) continue;
                    ReadFrame();
                    pixels.GetRawTextureData<byte>().CopyTo(rgbaBuffer);
                    recorder.Call<bool>("offerFrame", rgbaBuffer);
                    lastReadFrame = framesCopied;
                    read = true;
                }
                catch (Exception ex) { Fail("Video frame capture failed: " + ex.Message); }
                if (!read && CurrentState == MediaCaptureState.Error) yield break;
            }
            if (token != generation) yield break;
            if (CurrentState != MediaCaptureState.Finalizing) yield break;
            // Keep a genuine rendered poster for the preview. Playback validation remains a device test.
            if (pixels != null && lastReadFrame > 0) SetPreviewFromPixels();
            ReleaseFrame();
            float finishDeadline = Time.realtimeSinceStartup + 8f;
            while (true)
            {
                if (token != generation) yield break;
                string nativeState = NativeState();
                if (nativeState == "error") { Fail(NativeError()); yield break; }
                if (nativeState == "ready") break;
                if (Time.realtimeSinceStartup > finishDeadline) { Fail("Video encoder finalization timed out"); yield break; }
                yield return null;
            }
            try
            {
                if (!File.Exists(draftPath) || new FileInfo(draftPath).Length < 128) throw new IOException("MP4 output is empty");
                PendingMedia = NewResult("video", "video/mp4", recorder.Call<bool>("hasAudio"), recorder.Call<double>("getDurationSeconds"));
                ReleaseRecorder(false);
                SetState(MediaCaptureState.Preview, "Preparing video playback");
                OpenVideoPreview();
                Notify(PreviewReady, PendingMedia);
            }
            catch (Exception ex) { Fail("MP4 validation failed: " + ex.Message); }
#else
            yield return null;
            Fail("Rendered MP4 capture requires the Android native encoder");
#endif
        }

        public void StopVideo()
        {
            if (CurrentState == MediaCaptureState.Preparing) { Retry(); return; }
            if (CurrentState != MediaCaptureState.Recording) return;
            SetState(MediaCaptureState.Finalizing, "Finishing and inspecting MP4");
#if UNITY_ANDROID && !UNITY_EDITOR
            try { recorder?.Call("stop", false); }
            catch (Exception ex) { Fail("Unable to stop video encoder: " + ex.Message); }
#endif
        }

        public void SavePreview()
        {
            if (CurrentState != MediaCaptureState.Preview || PendingMedia == null) return;
            if (playback != null) playback.StopAndRelease();
            previewSaveError = null;
            string destination;
            long size;
            try
            {
                if (!CaptureFileValidation.IsControlledPath(PendingMedia.Path, DraftDirectory)
                    || !File.Exists(PendingMedia.Path) || new FileInfo(PendingMedia.Path).Length == 0)
                    throw new IOException("Capture draft is missing or outside the controlled directory");
                Directory.CreateDirectory(SavedDirectory);
                destination = Path.Combine(SavedDirectory, Path.GetFileName(PendingMedia.Path));
                size = new FileInfo(PendingMedia.Path).Length;
                File.Move(PendingMedia.Path, destination);
            }
            catch (Exception ex)
            {
                bool retained = CaptureFileValidation.IsControlledPath(PendingMedia.Path, DraftDirectory) && File.Exists(PendingMedia.Path);
                previewSaveError = "Unable to save capture: " + ex.Message;
                SetState(MediaCaptureState.Preview, previewSaveError + (retained ? "; draft retained for retry" : "; draft is unavailable"));
                if (retained && PendingMedia.MediaKind == "video") OpenVideoPreview();
                Notify(Failed, StatusMessage);
                return;
            }
            // File.Move has committed the save. Later UI/observer work cannot turn it
            // back into an unsaved draft or report a second failed file operation.
            PendingMedia.Path = destination;
            PendingMedia.SizeBytes = size;
            var saved = PendingMedia;
            draftPath = null;
            PendingMedia = null;
            ReleasePreview();
            SetState(MediaCaptureState.Idle, "Saved privately on this device");
            Notify(MediaSaved, saved);
        }

        private string previewSaveError;

        private void OpenVideoPreview()
        {
            if (playback == null)
            {
                playback = gameObject.AddComponent<MediaPreviewPlayer>();
                playback.StatusChanged += message =>
                {
                    if (CurrentState == MediaCaptureState.Preview)
                        StatusMessage = string.IsNullOrEmpty(previewSaveError) ? message : previewSaveError + "; " + message;
                };
            }
            playback.Open(PendingMedia.Path, PendingMedia.Width, PendingMedia.Height, PendingMedia.HasAudio);
        }

        public void TogglePreviewPlayback() { if (CurrentState == MediaCaptureState.Preview) playback?.TogglePlayback(); }

        public void Retry()
        {
            generation++;
            WaitingForMicrophonePermission = false;
            ReleaseRecorder(true);
            ReleaseFrame();
            DeleteDraft();
            ReleasePreview();
            PendingMedia = null;
            SetState(MediaCaptureState.Idle, "Ready");
        }

        private bool CanBegin()
        {
            if (CurrentState != MediaCaptureState.Idle && CurrentState != MediaCaptureState.Error) return false;
            if (CurrentState == MediaCaptureState.Error) Retry();
            return true;
        }

        private bool PrepareFrame(int longestSide)
        {
            try
            {
                if (GraphicsSettings.currentRenderPipeline != null)
                    throw new NotSupportedException("Capture requires a validated renderer feature for this SRP; configured Built-in renderer is supported");
                ARCameraManager arCamera = FindFirstObjectByType<ARCameraManager>();
#if UNITY_ANDROID && !UNITY_EDITOR
                if (arCamera == null || !arCamera.isActiveAndEnabled
                    || !Permission.HasUserAuthorizedPermission(Permission.Camera)
                    || !arCamera.permissionGranted || arCamera.subsystem == null || !arCamera.subsystem.running)
                    throw new InvalidOperationException("AR camera permission or running camera subsystem is unavailable");
#endif
                sourceCamera = arCamera != null ? arCamera.GetComponent<Camera>() : Camera.main;
                if (sourceCamera == null || !sourceCamera.isActiveAndEnabled) throw new InvalidOperationException("No active rendered camera");
                screenWidth = Screen.width; screenHeight = Screen.height;
                if (screenWidth < 2 || screenHeight < 2) throw new InvalidOperationException("Camera dimensions are not ready");
                float scale = Mathf.Min(1f, (float)longestSide / Mathf.Max(screenWidth, screenHeight));
                width = Mathf.Max(2, Mathf.FloorToInt(screenWidth * scale / 2f) * 2);
                height = Mathf.Max(2, Mathf.FloorToInt(screenHeight * scale / 2f) * 2);
                frame = new RenderTexture(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Default)
                    { name = "CrushXCaptureFrame", antiAliasing = 1 };
                if (!frame.Create()) throw new InvalidOperationException("Unable to allocate camera frame buffer");
                pixels = new Texture2D(width, height, TextureFormat.RGBA32, false);
                rgbaBuffer = new byte[width * height * 4];
                copyFrame = new CommandBuffer { name = "CrushX camera/effects capture before overlay UI" };
                copyFrame.Blit(BuiltinRenderTextureType.CameraTarget, frame);
                sourceCamera.AddCommandBuffer(CameraEvent.AfterEverything, copyFrame);
                Camera.onPostRender += CameraRendered;
                framesCopied = 0; lastReadFrame = 0;
                return true;
            }
            catch (Exception ex) { Fail("Capture unavailable: " + ex.Message); return false; }
        }

        private void CameraRendered(Camera rendered) { if (rendered == sourceCamera) framesCopied++; }

        private void ReadFrame()
        {
            RenderTexture previous = RenderTexture.active;
            try
            {
                RenderTexture.active = frame;
                pixels.ReadPixels(new Rect(0, 0, width, height), 0, 0, false);
                pixels.Apply(false, false);
            }
            finally { RenderTexture.active = previous; }
        }

        private void SetPreviewFromPixels()
        {
            ReleasePreview();
            PreviewTexture = new Texture2D(width, height, TextureFormat.RGBA32, false);
            PreviewTexture.LoadRawTextureData(pixels.GetRawTextureData<byte>());
            PreviewTexture.Apply(false, false);
        }

        private string NewDraftPath(string extension)
        {
            Directory.CreateDirectory(DraftDirectory);
            return Path.Combine(DraftDirectory, "capture_" + Guid.NewGuid().ToString("N") + extension);
        }

        private MediaCaptureResult NewResult(string kind, string mime, bool audio, double duration) => new MediaCaptureResult
        {
            CaptureId = Path.GetFileNameWithoutExtension(draftPath), MediaKind = kind, MimeType = mime,
            Path = draftPath, LensId = captureLensId,
            CreatedUtc = DateTime.UtcNow.ToString("O"), Width = width, Height = height,
            Orientation = width >= height ? "landscape" : "portrait", HasAudio = audio,
            DurationSeconds = duration, SizeBytes = new FileInfo(draftPath).Length
        };

        private bool VideoCapability(out string reason)
        {
            if (GraphicsSettings.currentRenderPipeline != null)
            { reason = "MP4 capture needs a validated renderer feature for this SRP"; return false; }
            if (!capabilityChecked)
            {
                capabilityChecked = true;
#if UNITY_ANDROID && !UNITY_EDITOR
                try
                {
                    using (var native = new AndroidJavaClass("in.crushx.lens.capture.CrushXMediaRecorder"))
                    {
                        videoSupported = native.CallStatic<bool>("isSupported");
                        capabilityReason = videoSupported ? "Available Android AVC encoder" : "No supported Android byte-buffer AVC encoder";
                    }
                }
                catch (Exception ex) { capabilityReason = "Android video encoder unavailable: " + ex.Message; }
#else
                capabilityReason = "Rendered MP4 capture is available only on an Android device";
#endif
            }
            reason = capabilityReason;
            return videoSupported;
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        private string NativeState()
        {
            try { return recorder != null ? recorder.Call<string>("getState") : "error"; }
            catch (Exception) { return "error"; }
        }
        private string NativeError()
        {
            try { return recorder != null ? recorder.Call<string>("getError") : "Native recorder is unavailable"; }
            catch (Exception ex) { return "Native recorder query failed: " + ex.Message; }
        }
#endif

        private void SetState(MediaCaptureState state, string message)
        {
            CurrentState = state; StatusMessage = message;
            Debug.Log("[CrushX.Media] state=" + state + " message=" + message);
            Notify(StateChanged, state);
        }

        private void Fail(string message)
        {
            generation++;
            WaitingForMicrophonePermission = false;
            ReleaseRecorder(true);
            ReleaseFrame(); DeleteDraft(); ReleasePreview(); PendingMedia = null;
            SetState(MediaCaptureState.Error, message);
            if (engine != null) engine.Say(message);
            Notify(Failed, message);
        }

        private static void Notify<T>(Action<T> handlers, T value)
        {
            if (handlers == null) return;
            foreach (Action<T> handler in handlers.GetInvocationList())
            {
                try { handler(value); }
                catch (Exception ex) { Debug.LogError("[CrushX.Media] completion observer failed: " + ex.Message); }
            }
        }

        private void ReleaseRecorder(bool discard)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (recorder == null) return;
            try { recorder.Call("stop", discard); }
            catch (Exception ex) { Debug.LogWarning("[CrushX.Media] encoder stop: " + ex.Message); }
            recorder.Dispose(); recorder = null;
#endif
        }

        private void ReleaseFrame()
        {
            Camera.onPostRender -= CameraRendered;
            if (sourceCamera != null && copyFrame != null) sourceCamera.RemoveCommandBuffer(CameraEvent.AfterEverything, copyFrame);
            copyFrame?.Release(); copyFrame = null; sourceCamera = null;
            if (frame != null) { frame.Release(); Destroy(frame); frame = null; }
            if (pixels != null) { Destroy(pixels); pixels = null; }
            rgbaBuffer = null;
        }

        private void DeleteDraft()
        {
            if (!string.IsNullOrEmpty(draftPath) && CaptureFileValidation.IsControlledPath(draftPath, DraftDirectory))
            {
                try { if (File.Exists(draftPath)) File.Delete(draftPath); }
                catch (Exception ex) { Debug.LogWarning("[CrushX.Media] draft cleanup: " + ex.Message); }
            }
            draftPath = null;
        }

        private void ReleasePreview()
        {
            previewSaveError = null;
            if (playback != null) playback.StopAndRelease();
            if (PreviewTexture != null) { Destroy(PreviewTexture); PreviewTexture = null; }
        }
        private void OnApplicationPause(bool paused)
        {
            if (!paused || lifecycleStopping) return;
            // OS permission dialogs also pause Unity; permission preparation must be allowed to finish.
            if (CurrentState == MediaCaptureState.Preparing && WaitingForMicrophonePermission) return;
            if (CurrentState == MediaCaptureState.Preparing || CurrentState == MediaCaptureState.Recording || CurrentState == MediaCaptureState.Finalizing || CurrentState == MediaCaptureState.CapturingPhoto)
                Fail("Capture interrupted when the app moved to the background; please retry");
        }
        private void OnDisable()
        {
            if (lifecycleStopping) return;
            lifecycleStopping = true; generation++; StopAllCoroutines(); ReleaseRecorder(true);
            WaitingForMicrophonePermission = false;
            ReleaseFrame(); DeleteDraft(); ReleasePreview(); PendingMedia = null;
            CurrentState = MediaCaptureState.Idle;
        }
        private void OnEnable() { lifecycleStopping = false; }
    }
}
