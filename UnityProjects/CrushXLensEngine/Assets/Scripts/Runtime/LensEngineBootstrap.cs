using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine
{
    // Minimal demonstrator. Real native release should substitute a Canvas UI and configured XR scene.
    public sealed class LensEngineBootstrap : MonoBehaviour
    {
        // Keep imported resource prototypes available without replacing animated procedural lenses by default.
        public bool PreferResourcePrefabs;
        private FaceTrackingManager tracking;
        private LensEffect effect;
        private Transform effectRoot;
        private LensPersonalization personalization;
        private List<LensManifest> ranking;
        private string activeId;
        private float startAt;
        private bool usingMock;
        private string notice = "";
        private float noticeUntil;
        private GameObject demoFace;
        private ARTrackingDiagnostics diagnostics;
        private readonly List<string> recentLensIds = new List<string>();

        public event Action<string, LensRuntimeState> LensStateChanged;
        public LensRuntimeState State { get; private set; }
        public string LastLensError { get; private set; }
        public string TrackingStatus { get { return diagnostics != null ? diagnostics.CurrentMessage : TrackingActive ? "Face tracking active" : "Initializing face tracking"; } }
        public bool IsFavorite(string id) { return personalization != null && personalization.IsFavorite(id); }
        public bool PersonalizationEnabled { get { return personalization != null && personalization.UsageEnabled; } }
        public IReadOnlyList<string> RecentLensIds { get { return recentLensIds; } }
        public TrackingCapabilities ProviderCapabilities { get { return tracking != null && tracking.ProviderComponent is ITrackingCapabilitiesProvider capabilities ? capabilities.Capabilities : TrackingCapabilities.None; } }
        public bool ProviderCapabilitiesKnown { get { return tracking != null && tracking.ProviderComponent is ITrackingCapabilitiesProvider capabilities && capabilities.CapabilitiesKnown; } }

        public IReadOnlyList<LensManifest> RankedLenses { get { return ranking; } }
        public string Notice { get { return Time.unscaledTime < noticeUntil ? notice : string.Empty; } }
        public string ActiveId { get { return activeId; } }
        public bool TrackingActive { get { return tracking != null && tracking.IsTracking; } }

        private void Awake()
        {
            diagnostics = GetComponent<ARTrackingDiagnostics>();
            if (diagnostics == null) diagnostics = gameObject.AddComponent<ARTrackingDiagnostics>();
            if (GetComponent<LensWorkflowBridge>() == null) gameObject.AddComponent<LensWorkflowBridge>();
            if (GetComponent<LensPerformanceMonitor>() == null) gameObject.AddComponent<LensPerformanceMonitor>();
            personalization = new LensPersonalization();
            recentLensIds.AddRange(personalization.RecentIds());
            tracking = gameObject.AddComponent<FaceTrackingManager>();
            ARFoundationFaceProvider deviceProvider = null;
            ARFaceManager faceManager = FindFirstObjectByType<ARFaceManager>();
            if (faceManager != null)
            {
                deviceProvider = gameObject.AddComponent<ARFoundationFaceProvider>();
                deviceProvider.FaceManager = faceManager;
                ARCameraManager frontCamera = FindFirstObjectByType<ARCameraManager>();
                if (frontCamera != null)
                    frontCamera.requestedFacingDirection = UnityEngine.XR.ARFoundation.CameraFacingDirection.User;
                tracking.SetProvider(deviceProvider);
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            else
            {
                var mock = gameObject.AddComponent<MockTrackingProvider>();
                tracking.SetProvider(mock);
                usingMock = true;
            }
#endif
            if (Camera.main == null)
            {
                var cam = new GameObject("CrushX Demo Camera");
                cam.tag = "MainCamera";
                var c = cam.AddComponent<Camera>();
                c.transform.position = new Vector3(0, 0, -2);
                c.transform.rotation = Quaternion.identity;
                c.clearFlags = CameraClearFlags.SolidColor;
                c.backgroundColor = new Color(.045f, .07f, .11f);
                c.fieldOfView = 56;
                cam.AddComponent<AudioListener>();
            }
            var light = new GameObject("CrushX Demo Light");
            light.transform.SetParent(transform, false);
            var lamp = light.AddComponent<Light>();
            lamp.type = LightType.Directional; lamp.intensity = 1.2f;
            lamp.transform.rotation = Quaternion.Euler(35, -20, 0);
            effectRoot = new GameObject("LensRoot").transform;
            effectRoot.SetParent(transform, false);
            if (usingMock) CreateDemoFace();
            ranking = personalization.Ranked();
            foreach (LensManifest lens in ranking)
                if (SelectLens(lens.Id)) break;
        }

        private void CreateDemoFace()
        {
            demoFace = new GameObject("MockFaceVisual - NOT REAL CAMERA");
            demoFace.transform.SetParent(effectRoot, false);
            LensGeometry.Add(demoFace.transform, "Face", PrimitiveType.Sphere, Vector3.zero,
                new Vector3(.54f, .69f, .43f), new Color(.68f, .43f, .35f));
            for (int side = -1; side <= 1; side += 2)
            {
                LensGeometry.Add(demoFace.transform, "Eye", PrimitiveType.Sphere,
                    new Vector3(side * .125f, .07f, -.208f), new Vector3(.07f, .055f, .024f), Color.white);
                LensGeometry.Add(demoFace.transform, "Pupil", PrimitiveType.Sphere,
                    new Vector3(side * .125f, .07f, -.237f), new Vector3(.031f, .034f, .013f), Color.black);
            }
        }

        private GameObject premiumLensInstance;

        public void SetPersonalizationEnabled(bool enabled)
        {
            personalization.SetUsageEnabled(enabled);
            recentLensIds.Clear();
            recentLensIds.AddRange(personalization.RecentIds());
            // Keep the current session's browse order stable; new ranking applies next session.
        }

        private void SetState(LensRuntimeState state)
        {
            if (State == state) return;
            State = state;
            LensStateChanged?.Invoke(activeId, State);
        }

        public LensCompatibilityResult Compatibility(LensManifest lens)
        {
            return LensCompatibility.Evaluate(lens, ProviderCapabilitiesKnown, ProviderCapabilities);
        }

        public bool SelectLens(string id)
        {
            id = LensCompatibility.NormalizeId(id);
            LensManifest? manifest = LensCatalog.Find(id);
            if (!manifest.HasValue) { LastLensError = "Lens not found"; Say(LastLensError); return false; }
            if (activeId == id) return true;
            LensCompatibilityResult compatibility = Compatibility(manifest.Value);
            if (!compatibility.CanSelect)
            {
                LastLensError = compatibility.Message;
                ARTrackingDiagnostics.RecordLensSelection(id, false, LastLensError);
                Say(LastLensError);
                return false;
            }
            var sceneLenses = new List<ISceneLens>();
            bool sceneLensAvailable = false;
            foreach (MonoBehaviour component in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None))
            {
                if (component is ISceneLens sceneLens)
                {
                    sceneLenses.Add(sceneLens);
                    if (sceneLens.LensId == id && sceneLens.IsAvailable) sceneLensAvailable = true;
                }
            }
            // Reject before destroying the active lens. Imported lenses never fall back to fake tracking.
            if (manifest.Value.SceneProvided && !sceneLensAvailable)
            {
                LastLensError = "This lens needs its configured AR scene and prefab";
                ARTrackingDiagnostics.RecordLensSelection(id, false, LastLensError);
                Say(LastLensError);
                return false;
            }
            LensEffect candidateEffect = null;
            GameObject candidate = null;
            LensRuntimeState previousState = State;
            SetState(LensRuntimeState.Loading);
            try
            {
                GameObject prefab = PreferResourcePrefabs ? Resources.Load<GameObject>("CrushXLenses/" + id) : null;
                if (!manifest.Value.SceneProvided)
                {
                    candidate = prefab != null ? Instantiate(prefab, effectRoot, false) : new GameObject("Lens-" + id);
                    candidate.SetActive(false);
                    candidate.transform.SetParent(effectRoot, false);
                    if (prefab == null)
                    {
                        candidateEffect = (LensEffect)candidate.AddComponent(LensCatalog.ResolveType(id));
                        candidateEffect.Build();
                    }
                }
                ARTrackingDiagnostics.RecordLensSelection(id, true, compatibility.Message);
                foreach (ISceneLens sceneLens in sceneLenses) sceneLens.SelectLens(id);
            }
            catch (Exception error)
            {
                if (candidate != null) { candidate.SetActive(false); Destroy(candidate); }
                foreach (ISceneLens sceneLens in sceneLenses)
                {
                    try { sceneLens.SelectLens(activeId ?? string.Empty); }
                    catch (Exception rollbackError) { Debug.LogException(rollbackError); }
                }
                LastLensError = "Lens could not load; previous lens retained";
                ARTrackingDiagnostics.RecordLensSelection(activeId ?? string.Empty, true, "Selection rollback");
                ARTrackingDiagnostics.RecordLensSelection(id, false, error.GetType().Name);
                SetState(previousState);
                Say(LastLensError);
                Debug.LogException(error);
                return false;
            }
            if (effect != null)
            {
                effect.OnDeselected();
                effect.gameObject.SetActive(false);
                Destroy(effect.gameObject);
            }
            if (premiumLensInstance != null) { premiumLensInstance.SetActive(false); Destroy(premiumLensInstance); }
            effect = candidateEffect;
            premiumLensInstance = candidateEffect == null ? candidate : null;
            activeId = id;
            if (candidate != null) candidate.SetActive(true);
            if (effect != null) effect.OnSelected();
            startAt = Time.unscaledTime;
            LastLensError = string.Empty;
            personalization.RecordUsage(id);
            recentLensIds.Clear();
            recentLensIds.AddRange(personalization.RecentIds());
            SetState(TrackingActive ? LensRuntimeState.Active : LensRuntimeState.WaitingForTracking);
            // Apply usage-based ordering next session, not in the middle of a swipe sequence.
            return true;
        }

        public void Step(int amount)
        {
            // Share a stable browse order with the carousel; explicit favorite/reset actions can re-rank.
            int index = ranking.FindIndex(l => l.Id == activeId);
            if (index < 0) index = 0;
            if (ranking.Count == 0 || amount == 0) return;
            int direction = amount < 0 ? -1 : 1;
            int next = (int)((((long)index + amount) % ranking.Count + ranking.Count) % ranking.Count);
            for (int attempt = 0; attempt < ranking.Count; attempt++)
            {
                if (SelectLens(ranking[next].Id)) return;
                next = (next + direction + ranking.Count) % ranking.Count;
            }
        }
        public void ToggleFavorite()
        {
            personalization.ToggleFavorite(activeId);
            ranking = personalization.Ranked();
            Say(personalization.IsFavorite(activeId) ? "Saved to favorites" : "Removed from favorites");
        }
        public void ResetRanking()
        {
            personalization.Reset(); ranking = personalization.Ranked(); Say("Local ranking reset");
            recentLensIds.Clear();
        }
        public void Say(string message) { notice = message; noticeUntil = Time.unscaledTime + 3; }

        private void Update()
        {
            bool showing = TrackingActive;
            if (effectRoot != null) effectRoot.gameObject.SetActive(showing);
            if (!string.IsNullOrEmpty(activeId))
                SetState(diagnostics != null && (diagnostics.CurrentOutcome == ARDiagnosticOutcome.LensPrefabMissing || diagnostics.CurrentOutcome == ARDiagnosticOutcome.LensRendererUnavailable)
                    ? LensRuntimeState.Unavailable : showing ? LensRuntimeState.Active : LensRuntimeState.WaitingForTracking);
            if (!showing) return;
            FaceSample face = tracking.Current;
            effectRoot.position = face.Position;
            effectRoot.rotation = face.Rotation;
            if (effect != null) effect.Animate(face, Time.unscaledTime - startAt);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && effectRoot != null) effectRoot.gameObject.SetActive(false);
        }

        private void OnDestroy()
        {
            if (effect != null) effect.OnDeselected();
            LensGeometry.ReleaseMaterials();
        }

        private NativeLensUI cachedNativeLensUi;

        private void OnGUI()
        {
            if (cachedNativeLensUi == null)
                cachedNativeLensUi = FindFirstObjectByType<NativeLensUI>();

            if (cachedNativeLensUi != null &&
                cachedNativeLensUi.isActiveAndEnabled)
                return;
            if (!usingMock && FindFirstObjectByType<NativeLensUI>() != null) return;
            // Basic functional debug UI, not a production Snapchat-class screen.
            float uiScale = Mathf.Max(.85f, Mathf.Min(Screen.width / 780f, Screen.height / 1280f));
            Matrix4x4 matrix = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(Vector3.one * uiScale);
            float w = Screen.width / uiScale;
            float h = Screen.height / uiScale;
            GUI.color = Color.white;
            GUI.Box(new Rect(18, 20, w - 36, 84), "CrushX Lens Engine v0.2 | " + (usingMock ? "MOCK TRACKING" : tracking.ProviderName));
            GUI.Label(new Rect(35, 58, w - 55, 27), TrackingActive ? "Tracking: active" : "Tracking: unavailable (configure AR face provider)");
            LensManifest? selected = LensCatalog.Find(activeId);
            GUI.Box(new Rect(18, h - 140, w - 36, 123), selected.HasValue ? selected.Value.DisplayName : "No lens");
            float buttonY = h - 103;
            float buttonW = Mathf.Max(65, (w - 80) / 4);
            if (GUI.Button(new Rect(28, buttonY, buttonW, 55), "< Previous")) Step(-1);
            if (GUI.Button(new Rect(34 + buttonW, buttonY, buttonW, 55), "Next >")) Step(1);
            if (GUI.Button(new Rect(40 + buttonW * 2, buttonY, buttonW, 55), personalization.IsFavorite(activeId) ? "★ Saved" : "☆ Favorite")) ToggleFavorite();
            if (GUI.Button(new Rect(46 + buttonW * 3, buttonY, buttonW - 5, 55), "Photo")) CaptureManager.SavePhoto(this);
            if (Time.unscaledTime < noticeUntil) GUI.Box(new Rect(18, h - 185, w - 36, 40), notice);
            GUI.matrix = matrix;
        }
    }
}
