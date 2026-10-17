using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CrushX.LensEngine
{
    /// <summary>Single owner for camera, carousel and shutter touches. IMGUI only owns ordinary buttons.</summary>
    [DisallowMultipleComponent]
    public sealed class CrushXCameraSwipe : MonoBehaviour
    {
        private enum GestureOwner { None, Camera, Carousel, Shutter }
        private LensEngineBootstrap engine;
        private NativeLensUI ui;
        private CrushXSmartCarousel carousel;
        private Vector2 startPosition;
        private GestureOwner owner;
        private bool waitForAllReleased;
        private int gestureWidth, gestureHeight;
        private Rect gestureSafeArea;
        private ScreenOrientation gestureOrientation;

        private void Awake() { Resolve(); }
        private void Resolve()
        {
            if (engine == null) engine = FindFirstObjectByType<LensEngineBootstrap>();
            if (ui == null) ui = GetComponent<NativeLensUI>();
            if (carousel == null) carousel = GetComponent<CrushXSmartCarousel>();
        }

        private void OnDisable() { Cancel(); }
        private void OnApplicationPause(bool paused) { if (paused) Cancel(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Cancel(); }

        public static int SwipeStep(Vector2 start, Vector2 end, float screenWidth)
        {
            Vector2 delta = end - start;
            float threshold = Mathf.Max(65f, screenWidth * .12f);
            if (Mathf.Abs(delta.x) < threshold || Mathf.Abs(delta.y) > Mathf.Abs(delta.x) * .7f) return 0;
            return delta.x < 0 ? 1 : -1;
        }

        public static bool IsTap(Vector2 start, Vector2 end, float scale)
        {
            return (end - start).sqrMagnitude <= 18f * 18f * scale * scale;
        }

        private void Cancel()
        {
            if (owner == GestureOwner.Shutter && ui != null) ui.EndShutter(true);
            if (carousel != null) carousel.CancelDrag();
            owner = GestureOwner.None;
        }

        private void Begin(Vector2 position)
        {
            Cancel();
            if (waitForAllReleased) return;
            Resolve();
            if (ui != null && ui.BeginShutter(position)) owner = GestureOwner.Shutter;
            else if (ui == null || !ui.BlocksCameraGestures)
            {
                NativeCameraLayout layout = NativeCameraLayout.Current;
                Vector2 point = layout.ToGui(position, Screen.height);
                if (carousel != null && layout.Carousel.Contains(point))
                { owner = GestureOwner.Carousel; carousel.BeginDrag(); }
                else if ((ui != null ? ui.CameraGestureRect : layout.CameraGesture(false)).Contains(point))
                    owner = GestureOwner.Camera;
            }
            startPosition = position;
            gestureWidth = Screen.width;
            gestureHeight = Screen.height;
            gestureSafeArea = Screen.safeArea;
            gestureOrientation = Screen.orientation;
        }

        private bool GestureGeometryChanged()
        {
            return gestureWidth != Screen.width || gestureHeight != Screen.height ||
                gestureSafeArea != Screen.safeArea || gestureOrientation != Screen.orientation;
        }

        private void Move(Vector2 position)
        {
            if (GestureGeometryChanged()) { Cancel(); return; }
            if (owner == GestureOwner.Carousel && carousel != null)
                carousel.Drag((position.x - startPosition.x) / NativeCameraLayout.Current.Scale);
            if (owner == GestureOwner.Shutter &&
                (position - startPosition).sqrMagnitude > 80f * 80f * NativeCameraLayout.Current.Scale * NativeCameraLayout.Current.Scale)
                Cancel();
        }

        private void End(Vector2 position, bool canceled)
        {
            GestureOwner completed = owner;
            owner = GestureOwner.None;
            bool resized = GestureGeometryChanged();
            if (completed == GestureOwner.Shutter)
            { if (ui != null) ui.EndShutter(canceled || resized); return; }
            if (canceled || resized || (ui != null && ui.BlocksCameraGestures))
            { if (carousel != null) carousel.CancelDrag(); return; }
            if (completed == GestureOwner.Carousel && carousel != null)
            {
                NativeCameraLayout layout = NativeCameraLayout.Current;
                Vector2 delta = position - startPosition;
                // Preserve the last finger position through release. A carousel snaps by cell spacing,
                // rather than the unrelated full-camera swipe threshold.
                carousel.Drag(delta.x / layout.Scale);
                carousel.EndDrag(layout.ToGui(position, Screen.height),
                    IsTap(startPosition, position, layout.Scale), Mathf.Abs(delta.y) <= Mathf.Abs(delta.x) * .7f);
            }
            else if (completed == GestureOwner.Camera)
            {
                int step = SwipeStep(startPosition, position, Screen.width);
                if (step == 0) return;
                if (carousel != null) carousel.StepVisible(step);
                else if (engine != null) engine.Step(step);
            }
        }

        private void Update()
        {
            Resolve();
            if (engine == null) return;
#if ENABLE_INPUT_SYSTEM
            Touchscreen screen = Touchscreen.current;
            if (screen != null)
            {
                int pressed = 0;
                foreach (var point in screen.touches) if (point.press.isPressed) pressed++;
                if (pressed > 1) { Cancel(); waitForAllReleased = true; return; }
                if (waitForAllReleased) { if (pressed == 0) waitForAllReleased = false; return; }
                var touch = screen.primaryTouch;
                if (touch.press.wasPressedThisFrame) Begin(touch.position.ReadValue());
                if (touch.press.isPressed) Move(touch.position.ReadValue());
                if (touch.press.wasReleasedThisFrame)
                    End(touch.position.ReadValue(), touch.phase.ReadValue() == UnityEngine.InputSystem.TouchPhase.Canceled);
                if (touch.press.isPressed || touch.press.wasReleasedThisFrame) return;
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Mouse.current != null)
            {
                if (Mouse.current.leftButton.wasPressedThisFrame) Begin(Mouse.current.position.ReadValue());
                if (Mouse.current.leftButton.isPressed) Move(Mouse.current.position.ReadValue());
                if (Mouse.current.leftButton.wasReleasedThisFrame) End(Mouse.current.position.ReadValue(), false);
            }
#endif
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (Input.touchCount > 1) { Cancel(); waitForAllReleased = true; return; }
            if (waitForAllReleased) { if (Input.touchCount == 0) waitForAllReleased = false; return; }
            if (Input.touchCount == 1)
            {
                Touch touch = Input.GetTouch(0);
                if (touch.phase == TouchPhase.Began) Begin(touch.position);
                if (touch.phase == TouchPhase.Moved || touch.phase == TouchPhase.Stationary) Move(touch.position);
                if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    End(touch.position, touch.phase == TouchPhase.Canceled);
                return;
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Input.GetMouseButtonDown(0)) Begin(Input.mousePosition);
            if (Input.GetMouseButton(0)) Move(Input.mousePosition);
            if (Input.GetMouseButtonUp(0)) End(Input.mousePosition, false);
#endif
#endif
        }
    }
}
