using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    public enum FunnyVoiceMode { Off, Robot, Deep, Space }

    /// <summary>
    /// Original no-external-SDK audio DSP. No recording/voice uploading.
    /// OnAudioFilterRead runs on Unity's audio thread; only immutable scalars
    /// are read there. Preview must be started with a separate user action.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class FunnyVoiceEffects : MonoBehaviour
    {
        private AudioSource source;
        private AudioClip ownedClip;
        private string startedDevice;
        private bool previewRunning;
        private volatile int mode;
        private volatile float wet = .72f;
        private double phase;
        private readonly float[] lowPass = new float[8];
        private int deviceSampleRate = 48000;

        public FunnyVoiceMode Mode => (FunnyVoiceMode)mode;
        public float Strength => wet;
        public bool IsPreviewRunning => previewRunning;

        private void Awake()
        {
            source = GetComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = true;
            source.spatialBlend = 0;
            source.volume = .65f; // local mic-to-speaker feedback caution
            deviceSampleRate = Mathf.Max(AudioSettings.outputSampleRate, 8000);
        }

        public bool SetMode(string value)
        {
            FunnyVoiceMode result;
            if (!Enum.TryParse(value, true, out result) ||
                !Enum.IsDefined(typeof(FunnyVoiceMode), result)) return false;
            mode = (int)result;
            return true;
        }

        public void SetStrength(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) return;
            wet = Mathf.Clamp01(value);
        }

        // ONLY call from a visible, user-initiated consent control.
        // Production uses headphones for preview and a synchronized audio
        // recording bus; this component does not encode the altered audio.
        public bool StartPreviewAfterConsent()
        {
            if (previewRunning) return true;
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(
                UnityEngine.Android.Permission.Microphone))
            {
                UnityEngine.Android.Permission.RequestUserPermission(
                    UnityEngine.Android.Permission.Microphone);
                return false; // second explicit tap after approval
            }
#endif
            if (Microphone.devices == null || Microphone.devices.Length == 0)
                return false;
            if (source == null) source = GetComponent<AudioSource>();
            startedDevice = Microphone.devices[0];
            try
            {
                ownedClip = Microphone.Start(startedDevice, true, 1,
                    Mathf.Max(AudioSettings.outputSampleRate, 16000));
                if (ownedClip == null) return false;
                source.clip = ownedClip;
                previewRunning = true;
                return true;
            }
            catch (Exception error)
            {
                Debug.LogWarning("[Crush.X Voice] Mic unavailable: " +
                    error.GetType().Name);
                StopPreview();
                return false;
            }
        }

        private void Update()
        {
            if (!previewRunning || source == null || ownedClip == null ||
                source.isPlaying) return;
            try
            {
                if (Microphone.GetPosition(startedDevice) > 4096)
                    source.Play();
            }
            catch (Exception) { StopPreview(); }
        }

        public void StopPreview()
        {
            previewRunning = false;
            if (source != null) { source.Stop(); source.clip = null; }
            if (!string.IsNullOrEmpty(startedDevice))
            {
                try { Microphone.End(startedDevice); }
                catch (Exception) { }
            }
            startedDevice = null;
            ownedClip = null;
        }

        private void OnApplicationPause(bool paused) { if (paused) StopPreview(); }
        private void OnDisable() { StopPreview(); }
        private void OnDestroy() { StopPreview(); }

        private void OnAudioFilterRead(float[] samples, int channels)
        {
            if (samples == null || channels < 1) return;
            int selected = mode;
            float blend = wet;
            if (selected == (int)FunnyVoiceMode.Off || blend <= 0) return;
            if (channels > lowPass.Length) return;
            int sampleRate = deviceSampleRate;
            float increment = 2f * Mathf.PI *
                (selected == (int)FunnyVoiceMode.Robot ? 72f : 9f) / sampleRate;
            // No heap allocations in Unity's audio callback.

            for (int i = 0; i < samples.Length; i += channels)
            {
                double modulator = Math.Sin(phase);
                for (int channel = 0; channel < channels; channel++)
                {
                    int index = i + channel;
                    float dry = samples[index];
                    float transformed = dry;
                    if (selected == (int)FunnyVoiceMode.Robot)
                        transformed = (float)(dry * modulator);
                    else if (selected == (int)FunnyVoiceMode.Deep)
                    {
                        lowPass[channel] += .11f * (dry - lowPass[channel]);
                        transformed = lowPass[channel];
                    }
                    else if (selected == (int)FunnyVoiceMode.Space)
                        transformed = (float)(dry * (.73 + .27 * modulator));
                    samples[index] = Mathf.Clamp(dry + (transformed - dry) * blend, -1f, 1f);
                }
                phase += increment;
                if (phase >= Mathf.PI * 2) phase -= Mathf.PI * 2;
            }
        }
    }
}
