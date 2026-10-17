using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CrushX.LensEngine
{
    /// <summary>Native camera controls. Face loss never hides camera navigation or lens browsing.</summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(CrushXCameraSwipe))]
    public sealed class NativeLensUI : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private CrushXSmartCarousel carousel;
        private NativeMediaCapture capture;
        private NativeCameraSkin skin;
        private GUIStyle header, status, button, small, input;
        private readonly ShutterGesture shutterGesture = new ShutterGesture();
        private bool searchVisible, microphone, awaitingMicrophone;
        private float captureAt = -1;
        private int timerSeconds;

        public bool SearchVisible { get { return searchVisible; } }
        public Rect CameraGestureRect
        {
            get
            {
                NativeCameraLayout layout = NativeCameraLayout.Current;
                Rect area = layout.CameraGesture(searchVisible);
                if (carousel != null && carousel.Filter == LensBrowseFilter.Recent)
                {
                    float consentTop = searchVisible ? layout.Search.y - 44 : layout.Tabs.y - 44;
                    area.height = Mathf.Max(0, consentTop - area.y - 10);
                }
                return area;
            }
        }
        public bool HidesCarousel { get { return capture != null && (capture.SuppressUi || capture.CurrentState == MediaCaptureState.Preview); } }
        public bool BlocksCameraGestures
        {
            get { return captureAt >= 0 || (capture != null && capture.CurrentState != MediaCaptureState.Idle && capture.CurrentState != MediaCaptureState.Error); }
        }

        private void Start()
        {
            engine = FindFirstObjectByType<LensEngineBootstrap>();
            // RequireComponent does not retrofit already serialized scene components.
            if (GetComponent<CrushXCameraSwipe>() == null) gameObject.AddComponent<CrushXCameraSwipe>();
            carousel = GetComponent<CrushXSmartCarousel>();
            if (carousel == null) carousel = gameObject.AddComponent<CrushXSmartCarousel>();
            if (engine != null) capture = NativeMediaCapture.GetOrCreate(engine);
        }

        private void Update()
        {
            if (engine == null) return;
            if (awaitingMicrophone && capture != null && !capture.WaitingForMicrophonePermission)
            {
                microphone = capture.MicrophoneGranted;
                awaitingMicrophone = false;
            }
            bool back = false;
#if ENABLE_INPUT_SYSTEM
            back = Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
            back = Input.GetKeyDown(KeyCode.Escape);
#endif
            if (back) { Back(); return; }
            if (captureAt >= 0 && Time.unscaledTime >= captureAt)
            {
                captureAt = -1;
                if (capture != null) capture.RequestPhoto();
            }
            if (shutterGesture.IsHeld && capture != null)
                ApplyShutterAction(shutterGesture.Poll(Time.realtimeSinceStartupAsDouble, capture.SupportsVideo));
        }

        public bool BeginShutter(Vector2 screenPosition)
        {
            if (capture == null || BlocksCameraGestures) return false;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            if (!layout.Shutter.Contains(layout.ToGui(screenPosition, Screen.height))) return false;
            return shutterGesture.Begin(Time.realtimeSinceStartupAsDouble);
        }

        public void EndShutter(bool canceled)
        {
            if (!shutterGesture.IsHeld) return;
            ShutterAction action = shutterGesture.End(Time.realtimeSinceStartupAsDouble, canceled, capture != null && capture.SupportsVideo);
            ApplyShutterAction(action);
        }

        private void ApplyShutterAction(ShutterAction action)
        {
            if (capture == null) return;
            if ((action & (ShutterAction.StartVideo | ShutterAction.VideoUnavailable)) != 0)
                capture.StartVideo(microphone); // Unsupported holds surface the cached capability reason.
            if ((action & ShutterAction.CancelVideo) != 0)
            {
                // Auto-stop can finish the clip before this gesture is released. An OS
                // cancellation must not discard a completed preview or interrupt finalization.
                if (capture.CurrentState == MediaCaptureState.Preparing || capture.CurrentState == MediaCaptureState.Recording)
                    capture.Retry();
            }
            if ((action & ShutterAction.StopVideo) != 0) capture.StopVideo();
            if ((action & ShutterAction.Photo) != 0)
            {
                if (timerSeconds == 0) capture.RequestPhoto();
                else captureAt = Time.unscaledTime + timerSeconds;
            }
        }

        private void Back()
        {
            // Back owns the stop/exit decision below; a pending press must not fire later.
            shutterGesture.End(Time.realtimeSinceStartupAsDouble, true, false);
            if (captureAt >= 0) { captureAt = -1; return; }
            if (capture != null && capture.CurrentState == MediaCaptureState.Preview) { capture.Retry(); return; }
            if (capture != null && (capture.CurrentState == MediaCaptureState.Recording || capture.CurrentState == MediaCaptureState.Preparing))
            { capture.StopVideo(); return; }
            if (searchVisible) { searchVisible = false; carousel.SetQuery(string.Empty); return; }
            NativeLensLifecycle.ExitToCrushX();
        }

        private void OnApplicationPause(bool paused)
        {
            if (!paused) return;
            if (capture != null && capture.WaitingForMicrophonePermission) return;
            captureAt = -1;
            EndShutter(true);
        }

        private void OnDisable() { captureAt = -1; EndShutter(true); }
        private void OnApplicationFocus(bool focused)
        {
            if (focused) return;
            captureAt = -1;
            if (capture == null || !capture.WaitingForMicrophonePermission) EndShutter(true);
        }

        private void EnsureStyles()
        {
            if (button != null) return;
            skin = new NativeCameraSkin();
            button = skin.Button;
            header = skin.Header;
            status = skin.Status;
            small = skin.Small;
            input = skin.Input;
        }

        private void OnGUI()
        {
            if (engine == null || capture == null || capture.SuppressUi) return;
            EnsureStyles();
            NativeCameraLayout layout = NativeCameraLayout.Current;
            Matrix4x4 oldMatrix = GUI.matrix;
            Color oldColor = GUI.color;
            Color oldBackground = GUI.backgroundColor;
            bool oldEnabled = GUI.enabled;
            GUI.matrix = layout.Matrix;
            GUI.color = Color.white;
            GUI.backgroundColor = Color.white;
            if (capture.CurrentState == MediaCaptureState.Preview) DrawPreview(layout);
            else DrawCamera(layout);
            GUI.enabled = oldEnabled;
            GUI.color = oldColor;
            GUI.backgroundColor = oldBackground;
            GUI.matrix = oldMatrix;
        }

        // Capture being idle does not mean the face effect is ready. Operation/error
        // messages also take priority over temporary informational lens notices.
        public static string ComposeCameraNotice(string lensNotice, MediaCaptureState captureState, string captureMessage)
        {
            bool operation = captureState != MediaCaptureState.Idle && captureState != MediaCaptureState.Preview;
            if (operation && !string.IsNullOrEmpty(captureMessage)) return captureMessage;
            if (!string.IsNullOrEmpty(lensNotice)) return lensNotice;
            return captureState == MediaCaptureState.Idle && captureMessage == "Ready" ? string.Empty : captureMessage;
        }

        private void DrawCamera(NativeCameraLayout layout)
        {
            GUI.Label(new Rect(84, 12, layout.Width - 168, 40), "Crush.X", header);
            if (GUI.Button(new Rect(12, 12, 64, 40), "Back", button)) Back();
            GUI.enabled = !BlocksCameraGestures;
            if (GUI.Button(new Rect(layout.Width - 76, 12, 64, 40), searchVisible ? "Close" : "Search", button))
            {
                searchVisible = !searchVisible;
                if (!searchVisible) { carousel.SetQuery(string.Empty); GUI.FocusControl(null); }
            }
            GUI.enabled = true;
            skin.Panel(layout.TrackingStatus, NativeCameraSkin.PanelColor);
            GUI.Label(layout.TrackingStatus, engine.TrackingStatus, status);
            string notice = ComposeCameraNotice(engine.Notice, capture.CurrentState, capture.StatusMessage);
            if (!string.IsNullOrEmpty(notice)) GUI.Label(new Rect(18, 112, layout.Width - (capture.SupportsVideo ? 174 : 36), 40), notice, small);

            GUI.enabled = !BlocksCameraGestures;
            if (searchVisible)
            {
                GUI.SetNextControlName("CrushXLensSearch");
                carousel.SetQuery(GUI.TextField(layout.Search, carousel.Query, 80, input));
            }
            Rect tabs = layout.Tabs;
            float tabWidth = (tabs.width - 8) / 3f;
            DrawTab(new Rect(tabs.x, tabs.y, tabWidth, tabs.height), LensBrowseFilter.All, "All");
            DrawTab(new Rect(tabs.x + tabWidth + 4, tabs.y, tabWidth, tabs.height), LensBrowseFilter.Favorites, "Favorites");
            DrawTab(new Rect(tabs.x + (tabWidth + 4) * 2, tabs.y, tabWidth, tabs.height), LensBrowseFilter.Recent, "Recent");
            if (carousel.Filter == LensBrowseFilter.Recent)
            {
                Rect consent = new Rect(tabs.x, searchVisible ? layout.Search.y - 44 : tabs.y - 44, tabs.width, 38);
                bool remember = GUI.Toggle(consent, engine.PersonalizationEnabled, "Remember recent lenses on this device", button);
                if (remember != engine.PersonalizationEnabled) { engine.SetPersonalizationEnabled(remember); carousel.Refresh(); }
            }
            LensManifest? selected = LensCatalog.Find(engine.ActiveId);
            GUI.Label(layout.LensTitle, selected.HasValue ? selected.Value.DisplayName : "Choose a lens", header);
            string selection = engine.State == LensRuntimeState.Loading ? "Loading lens" :
                engine.State == LensRuntimeState.Failed ? "Could not load lens" :
                engine.State == LensRuntimeState.Unavailable ? "Effect unavailable" :
                engine.ActiveLensRequiresFace && !engine.TrackingActive ? "Selected · waiting for face tracking" :
                !engine.CameraReady ? "Selected · waiting for camera" : "Selected";
            GUI.Label(layout.LensState, selected.HasValue ? selection : string.Empty, small);
            if (GUI.Button(layout.Favorite, engine.IsFavorite(engine.ActiveId) ? "★ Saved" : "☆ Favorite", button))
            { engine.ToggleFavorite(); carousel.Refresh(); }
            if (GUI.Button(layout.Timer, timerSeconds == 0 ? "Timer off" : "Timer " + timerSeconds + "s", button))
                timerSeconds = timerSeconds == 0 ? 3 : timerSeconds == 3 ? 10 : 0;
            GUI.enabled = true;

            bool recording = capture.CurrentState == MediaCaptureState.Recording;
            bool preparingVideo = capture.CurrentState == MediaCaptureState.Preparing && !capture.WaitingForMicrophonePermission;
            // Press feedback changes drawing only; the shutter hit area remains stable.
            float diameter = layout.Shutter.width * (shutterGesture.IsHeld ? .95f : 1f);
            Rect shutterRing = new Rect(layout.Shutter.center.x - diameter * .5f, layout.Shutter.center.y - diameter * .5f, diameter, diameter);
            float centerDiameter = diameter * .76f;
            Rect shutterCenter = new Rect(shutterRing.center.x - centerDiameter * .5f, shutterRing.center.y - centerDiameter * .5f, centerDiameter, centerDiameter);
            float ringThickness = diameter * .035f;
            Color shutterColor = recording || preparingVideo ? new Color(1f, .18f, .35f) : BlocksCameraGestures ? new Color(.65f, .65f, .65f) : Color.white;
            Texture2D selectedCover = !recording && !preparingVideo && carousel != null ? carousel.GetCover(engine.ActiveId) : null;
            if (selectedCover != null)
            {
                GUI.color = shutterColor;
                GUI.DrawTexture(shutterCenter, selectedCover, ScaleMode.ScaleToFit, true);
                GUI.color = Color.white;
            }
            else skin.Disc(shutterCenter, shutterColor);
            skin.Ring(shutterRing, new Color(1f, 1f, 1f, recording ? .35f : 1f), 1f, ringThickness);
            if (recording)
                skin.Ring(shutterRing, NativeCameraSkin.AccentColor, Mathf.Clamp01(capture.RecordingSeconds / NativeMediaCapture.MaxRecordingSeconds), ringThickness);
            if (captureAt >= 0)
            {
                GUI.Label(new Rect(layout.Width * .5f - 70, layout.Height * .4f, 140, 90), Mathf.CeilToInt(captureAt - Time.unscaledTime).ToString(), header);
                if (GUI.Button(layout.Hint, "Cancel timer", button)) captureAt = -1;
            }
            else if (recording)
            {
                GUI.Label(layout.Hint, capture.RecordingSeconds.ToString("0.0") + "s / " + NativeMediaCapture.MaxRecordingSeconds + "s · release to stop", status);
            }
            else GUI.Label(layout.Hint, capture.SupportsVideo ? "Tap for photo · hold for video" : "Tap for photo · video unavailable", small);
            if (capture.SupportsVideo && !BlocksCameraGestures)
            {
                Rect micRect = new Rect(layout.Width - 140, 112, 122, 38);
                bool nextMicrophone = GUI.Toggle(micRect, microphone, microphone ? "Mic on" : "Mic off", button);
                if (nextMicrophone != microphone)
                {
                    microphone = nextMicrophone;
                    if (microphone && !capture.MicrophoneGranted)
                    {
                        capture.RequestMicrophoneAccess();
                        awaitingMicrophone = true;
                    }
                }
            }
        }

        private void DrawTab(Rect rect, LensBrowseFilter value, string title)
        {
            bool selected = carousel.Filter == value;
            if (GUI.Toggle(rect, selected, title, button) && !selected) carousel.SetFilter(value);
        }

        private void DrawPreview(NativeCameraLayout layout)
        {
            skin.Panel(layout.Bounds, new Color(.015f, .02f, .03f, .97f));
            GUI.Label(new Rect(12, 12, 132, 44), "Preview", header);
            Rect preview = new Rect(12, 64, layout.Width - 24, layout.Height - 190);
            if (capture.DisplayPreviewTexture != null) GUI.DrawTexture(preview, capture.DisplayPreviewTexture, ScaleMode.ScaleToFit);
            else GUI.Label(preview, "Video draft ready. Save to keep the MP4.", status);
            GUI.Label(new Rect(12, layout.Height - 120, layout.Width - 24, 32), capture.StatusMessage, small);
            if (capture.PreviewPlaybackReady && GUI.Button(new Rect(layout.Width * .5f - 60, 14, 120, 36), capture.PreviewPlaying ? "Pause" : "Play", button))
                capture.TogglePreviewPlayback();
            if (GUI.Button(new Rect(16, layout.Height - 80, layout.Width * .5f - 24, 56), "Retry", button)) capture.Retry();
            if (GUI.Button(new Rect(layout.Width * .5f + 8, layout.Height - 80, layout.Width * .5f - 24, 56), "Save", button)) capture.SavePreview();
        }

        private void OnDestroy()
        {
            if (skin != null) skin.Dispose();
        }
    }
}
