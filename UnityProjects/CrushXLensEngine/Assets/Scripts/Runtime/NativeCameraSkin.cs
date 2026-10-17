using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>Shared camera styling. Create during OnGUI and dispose with the owning component.</summary>
    public sealed class NativeCameraSkin : IDisposable
    {
        public static readonly Color PanelColor = new Color(.045f, .055f, .08f, .86f);
        public static readonly Color AccentColor = new Color(.96f, .25f, .58f, 1f);

        public readonly GUIStyle Button, Header, Status, Small, Input, CardTitle, Badge;
        private readonly GUIStyle panel;
        private readonly List<Texture2D> textures = new List<Texture2D>();
        private readonly Dictionary<int, Texture2D> rings = new Dictionary<int, Texture2D>();
        private readonly Texture2D disc;
        private Texture2D progressRing;
        private Color32[] progressPixels;
        private int previousProgress = -1, previousThickness = -1;
        private const int CircleSize = 128;

        public NativeCameraSkin()
        {
            Texture2D rounded = CreateRounded(Color.white);
            Texture2D normal = CreateRounded(PanelColor);
            Texture2D hover = CreateRounded(new Color(.095f, .11f, .15f, .96f));
            Texture2D pressed = CreateRounded(new Color(.15f, .17f, .22f, .98f));
            Texture2D selected = CreateRounded(new Color(.45f, .10f, .27f, .96f));
            disc = CreateCircle(0, 1f, true);
            var border = new RectOffset(10, 10, 10, 10);
            panel = new GUIStyle { border = border };
            SetState(panel.normal, rounded);

            Button = new GUIStyle(GUI.skin.button)
            {
                fontSize = 14,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                wordWrap = true,
                border = new RectOffset(10, 10, 10, 10),
                padding = new RectOffset(10, 10, 5, 5),
                margin = new RectOffset(0, 0, 0, 0)
            };
            SetState(Button.normal, normal);
            SetState(Button.hover, hover);
            SetState(Button.active, pressed);
            SetState(Button.focused, hover);
            SetState(Button.onNormal, selected);
            SetState(Button.onHover, selected);
            SetState(Button.onActive, pressed);
            SetState(Button.onFocused, selected);

            Header = Label(18, FontStyle.Bold);
            Status = Label(14, FontStyle.Normal);
            Small = Label(12, FontStyle.Normal);
            CardTitle = Label(11, FontStyle.Normal);
            Badge = Label(11, FontStyle.Bold);
            Input = new GUIStyle(Button)
            {
                fontSize = 14,
                fontStyle = FontStyle.Normal,
                alignment = TextAnchor.MiddleLeft,
                wordWrap = false,
                padding = new RectOffset(12, 12, 6, 6)
            };
        }

        private static GUIStyle Label(int size, FontStyle weight)
        {
            var style = new GUIStyle(GUI.skin.label)
            {
                fontSize = size,
                fontStyle = weight,
                alignment = TextAnchor.MiddleCenter,
                wordWrap = true,
                padding = new RectOffset(0, 0, 0, 0),
                margin = new RectOffset(0, 0, 0, 0)
            };
            style.normal.textColor = Color.white;
            return style;
        }

        private static void SetState(GUIStyleState state, Texture2D background)
        {
            state.background = background;
            // Unity 6 exposes scaledBackgrounds only to Editor assemblies. Android player
            // code must use the ordinary background texture above.
#if UNITY_EDITOR
            state.scaledBackgrounds = null;
#endif
            state.textColor = Color.white;
        }

        private Texture2D CreateRounded(Color color)
        {
            const int size = 32;
            const float radius = 10f;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                name = "CrushX camera rounded panel",
                hideFlags = HideFlags.HideAndDontSave,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = Mathf.Max(Mathf.Abs(x + .5f - size * .5f) - (size * .5f - radius), 0f);
                    float dy = Mathf.Max(Mathf.Abs(y + .5f - size * .5f) - (size * .5f - radius), 0f);
                    Color pixel = color;
                    pixel.a *= Mathf.Clamp01(radius + .5f - Mathf.Sqrt(dx * dx + dy * dy));
                    pixels[y * size + x] = pixel;
                }
            texture.SetPixels(pixels);
            texture.Apply(false, true);
            textures.Add(texture);
            return texture;
        }

        public void Panel(Rect rect, Color color)
        {
            Color previousColor = GUI.color;
            Color previousBackground = GUI.backgroundColor;
            GUI.color = color;
            GUI.backgroundColor = Color.white;
            GUI.Label(rect, GUIContent.none, panel);
            GUI.backgroundColor = previousBackground;
            GUI.color = previousColor;
        }

        public void Disc(Rect rect, Color color) { DrawCircle(rect, disc, color); }

        /// <summary>A clockwise arc starting at twelve o'clock. No per-frame texture allocation.</summary>
        public void Ring(Rect rect, Color color, float progress, float thickness = 3f)
        {
            float diameter = Mathf.Min(rect.width, rect.height);
            if (diameter <= 0 || progress <= 0 || float.IsNaN(progress)) return;
            progress = Mathf.Clamp01(progress);
            int pixelThickness = Mathf.Clamp(Mathf.RoundToInt(thickness / diameter * CircleSize * 10), 5, CircleSize * 5);
            Texture2D texture;
            if (progress >= 1f)
            {
                if (!rings.TryGetValue(pixelThickness, out texture))
                {
                    texture = CreateCircle(pixelThickness / 10f, 1f, false);
                    rings.Add(pixelThickness, texture);
                }
            }
            else
            {
                int step = Mathf.CeilToInt(progress * 720);
                if (progressRing == null)
                {
                    progressRing = NewCircleTexture();
                    progressPixels = new Color32[CircleSize * CircleSize];
                }
                if (step != previousProgress || pixelThickness != previousThickness)
                {
                    CirclePixels(progressPixels, pixelThickness / 10f, step / 720f, false);
                    progressRing.SetPixels32(progressPixels);
                    progressRing.Apply(false, false);
                    previousProgress = step;
                    previousThickness = pixelThickness;
                }
                texture = progressRing;
            }
            DrawCircle(rect, texture, color);
        }

        private static void DrawCircle(Rect rect, Texture2D texture, Color color)
        {
            Color previous = GUI.color;
            GUI.color = previous * color;
            GUI.DrawTexture(rect, texture, ScaleMode.ScaleToFit, true);
            GUI.color = previous;
        }

        private Texture2D NewCircleTexture()
        {
            var texture = new Texture2D(CircleSize, CircleSize, TextureFormat.RGBA32, false)
            {
                name = "CrushX camera circle",
                hideFlags = HideFlags.HideAndDontSave,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
            textures.Add(texture);
            return texture;
        }

        private Texture2D CreateCircle(float thickness, float progress, bool filled)
        {
            Texture2D texture = NewCircleTexture();
            var pixels = new Color32[CircleSize * CircleSize];
            CirclePixels(pixels, thickness, progress, filled);
            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return texture;
        }

        private static void CirclePixels(Color32[] pixels, float thickness, float progress, bool filled)
        {
            const float radius = CircleSize * .5f - 1f;
            for (int y = 0; y < CircleSize; y++)
                for (int x = 0; x < CircleSize; x++)
                {
                    float dx = x + .5f - CircleSize * .5f, dy = y + .5f - CircleSize * .5f;
                    float distance = Mathf.Sqrt(dx * dx + dy * dy);
                    float alpha = Mathf.Clamp01(radius + .5f - distance);
                    if (!filled) alpha *= Mathf.Clamp01(distance - (radius - thickness) + .5f);
                    if (progress < 1f && alpha > 0)
                    {
                        float angle = Mathf.Atan2(dx, dy) / (2f * Mathf.PI);
                        if (angle < 0) angle += 1f;
                        alpha *= Mathf.Clamp01((progress - angle) * (2f * Mathf.PI * radius) + .5f);
                    }
                    pixels[y * CircleSize + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(alpha * 255));
                }
        }

        public void Dispose()
        {
            foreach (Texture2D texture in textures)
            {
                if (texture == null) continue;
                if (Application.isPlaying) UnityEngine.Object.Destroy(texture);
                else UnityEngine.Object.DestroyImmediate(texture);
            }
            textures.Clear();
            rings.Clear();
        }
    }
}
