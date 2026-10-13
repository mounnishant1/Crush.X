using UnityEngine;

namespace CrushX.LensEngine
{
    public static class LensRuntimeEntry
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void OnSceneLoad()
        {
            if (Object.FindFirstObjectByType<LensEngineBootstrap>() == null)
                new GameObject("CrushX Lens Engine").AddComponent<LensEngineBootstrap>();
            if (GameObject.Find("CrushXLensReceiver") == null)
                new GameObject("CrushXLensReceiver").AddComponent<UnityLensReceiver>();
        }
    }
}
