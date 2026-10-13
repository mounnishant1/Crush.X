using UnityEngine;

namespace CrushX.LensEngine
{
    public static class NativeLensLifecycle
    {
        public static void ExitToCrushX()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                // Finish only the Unity full-screen Activity. Do not call Application.Quit on host app.
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                    if (activity != null) activity.Call("finish");
            }
            catch (System.Exception e) { Debug.LogWarning("Unity camera close failed: " + e.GetType().Name); }
#else
            Debug.Log("Unity native lens close requested (Editor)");
#endif
        }
    }
}
