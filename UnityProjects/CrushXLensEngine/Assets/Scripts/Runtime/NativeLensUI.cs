using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CrushX.LensEngine
{
    /// <summary>Full-screen native scene controls: swipe horizontally to browse; buttons work without WebView.</summary>
    [RequireComponent(typeof(CrushXCameraSwipe))]
    public sealed class NativeLensUI : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private GUIStyle header, status, button;
        private Texture2D dark;

        private void Start()
        {
            engine = FindFirstObjectByType<LensEngineBootstrap>();
            // RequireComponent does not retrofit already serialized scene components.
            if (GetComponent<CrushXCameraSwipe>() == null) gameObject.AddComponent<CrushXCameraSwipe>();
            if (GetComponent<CrushXSmartCarousel>() == null) gameObject.AddComponent<CrushXSmartCarousel>();
        }

        private void Update()
        {
            if (engine == null) return;
#if ENABLE_INPUT_SYSTEM
            if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame) NativeLensLifecycle.ExitToCrushX();
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKeyDown(KeyCode.Escape)) NativeLensLifecycle.ExitToCrushX();
#endif
        }

        private void EnsureStyles()
        {
            if (button != null) return;
            dark = new Texture2D(1,1); dark.SetPixel(0,0,new Color(.02f,.035f,.08f,.8f)); dark.Apply();
            button = new GUIStyle(GUI.skin.button) { fontSize=22, fontStyle=FontStyle.Bold };
            button.normal.background = dark;
            button.normal.textColor = Color.white;
            header = new GUIStyle(GUI.skin.label) { fontSize=25, fontStyle=FontStyle.Bold, alignment=TextAnchor.MiddleCenter };
            header.normal.textColor = Color.white;
            status = new GUIStyle(header) { fontSize=18, fontStyle=FontStyle.Normal };
        }

        private void OnGUI()
        {
            if (engine == null) return;
            EnsureStyles();
            float u = Mathf.Max(.6f, Mathf.Min(Screen.width/440f, Screen.height/900f));
            Matrix4x4 old = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(Vector3.one*u);
            float w=Screen.width/u, h=Screen.height/u;
            GUI.Label(new Rect(w*.2f, 20, w*.6f,45), "Crush.X   3D AR", header);
            if (GUI.Button(new Rect(14,20,78,48), "Back", button)) NativeLensLifecycle.ExitToCrushX();
            GUI.Label(new Rect(20,74,w-40,34), engine.TrackingActive ? "Face tracking active" : "Face tracking unavailable", status);
            if (GUI.Button(new Rect(w/2-120,h-144,96,80), "Favorite",button)) engine.ToggleFavorite();
            if (GUI.Button(new Rect(w/2+24,h-144,96,80), "Photo",button)) CaptureManager.SavePhoto(engine);
            if (!string.IsNullOrEmpty(engine.Notice)) GUI.Label(new Rect(20,h-310,w-40,40), engine.Notice, status);
            var selected=LensCatalog.Find(engine.ActiveId);
            GUI.Label(new Rect(18,h-68,w-36,40),selected.HasValue?selected.Value.DisplayName:"Original",header);
            GUI.matrix=old;
        }

        private void OnDestroy() { if (dark != null) Destroy(dark); }
    }
}
