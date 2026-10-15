using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CrushX.LensEngine
{
    [DisallowMultipleComponent]
    public sealed class CrushXCameraSwipe : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private Vector2 startPosition;
        private bool dragging;

        private void Awake() { engine = FindFirstObjectByType<LensEngineBootstrap>(); }
        private void OnDisable() { dragging = false; }

        public static int SwipeStep(Vector2 start, Vector2 end, float screenWidth)
        {
            Vector2 delta = end - start;
            float threshold = Mathf.Max(65f, screenWidth * .12f);
            if (Mathf.Abs(delta.x) < threshold || Mathf.Abs(delta.y) > Mathf.Abs(delta.x) * .7f) return 0;
            return delta.x < 0 ? 1 : -1;
        }

        private void Begin(Vector2 position)
        {
            startPosition = position;
            // Do not turn drags over the header, shutter, or carousel into camera gestures.
            float scale = Mathf.Clamp(Mathf.Min(Screen.width / 440f, Screen.height / 900f), .6f, 3f);
            dragging = position.y > 280f * scale && position.y < Screen.height - 120f * scale;
        }

        private void End(Vector2 position, bool canceled)
        {
            if (!dragging) return;
            dragging = false;
            if (canceled) return;
            int step = SwipeStep(startPosition, position, Screen.width);
            if (step != 0) engine.Step(step);
        }

        private void Update()
        {
            if (engine == null) engine = FindFirstObjectByType<LensEngineBootstrap>();
            if (engine == null) return;
#if ENABLE_INPUT_SYSTEM
            Touchscreen screen = Touchscreen.current;
            if (screen != null)
            {
                int pressed = 0;
                foreach (var point in screen.touches) if (point.press.isPressed) pressed++;
                if (pressed > 1) { dragging = false; return; }
                var touch = screen.primaryTouch;
                if (touch.press.wasPressedThisFrame) Begin(touch.position.ReadValue());
                if (touch.press.wasReleasedThisFrame)
                    End(touch.position.ReadValue(), touch.phase.ReadValue() == UnityEngine.InputSystem.TouchPhase.Canceled);
                if (touch.press.isPressed || touch.press.wasReleasedThisFrame) return;
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Mouse.current != null)
            {
                if (Mouse.current.leftButton.wasPressedThisFrame) Begin(Mouse.current.position.ReadValue());
                if (Mouse.current.leftButton.wasReleasedThisFrame) End(Mouse.current.position.ReadValue(), false);
            }
#endif
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (Input.touchCount > 1) { dragging = false; return; }
            if (Input.touchCount == 1)
            {
                Touch touch = Input.GetTouch(0);
                if (touch.phase == TouchPhase.Began) Begin(touch.position);
                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    End(touch.position, touch.phase == TouchPhase.Canceled);
                return;
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Input.GetMouseButtonDown(0)) Begin(Input.mousePosition);
            if (Input.GetMouseButtonUp(0)) End(Input.mousePosition, false);
#endif
#endif
        }
    }
}
