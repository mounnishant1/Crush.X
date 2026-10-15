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
        private GUIStyle header, status, button, small, input;
        private Texture2D dark, shutter;
        private bool searchVisible, microphone, shutterHeld, videoStarted;
        private float shutterPressedAt, captureAt = -1;
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
            bool back = false;
#if ENABLE_INPUT_SYSTEM
            back = Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
            back = Input.GetKeyDown(KeyCode.Escape);
#endif
            if (back) Back();
            if (captureAt >= 0 && Time.unscaledTime >= captureAt)
            {
                captureAt = -1;
                if (capture != null) capture.RequestPhoto();
            }
            if (shutterHeld && !videoStarted && capture != null && capture.SupportsVideo &&
                Time.unscaledTime - shutterPressedAt >= .4f)
            {
                videoStarted = true;
                capture.StartVideo(microphone);
            }
        }

        public bool BeginShutter(Vector2 screenPosition)
        {
            if (capture == null || BlocksCameraGestures) return false;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            if (!layout.Shutter.Contains(layout.ToGui(screenPosition, Screen.height))) return false;
            shutterHeld = true;
            videoStarted = false;
            shutterPressedAt = Time.unscaledTime;
            return true;
        }

        public void EndShutter(bool canceled)
        {
            if (!shutterHeld) return;
            shutterHeld = false;
            if (videoStarted)
            {
                // Also cancels a pending microphone permission/encoder initialization.
                if (canceled) capture.Retry();
                else capture.StopVideo();
                videoStarted = false;
                return;
            }
            if (canceled || capture == null) return;
            if (timerSeconds == 0) capture.RequestPhoto();
            else captureAt = Time.unscaledTime + timerSeconds;
        }

        private void Back()
        {
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

        private void EnsureStyles()
        {
            if (button != null) return;
            dark = new Texture2D(1, 1);
            dark.SetPixel(0, 0, new Color(.025f, .035f, .065f, .82f)); dark.Apply();
            button = new GUIStyle(GUI.skin.button) { fontSize = 18, fontStyle = FontStyle.Bold, wordWrap = true };
            button.normal.background = dark;
            button.normal.textColor = Color.white;
            header = new GUIStyle(GUI.skin.label) { fontSize = 24, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            header.normal.textColor = Color.white;
            status = new GUIStyle(header) { fontSize = 16, fontStyle = FontStyle.Normal, wordWrap = true };
            small = new GUIStyle(status) { fontSize = 14 };
            input = new GUIStyle(GUI.skin.textField) { fontSize = 18, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(12, 12, 5, 5) };
            shutter = new Texture2D(96, 96, TextureFormat.RGBA32, false);
            var pixels = new Color[96 * 96];
            for (int y = 0; y < 96; y++) for (int x = 0; x < 96; x++)
            {
                float distance = Vector2.Distance(new Vector2(x, y), new Vector2(47.5f, 47.5f));
                pixels[y * 96 + x] = distance > 47 ? Color.clear : distance > 41 || distance < 36 ? Color.white : Color.clear;
            }
            shutter.SetPixels(pixels); shutter.Apply();
        }

        private void OnGUI()
        {
            if (engine == null || capture == null || capture.SuppressUi) return;
            EnsureStyles();
            NativeCameraLayout layout = NativeCameraLayout.Current;
            Matrix4x4 oldMatrix = GUI.matrix;
            Color oldColor = GUI.color;
            bool oldEnabled = GUI.enabled;
            GUI.matrix = layout.Matrix;
            GUI.color = Color.white;
            if (capture.CurrentState == MediaCaptureState.Preview) DrawPreview(layout);
            else DrawCamera(layout);
            GUI.enabled = oldEnabled;
            GUI.color = oldColor;
            GUI.matrix = oldMatrix;
        }

        private void DrawCamera(NativeCameraLayout layout)
        {
            GUI.Label(new Rect(98, 12, layout.Width - 196, 44), "Crush.X", header);
            if (GUI.Button(new Rect(12, 12, 78, 44), "Back", button)) Back();
            GUI.enabled = !BlocksCameraGestures;
            if (GUI.Button(new Rect(layout.Width - 90, 12, 78, 44), searchVisible ? "Close" : "Search", button))
            {
                searchVisible = !searchVisible;
                if (!searchVisible) { carousel.SetQuery(string.Empty); GUI.FocusControl(null); }
            }
            GUI.enabled = true;
            GUI.Box(new Rect(12, 62, layout.Width - 24, 46), GUIContent.none);
            GUI.Label(new Rect(18, 62, layout.Width - 36, 46), engine.TrackingStatus, status);
            string notice = !string.IsNullOrEmpty(engine.Notice) ? engine.Notice : capture.StatusMessage;
            if (!string.IsNullOrEmpty(notice)) GUI.Label(new Rect(18, 112, layout.Width - (capture.SupportsVideo ? 174 : 36), 40), notice, status);

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
            if (GUI.Button(layout.Favorite, engine.IsFavorite(engine.ActiveId) ? "★ Saved" : "☆ Favorite", button))
            { engine.ToggleFavorite(); carousel.Refresh(); }
            if (GUI.Button(layout.Timer, timerSeconds == 0 ? "Timer off" : "Timer " + timerSeconds + "s", button))
                timerSeconds = timerSeconds == 0 ? 3 : timerSeconds == 3 ? 10 : 0;
            GUI.enabled = true;

            bool recording = capture.CurrentState == MediaCaptureState.Recording;
            GUI.color = recording ? new Color(1f, .18f, .35f) : BlocksCameraGestures ? new Color(.65f, .65f, .65f) : Color.white;
            GUI.DrawTexture(layout.Shutter, shutter, ScaleMode.ScaleToFit);
            GUI.color = Color.white;
            if (captureAt >= 0)
            {
                GUI.Label(new Rect(layout.Width * .5f - 70, layout.Height * .4f, 140, 90), Mathf.CeilToInt(captureAt - Time.unscaledTime).ToString(), header);
                if (GUI.Button(layout.Hint, "Cancel timer", button)) captureAt = -1;
            }
            else if (recording)
            {
                GUI.Label(layout.Hint, capture.RecordingSeconds.ToString("0.0") + "s / " + NativeMediaCapture.MaxRecordingSeconds + "s · release to stop", status);
                float fraction = Mathf.Clamp01(capture.RecordingSeconds / NativeMediaCapture.MaxRecordingSeconds);
                GUI.DrawTexture(new Rect(layout.Shutter.x, layout.Shutter.yMax + 4, layout.Shutter.width * fraction, 3), Texture2D.whiteTexture);
            }
            else GUI.Label(layout.Hint, capture.SupportsVideo ? "Tap for photo · hold for video" : "Tap for photo", small);
            if (capture.SupportsVideo && !BlocksCameraGestures)
            {
                Rect micRect = new Rect(layout.Width - 140, 112, 122, 38);
                microphone = GUI.Toggle(micRect, microphone, microphone ? "Mic on" : "Mic off", button);
            }
        }

        private void DrawTab(Rect rect, LensBrowseFilter value, string title)
        {
            Color old = GUI.backgroundColor;
            if (carousel.Filter == value) GUI.backgroundColor = new Color(.95f, .22f, .61f);
            if (GUI.Button(rect, title, button)) carousel.SetFilter(value);
            GUI.backgroundColor = old;
        }

        private void DrawPreview(NativeCameraLayout layout)
        {
            GUI.DrawTexture(layout.Bounds, dark);
            GUI.Label(new Rect(12, 12, layout.Width - 24, 44), "Preview", header);
            Rect preview = new Rect(12, 64, layout.Width - 24, layout.Height - 190);
            if (capture.PreviewTexture != null) GUI.DrawTexture(preview, capture.PreviewTexture, ScaleMode.ScaleToFit);
            else GUI.Label(preview, "Video draft ready. Save to keep the MP4.", status);
            GUI.Label(new Rect(12, layout.Height - 120, layout.Width - 24, 32), capture.StatusMessage, small);
            if (GUI.Button(new Rect(16, layout.Height - 80, layout.Width * .5f - 24, 56), "Retry", button)) capture.Retry();
            if (GUI.Button(new Rect(layout.Width * .5f + 8, layout.Height - 80, layout.Width * .5f - 24, 56), "Save", button)) capture.SavePreview();
        }

        private void OnDestroy()
        {
            if (dark != null) Destroy(dark);
            if (shutter != null) Destroy(shutter);
        }
    }
}
