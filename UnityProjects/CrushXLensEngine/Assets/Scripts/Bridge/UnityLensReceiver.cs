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
        // Call only after the host authenticates the account and on each
        // account switch. Empty string switches to isolated guest storage.
        public void SetLensAccountScope(string authenticatedAccountId)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null && !e.ConfigureAccountScope(authenticatedAccountId))
                Debug.LogWarning("Rejected invalid lens account scope");
        }

        public void SetCollection(string collection)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) e.SetCollection(collection);
        }
        // The Android host must validate backend authorization before calling this method.
        // The receiver itself cannot authenticate arbitrary UnitySendMessage senders.
        public void ApplyTrendingFeed(string trustedJson)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null && !e.ApplyTrustedTrendingFeed(trustedJson))
                Debug.LogWarning("Rejected invalid or stale lens trend feed");
        }
        // Host supplies viewport-aligned, normalized landmarks from real frames.
        public void PushFaceWarpFrame(string json)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null && !e.PushFaceWarpFrame(json))
                Debug.LogWarning("Rejected unsafe / stale face warp frame");
        }
        public void ResetFaceWarpFrame(string ignored)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) e.ClearWarpTracking();
        }
        public void SetFaceWarpIntensity(string rawValue)
        {
            float intensity;
            if (float.TryParse(rawValue,
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out intensity))
            {
                LensEngineBootstrap e = GetEngine();
                if (e != null) e.SetWarpIntensity(intensity);
            }
        }

        public void SetBeautyIntensity(string rawValue)
        {
            float strength;
            if (float.TryParse(rawValue,
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture,
                    out strength))
            {
                LensEngineBootstrap e = GetEngine();
                if (e != null) e.SetBeautyIntensity(strength);
            }
        }

        public void CalibrateFaceCamera(string value)
        {
            if (string.IsNullOrEmpty(value)) return;
            // Short, explicit format: 0,false | 90,true | 180,false | 270,true
            string[] parts = value.Split(',');
            int rotation;
            bool mirror;
            if (parts.Length != 2 ||
                !int.TryParse(parts[0].Trim(), out rotation) ||
                !bool.TryParse(parts[1].Trim(), out mirror)) return;
            LensEngineBootstrap e = GetEngine();
            if (e != null && !e.SetCameraAlignment(rotation, mirror))
                Debug.LogWarning("Rejected face-camera orientation calibration");
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
