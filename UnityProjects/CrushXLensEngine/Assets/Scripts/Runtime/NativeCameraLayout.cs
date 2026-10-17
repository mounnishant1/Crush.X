using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>One coordinate system for drawing and hit testing camera controls.</summary>
    public struct NativeCameraLayout
    {
        public float Scale;
        public Vector2 Origin;
        public float Width;
        public float Height;

        public static NativeCameraLayout Create(float width, float height, Rect safeArea)
        {
            width = Mathf.Max(1f, width);
            height = Mathf.Max(1f, height);
            if (safeArea.width <= 0 || safeArea.height <= 0) safeArea = new Rect(0, 0, width, height);
            float left = Mathf.Clamp(safeArea.xMin, 0, width - 1f);
            float bottom = Mathf.Clamp(safeArea.yMin, 0, height - 1f);
            float right = Mathf.Clamp(safeArea.xMax, left + 1f, width);
            float top = Mathf.Clamp(safeArea.yMax, bottom + 1f, height);
            float scale = Mathf.Max(.1f, Mathf.Min((right - left) / 440f, (top - bottom) / 800f));
            return new NativeCameraLayout
            {
                Scale = scale,
                Origin = new Vector2(left, height - top),
                Width = (right - left) / scale,
                Height = (top - bottom) / scale
            };
        }

        public static NativeCameraLayout Current { get { return Create(Screen.width, Screen.height, Screen.safeArea); } }
        public Matrix4x4 Matrix { get { return Matrix4x4.TRS(Origin, Quaternion.identity, new Vector3(Scale, Scale, 1)); } }
        public Rect Bounds { get { return new Rect(0, 0, Width, Height); } }
        private float ContentWidth { get { return Mathf.Min(Width - 24f, 640f); } }
        private float ContentLeft { get { return (Width - ContentWidth) * .5f; } }
        public Rect TrackingStatus { get { return new Rect(24, 64, Width - 48, 42); } }
        public Rect Search { get { return new Rect(ContentLeft, Height - 350, ContentWidth, 38); } }
        public Rect Tabs { get { return new Rect(ContentLeft, Height - 306, ContentWidth, 36); } }
        public Rect Carousel { get { return new Rect(ContentLeft, Height - 264, ContentWidth, 88); } }
        public Rect LensTitle { get { return new Rect(ContentLeft, Height - 174, ContentWidth, 26); } }
        public Rect LensState { get { return new Rect(ContentLeft, Height - 148, ContentWidth, 18); } }
        public Rect Shutter { get { return new Rect(Width * .5f - 40, Height - 128, 80, 80); } }
        public Rect Favorite { get { return new Rect(Width * .5f - 154, Height - 116, 104, 56); } }
        public Rect Timer { get { return new Rect(Width * .5f + 50, Height - 116, 104, 56); } }
        public Rect Hint { get { return new Rect(ContentLeft, Height - 40, ContentWidth, 28); } }
        public Rect CameraGesture(bool searchVisible)
        {
            float bottom = searchVisible ? Search.yMin : Tabs.yMin;
            return new Rect(12, 156, Width - 24, Mathf.Max(0, bottom - 166));
        }
        public Vector2 ToGui(Vector2 screenPosition, float screenHeight)
        {
            return new Vector2((screenPosition.x - Origin.x) / Scale,
                (screenHeight - screenPosition.y - Origin.y) / Scale);
        }
    }
}
