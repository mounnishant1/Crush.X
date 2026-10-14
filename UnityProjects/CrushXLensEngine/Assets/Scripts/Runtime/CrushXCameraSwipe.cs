using UnityEngine;

namespace CrushX.LensEngine
{
    public sealed class CrushXCameraSwipe : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private Vector2 startPosition;
        private bool dragging;
        private float threshold;

        private void Awake()
        {
            engine = FindFirstObjectByType<LensEngineBootstrap>();
            threshold = Mathf.Max(65f, Screen.width * 0.12f);
        }

        private void Update()
        {
            if (engine == null)
            {
                engine = FindFirstObjectByType<LensEngineBootstrap>();
                return;
            }

#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.touchCount > 0)
            {
                Touch touch = Input.GetTouch(0);

                if (touch.phase == TouchPhase.Began)
                {
                    startPosition = touch.position;
                    dragging = true;
                }

                if (dragging &&
                    (touch.phase == TouchPhase.Ended ||
                     touch.phase == TouchPhase.Canceled))
                {
                    ProcessSwipe(touch.position);
                    dragging = false;
                }

                return;
            }

#if UNITY_EDITOR
            if (Input.GetMouseButtonDown(0))
            {
                startPosition = Input.mousePosition;
                dragging = true;
            }

            if (dragging && Input.GetMouseButtonUp(0))
            {
                ProcessSwipe(Input.mousePosition);
                dragging = false;
            }
#endif
#endif
        }

        private void ProcessSwipe(Vector2 endPosition)
        {
            Vector2 delta = endPosition - startPosition;

            if (Mathf.Abs(delta.x) < threshold)
                return;

            if (Mathf.Abs(delta.y) > Mathf.Abs(delta.x) * 0.7f)
                return;

            engine.Step(delta.x < 0 ? 1 : -1);
        }
    }
}