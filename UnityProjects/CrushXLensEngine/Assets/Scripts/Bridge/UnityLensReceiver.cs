using UnityEngine;

namespace CrushX.LensEngine
{
    // Native bridge uses UnityPlayer.UnitySendMessage("CrushXLensReceiver", METHOD, VALUE).
    // UnitySendMessage is not a request/response RPC and payloads should be short and validated.
    public sealed class UnityLensReceiver : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private void Awake()
        {
            gameObject.name = "CrushXLensReceiver";
            DontDestroyOnLoad(gameObject);
        }
        private LensEngineBootstrap GetEngine()
        {
            if (engine == null) engine = FindFirstObjectByType<LensEngineBootstrap>();
            return engine;
        }
        public void SetLens(string id)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) e.SelectLens(id);
        }
        public void TakePhoto(string ignored)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) CaptureManager.SavePhoto(e);
        }
        public void ExitCamera(string ignored) { NativeLensLifecycle.ExitToCrushX(); }
        public void ToggleFavorite(string ignored)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) e.ToggleFavorite();
        }
    }
}
