using System;
using System.Collections;
using System.IO;
using UnityEngine;
using Unity.Profiling;
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
        private static readonly ProfilerMarker ReadbackMarker = new ProfilerMarker("CrushX.Capture.Readback");
        public const float MaxRecordingSeconds = 30f;
        private const int VideoFps = 15;
        private const int VideoLongestSide = 1280;
        public MediaCaptureState CurrentState { get; private set; }
        public Texture2D PreviewTexture { get; private set; }
        public Texture DisplayPreviewTexture { get { return playback != null && playback.Texture != null ? playback.Texture : PreviewTexture; } }
        public bool PreviewPlaybackReady { get { return playback != null && playback.IsPrepared; } }
        public bool PreviewPlaying { get { return playback != null && playback.IsPlaying; } }
        public MediaCaptureResult PendingMedia { get; private set; }
        public MediaCaptureResult LastSavedMedia { get; private set; }
        public CaptureMirrorMode ExportMirrorMode { get; set; } = CaptureMirrorMode.MatchPreview;
        public bool GalleryExporting { get; private set; }
        public string LastGalleryUri { get; private set; }
        public string StatusMessage { get; private set; } = "Ready";
        public bool SuppressUi => false;
        public bool WaitingForMicrophonePermission { get; private set; }
        public float RecordingSeconds => CurrentState == MediaCaptureState.Recording
            ? Mathf.Max(0f, Time.realtimeSinceStartup - recordingStarted) : 0f;
        public bool SupportsVideo => VideoCapability(out _);
        public string VideoCapabilityReason { get { VideoCapability(out string reason); return reason; } }
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
        public event Action<string> GalleryExportCompleted;

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
        private bool capabilityChecked, capabilityLogged, videoSupported;
        private string capabilityReason;
        private bool requestedMicrophone;
        private bool lifecycleStopping;
        private string captureLensId;
        private string captureCreatorId, captureCreatorConfigurationSha256;
        private int captureCreatorRevision;
        private MediaPreviewPlayer playback;
        private readonly CaptureFrameProgressPolicy frameProgress = new CaptureFrameProgressPolicy();
        private long acceptedFrames;
        private double lastRenderedAt;
        private long lastRenderedImageSequence;
        private int captureCameraGeneration;
        private ScreenOrientation captureOrientation;
        private string captureStartedUtc;
        private CaptureMirrorMode captureMirrorMode;
        private bool restoredDraft;
        private bool galleryCapabilityChecked, gallerySupported;
        private int galleryGeneration;
#if UNITY_ANDROID && !UNITY_EDITOR
        private AndroidJavaObject recorder;
        private AndroidJavaObject galleryExporter;
#endif

        private string DraftDirectory => Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "drafts");
        private string SavedDirectory => Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "saved");

        public static NativeMediaCapture GetOrCreate(LensEngineBootstrap owner)
        {
            if (owner == null) return null;
            var service = owner.GetComponent<NativeMediaCapture>();
            if (service == null) service = owner.gameObject.AddComponent<NativeMediaCapture>();
            service.engine = owner;
            service.RestoreCompletedDraft();
            return service;
        }

        public void RequestPhoto()
        {
            if (!CanBegin()) return;
            FreezeCaptureSettings();
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
                if (!CameraGenerationMatches()) { Fail("Photo interrupted because the camera changed"); yield break; }
            }
            if (framesCopied == initialFrame) { Fail("Camera did not render a capture frame"); yield break; }
            if (screenWidth != Screen.width || screenHeight != Screen.height || captureOrientation != Screen.orientation)
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
                PersistCompletedDraft();
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
            FreezeCaptureSettings();
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
            // Unity's deprecated Don'tAskAgain callback is unreliable; denied
            // requests are handled by PermissionDenied and the deadline below.
            callbacks.PermissionDenied += _ => answered = true;
            bool requestStarted = false;
            try
            {
                Permission.RequestUserPermission(Permission.Microphone, callbacks);
                requestStarted = true;
            }
            catch (Exception ex) { Fail("Unable to request microphone permission: " + ex.Message); }
            if (!requestStarted) yield break;
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
                using (var native = new AndroidJavaClass("in.crushx.lens.capture.CrushXMediaRecorder"))
                    if (!native.CallStatic<bool>("isSupportedSize", width, height, VideoFps))
                        throw new NotSupportedException("No advertised AVC buffer encoder supports the requested capture dimensions");
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
            bool timestampsReady = false;
            try
            {
                recordingStarted = Time.realtimeSinceStartup;
                captureStartedUtc = DateTimeOffset.FromUnixTimeMilliseconds(recorder.Call<long>("getStartedUnixMillis")).UtcDateTime.ToString("O");
                timestampsReady = true;
            }
            catch (Exception ex) { Fail("Unable to read recording timestamps: " + ex.Message); }
            if (!timestampsReady) yield break;
            frameProgress.Start(Time.realtimeSinceStartupAsDouble);
            acceptedFrames = 0;
            SetState(MediaCaptureState.Recording, audio ? "Recording with microphone" : "Recording without microphone audio");
            float nextFrame = 0f;
            while (CurrentState == MediaCaptureState.Recording)
            {
                yield return new WaitForEndOfFrame();
                if (token != generation) yield break;
                if (screenWidth != Screen.width || screenHeight != Screen.height || captureOrientation != Screen.orientation || !CameraGenerationMatches())
                { Fail("Recording cancelled because screen orientation or dimensions changed"); yield break; }
                if (engine == null || engine.CameraSession == null || !engine.CameraSession.PreviewReady)
                { Fail("Camera preview was interrupted during recording"); yield break; }
                if (NativeState() == "error") { Fail(NativeError()); yield break; }
                string progressFailure = null;
                try
                {
                    double now = Time.realtimeSinceStartupAsDouble;
                    frameProgress.Observe(now, acceptedFrames, recorder.Call<long>("getEncodedFrameCount"));
                    progressFailure = frameProgress.Failure(now);
                }
                catch (Exception ex) { progressFailure = "Unable to validate recorder progress: " + ex.Message; }
                if (progressFailure != null) { Fail(progressFailure); yield break; }
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
                    long ageMicroseconds = (long)Math.Max(0d, (Time.realtimeSinceStartupAsDouble - lastRenderedAt) * 1000000d);
                    if (recorder.Call<bool>("offerFrame", rgbaBuffer, ageMicroseconds))
                    { lastReadFrame = framesCopied; acceptedFrames++; }
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
                if (!CaptureFileValidation.IsMp4(draftPath)) throw new IOException("MP4 container validation failed");
                PendingMedia = NewResult("video", "video/mp4", recorder.Call<bool>("hasAudio"), recorder.Call<double>("getDurationSeconds"));
                PendingMedia.FirstFrameOffsetSeconds = recorder.Call<double>("getFirstFrameOffsetSeconds");
                PersistCompletedDraft();
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
            if (CurrentState == MediaCaptureState.Preparing)
            {
                if (WaitingForMicrophonePermission) Retry();
                else Fail("Recording was too short; hold the shutter until recording starts");
                return;
            }
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
                    || !IsRestorableDraft(PendingMedia))
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
            LastSavedMedia = saved;
            DeleteDraftMetadata();
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

        public bool SupportsGalleryExport
        {
            get
            {
                if (!galleryCapabilityChecked)
                {
                    galleryCapabilityChecked = true;
#if UNITY_ANDROID && !UNITY_EDITOR
                    try
                    {
                        using (var native = new AndroidJavaClass("in.crushx.lens.capture.CrushXGalleryExporter"))
                            gallerySupported = native.CallStatic<bool>("isSupported");
                    }
                    catch (Exception) { gallerySupported = false; }
#endif
                }
                return gallerySupported;
            }
        }

        public void ExportLastSavedToGallery()
        {
            if (GalleryExporting) return;
            if (!SupportsGalleryExport)
            { StatusMessage = "Gallery export requires the Android 10+ MediaStore integration"; Notify(Failed, StatusMessage); return; }
            if (LastSavedMedia == null || !CaptureFileValidation.IsControlledPath(LastSavedMedia.Path, SavedDirectory) || !File.Exists(LastSavedMedia.Path))
            { StatusMessage = "Save a completed capture before exporting to the gallery"; Notify(Failed, StatusMessage); return; }
            GalleryExporting = true;
            StartCoroutine(ExportGallery(++galleryGeneration, LastSavedMedia));
        }

        private IEnumerator ExportGallery(int token, MediaCaptureResult media)
        {
            string error = null, uri = null;
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                galleryExporter = new AndroidJavaObject("in.crushx.lens.capture.CrushXGalleryExporter");
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                    galleryExporter.Call("export", activity, media.Path, SavedDirectory, media.MimeType);
            }
            catch (Exception ex) { error = "Unable to start gallery export: " + ex.Message; }
            double deadline = Time.realtimeSinceStartupAsDouble + 30d;
            while (error == null && uri == null)
            {
                if (token != galleryGeneration) yield break;
                try
                {
                    string state = galleryExporter.Call<string>("getState");
                    if (state == "ready") uri = galleryExporter.Call<string>("getUri");
                    else if (state == "error") error = galleryExporter.Call<string>("getError");
                    else if (Time.realtimeSinceStartupAsDouble >= deadline) error = "Gallery export timed out";
                }
                catch (Exception ex) { error = "Gallery export failed: " + ex.Message; }
                if (error == null && uri == null) yield return null;
            }
#else
            yield return null;
            error = "Gallery export requires Android 10+";
#endif
            StopGalleryExport();
            if (error != null || string.IsNullOrEmpty(uri))
            { StatusMessage = error ?? "Gallery export returned no content URI"; Notify(Failed, StatusMessage); yield break; }
            LastGalleryUri = uri;
            StatusMessage = "Exported to this device's gallery";
            Notify(GalleryExportCompleted, uri);
        }

        private void StopGalleryExport()
        {
            galleryGeneration++;
#if UNITY_ANDROID && !UNITY_EDITOR
            if (galleryExporter != null)
            {
                try { galleryExporter.Call("cancel"); }
                catch (Exception ex) { Debug.LogWarning("[CrushX.Media] gallery cleanup: " + ex.Message); }
                galleryExporter.Dispose(); galleryExporter = null;
            }
#endif
            GalleryExporting = false;
        }

        private void FreezeCaptureSettings()
        {
            if (!Enum.IsDefined(typeof(CaptureMirrorMode), ExportMirrorMode)) ExportMirrorMode = CaptureMirrorMode.MatchPreview;
            captureMirrorMode = ExportMirrorMode;
            captureStartedUtc = null;
            var preset = engine != null && engine.ActiveLensTransform != null
                ? engine.ActiveLensTransform.GetComponent<Creator.CreatorLensPreset>() : null;
            captureCreatorId = preset != null ? preset.PresetId : string.Empty;
            captureCreatorRevision = preset != null ? preset.PresetRevision : 0;
            captureCreatorConfigurationSha256 = preset != null ? preset.ConfigurationSha256 : string.Empty;
        }

        private void PersistCompletedDraft()
        {
            // A manifest is created only after a genuine completed capture. In-flight MP4s
            // without this metadata are never restored as successful output after a crash.
            File.WriteAllText(draftPath + ".json", JsonUtility.ToJson(PendingMedia));
        }

        private void DeleteDraftMetadata()
        {
            if (string.IsNullOrEmpty(draftPath) || !CaptureFileValidation.IsControlledPath(draftPath, DraftDirectory)) return;
            try { if (File.Exists(draftPath + ".json")) File.Delete(draftPath + ".json"); }
            catch (Exception ex) { Debug.LogWarning("[CrushX.Media] draft metadata cleanup: " + ex.Message); }
        }

        private void RestoreCompletedDraft()
        {
            if (restoredDraft || CurrentState != MediaCaptureState.Idle) return;
            restoredDraft = true;
            if (!Directory.Exists(DraftDirectory)) return;
            try
            {
                string chosen = null;
                MediaCaptureResult selected = null;
                DateTime newest = DateTime.MinValue;
                int inspected = 0;
                foreach (string manifest in Directory.EnumerateFiles(DraftDirectory, "*.json"))
                {
                    if (++inspected > 100) break;
                    if (new FileInfo(manifest).Length > 16384) continue;
                    DateTime timestamp = File.GetLastWriteTimeUtc(manifest);
                    if (timestamp <= newest) continue;
                    try
                    {
                        var candidate = JsonUtility.FromJson<MediaCaptureResult>(File.ReadAllText(manifest));
                        if (!IsRestorableDraft(candidate) || !string.Equals(manifest, candidate.Path + ".json", StringComparison.Ordinal)) continue;
                        selected = candidate; chosen = candidate.Path; newest = timestamp;
                    }
                    catch (Exception) { /* An interrupted metadata write cannot hide another valid completed draft. */ }
                }
                if (chosen == null) return;
                PendingMedia = selected;
                draftPath = chosen;
                SetState(MediaCaptureState.Preview, "Recovered a completed private capture — Retry or Save", true);
                RestorePreview();
                Notify(PreviewReady, PendingMedia);
            }
            catch (Exception ex) { Debug.LogWarning("[CrushX.Media] completed draft recovery: " + ex.Message); }
        }

        private bool IsRestorableDraft(MediaCaptureResult media)
        {
            if (media == null || !CaptureFileValidation.IsControlledPath(media.Path, DraftDirectory)
                || !File.Exists(media.Path) || media.Width < 2 || media.Height < 2 || media.Width > 2048 || media.Height > 2048
                || new FileInfo(media.Path).Length < 33 || new FileInfo(media.Path).Length > 128L * 1024L * 1024L) return false;
            if (media.MediaKind == "photo") return media.MimeType == "image/png" && CaptureFileValidation.IsPng(media.Path, media.Width, media.Height);
            return media.MediaKind == "video" && media.MimeType == "video/mp4" && media.DurationSeconds > 0
                && media.DurationSeconds <= MaxRecordingSeconds + 1 && CaptureFileValidation.IsMp4(media.Path);
        }

        private void RestorePreview()
        {
            if (PendingMedia == null) return;
            if (PendingMedia.MediaKind == "video") { OpenVideoPreview(); return; }
            try
            {
                ReleasePreview();
                PreviewTexture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (!PreviewTexture.LoadImage(File.ReadAllBytes(PendingMedia.Path))) throw new IOException("Saved photo could not be decoded");
            }
            catch (Exception ex)
            { StatusMessage = "Preview unavailable; completed draft retained: " + ex.Message; ReleasePreview(); }
        }

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
            if (!CaptureLifecyclePolicy.CanBegin(CurrentState)) return false;
            if (CurrentState == MediaCaptureState.Error) Retry();
            return true;
        }

        private bool PrepareFrame(int longestSide)
        {
            try
            {
                if (GraphicsSettings.currentRenderPipeline != null)
                    throw new NotSupportedException("Capture requires a validated renderer feature for this SRP; configured Built-in renderer is supported");
#if UNITY_ANDROID && !UNITY_EDITOR
                CameraSessionController session = engine != null ? engine.CameraSession : null;
                if (session == null || !session.PreviewReady || !Permission.HasUserAuthorizedPermission(Permission.Camera))
                    throw new InvalidOperationException("Camera preview or permission is unavailable");
                sourceCamera = session.RenderCamera;
                lastRenderedImageSequence = session.CurrentImageFrameSequence;
                captureCameraGeneration = session.Generation;
#else
                sourceCamera = engine != null && engine.CameraSession != null ? engine.CameraSession.RenderCamera : Camera.main;
#endif
                if (sourceCamera == null || !sourceCamera.isActiveAndEnabled) throw new InvalidOperationException("No active rendered camera");
                screenWidth = Screen.width; screenHeight = Screen.height;
                captureOrientation = Screen.orientation;
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
                copyFrame.BeginSample("CrushX.Capture.Copy");
                bool flip = captureMirrorMode == CaptureMirrorMode.FlipHorizontally;
                copyFrame.Blit(BuiltinRenderTextureType.CameraTarget, frame, flip ? new Vector2(-1, 1) : Vector2.one, flip ? new Vector2(1, 0) : Vector2.zero);
                copyFrame.EndSample("CrushX.Capture.Copy");
                sourceCamera.AddCommandBuffer(CameraEvent.AfterEverything, copyFrame);
                Camera.onPostRender += CameraRendered;
                framesCopied = 0; lastReadFrame = 0;
                return true;
            }
            catch (Exception ex) { Fail("Capture unavailable: " + ex.Message); return false; }
        }

        private void CameraRendered(Camera rendered)
        {
            if (rendered != sourceCamera) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            if (engine == null || engine.CameraSession == null || !engine.CameraSession.PreviewReady || !CameraGenerationMatches()) return;
            long imageSequence = engine.CameraSession.CurrentImageFrameSequence;
            if (imageSequence == lastRenderedImageSequence) return;
            lastRenderedImageSequence = imageSequence;
#endif
            framesCopied++;
            lastRenderedAt = Time.realtimeSinceStartupAsDouble;
            if (string.IsNullOrEmpty(captureStartedUtc)) captureStartedUtc = DateTime.UtcNow.ToString("O");
        }

        private bool CameraGenerationMatches()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            return engine != null && engine.CameraSession != null && engine.CameraSession.Generation == captureCameraGeneration;
#else
            return true;
#endif
        }

        private void ReadFrame()
        {
            using (ReadbackMarker.Auto()) ReadFramePixels();
        }

        private void ReadFramePixels()
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
            CreatorPresetId = captureCreatorId, CreatorPresetRevision = captureCreatorRevision,
            CreatorConfigurationSha256 = captureCreatorConfigurationSha256,
            CreatedUtc = captureStartedUtc, CompletedUtc = DateTime.UtcNow.ToString("O"), Width = width, Height = height,
            Mirroring = captureMirrorMode.ToString() + " relative to rendered preview; absolute AR selfie mirroring requires device verification",
            MirroredRelativeToPreview = captureMirrorMode == CaptureMirrorMode.FlipHorizontally,
            Orientation = width >= height ? "landscape" : "portrait", HasAudio = audio,
            DurationSeconds = duration, SizeBytes = new FileInfo(draftPath).Length
        };

        private bool VideoCapability(out string reason)
        {
            if (GraphicsSettings.currentRenderPipeline != null)
            {
                reason = "MP4 capture needs a validated renderer feature for this SRP";
                LogVideoCapabilityOnce(false, reason);
                return false;
            }
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
                catch (Exception ex) { capabilityReason = "Android video encoder unavailable: " + ex.GetType().Name + ": " + ex.Message; }
#else
                capabilityReason = "Rendered MP4 capture is available only on an Android device";
#endif
                // Cache the same bounded native-probe reason for UI and diagnostics.
                capabilityReason = (capabilityReason ?? "Video capability probe returned no reason").Replace('\r', ' ').Replace('\n', ' ');
                if (capabilityReason.Length > 220) capabilityReason = capabilityReason.Substring(0, 217) + "...";
            }
            reason = capabilityReason;
            LogVideoCapabilityOnce(videoSupported, reason);
            return videoSupported;
        }

        private void LogVideoCapabilityOnce(bool supported, string reason)
        {
            if (capabilityLogged) return;
            capabilityLogged = true;
            Debug.Log("[CrushX Capture] videoSupported=" + supported + " reason=" + reason);
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

        private void SetState(MediaCaptureState state, string message, bool restoringCompletedDraft = false)
        {
            if (!CaptureLifecyclePolicy.CanTransition(CurrentState, state, restoringCompletedDraft))
                throw new InvalidOperationException("Invalid capture state transition: " + CurrentState + " -> " + state);
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
            DeleteDraftMetadata();
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
            if (CaptureLifecyclePolicy.IsInFlight(CurrentState))
                Fail("Capture interrupted when the app moved to the background; please retry");
        }
        private void OnApplicationFocus(bool focused)
        {
            if (!focused && !lifecycleStopping && !WaitingForMicrophonePermission && CaptureLifecyclePolicy.IsInFlight(CurrentState))
                Fail("Capture interrupted when the app lost focus; please retry");
        }
        private void OnDisable()
        {
            if (lifecycleStopping) return;
            lifecycleStopping = true; generation++; StopAllCoroutines(); ReleaseRecorder(true);
            WaitingForMicrophonePermission = false;
            ReleaseFrame(); ReleasePreview();
            if (CurrentState != MediaCaptureState.Preview || PendingMedia == null)
            { DeleteDraft(); PendingMedia = null; CurrentState = MediaCaptureState.Idle; }
            StopGalleryExport();
        }
        private void OnEnable()
        {
            lifecycleStopping = false;
            if (PendingMedia != null && CurrentState == MediaCaptureState.Preview) RestorePreview();
        }
    }
}
