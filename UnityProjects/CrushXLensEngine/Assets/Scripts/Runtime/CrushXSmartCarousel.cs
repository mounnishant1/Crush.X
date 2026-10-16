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
        private GUIStyle nameStyle, monogramStyle, emptyStyle;
        private Texture2D bubbleTexture;
        private LensBrowseFilter filter;
        private LensCategory? categoryFilter;
        private string query = string.Empty;
        private float dragOffset;
        private bool dragging;
        private string observedActiveId;

        public LensBrowseFilter Filter { get { return filter; } }
        public LensCategory? CategoryFilter { get { return categoryFilter; } }
        public string CategoryLabel { get { return categoryFilter.HasValue ?
            (categoryFilter.Value == LensCategory.SciFi ? "Sci-Fi" : categoryFilter.Value.ToString()) : "All categories"; } }
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
            IReadOnlyList<string> recentIds, LensCategory? category = null)
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
                        if (order[i].Id == id && Matches(order[i], term, category) && seen.Add(id))
                        { result.Add(order[i]); break; }
                return result;
            }
            foreach (LensManifest lens in order)
                if (Matches(lens, term, category) && (selectedFilter != LensBrowseFilter.Favorites ||
                    (isFavorite != null && isFavorite(lens.Id)))) result.Add(lens);
            return result;
        }

        private static bool Matches(LensManifest lens, string term, LensCategory? category)
        {
            return (!category.HasValue || lens.Category == category.Value) &&
                (term.Length == 0 || lens.DisplayName.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.Id.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.Category.ToString().IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        // Only offer categories backed by installed lenses. Do not manufacture empty
        // Gaming/Anime/Cinematic collections until those assets actually exist.
        public static List<LensCategory> AvailableCategories(IReadOnlyList<LensManifest> order)
        {
            var categories = new List<LensCategory>();
            if (order == null) return categories;
            foreach (LensManifest lens in order)
                if (!categories.Contains(lens.Category)) categories.Add(lens.Category);
            categories.Sort();
            return categories;
        }

        public static LensCategory? NextCategory(IReadOnlyList<LensCategory> categories,
            LensCategory? current, int amount)
        {
            if (categories == null || categories.Count == 0) return null;
            int index = -1;
            if (current.HasValue)
                for (int i = 0; i < categories.Count; i++)
                    if (categories[i] == current.Value) { index = i; break; }
            int next = WrappedIndex(index + amount + 1, categories.Count + 1) - 1;
            return next < 0 ? (LensCategory?)null : categories[next];
        }

        public void CycleCategory(int amount)
        {
            if (amount == 0 || !EnsureEngine()) return;
            SetCategory(NextCategory(AvailableCategories(sessionOrder), categoryFilter, amount));
        }

        public void SetCategory(LensCategory? value)
        {
            if (categoryFilter == value) return;
            categoryFilter = value;
            Refresh();
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
            visible.AddRange(BuildResults(sessionOrder, filter, query, engine.IsFavorite,
                engine.RecentLensIds, categoryFilter));
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

        public static Rect BubbleRect(Rect card)
        {
            // Keep space for the two-line label; never clip it inside GUI.BeginGroup.
            float diameter = Mathf.Max(1f, Mathf.Min(54f, Mathf.Min(card.width - 8f, card.height - 31f)));
            return new Rect(card.center.x - diameter * .5f, card.y + 1f, diameter, diameter);
        }

        private void EnsureVisuals()
        {
            if (nameStyle != null) return;
            nameStyle = new GUIStyle(GUI.skin.label)
            { fontSize = 12, alignment = TextAnchor.UpperCenter, wordWrap = true };
            nameStyle.normal.textColor = Color.white;
            monogramStyle = new GUIStyle(GUI.skin.label)
            { fontSize = 17, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            monogramStyle.normal.textColor = Color.white;
            emptyStyle = new GUIStyle(GUI.skin.label)
            { fontSize = 17, wordWrap = true, alignment = TextAnchor.MiddleCenter };
            emptyStyle.normal.textColor = Color.white;

            // The catalog does not yet ship a thumbnail for every lens. Draw an actual
            // circular, tappable fallback instead of misleading rectangular mock cards.
            const int size = 64;
            bubbleTexture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            bubbleTexture.name = "CrushX Lens Bubble";
            bubbleTexture.wrapMode = TextureWrapMode.Clamp;
            bubbleTexture.filterMode = FilterMode.Bilinear;
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = x - (size - 1) * .5f;
                    float dy = y - (size - 1) * .5f;
                    float distance = Mathf.Sqrt(dx * dx + dy * dy);
                    pixels[y * size + x] = distance > 31f ? Color.clear :
                        distance >= 26f ? Color.white : new Color(.15f, .18f, .24f, .96f);
                }
            bubbleTexture.SetPixels(pixels);
            bubbleTexture.Apply(false, true);
        }

        private void Update()
        {
            // Recent is an active, consented list. External commands and camera swipes
            // can change it without pressing a browse tab; reflect those selections.
            if (EnsureEngine() && observedActiveId != engine.ActiveId)
            {
                observedActiveId = engine.ActiveId;
                if (filter == LensBrowseFilter.Recent) Refresh();
            }
            if (!dragging) dragOffset = Mathf.MoveTowards(dragOffset, 0, Time.unscaledDeltaTime * 650f);
        }

        private void OnApplicationPause(bool paused) { if (paused) CancelDrag(); }
        private void OnDisable() { CancelDrag(); }

        private void OnDestroy()
        {
            if (bubbleTexture != null) Destroy(bubbleTexture);
        }

        private void OnGUI()
        {
            if (!EnsureEngine() || (nativeUi != null && nativeUi.HidesCarousel)) return;
            EnsureVisuals();
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
                string message = categoryFilter.HasValue ? "No matching " + CategoryLabel + " lenses" :
                    filter == LensBrowseFilter.Favorites ? "Favorite a lens to find it here" :
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
                    Rect bubble = BubbleRect(card);
                    // Input belongs to CrushXCameraSwipe; drawing does not steal swipe releases.
                    GUI.color = active ? new Color(1f, .25f, .65f) : new Color(.65f, .72f, .85f);
                    GUI.DrawTexture(bubble, bubbleTexture, ScaleMode.StretchToFill, true);
                    GUI.color = Color.white;
                    string monogram = lens.DisplayName.Length > 1 ?
                        lens.DisplayName.Substring(0, 2).ToUpperInvariant() : lens.DisplayName;
                    GUI.Label(bubble, monogram, monogramStyle);
                    GUI.Label(new Rect(card.x, bubble.yMax + 1, card.width, 28),
                        (engine.IsFavorite(lens.Id) ? "★ " : "") + lens.DisplayName, nameStyle);
                }
                GUI.EndGroup();
            }
            GUI.backgroundColor = previousBackground;
            GUI.color = previousColor;
            GUI.matrix = previousMatrix;
        }
    }
}
