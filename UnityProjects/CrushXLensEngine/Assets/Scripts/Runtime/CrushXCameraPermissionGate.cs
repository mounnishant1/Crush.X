using UnityEngine;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace CrushX.LensEngine
{
    /// <summary>One Android camera permission gate; Android owns grants and expiry.</summary>
    [DisallowMultipleComponent]
    public sealed class CrushXCameraPermissionGate : MonoBehaviour
    {
        private const string AskedKey = "CrushX.CameraPermissionRequested.v1";
        public bool RequestPending { get; private set; }
        public bool WasAsked { get { return PlayerPrefs.GetInt(AskedKey, 0) != 0; } }
        public bool Granted
        {
            get
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                return Permission.HasUserAuthorizedPermission(Permission.Camera);
#else
                return true;
#endif
            }
        }

        public void AskFromUserAction()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (RequestPending || Granted || WasAsked) return;
            RequestPending = true;
            PlayerPrefs.SetInt(AskedKey, 1);
            PlayerPrefs.Save();
            var callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += _ => RequestPending = false;
            callbacks.PermissionDenied += _ => RequestPending = false;
            callbacks.PermissionDeniedAndDontAskAgain += _ => RequestPending = false;
            Permission.RequestUserPermission(Permission.Camera, callbacks);
#endif
        }

        public void OpenAndroidSettings()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                using (var intent = new AndroidJavaObject("android.content.Intent", "android.settings.APPLICATION_DETAILS_SETTINGS"))
                using (var uri = new AndroidJavaClass("android.net.Uri"))
                {
                    using (var packageUri = uri.CallStatic<AndroidJavaObject>("parse", "package:" + activity.Call<string>("getPackageName")))
                    {
                        intent.Call<AndroidJavaObject>("setData", packageUri);
                        activity.Call("startActivity", intent);
                    }
                }
            }
            catch (System.Exception error) { Debug.LogWarning("[CrushX] Cannot open application settings: " + error.Message); }
#endif
        }
    }
}
