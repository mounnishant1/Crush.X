using UnityEngine;

namespace CrushX.LensEngine
{
    public sealed class CrushXSmartCarousel : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private readonly LensPersonalization preferences =
            new LensPersonalization();

        private void Start()
        {
            engine = FindFirstObjectByType<LensEngineBootstrap>();
        }

        private void OnGUI()
        {
            if (engine == null) return;

            var lenses = engine.RankedLenses;
            if (lenses == null || lenses.Count == 0) return;

            int center = 0;
            for (int i = 0; i < lenses.Count; i++)
                if (lenses[i].Id == engine.ActiveId) { center = i; break; }

            Matrix4x4 previousMatrix = GUI.matrix;
            Color previousColor = GUI.backgroundColor;

            float scale = Mathf.Clamp(
                Mathf.Min(Screen.width / 440f,
                          Screen.height / 900f), .65f, 3f);

            GUI.matrix = Matrix4x4.Scale(
                new Vector3(scale, scale, 1f));

            float w = Screen.width / scale;
            float h = Screen.height / scale;
            float cell = (w - 24f) / 5f;

            GUI.Box(new Rect(8, h - 260, w - 16, 90),
                "Crush.X Lenses");

            GUIStyle style = new GUIStyle(GUI.skin.button);
            style.fontSize = 12;
            style.wordWrap = true;
            style.alignment = TextAnchor.MiddleCenter;

            for (int offset = -2; offset <= 2; offset++)
            {
                int index = (center + offset +
                             lenses.Count) % lenses.Count;

                var lens = lenses[index];
                bool active = lens.Id == engine.ActiveId;
                bool favorite = preferences.IsFavorite(lens.Id);

                GUI.backgroundColor = active
                    ? new Color(.32f, .82f, 1f)
                    : new Color(.16f, .19f, .25f);

                string label = (favorite ? "★ " : "") +
                               lens.DisplayName;

                Rect rect = new Rect(
                    12 + (offset + 2) * cell,
                    h - 225,
                    cell - 4,
                    54);

                if (GUI.Button(rect, label, style) && !active)
                    engine.SelectLens(lens.Id);
            }

            GUI.backgroundColor = previousColor;
            GUI.matrix = previousMatrix;
        }
    }
}