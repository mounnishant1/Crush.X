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
        private NativeCameraSkin skin;
        private LensBrowseFilter filter;
        private string query = string.Empty;
        private readonly LensCarouselMotion motion = new LensCarouselMotion();
        private readonly Dictionary<string, Texture2D> covers = new Dictionary<string, Texture2D>();
        private string observedActiveId;
        private bool orderLoaded;
        private bool dragStartedSettled;
        private bool autoSlideEnabled;
        private float nextAutoSlideAt;
        private const float AutoSlideIntervalSeconds = 6f;

        public LensBrowseFilter Filter { get { return filter; } }
        public string Query { get { return query; } }
        public int VisibleCount { get { EnsureEngine(); return visible.Count; } }
        public bool AutoSlideEnabled { get { return autoSlideEnabled; } }

        // Optional for this camera session; never moves lenses while the user interacts.
        public void SetAutoSlideEnabled(bool enabled)
        {
            autoSlideEnabled = enabled;
            DeferAutoSlide();
        }

        private void DeferAutoSlide() { nextAutoSlideAt = Time.unscaledTime + AutoSlideIntervalSeconds; }

        public static bool CanAutoAdvance(int count, bool settled, bool busy, bool hidden, bool searching, bool rearCamera)
        { return count > 1 && settled && !busy && !hidden && !searching && !rearCamera; }

        public Texture2D GetCover(string lensId)
        {
            Texture2D cover;
            return lensId != null && covers.TryGetValue(lensId, out cover) ? cover : null;
        }

        private void Start() { EnsureEngine(); }

        private bool EnsureEngine()
        {
            if (engine == null) engine = FindFirstObjectByType<LensEngineBootstrap>();
            if (nativeUi == null) nativeUi = GetComponent<NativeLensUI>();
            if (!orderLoaded && engine != null && engine.RankedLenses != null)
            {
                orderLoaded = true;
                // Usage changes may influence the next camera session, never an active browse gesture.
                foreach (LensManifest lens in engine.RankedLenses)
                {
                    sessionOrder.Add(lens);
                    // Includes missing entries, so OnGUI never retries a load or allocates a resource path.
                    if (!covers.ContainsKey(lens.Id))
                        covers.Add(lens.Id, Resources.Load<Texture2D>("CrushXLensCovers/" + lens.Id));
                }
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
            DeferAutoSlide();
        }

        public void SetQuery(string value)
        {
            value = value ?? string.Empty;
            if (query == value) return;
            query = value;
            Refresh();
            DeferAutoSlide();
        }

        public void Refresh()
        {
            if (engine == null) return;
            visible.Clear();
            visible.AddRange(BuildResults(sessionOrder, filter, query, engine.IsFavorite, engine.RecentLensIds));
            observedActiveId = engine.ActiveId;
            motion.Reset(visible.Count, CenterIndex());
            dragStartedSettled = false;
        }

        private int CenterIndex()
        {
            for (int i = 0; i < visible.Count; i++) if (visible[i].Id == engine.ActiveId) return i;
            return -1;
        }

        public void BeginDrag()
        {
            if (!EnsureEngine()) return;
            SynchronizeSelection();
            DeferAutoSlide();
            dragStartedSettled = motion.IsSettled;
            motion.BeginDrag();
        }

        public void Drag(float logicalDelta)
        {
            motion.Drag(logicalDelta / CellSpacing(CarouselViewport(NativeCameraLayout.Current.Carousel)));
        }

        public void CancelDrag()
        {
            motion.CancelDrag();
            dragStartedSettled = false;
        }

        public bool EndDrag(Vector2 logicalPosition, bool isTap, bool isHorizontal, float screenVelocityPixelsPerSecond = 0f)
        {
            SynchronizeSelection();
            if (!motion.IsDragging) return false;
            bool allowTap = dragStartedSettled;
            dragStartedSettled = false;
            if (isTap)
            {
                motion.CancelDrag();
                return allowTap && TapAtPosition(logicalPosition, true);
            }
            if (!isHorizontal) { motion.CancelDrag(); return false; }
            NativeCameraLayout layout = NativeCameraLayout.Current;
            float pixelsPerCell = layout.Scale * CellSpacing(CarouselViewport(layout.Carousel));
            // Screen X runs opposite to lens position: leftward finger motion advances.
            double velocityCells = -screenVelocityPixelsPerSecond / Mathf.Max(1f, pixelsPerCell);
            int index = motion.EndDrag(velocityCells);
            if (SelectResult(index)) return true;
            // An unavailable result must return to the actual selection instead of claiming it was applied.
            int active = CenterIndex();
            if (active >= 0) motion.SelectIndex(active);
            return false;
        }

        public bool StepVisible(int amount)
        {
            if (!EnsureEngine() || visible.Count == 0 || amount == 0) return false;
            SynchronizeSelection();
            DeferAutoSlide();
            int direction = amount < 0 ? -1 : 1;
            int current = CenterIndex();
            int index = NextResultIndex(current, direction, visible.Count);
            CancelDrag();
            for (int attempt = 0; attempt < visible.Count; attempt++)
            {
                if (SelectResult(index, current < 0 ? 0 : direction)) return true;
                index = WrappedIndex(index + direction, visible.Count);
            }
            return false;
        }

        private bool SelectResult(int index, int direction = 0)
        {
            if (index < 0 || index >= visible.Count) return false;
            LensManifest lens = visible[index];
            if (lens.Id != engine.ActiveId && !engine.SelectLens(lens.Id)) return false;
            observedActiveId = engine.ActiveId;
            motion.SelectIndex(index, direction);
            return true;
        }

        private void SynchronizeSelection()
        {
            if (engine == null || string.Equals(observedActiveId, engine.ActiveId, StringComparison.Ordinal)) return;
            observedActiveId = engine.ActiveId;
            CancelDrag();
            int index = CenterIndex();
            if (index >= 0) motion.SelectIndex(index);
        }

        public static int NextResultIndex(int current, int direction, int count)
        {
            if (count <= 0) return -1;
            if (current < 0) return direction < 0 ? count - 1 : 0;
            return WrappedIndex(current + (direction < 0 ? -1 : 1), count);
        }

        public bool Tap(Vector2 logicalPosition)
        {
            return TapAtPosition(logicalPosition, false);
        }

        private bool TapAtPosition(Vector2 logicalPosition, bool releasedTap)
        {
            DeferAutoSlide();
            SynchronizeSelection();
            if (!EnsureEngine() || visible.Count == 0 || motion.IsDragging ||
                (!releasedTap && !motion.IsSettled)) return false;
            Rect viewport = CarouselViewport(NativeCameraLayout.Current.Carousel);
            if (!viewport.Contains(logicalPosition)) return false;
            int first, last;
            VisibleCoordinates(out first, out last);
            for (int coordinate = first; coordinate <= last; coordinate++)
            {
                // The same animated, scaled circle is used by rendering; empty corners are not tappable.
                Rect circle = AnimatedCardRect(viewport, coordinate);
                Vector2 delta = logicalPosition - circle.center;
                if (delta.sqrMagnitude <= circle.width * circle.width * .25f)
                {
                    // A clipped wrap copy must travel in the direction of the image that was actually tapped.
                    int direction = coordinate < motion.Position ? -1 : coordinate > motion.Position ? 1 : 0;
                    return SelectResult(WrappedIndex(coordinate, visible.Count), direction);
                }
            }
            return false;
        }

        private static Rect CarouselViewport(Rect bounds)
        {
            float width = Mathf.Min(420f, bounds.width);
            return new Rect(bounds.center.x - width * .5f, bounds.y, width, bounds.height);
        }

        private static float CellSpacing(Rect bounds) { return Mathf.Max(1f, bounds.width / 5f); }

        public static Rect CardRect(Rect bounds, int slot, int slots)
        {
            if (slots <= 0) return Rect.zero;
            float spacing = CellSpacing(bounds);
            float diameter = Mathf.Min(72f, Mathf.Max(1f, spacing - 8f));
            return new Rect(bounds.center.x + (slot - (slots - 1) * .5f) * spacing - diameter * .5f,
                bounds.center.y - diameter * .5f, diameter, diameter);
        }

        private Rect AnimatedCardRect(Rect bounds, int coordinate)
        {
            Rect circle = CardRect(bounds, 0, 1);
            float distance = (float)(coordinate - motion.Position);
            float scale = Mathf.Lerp(.84f, 1f, Mathf.Clamp01(1f - Mathf.Abs(distance)));
            circle.x += distance * CellSpacing(bounds);
            Vector2 center = circle.center;
            circle.width *= scale;
            circle.height *= scale;
            circle.center = center;
            return circle;
        }

        private void VisibleCoordinates(out int first, out int last)
        {
            if (!motion.Loops) { first = 0; last = visible.Count - 1; return; }
            int anchor = (int)Math.Floor(motion.Position);
            first = anchor - 3;
            last = anchor + 3;
        }

        private void Update()
        {
            EnsureEngine();
            SynchronizeSelection();
            motion.Tick(Time.unscaledDeltaTime);
            if (!autoSlideEnabled) return;
            bool hidden = nativeUi != null && nativeUi.HidesCarousel;
            bool busy = nativeUi != null && nativeUi.BlocksCameraGestures;
            bool searching = nativeUi != null && nativeUi.SearchVisible;
            bool rearCamera = nativeUi != null && nativeUi.UsingRearCamera;
            if (!CanAutoAdvance(visible.Count, motion.IsSettled, busy, hidden, searching, rearCamera))
            {
                // After a capture, search, drag or camera flip, wait a full interval;
                // never unexpectedly advance the instant the activity ends.
                if (busy || hidden || searching || rearCamera || motion.IsDragging) DeferAutoSlide();
                return;
            }
            if (Time.unscaledTime >= nextAutoSlideAt) StepVisible(1);
        }

        private void OnApplicationPause(bool paused) { if (paused) CancelDrag(); }
        private void OnApplicationFocus(bool focused) { if (!focused) CancelDrag(); }
        private void OnDisable() { CancelDrag(); }
        private void OnDestroy() { if (skin != null) skin.Dispose(); }

        private void OnGUI()
        {
            if (!EnsureEngine() || (nativeUi != null && nativeUi.HidesCarousel)) return;
            if (skin == null) skin = new NativeCameraSkin();
            Matrix4x4 previousMatrix = GUI.matrix;
            Color previousColor = GUI.color;
            Color previousBackground = GUI.backgroundColor;
            NativeCameraLayout layout = NativeCameraLayout.Current;
            GUI.matrix = layout.Matrix;
            GUI.color = Color.white;
            Rect bounds = CarouselViewport(layout.Carousel);
            if (visible.Count == 0)
            {
                string message = filter == LensBrowseFilter.Favorites ? "Favorite a lens to find it here" :
                    filter == LensBrowseFilter.Recent ? "No recent lenses saved" : "No lenses match your search";
                GUI.Label(bounds, message, skin.Status);
            }
            else
            {
                GUI.BeginGroup(bounds);
                Rect localBounds = new Rect(0, 0, bounds.width, bounds.height);
                int first, last;
                VisibleCoordinates(out first, out last);
                for (int coordinate = first; coordinate <= last; coordinate++)
                {
                    LensManifest lens = visible[WrappedIndex(coordinate, visible.Count)];
                    Rect circle = AnimatedCardRect(localBounds, coordinate);
                    if (circle.xMax < 0 || circle.xMin > localBounds.width) continue;
                    bool active = lens.Id == engine.ActiveId;
                    skin.Disc(circle, NativeCameraSkin.PanelColor);
                    Texture2D cover = GetCover(lens.Id);
                    if (cover != null)
                        GUI.DrawTexture(circle, cover, ScaleMode.ScaleToFit, true);
                    else
                    {
                        // A missing resource is explicit; badges must never masquerade as effect previews.
                        skin.Disc(circle, BadgeColor(lens));
                        GUI.Label(circle, "NO COVER", skin.Badge);
                    }
                    Rect ring = new Rect(circle.x - 2f, circle.y - 2f, circle.width + 4f, circle.height + 4f);
                    // Keep the texture-space thickness fixed as the cell scales, so animation reuses two rings.
                    skin.Ring(ring, active ? NativeCameraSkin.AccentColor : new Color(1f, 1f, 1f, .35f),
                        1f, ring.width * (active ? .04f : .022f));
                }
                GUI.EndGroup();
            }
            GUI.backgroundColor = previousBackground;
            GUI.color = previousColor;
            GUI.matrix = previousMatrix;
        }

        private static Color BadgeColor(LensManifest lens)
        {
            if (lens.Implementation == LensImplementation.ColorFilter) return new Color(.22f, .20f, .38f, 1f);
            switch (lens.Category)
            {
                case LensCategory.Animals: return new Color(.38f, .23f, .15f, 1f);
                case LensCategory.SciFi: return new Color(.10f, .29f, .36f, 1f);
                case LensCategory.Fantasy: return new Color(.30f, .18f, .38f, 1f);
                case LensCategory.Beauty: return new Color(.36f, .18f, .28f, 1f);
                default: return new Color(.20f, .25f, .34f, 1f);
            }
        }
    }
}
