using UnityEngine;
using UnityEngine.SceneManagement;

namespace CrushX.LensEngine
{
    public static class LensRuntimeEntry
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void OnSceneLoad()
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
            SceneManager.sceneLoaded += OnSceneLoaded;
            EnsureRuntime(SceneManager.GetActiveScene());
        }

        private static void OnSceneLoaded(Scene scene, LoadSceneMode mode) { EnsureRuntime(scene); }

        private static void EnsureRuntime(Scene scene)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (scene.name == "CrushXStartup" && Application.CanStreamedLevelBeLoaded("CrushXNativeAR"))
            {
                SceneManager.LoadScene("CrushXNativeAR");
                return;
            }
#endif
            if (Object.FindFirstObjectByType<LensEngineBootstrap>() == null)
                new GameObject("CrushX Lens Engine").AddComponent<LensEngineBootstrap>();
            if (Object.FindFirstObjectByType<UnityLensReceiver>() == null)
                new GameObject("CrushXLensReceiver").AddComponent<UnityLensReceiver>();
        }
    }
}
