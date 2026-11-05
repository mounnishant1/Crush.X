using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace CrushX.LensEngine
{
    public static class LensPreviewSwipe
    {
        // UI Toolkit top-left coordinates. The rule is equivalent to the
        // legacy camera swipe and always returns at most one step.
        public static int Direction(Vector2 start, Vector2 end, float width)
        {
            if (width <= 0f || float.IsNaN(width) ||
                float.IsInfinity(width) || float.IsNaN(start.x) ||
                float.IsNaN(start.y) || float.IsNaN(end.x) ||
                float.IsNaN(end.y)) return 0;
            Vector2 delta = end - start;
            if (Mathf.Abs(delta.x) < width * .16f ||
                Mathf.Abs(delta.y) >= Mathf.Abs(delta.x) * .70f)
                return 0;
            return delta.x < 0f ? 1 : -1;
        }
    }

    /// <summary>
    /// Unity 6 runtime UI Toolkit lens camera controls. Configure a dedicated
    /// UIDocument + PanelSettings via the editor menu. The legacy IMGUI UI
    /// remains a fallback if the panel is not installed.
    ///
    /// Visual controls stay out of the camera preview's pointer overlay; only
    /// a genuine preview swipe can change lenses. Touch UI does not use
    /// platform-specific mouse/touch mirroring or manually synthesize clicks.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class LensCameraProductionUI : MonoBehaviour
    {
        public LensEngineBootstrap Engine;
        public bool IsReady { get; private set; }

        private UIDocument document;
        private VisualElement root, previewArea, top, bottom, browsePanel;
        private ScrollView categoryStrip, browseList, voiceStrip;
        private Label sectionInfo, selectedLens, trackingStatus, gameStatus;
        private Button favoriteButton, microphoneButton, browseButton;
        private Slider intensitySlider;
        private readonly Dictionary<string, Button> voiceModes =
            new Dictionary<string, Button>(StringComparer.Ordinal);
        private readonly Dictionary<string, Button> categories =
            new Dictionary<string, Button>(StringComparer.Ordinal);
        private bool browseOpen;
        private int pointerId = -1;
        private bool multiTouchCancelled;
        private Vector2 swipeStart;
        private float nextRefresh;
        private string lastUiKey;
        private Rect lastSafeArea;

        private static readonly Color White = new Color(.98f, .98f, 1f);
        private static readonly Color Muted = new Color(.72f, .76f, .84f);
        private static readonly Color Dark = new Color(.04f, .055f, .09f, .90f);
        private static readonly Color Selected = new Color(.22f, .35f, .52f, .98f);
        private static readonly Color Neutral = new Color(.12f, .15f, .23f, .90f);

        private void OnEnable() { TryBuild(); }

        private void Start()
        {
            if (Engine == null) Engine = FindFirstObjectByType<LensEngineBootstrap>();
            TryBuild();
        }

        private void OnDisable()
        {
            if (pointerId != -1 && previewArea != null &&
                previewArea.HasPointerCapture(pointerId))
                previewArea.ReleasePointer(pointerId);
            pointerId = -1;
            multiTouchCancelled = false;
            browseOpen = false;
            IsReady = false;
        }

        private void TryBuild()
        {
            if (IsReady) return;
            if (document == null) document = GetComponent<UIDocument>();
            if (document == null || document.panelSettings == null ||
                document.rootVisualElement == null) return;
            if (Engine == null) Engine = FindFirstObjectByType<LensEngineBootstrap>();
            if (Engine == null) return;

            root = document.rootVisualElement;
            categories.Clear();
            voiceModes.Clear();
            root.Clear(); // Dedicated, owned UIDocument only.
            root.style.flexGrow = 1;
            root.style.width = Length.Percent(100);
            root.style.height = Length.Percent(100);
            root.pickingMode = PickingMode.Ignore;

            // Preview input is underneath the UI bars, and only this surface
            // observes one-swipe-one-lens; category scroll never reaches it.
            previewArea = new VisualElement { name = "lens-preview-hit-area" };
            Fill(previewArea);
            previewArea.pickingMode = PickingMode.Position;
            previewArea.RegisterCallback<PointerDownEvent>(OnPreviewDown);
            previewArea.RegisterCallback<PointerUpEvent>(OnPreviewUp);
            previewArea.RegisterCallback<PointerCancelEvent>(OnPreviewCancelled);
            root.Add(previewArea);

            top = new VisualElement { name = "lens-top-controls" };
            top.style.position = Position.Absolute;
            top.style.top = 0;
            top.style.left = 0;
            top.style.right = 0;
            top.style.paddingLeft = 10;
            top.style.paddingRight = 10;
            top.style.paddingBottom = 7;
            top.style.backgroundColor = new Color(.015f, .02f, .04f, .72f);
            root.Add(top);

            var titleRow = new VisualElement();
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.alignItems = Align.Center;
            titleRow.style.minHeight = 50;
            top.Add(titleRow);
            var exit = MakeButton("Back", "Exit Crush.X lens camera",
                () => NativeLensLifecycle.ExitToCrushX());
            exit.style.width = 66;
            titleRow.Add(exit);
            var title = MakeLabel("Crush.X Camera", 19, White);
            title.style.flexGrow = 1;
            title.style.unityTextAlign = TextAnchor.MiddleCenter;
            titleRow.Add(title);

            trackingStatus = MakeLabel("Camera ready", 12, Muted);
            trackingStatus.style.unityTextAlign = TextAnchor.MiddleCenter;
            titleRow.Add(trackingStatus);

            var tabsRow = new VisualElement();
            tabsRow.style.flexDirection = FlexDirection.Row;
            tabsRow.style.alignItems = Align.Center;
            tabsRow.style.minHeight = 50;
            top.Add(tabsRow);
            categoryStrip = new ScrollView(ScrollViewMode.Horizontal)
            {
                name = "lens-category-scroll"
            };
            categoryStrip.style.flexGrow = 1;
            categoryStrip.style.height = 48;
            categoryStrip.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            categoryStrip.verticalScrollerVisibility = ScrollerVisibility.Hidden;
            categoryStrip.contentContainer.style.flexDirection = FlexDirection.Row;
            tabsRow.Add(categoryStrip);
            foreach (string collection in LensDiscovery.Collections)
            {
                string chosen = collection;
                var button = MakeButton(collection, "Open " + collection + " lenses",
                    () => OpenCollection(chosen));
                button.style.marginRight = 5;
                button.style.minWidth = 92;
                categoryStrip.Add(button);
                categories.Add(collection, button);
            }

            browseButton = MakeButton("Browse", "Browse all lens categories",
                ToggleBrowse);
            browseButton.style.width = 76;
            tabsRow.Add(browseButton);
            sectionInfo = MakeLabel("", 13, Muted);
            sectionInfo.style.unityTextAlign = TextAnchor.MiddleCenter;
            top.Add(sectionInfo);

            browsePanel = new VisualElement { name = "lens-browse-panel" };
            browsePanel.style.position = Position.Absolute;
            browsePanel.style.right = 10;
            browsePanel.style.width = 235;
            browsePanel.style.backgroundColor = Dark;
            browsePanel.style.paddingTop = 7;
            browsePanel.style.paddingBottom = 7;
            browsePanel.style.paddingLeft = 8;
            browsePanel.style.paddingRight = 8;
            browsePanel.style.borderTopLeftRadius = 12;
            browsePanel.style.borderTopRightRadius = 12;
            browsePanel.style.borderBottomLeftRadius = 12;
            browsePanel.style.borderBottomRightRadius = 12;
            browsePanel.style.display = DisplayStyle.None;
            browsePanel.pickingMode = PickingMode.Position;
            browseList = new ScrollView(ScrollViewMode.Vertical);
            browseList.style.maxHeight = 390;
            foreach (string collection in LensDiscovery.Collections)
            {
                string chosen = collection;
                var choice = MakeButton(collection, "Choose " + collection,
                    () => OpenCollection(chosen));
                choice.style.marginBottom = 4;
                browseList.Add(choice);
            }
            browsePanel.Add(browseList);
            root.Add(browsePanel);

            bottom = new VisualElement { name = "lens-bottom-controls" };
            bottom.style.position = Position.Absolute;
            bottom.style.bottom = 0;
            bottom.style.left = 0;
            bottom.style.right = 0;
            bottom.style.paddingLeft = 14;
            bottom.style.paddingRight = 14;
            bottom.style.paddingTop = 8;
            bottom.style.backgroundColor = new Color(.015f, .02f, .04f, .78f);
            root.Add(bottom);

            selectedLens = MakeLabel("", 18, White);
            selectedLens.style.unityTextAlign = TextAnchor.MiddleCenter;
            selectedLens.style.minHeight = 30;
            bottom.Add(selectedLens);

            gameStatus = MakeLabel("", 13, White);
            gameStatus.style.unityTextAlign = TextAnchor.MiddleCenter;
            gameStatus.style.display = DisplayStyle.None;
            bottom.Add(gameStatus);

            intensitySlider = new Slider("Strength", 0f, 1f);
            intensitySlider.style.minHeight = 34;
            intensitySlider.style.color = White;
            intensitySlider.style.display = DisplayStyle.None;
            intensitySlider.tooltip = "Adjust selected beauty or funny face warp intensity";
            intensitySlider.RegisterValueChangedCallback(evt =>
            {
                if (Engine == null) return;
                if (IsBeauty(Engine.ActiveId))
                    Engine.SetBeautyIntensity(evt.newValue);
                else if (IsFaceWarp(Engine.ActiveId))
                    Engine.SetWarpIntensity(evt.newValue);
            });
            bottom.Add(intensitySlider);

            voiceStrip = new ScrollView(ScrollViewMode.Horizontal);
            voiceStrip.style.height = 46;
            voiceStrip.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            voiceStrip.contentContainer.style.flexDirection = FlexDirection.Row;
            voiceStrip.style.display = DisplayStyle.None;
            foreach (string mode in new[] { "Robot", "Deep", "Space", "Off" })
            {
                string selected = mode;
                var voiceButton = MakeButton(selected, "Set local voice " + selected,
                    () => { if (Engine != null) Engine.SetVoiceMode(selected); });
                voiceButton.style.minWidth = 70;
                voiceButton.style.marginRight = 5;
                voiceStrip.Add(voiceButton);
                voiceModes.Add(selected, voiceButton);
            }
            microphoneButton = MakeButton("Start Mic",
                "Tap to request microphone permission for local funny voice preview",
                () => { if (Engine != null) Engine.ToggleVoicePreview(); });
            microphoneButton.style.minWidth = 110;
            voiceStrip.Add(microphoneButton);
            bottom.Add(voiceStrip);

            var captureRow = new VisualElement();
            captureRow.style.flexDirection = FlexDirection.Row;
            captureRow.style.alignItems = Align.Center;
            captureRow.style.justifyContent = Justify.SpaceBetween;
            captureRow.style.minHeight = 56;
            bottom.Add(captureRow);

            var previous = MakeButton("‹", "Previous lens",
                () => { if (Engine != null) Engine.Step(-1); });
            previous.style.flexGrow = 1;
            captureRow.Add(previous);
            favoriteButton = MakeButton("♡", "Save or remove favorite lens",
                () => { if (Engine != null) Engine.ToggleFavorite(); });
            favoriteButton.style.flexGrow = 1;
            captureRow.Add(favoriteButton);
            var capture = MakeButton("Photo", "Capture photo with selected effects",
                () => { if (Engine != null) CaptureManager.SavePhoto(Engine); });
            capture.style.flexGrow = 1;
            captureRow.Add(capture);
            var next = MakeButton("›", "Next lens",
                () => { if (Engine != null) Engine.Step(1); });
            next.style.flexGrow = 1;
            captureRow.Add(next);

            IsReady = true;
            lastUiKey = null;
            lastSafeArea = Rect.zero;
            UpdateSafeArea();
            RefreshVisualState(true);
        }

        private static void Fill(VisualElement element)
        {
            element.style.position = Position.Absolute;
            element.style.top = 0;
            element.style.bottom = 0;
            element.style.left = 0;
            element.style.right = 0;
        }

        private static Label MakeLabel(string text, int size, Color color)
        {
            var label = new Label(text);
            label.style.color = color;
            label.style.fontSize = size;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.pickingMode = PickingMode.Ignore;
            return label;
        }

        private static Button MakeButton(string text, string tooltip, Action action)
        {
            var button = new Button(() => action()) { text = text, tooltip = tooltip };
            button.focusable = true;
            button.style.color = White;
            button.style.backgroundColor = Neutral;
            button.style.fontSize = 14;
            button.style.unityFontStyleAndWeight = FontStyle.Bold;
            button.style.unityTextAlign = TextAnchor.MiddleCenter;
            button.style.minHeight = 44;
            button.style.marginLeft = 2;
            button.style.marginRight = 2;
            button.style.borderTopLeftRadius = 8;
            button.style.borderTopRightRadius = 8;
            button.style.borderBottomLeftRadius = 8;
            button.style.borderBottomRightRadius = 8;
            return button;
        }

        private static bool IsBeauty(string id) =>
            id == "beauty-glow" || id == "beauty-blush";

        private static bool IsFaceWarp(string id) =>
            id == "funny-big-eyes" || id == "funny-jumbo-mouth";

        private void OpenCollection(string name)
        {
            if (Engine == null || !LensDiscovery.IsCollection(name)) return;
            Engine.SetCollection(name);
            browseOpen = false;
            browsePanel.style.display = DisplayStyle.None;
            browseButton.text = "Browse";
            lastUiKey = null;
            RefreshVisualState(true);
        }

        private void ToggleBrowse()
        {
            browseOpen = !browseOpen;
            browsePanel.style.display = browseOpen ?
                DisplayStyle.Flex : DisplayStyle.None;
            browseButton.text = browseOpen ? "Close" : "Browse";
        }

        private void OnPreviewDown(PointerDownEvent evt)
        {
            if (browseOpen)
            {
                ToggleBrowse();
                return;
            }
            if (pointerId != -1)
            {
                multiTouchCancelled = true;
                return;
            }
            if (Engine == null) return;
            pointerId = evt.pointerId;
            multiTouchCancelled = false;
            swipeStart = new Vector2(evt.localPosition.x, evt.localPosition.y);
            previewArea.CapturePointer(evt.pointerId);
        }

        private void OnPreviewUp(PointerUpEvent evt)
        {
            if (pointerId != evt.pointerId || pointerId == -1) return;
            pointerId = -1;
            if (previewArea.HasPointerCapture(evt.pointerId))
                previewArea.ReleasePointer(evt.pointerId);
            if (Engine == null || browseOpen || multiTouchCancelled) return;
            Vector2 difference = new Vector2(evt.localPosition.x,
                evt.localPosition.y) - swipeStart;
            float width = previewArea.resolvedStyle.width;
            int direction = LensPreviewSwipe.Direction(Vector2.zero,
                difference, width);
            if (direction != 0) Engine.Step(direction);
        }

        private void OnPreviewCancelled(PointerCancelEvent evt)
        {
            if (evt.pointerId != pointerId) return;
            pointerId = -1;
            multiTouchCancelled = true;
            if (previewArea.HasPointerCapture(evt.pointerId))
                previewArea.ReleasePointer(evt.pointerId);
        }

        private void Update()
        {
            if (!IsReady)
            {
                TryBuild();
                return;
            }
            if (Engine == null)
            {
                Engine = FindFirstObjectByType<LensEngineBootstrap>();
                if (Engine == null) return;
            }
            UpdateSafeArea();
            if (Time.unscaledTime < nextRefresh) return;
            nextRefresh = Time.unscaledTime + .12f;
            RefreshVisualState(false);
        }

        private void UpdateSafeArea()
        {
            Rect safe = Screen.safeArea;
            if (safe == lastSafeArea || root == null || root.resolvedStyle.height <= 0)
                return;
            lastSafeArea = safe;
            // Convert from physical screen pixels to UI Toolkit points.
            float pixelsToPanel = root.resolvedStyle.height /
                Mathf.Max(1f, Screen.height);
            float topInset = (Screen.height - safe.yMax) * pixelsToPanel;
            float bottomInset = safe.yMin * pixelsToPanel;
            top.style.paddingTop = topInset + 6f;
            bottom.style.paddingBottom = bottomInset + 7f;
            browsePanel.style.top = topInset + 153f;
            browseList.style.maxHeight = Mathf.Max(100f,
                root.resolvedStyle.height - topInset - bottomInset - 270f);
        }

        private void RefreshVisualState(bool force)
        {
            if (Engine == null || !IsReady) return;
            string active = Engine.ActiveId ?? "";
            bool favorite = Engine.IsCurrentFavorite;
            string key = Engine.ActiveCollection + "|" + active + "|" +
                Engine.VisibleLensCount + "|" + favorite + "|" +
                Engine.TrackingActive + "|" + Engine.VoicePreviewRunning + "|" +
                Engine.ActiveVoiceMode + "|" + Engine.HasActiveGame;
            if (force || key != lastUiKey)
            {
                lastUiKey = key;
                foreach (var entry in categories)
                    entry.Value.style.backgroundColor =
                        entry.Key == Engine.ActiveCollection ? Selected : Neutral;
                favoriteButton.text = favorite ? "♥" : "♡";
                favoriteButton.tooltip = favorite ?
                    "Remove lens from favorites" : "Add lens to favorites";
                microphoneButton.text = Engine.VoicePreviewRunning ?
                    "Stop Mic" : "Start Mic";
                foreach (var entry in voiceModes)
                    entry.Value.style.backgroundColor =
                        entry.Key == Engine.ActiveVoiceMode.ToString() ?
                            Selected : Neutral;
                trackingStatus.text = Engine.TrackingActive ?
                    "Face active" : "Camera";
                sectionInfo.text = Engine.VisibleLensCount == 0 ?
                    Engine.ActiveCollection == "Favorites" ?
                        "No favorites. Choose All and tap the heart." :
                    Engine.ActiveCollection == "Recent" ?
                        "No recent lenses. Select one from All." :
                        "No lenses in this category." :
                    Engine.ActiveCollection + " · " +
                        Engine.VisibleLensCount + " lenses";

                var info = LensCatalog.Find(active);
                selectedLens.text = info.HasValue ?
                    info.Value.DisplayName : "Original";
                bool showSlider = IsBeauty(active) || IsFaceWarp(active);
                intensitySlider.style.display = showSlider ?
                    DisplayStyle.Flex : DisplayStyle.None;
                bool showVoice = active.StartsWith("funny-",
                    StringComparison.Ordinal);
                voiceStrip.style.display = showVoice ?
                    DisplayStyle.Flex : DisplayStyle.None;
                gameStatus.style.display = Engine.HasActiveGame ?
                    DisplayStyle.Flex : DisplayStyle.None;
            }

            if (Engine.HasActiveGame)
                gameStatus.text = "Score " + Engine.ActiveGameScore +
                    " · " + Mathf.CeilToInt(Engine.ActiveGameSeconds) + "s";

            if (IsBeauty(active))
                intensitySlider.SetValueWithoutNotify(Engine.BeautyIntensity);
            else if (IsFaceWarp(active))
                intensitySlider.SetValueWithoutNotify(Engine.WarpIntensity);
        }
    }
}
