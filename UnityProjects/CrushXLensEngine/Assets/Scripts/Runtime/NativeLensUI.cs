using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace CrushX.LensEngine
{
    // Swipe only over camera preview; not category tabs or capture controls.
    public static class LensSwipeGesture
    {
        public static int Direction(Vector2 start, Vector2 end, float screenWidth,
            float screenHeight, float scale)
        {
            if (screenWidth <= 0 || screenHeight <= 0 || scale <= 0) return 0;
            // Input touch coordinates start at lower-left, IMGUI starts at upper-left.
            if (start.y < 215f * scale ||
                start.y > screenHeight - 185f * scale) return 0;
            Vector2 delta = end - start;
            if (Mathf.Abs(delta.x) < screenWidth * .16f ||
                Mathf.Abs(delta.y) >= Mathf.Abs(delta.x) * .7f) return 0;
            return delta.x < 0 ? 1 : -1;
        }
    }

    // IMGUI is an integration prototype. Production UI should be moved to Canvas.
    public sealed class NativeLensUI : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private Vector2 pointerDown;
        private int activeTouchId = -1;
        private bool mousePressed;
        private GUIStyle header, status, button, tabButton;
        private Texture2D dark;

        private void OnEnable() { EnhancedTouchSupport.Enable(); }
        private void OnDisable() { EnhancedTouchSupport.Disable(); }
        private void Start() { engine = FindFirstObjectByType<LensEngineBootstrap>(); }

        private void Update()
        {
            if (engine == null) return;
            if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame)
            {
                NativeLensLifecycle.ExitToCrushX();
                return;
            }

            // EnhancedTouch preserves touch Began/Ended events on Android.
            if (Touch.activeTouches.Count > 1)
            {
                activeTouchId = -1;
                return;
            }
            foreach (var touch in Touch.activeTouches)
            {
                if (touch.began && activeTouchId == -1)
                {
                    activeTouchId = touch.touchId;
                    pointerDown = touch.screenPosition;
                }
                else if (touch.touchId == activeTouchId && touch.ended)
                {
                    AdvanceIfSwipe(pointerDown, touch.screenPosition);
                    activeTouchId = -1;
                }
            }

#if UNITY_EDITOR || UNITY_STANDALONE
            // Editor-only keyboard/mouse parity for Unity playmode QA.
            if (Mouse.current != null && Touchscreen.current == null)
            {
                if (Mouse.current.leftButton.wasPressedThisFrame)
                {
                    pointerDown = Mouse.current.position.ReadValue();
                    mousePressed = true;
                }
                if (mousePressed && Mouse.current.leftButton.wasReleasedThisFrame)
                {
                    AdvanceIfSwipe(pointerDown, Mouse.current.position.ReadValue());
                    mousePressed = false;
                }
            }
#endif
        }

        private void AdvanceIfSwipe(Vector2 start, Vector2 end)
        {
            float scale = Mathf.Max(.6f, Mathf.Min(Screen.width / 440f, Screen.height / 900f));
            int direction = LensSwipeGesture.Direction(start, end, Screen.width, Screen.height, scale);
            if (direction != 0) engine.Step(direction);
        }

        private void EnsureStyles()
        {
            if (button != null) return;
            dark = new Texture2D(1, 1);
            dark.SetPixel(0, 0, new Color(.02f, .035f, .08f, .80f));
            dark.Apply();
            button = new GUIStyle(GUI.skin.button) { fontSize = 22, fontStyle = FontStyle.Bold };
            button.normal.background = dark;
            button.normal.textColor = Color.white;
            tabButton = new GUIStyle(button)
            {
                fontSize = 15, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Normal
            };
            header = new GUIStyle(GUI.skin.label)
            {
                fontSize = 25, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter
            };
            header.normal.textColor = Color.white;
            status = new GUIStyle(header) { fontSize = 18, fontStyle = FontStyle.Normal };
        }

        private void OnGUI()
        {
            if (engine == null) return;
            EnsureStyles();
            float u = Mathf.Max(.6f, Mathf.Min(Screen.width / 440f, Screen.height / 900f));
            Matrix4x4 old = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(Vector3.one * u);
            float w = Screen.width / u, h = Screen.height / u;
            GUI.Label(new Rect(w * .2f, 20, w * .6f, 45), "Crush.X   3D AR", header);
            if (GUI.Button(new Rect(14, 20, 78, 48), "←", button)) NativeLensLifecycle.ExitToCrushX();
            GUI.Label(new Rect(20, 74, w - 40, 34),
                engine.TrackingActive ? "Face tracking active" : "Face tracking unavailable", status);

            string[] tabs = { "All", "Beauty", "Alien", "Funny", "Trending" };
            float gap = 4f, tabX = 12f;
            float tabWidth = (w - 24f - gap * (tabs.Length - 1)) / tabs.Length;
            for (int i = 0; i < tabs.Length; i++)
            {
                bool selected = engine.ActiveCollection == tabs[i];
                string label = selected ? "• " + tabs[i] : tabs[i];
                if (GUI.Button(new Rect(tabX + i * (tabWidth + gap), 116, tabWidth, 46),
                    label, tabButton))
                    engine.SetCollection(tabs[i]);
            }

            if (engine.ActiveId == "funny-big-eyes" ||
                engine.ActiveId == "funny-jumbo-mouth")
            {
                GUI.Label(new Rect(16, h - 217, 100, 23), "Warp", status);
                float desired = GUI.HorizontalSlider(
                    new Rect(119, h - 205, w - 136, 26), engine.WarpIntensity, 0f, 1f);
                if (Mathf.Abs(desired - engine.WarpIntensity) > .001f)
                    engine.SetWarpIntensity(desired);
            }

            if (engine.ActiveId == "beauty-glow" ||
                engine.ActiveId == "beauty-blush")
            {
                GUI.Label(new Rect(16, h - 217, 100, 23), "Beauty", status);
                float strength = GUI.HorizontalSlider(new Rect(119, h - 205,
                    w - 136, 26), engine.BeautyIntensity, 0f, 1f);
                if (Mathf.Abs(strength - engine.BeautyIntensity) > .001f)
                    engine.SetBeautyIntensity(strength);
            }

            if (GUI.Button(new Rect(16, h - 138, 82, 68), "‹", button)) engine.Step(-1);
            if (GUI.Button(new Rect(w - 98, h - 138, 82, 68), "›", button)) engine.Step(1);
            if (GUI.Button(new Rect(w / 2 - 120, h - 144, 96, 80), "♡", button))
                engine.ToggleFavorite();
            if (GUI.Button(new Rect(w / 2 + 24, h - 144, 96, 80), "●", button))
                CaptureManager.SavePhoto(engine);
            var selectedLens = LensCatalog.Find(engine.ActiveId);
            GUI.Label(new Rect(18, h - 68, w - 36, 40),
                selectedLens.HasValue ? selectedLens.Value.DisplayName : "Original", header);
            GUI.matrix = old;
        }

        private void OnDestroy() { if (dark != null) Destroy(dark); }
    }
}
