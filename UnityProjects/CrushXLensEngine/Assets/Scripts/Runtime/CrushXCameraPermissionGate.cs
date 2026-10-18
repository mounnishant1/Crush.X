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
        private const string PreviouslyGrantedKey = "CrushX.CameraPermissionGranted.v1";
        public bool RequestPending { get; private set; }
        public bool WasAsked { get { return PlayerPrefs.GetInt(AskedKey, 0) != 0; } }
        public bool Granted
        {
            get
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                bool allowed = Permission.HasUserAuthorizedPermission(Permission.Camera);
                if (allowed && PlayerPrefs.GetInt(PreviouslyGrantedKey, 0) == 0)
                {
                    PlayerPrefs.SetInt(PreviouslyGrantedKey, 1);
                    PlayerPrefs.Save();
                }
                return allowed;
#else
                return true;
#endif
            }
        }

        // One-time grants may expire after leaving the app. A previous grant must
        // never permanently strand the user on the Settings recovery screen.
        public bool CanAskAgain
        {
            get
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                if (Granted) return false;
                if (!WasAsked || PlayerPrefs.GetInt(PreviouslyGrantedKey, 0) != 0) return true;
                try
                {
                    using (var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                    using (var activity = unity.GetStatic<AndroidJavaObject>("currentActivity"))
                        return activity.Call<bool>("shouldShowRequestPermissionRationale", Permission.Camera);
                }
                catch (System.Exception ex)
                {
                    Debug.LogWarning("[CrushX] Cannot read Android permission rationale: " + ex.Message);
                    return false;
                }
#else
                return false;
#endif
            }
        }

        public void AskFromUserAction()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (RequestPending || Granted || !CanAskAgain) return;
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
