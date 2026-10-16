using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Video;

namespace CrushX.LensEngine
{
    /// <summary>Decodes a completed local MP4; preparation/playback errors preserve the captured draft.</summary>
    public sealed class MediaPreviewPlayer : MonoBehaviour
    {
        public bool IsPrepared { get; private set; }
        public bool IsPlaying { get { return IsPrepared && player != null && player.isPlaying; } }
        public Texture Texture { get { return IsPrepared ? target : null; } }
        public event Action<string> StatusChanged;
        private VideoPlayer player;
        private GameObject playbackObject;
        private RenderTexture target;
        private int generation;

        public void Open(string path, int width, int height, bool hasAudio)
        {
            StopAndRelease();
            if (!File.Exists(path) || width < 1 || height < 1 || width > 2048 || height > 2048)
            { Report("Video preview unavailable; completed draft retained"); return; }
            try
            {
                target = new RenderTexture(width, height, 0, RenderTextureFormat.ARGB32) { name = "CrushXVideoPreview" };
                if (!target.Create()) throw new InvalidOperationException("Preview texture allocation failed");
                playbackObject = new GameObject("CrushX Local Media Playback");
                playbackObject.transform.SetParent(transform, false);
                player = playbackObject.AddComponent<VideoPlayer>();
                player.playOnAwake = false;
                player.source = VideoSource.Url;
                player.url = new Uri(Path.GetFullPath(path)).AbsoluteUri;
                player.renderMode = VideoRenderMode.RenderTexture;
                player.targetTexture = target;
                player.aspectRatio = VideoAspectRatio.FitInside;
                player.isLooping = true;
                player.waitForFirstFrame = true;
                player.skipOnDrop = true;
                if (hasAudio)
                {
                    var audio = playbackObject.AddComponent<AudioSource>();
                    audio.playOnAwake = false;
                    audio.spatialBlend = 0;
                    player.audioOutputMode = VideoAudioOutputMode.AudioSource;
                    player.controlledAudioTrackCount = 1;
                    player.EnableAudioTrack(0, true);
                    player.SetTargetAudioSource(0, audio);
                }
                else player.audioOutputMode = VideoAudioOutputMode.None;
                player.prepareCompleted += Prepared;
                player.errorReceived += PlaybackError;
                Report("Preparing video playback");
                player.Prepare();
                StartCoroutine(PreparationDeadline(generation));
            }
            catch (Exception error) { StopAndRelease(); Report("Video preview failed: " + error.Message + "; completed draft retained"); }
        }

        private IEnumerator PreparationDeadline(int token)
        {
            float deadline = Time.realtimeSinceStartup + 8;
            while (token == generation && !IsPrepared && Time.realtimeSinceStartup < deadline) yield return null;
            if (token == generation && !IsPrepared)
            { StopAndRelease(); Report("Video preview timed out; completed draft retained"); }
        }

        private void Prepared(VideoPlayer source)
        {
            if (source != player || !isActiveAndEnabled) return;
            IsPrepared = true;
            if (Application.isFocused) source.Play();
            Report("Video preview — pause/play, Retry or Save");
        }

        private void PlaybackError(VideoPlayer source, string error)
        {
            if (source != player) return;
            StopAndRelease();
            Report("Video playback failed: " + error + "; completed draft retained");
        }

        public void TogglePlayback()
        {
            if (!IsPrepared || player == null || !Application.isFocused) return;
            if (player.isPlaying) player.Pause();
            else player.Play();
        }

        public void StopAndRelease()
        {
            generation++;
            IsPrepared = false;
            if (player != null)
            {
                VideoPlayer previous = player;
                player = null;
                previous.prepareCompleted -= Prepared;
                previous.errorReceived -= PlaybackError;
                previous.Stop();
                previous.targetTexture = null;
            }
            if (playbackObject != null) { Destroy(playbackObject); playbackObject = null; }
            if (target != null) { target.Release(); Destroy(target); target = null; }
        }

        private void Report(string message) { StatusChanged?.Invoke(message); }
        private void OnApplicationPause(bool paused) { if (paused && player != null) player.Pause(); }
        private void OnApplicationFocus(bool focused) { if (!focused && player != null) player.Pause(); }
        private void OnDisable() { StopAndRelease(); }
    }
}
