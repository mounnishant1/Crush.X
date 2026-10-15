using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    public enum LensBrowseFilter { All, Favorites, Recent }

    [DisallowMultipleComponent]
    public sealed class CrushXSmartCarousel : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private NativeLensUI nativeUi;
        private readonly List<LensManifest> sessionOrder = new List<LensManifest>();
        private readonly List<LensManifest> visible = new List<LensManifest>();
        private GUIStyle cardStyle, emptyStyle;
        private LensBrowseFilter filter;
        private string query = string.Empty;
        private float dragOffset;
        private bool dragging;

        public LensBrowseFilter Filter { get { return filter; } }
        public string Query { get { return query; } }
        public int VisibleCount { get { EnsureEngine(); return visible.Count; } }

        private void Start() { EnsureEngine(); }

        private bool EnsureEngine()
        {
            if (engine == null) engine = FindFirstObjectByType<LensEngineBootstrap>();
            if (nativeUi == null) nativeUi = GetComponent<NativeLensUI>();
            if (sessionOrder.Count == 0 && engine != null && engine.RankedLenses != null)
            {
                // Usage changes may influence the next camera session, never an active browse gesture.
                foreach (LensManifest lens in engine.RankedLenses) sessionOrder.Add(lens);
                Refresh();
            }
            return engine != null;
        }

        public static int WrappedIndex(int index, int count)
        {
            if (count <= 0) return -1;
            return (int)((((long)index % count) + count) % count);
        }

        public static List<LensManifest> BuildResults(IReadOnlyList<LensManifest> order,
            LensBrowseFilter selectedFilter, string search, Func<string, bool> isFavorite,
            IReadOnlyList<string> recentIds)
        {
            var result = new List<LensManifest>();
            if (order == null) return result;
            string term = (search ?? string.Empty).Trim();
            if (selectedFilter == LensBrowseFilter.Recent)
            {
                if (recentIds == null) return result;
                var seen = new HashSet<string>();
                foreach (string id in recentIds)
                    for (int i = 0; i < order.Count; i++)
                        if (order[i].Id == id && Matches(order[i], term) && seen.Add(id))
                        { result.Add(order[i]); break; }
                return result;
            }
            foreach (LensManifest lens in order)
                if (Matches(lens, term) && (selectedFilter != LensBrowseFilter.Favorites ||
                    (isFavorite != null && isFavorite(lens.Id)))) result.Add(lens);
            return result;
        }

        private static bool Matches(LensManifest lens, string term)
        {
            return term.Length == 0 || lens.DisplayName.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.Id.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.Category.ToString().IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public void SetFilter(LensBrowseFilter value)
        {
            if (filter == value) return;
            filter = value;
            Refresh();
        }

        public void SetQuery(string value)
        {
            value = value ?? string.Empty;
            if (query == value) return;
            query = value;
            Refresh();
        }

        public void Refresh()
        {
            if (engine == null) return;
            visible.Clear();
            visible.AddRange(BuildResults(sessionOrder, filter, query, engine.IsFavorite, engine.RecentLensIds));
            dragging = false;
            dragOffset = 0;
        }

        private int CenterIndex()
        {
            for (int i = 0; i < visible.Count; i++) if (visible[i].Id == engine.ActiveId) return i;
            return 0;
        }

        public void BeginDrag() { dragging = true; dragOffset = 0; }
        public void Drag(float logicalDelta) { if (dragging) dragOffset = Mathf.Clamp(logicalDelta, -100, 100); }
        public void CancelDrag() { dragging = false; dragOffset = 0; }

        public bool StepVisible(int amount)
        {
            if (!EnsureEngine() || visible.Count == 0 || amount == 0) return false;
            int direction = amount < 0 ? -1 : 1;
            int index = WrappedIndex(CenterIndex() + direction, visible.Count);
            CancelDrag();
            for (int attempt = 0; attempt < visible.Count; attempt++)
            {
                if (visible[index].Id == engine.ActiveId || engine.SelectLens(visible[index].Id)) return true;
                index = WrappedIndex(index + direction, visible.Count);
            }
            return false;
        }

        public bool Tap(Vector2 logicalPosition)
        {
            if (!EnsureEngine() || visible.Count == 0) return false;
            Rect bounds = NativeCameraLayout.Current.Carousel;
            int slots = Mathf.Min(5, visible.Count);
            int center = CenterIndex();
            for (int slot = 0; slot < slots; slot++)
                if (CardRect(bounds, slot, slots).Contains(logicalPosition))
                {
                    LensManifest lens = visible[WrappedIndex(center + slot - slots / 2, visible.Count)];
                    CancelDrag();
                    return lens.Id == engine.ActiveId || engine.SelectLens(lens.Id);
                }
            CancelDrag();
            return false;
        }

        public static Rect CardRect(Rect bounds, int slot, int slots)
        {
            if (slots <= 0) return Rect.zero;
            float cell = Mathf.Min(120f, (bounds.width - 12f) / slots);
            float left = bounds.center.x - cell * slots * .5f;
            return new Rect(left + slot * cell + 3, bounds.y + 8, cell - 6, bounds.height - 16);
        }

        private void Update()
        {
            if (!dragging) dragOffset = Mathf.MoveTowards(dragOffset, 0, Time.unscaledDeltaTime * 650f);
        }

        private void OnApplicationPause(bool paused) { if (paused) CancelDrag(); }
        private void OnDisable() { CancelDrag(); }

        private void OnGUI()
        {
            if (!EnsureEngine() || (nativeUi != null && nativeUi.HidesCarousel)) return;
            if (cardStyle == null)
            {
                cardStyle = new GUIStyle(GUI.skin.box) { fontSize = 15, wordWrap = true, alignment = TextAnchor.MiddleCenter };
                cardStyle.normal.textColor = Color.white;
                emptyStyle = new GUIStyle(GUI.skin.label) { fontSize = 17, wordWrap = true, alignment = TextAnchor.MiddleCenter };
                emptyStyle.normal.textColor = Color.white;
            }
            Matrix4x4 previousMatrix = GUI.matrix;
            Color previousColor = GUI.color;
            Color previousBackground = GUI.backgroundColor;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            GUI.matrix = layout.Matrix;
            GUI.color = Color.white;
            Rect bounds = layout.Carousel;
            GUI.Box(bounds, GUIContent.none);
            if (visible.Count == 0)
            {
                string message = filter == LensBrowseFilter.Favorites ? "Favorite a lens to find it here" :
                    filter == LensBrowseFilter.Recent ? "No recent lenses saved" : "No lenses match your search";
                GUI.Label(bounds, message, emptyStyle);
            }
            else
            {
                int center = CenterIndex();
                int slots = Mathf.Min(5, visible.Count);
                GUI.BeginGroup(bounds);
                Rect localBounds = new Rect(0, 0, bounds.width, bounds.height);
                for (int slot = 0; slot < slots; slot++)
                {
                    LensManifest lens = visible[WrappedIndex(center + slot - slots / 2, visible.Count)];
                    bool active = lens.Id == engine.ActiveId;
                    Rect card = CardRect(localBounds, slot, slots);
                    card.x += dragOffset;
                    GUI.backgroundColor = active ? new Color(.95f, .22f, .61f) : new Color(.16f, .19f, .25f);
                    // Touches are owned by CrushXCameraSwipe; GUI.Button would also select on release after a drag.
                    GUI.Box(card, (engine.IsFavorite(lens.Id) ? "★ " : "") + lens.DisplayName, cardStyle);
                    if (active) GUI.DrawTexture(new Rect(card.x + 8, card.yMax - 5, card.width - 16, 3), Texture2D.whiteTexture);
                }
                GUI.EndGroup();
            }
            GUI.backgroundColor = previousBackground;
            GUI.color = previousColor;
            GUI.matrix = previousMatrix;
        }
    }
}
