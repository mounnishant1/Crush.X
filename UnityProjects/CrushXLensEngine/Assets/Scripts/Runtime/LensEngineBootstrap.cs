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

        public string ActiveId { get { return activeId; } }
        public bool TrackingActive { get { return tracking != null && tracking.IsTracking; } }

        private void Awake()
        {
            personalization = new LensPersonalization();
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
            SelectLens(ranking[0].Id);
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

        public bool SelectLens(string id)
        {
            if (!LensCatalog.Find(id).HasValue) { Say("Lens not found"); return false; }
            if (effect != null) Destroy(effect.gameObject);
            var go = new GameObject("Lens-" + id);
            go.transform.SetParent(effectRoot, false);
            effect = (LensEffect)go.AddComponent(LensCatalog.ResolveType(id));
            effect.Build();
            activeId = id;
            startAt = Time.unscaledTime;
            personalization.RecordUsage(id);
            ranking = personalization.Ranked();
            return true;
        }

        public void Step(int amount)
        {
            // Use current ordering; recompute only after selection to avoid unexpected mid-step jumping.
            int index = ranking.FindIndex(l => l.Id == activeId);
            if (index < 0) index = 0;
            SelectLens(ranking[(index + amount + ranking.Count) % ranking.Count].Id);
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
        }
        public void Say(string message) { notice = message; noticeUntil = Time.unscaledTime + 3; }

        private void Update()
        {
            bool showing = TrackingActive;
            if (effectRoot != null) effectRoot.gameObject.SetActive(showing);
            if (!showing) return;
            FaceSample face = tracking.Current;
            effectRoot.position = face.Position;
            effectRoot.rotation = face.Rotation;
            if (effect != null) effect.Animate(face, Time.unscaledTime - startAt);
        }

        private void OnGUI()
        {
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
