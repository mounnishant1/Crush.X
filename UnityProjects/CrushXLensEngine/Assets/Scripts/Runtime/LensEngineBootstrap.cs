using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine
{
    // Minimal demonstrator. Real native release should substitute a Canvas UI and configured XR scene.
    public sealed class LensEngineBootstrap : MonoBehaviour
    {
        private FaceTrackingManager tracking;
        private FunnyVoiceEffects voice;
        private MultiFaceFunnyOverlay groupFaces;
        private ARCameraMediaPipeRunner mediaPipeRunner;
        private FaceWarpFrameSource faceWarp;
        private readonly LiveFaceExpressionState expressions = new LiveFaceExpressionState();
        private bool preciseTrackingAvailable;
        private LensEffect effect;
        private Transform effectRoot;
        private LensPersonalization personalization;
        private List<LensManifest> ranking;
        private List<LensManifest> visible;
        private LensTrendFeed trendFeed;
        private string collection = "All";
        private string activeId;
        private float startAt;
        private bool usingMock;
        private string notice = "";
        private float noticeUntil;
        private GameObject demoFace;

        public string ActiveId { get { return activeId; } }
        public string ActiveCollection { get { return collection; } }
        public IReadOnlyList<LensUserCollection> UserCollections =>
            personalization != null ?
                personalization.CustomCollections.All() :
                new List<LensUserCollection>();

        public List<string> CollectionKeys()
        {
            var options = new List<string>(LensDiscovery.Collections);
            if (personalization != null)
                foreach (LensUserCollection folder in personalization.CustomCollections.All())
                    options.Add(folder.id);
            return options;
        }

        public string CollectionLabel(string id)
        {
            if (LensDiscovery.IsCollection(id)) return id;
            if (personalization == null) return "";
            var folder = personalization.CustomCollections.Get(id);
            return folder != null ? folder.name : "";
        }

        public bool IsCustomCollection(string id)
        {
            return personalization != null &&
                LensCustomCollections.IsCustomId(id) &&
                personalization.CustomCollections.Get(id) != null;
        }

        public bool CreateCustomCollection(string name, out string id)
        {
            id = null;
            if (personalization == null ||
                !personalization.CustomCollections.TryCreate(name, out id))
                return false;
            RefreshVisible();
            return true;
        }

        public bool RenameCustomCollection(string id, string name)
        {
            if (personalization == null ||
                !personalization.CustomCollections.Rename(id, name)) return false;
            RefreshVisible();
            return true;
        }

        public bool DeleteCustomCollection(string id)
        {
            if (personalization == null ||
                !personalization.CustomCollections.Delete(id)) return false;
            if (collection == id) collection = "All";
            RefreshVisible();
            return true;
        }

        public bool ReorderCustomCollection(string id, int direction)
        {
            return personalization != null &&
                personalization.CustomCollections.MoveCollection(id, direction);
        }

        public bool AddLensToCustomCollection(string folderId, string lensId)
        {
            if (personalization == null ||
                !personalization.CustomCollections.AddLens(folderId, lensId))
                return false;
            if (collection == folderId) RefreshVisible();
            return true;
        }

        public bool RemoveLensFromCustomCollection(string folderId, string lensId)
        {
            if (personalization == null ||
                !personalization.CustomCollections.RemoveLens(folderId, lensId))
                return false;
            if (collection == folderId) RefreshVisible();
            return true;
        }

        public bool ReorderLensInCustomCollection(
            string folderId, string lensId, int direction)
        {
            if (personalization == null ||
                !personalization.CustomCollections.MoveLens(folderId, lensId, direction))
                return false;
            if (collection == folderId) RefreshVisible();
            return true;
        }

        public int VisibleLensCount => visible != null ? visible.Count : 0;
        public bool IsCurrentFavorite => personalization != null &&
            !string.IsNullOrEmpty(activeId) && personalization.IsFavorite(activeId);
        public float WarpIntensity { get { return faceWarp != null ? faceWarp.Intensity : 0f; } }
        public float BeautyIntensity { get { return faceWarp != null ? faceWarp.BeautyIntensity : 0f; } }
        public bool TrackingActive { get { return tracking != null && tracking.IsTracking; } }
        public bool PreciseTrackingActive { get { return preciseTrackingAvailable; } }
        public bool VoicePreviewRunning => voice != null && voice.IsPreviewRunning;
        public FunnyVoiceMode ActiveVoiceMode => voice != null ? voice.Mode : FunnyVoiceMode.Off;
        public int ActiveGameScore => effect is IFunnyLensGame g ? g.Score : 0;
        public float ActiveGameSeconds => effect is IFunnyLensGame g ? g.RemainingSeconds : 0f;
        public bool HasActiveGame => effect is IFunnyLensGame;

        private void Awake()
        {
            personalization = new LensPersonalization();
            voice = gameObject.AddComponent<FunnyVoiceEffects>();
            groupFaces = gameObject.AddComponent<MultiFaceFunnyOverlay>();
            groupFaces.Engine = this;
            faceWarp = gameObject.AddComponent<FaceWarpFrameSource>();
            trendFeed = new LensTrendFeed();
            tracking = gameObject.AddComponent<FaceTrackingManager>();
            ARFoundationFaceProvider deviceProvider = null;
            ARFaceManager faceManager = FindFirstObjectByType<ARFaceManager>();
            ARCameraManager frontCamera = FindFirstObjectByType<ARCameraManager>();
            if (frontCamera != null)
                frontCamera.requestedFacingDirection =
                    UnityEngine.XR.ARFoundation.CameraFacingDirection.User;
            if (faceManager != null)
            {
                deviceProvider = gameObject.AddComponent<ARFoundationFaceProvider>();
                deviceProvider.FaceManager = faceManager;
                tracking.SetProvider(deviceProvider);
                // Coarse on-device ARCore face-mesh fallback for image warping.
                // A precise MediaPipe landmark source can replace this later.
                var warpDriver = gameObject.AddComponent<ARFaceMeshWarpDriver>();
                warpDriver.FaceManager = faceManager;
                warpDriver.PreviewCamera = frontCamera != null ?
                    frontCamera.GetComponent<Camera>() : Camera.main;
                warpDriver.Engine = this;
            }
#if UNITY_EDITOR || UNITY_STANDALONE
            else
            {
                var mock = gameObject.AddComponent<MockTrackingProvider>();
                tracking.SetProvider(mock);
                usingMock = true;
            }
#endif
            // MediaPipe camera image inference is independent of ARFaceManager.
            // Some Android XR camera setups expose camera frames without a 3D
            // AR face subsystem. Keep 2D image-space beauty/warp available.
            if (frontCamera != null)
            {
                mediaPipeRunner = gameObject.AddComponent<ARCameraMediaPipeRunner>();
                mediaPipeRunner.CameraManager = frontCamera;
                mediaPipeRunner.Engine = this;
            }
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
            RefreshVisible();
            if (visible.Count > 0) SelectLensInternal(visible[0].Id, false);
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

        private void RefreshVisible()
        {
            ranking = personalization.Ranked();
            visible = LensDiscovery.Browse(collection, ranking, trendFeed, DateTimeOffset.UtcNow,
                personalization);
        }

        // Authenticated Android host must send an opaque stable account key
        // on account switch and clear it on sign-out. No raw ID is stored.
        public bool ConfigureAccountScope(string authenticatedAccountId)
        {
            if (!personalization.ConfigureAccountScope(authenticatedAccountId))
                return false;
            collection = "All";
            RefreshVisible();
            // Never auto-insert an unintended selection into a new account's
            // recents. Keep prior account's favorites/history inaccessible.
            if (visible.Count > 0)
                SelectLensInternal(visible[0].Id, false);
            return true;
        }

        public bool SetCollection(string name)
        {
            if (!LensDiscovery.IsCollection(name, personalization)) return false;
            collection = name;
            RefreshVisible();
            if (visible.Count == 0)
            {
                // Keep a working camera preview without silently leaving the
                // selected empty collection or switching to a different tab.
                Say(name == "Favorites" ? "Save a lens with the heart button" :
                    name == "Recent" ? "Select any lens to fill Recent" :
                    "No lenses in this collection");
                return true;
            }
            if (visible.FindIndex(l => l.Id == activeId) < 0)
                SelectLensInternal(visible[0].Id, false);
            return true;
        }

        // This endpoint accepts only an allow-listed ranking, not executable lens assets.
        // The native host must authenticate/authorize the source of the JSON first.
        public bool ApplyTrustedTrendingFeed(string json)
        {
            if (!trendFeed.TryApplyTrustedSnapshot(json, DateTimeOffset.UtcNow)) return false;
            if (collection == "Trending")
            {
                RefreshVisible();
                if (visible.Count > 0 && visible.FindIndex(l => l.Id == activeId) < 0)
                    SelectLens(visible[0].Id);
            }
            return true;
        }

        public void SetPreciseTrackingAvailable(bool available)
        {
            if (preciseTrackingAvailable == available) return;
            preciseTrackingAvailable = available;
            expressions.Invalidate();
            if (faceWarp != null) faceWarp.Invalidate();
            if (groupFaces != null) groupFaces.Invalidate();
        }

        public bool PushMultiFaceResult(string json)
        {
            return preciseTrackingAvailable && groupFaces != null &&
                groupFaces.Apply(json, Time.realtimeSinceStartup);
        }

        public bool PushMediaPipeResult(string json)
        {
            if (!preciseTrackingAvailable) return false;
            float now = Time.realtimeSinceStartup;
            bool accepted = expressions.TryApply(json, now);
            // No face is a valid invalidation message in both systems.
            if (faceWarp != null) faceWarp.TryApplyJson(json, now);
            return accepted;
        }

        public bool PushFaceWarpFrame(string json)
        {
            return faceWarp != null &&
                faceWarp.TryApplyJson(json, Time.realtimeSinceStartup);
        }

        public void SetWarpIntensity(float value)
        {
            if (faceWarp != null) faceWarp.SetIntensity(value);
        }

        public void SetBeautyIntensity(float value)
        {
            if (faceWarp != null) faceWarp.SetBeautyIntensity(value);
        }

        public void ClearAllTrackingFrames()
        {
            expressions.Invalidate();
            if (faceWarp != null) faceWarp.Invalidate();
            if (groupFaces != null) groupFaces.Invalidate();
        }

        public bool SetCameraAlignment(int rotation, bool mirror)
        {
            return mediaPipeRunner != null &&
                mediaPipeRunner.SetCameraAlignment(rotation, mirror);
        }

        public void ClearWarpTracking()
        {
            if (faceWarp != null) faceWarp.Invalidate();
        }

        public bool SetVoiceMode(string modeName)
        {
            return voice != null && voice.SetMode(modeName);
        }

        public bool ToggleVoicePreview()
        {
            if (voice == null) return false;
            if (voice.IsPreviewRunning)
            {
                voice.StopPreview();
                return false;
            }
            return voice.StartPreviewAfterConsent();
        }

        public bool SelectLens(string id)
        {
            return SelectLensInternal(id, true);
        }

        private bool SelectLensInternal(string id, bool recordUsage)
        {
            if (!LensCatalog.Find(id).HasValue) { Say("Lens not found"); return false; }
            if (visible != null && visible.FindIndex(l => l.Id == id) < 0)
            {
                collection = "All";
                RefreshVisible();
            }
            if (voice != null && !id.StartsWith("funny-", StringComparison.Ordinal))
                voice.StopPreview();
            if (faceWarp != null) faceWarp.SetLens(id);
            if (effect != null) Destroy(effect.gameObject);
            var go = new GameObject("Lens-" + id);
            go.transform.SetParent(effectRoot, false);
            effect = (LensEffect)go.AddComponent(LensCatalog.ResolveType(id));
            effect.Build();
            activeId = id;
            startAt = Time.unscaledTime;
            if (recordUsage) personalization.RecordUsage(id);
            // Reorder recents on intentional selection, but never mid-swipe
            // for unrelated categories that must keep a stable ranking.
            if (recordUsage && collection == "Recent")
                RefreshVisible();
            // Keep the carousel order stable while swiping; refresh on tab/favorite change.
            return true;
        }

        public void Step(int amount)
        {
            // Use current ordering; recompute only after selection to avoid unexpected mid-step jumping.
            if (visible == null || visible.Count == 0) return;
            int index = visible.FindIndex(l => l.Id == activeId);
            if (index < 0) index = 0;
            int next = ((index + amount) % visible.Count + visible.Count) % visible.Count;
            SelectLens(visible[next].Id);
        }
        public void ToggleFavorite()
        {
            if (string.IsNullOrEmpty(activeId)) return;
            personalization.ToggleFavorite(activeId);
            bool saved = personalization.IsFavorite(activeId);
            RefreshVisible();
            if (collection == "Favorites" && !saved && visible.Count > 0 &&
                visible.FindIndex(l => l.Id == activeId) < 0)
                SelectLens(visible[0].Id);
            Say(saved ? "Saved to favorites" :
                collection == "Favorites" && visible.Count == 0 ?
                    "Favorites empty — select All to browse" : "Removed from favorites");
        }
        public void ResetRanking()
        {
            personalization.Reset(); RefreshVisible(); Say("Local ranking reset");
        }
        public void Say(string message) { notice = message; noticeUntil = Time.unscaledTime + 3; }

        private void Update()
        {
            bool showing = TrackingActive;
            if (effectRoot != null) effectRoot.gameObject.SetActive(showing);
            // Keep fallback procedural effects visible until the actual URP
            // renderer pass and camera alignment have been device verified.
            if (!showing) return;
            FaceSample face = tracking.Current;
            float mouthOpen, blink, smile, brow;
            if (preciseTrackingAvailable &&
                expressions.TryRead(Time.realtimeSinceStartup,
                    out mouthOpen, out blink, out smile, out brow))
            {
                face.MouthOpen = mouthOpen;
                face.Blink = blink;
            }
            else if (preciseTrackingAvailable)
            {
                // No stale expressions when MediaPipe has no current frame.
                face.MouthOpen = 0f;
                face.Blink = 0f;
            }
            effectRoot.position = face.Position;
            effectRoot.rotation = face.Rotation;
            if (effect != null) effect.Animate(face, Time.unscaledTime - startAt);
        }

        private void OnGUI()
        {
            var productionUI = FindFirstObjectByType<LensCameraProductionUI>();
            if (productionUI != null && productionUI.IsReady) return;
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
            GUI.Box(new Rect(18, h - 140, w - 36, 123), selected.HasValue ? collection + " | " + selected.Value.DisplayName : "No lens");
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
