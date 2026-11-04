using System;
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
        private NativeMediaCapture GetCapture()
        {
            LensEngineBootstrap current = GetEngine();
            return current != null ? NativeMediaCapture.GetOrCreate(current) : null;
        }
        public void RequestMicrophone(string ignored) { GetCapture()?.RequestMicrophoneAccess(); }
        public void StartRecording(string withMicrophone)
        {
            if (withMicrophone != "true" && withMicrophone != "false") return;
            GetCapture()?.StartVideo(withMicrophone == "true");
        }
        public void StopRecording(string ignored) { GetCapture()?.StopVideo(); }
        public void SaveCapture(string ignored) { GetCapture()?.SavePreview(); }
        public void RetryCapture(string ignored) { GetCapture()?.Retry(); }
        public void ExportSavedCapture(string ignored) { GetCapture()?.ExportLastSavedToGallery(); }
        public void SetCaptureMirror(string mode)
        {
            if (mode == null || mode.Length > 32 || !Enum.TryParse(mode, false, out CaptureMirrorMode value)
                || !Enum.IsDefined(typeof(CaptureMirrorMode), value)) return;
            NativeMediaCapture capture = GetCapture();
            if (capture != null) capture.ExportMirrorMode = value;
        }
        public void LensCommand(string json)
        {
            LensEngineBootstrap current = GetEngine();
            if (current != null) current.GetComponent<LensWorkflowBridge>()?.HandleCommand(json);
        }
        public void AuraLensCommand(string text)
        {
            LensEngineBootstrap current = GetEngine();
            if (current != null) current.GetComponent<LensWorkflowBridge>()?.HandleNaturalLanguage(text);
        }
        public void ToggleFavorite(string ignored)
        {
            LensEngineBootstrap e = GetEngine();
            if (e != null) e.ToggleFavorite();
        }
    }
}
