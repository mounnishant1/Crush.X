using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>Development measurements from the running player, never synthetic benchmark results.</summary>
    public sealed class LensPerformanceMonitor : MonoBehaviour
    {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
        private readonly float[] frames = new float[600];
        private readonly float[] sorted = new float[600];
        private int count, cursor, collections;
        private float nextReport;

        [System.Serializable]
        private sealed class Sample
        {
            public string eventName = "performance", scene, quality, lensId;
            public int sampledFrames, gen0Collections;
            public float sampledFps, p95FrameMs, maxFrameMs, batteryLevel;
            public long allocatedBytes, reservedBytes, managedBytes;
        }

        private void OnEnable() { ResetWindow(); }
        private void ResetWindow()
        {
            count = cursor = 0;
            collections = System.GC.CollectionCount(0);
            nextReport = Time.realtimeSinceStartup + 15;
        }
        private void OnApplicationPause(bool paused) { ResetWindow(); }
        private void Update()
        {
            if (Time.unscaledDeltaTime > 0)
            {
                frames[cursor] = Time.unscaledDeltaTime;
                cursor = (cursor + 1) % frames.Length;
                count = Mathf.Min(count + 1, frames.Length);
            }
            if (Time.realtimeSinceStartup < nextReport || count == 0) return;
            nextReport = Time.realtimeSinceStartup + 15;
            System.Array.Copy(frames, sorted, count);
            System.Array.Sort(sorted, 0, count);
            float total = 0;
            for (int i = 0; i < count; i++) total += sorted[i];
            LensEngineBootstrap engine = GetComponent<LensEngineBootstrap>();
            Debug.Log("[CrushX AR] " + JsonUtility.ToJson(new Sample
            {
                scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name,
                lensId = engine == null ? "none" : engine.ActiveId, quality = LensQualitySettings.Current.ToString(),
                sampledFrames = count, sampledFps = total > 0 ? count / total : 0,
                p95FrameMs = sorted[Mathf.Min(count - 1, Mathf.CeilToInt(count * .95f) - 1)] * 1000,
                maxFrameMs = sorted[count - 1] * 1000,
                allocatedBytes = UnityEngine.Profiling.Profiler.GetTotalAllocatedMemoryLong(),
                reservedBytes = UnityEngine.Profiling.Profiler.GetTotalReservedMemoryLong(),
                managedBytes = UnityEngine.Profiling.Profiler.GetMonoUsedSizeLong(),
                gen0Collections = System.GC.CollectionCount(0) - collections, batteryLevel = SystemInfo.batteryLevel
            }));
        }
#endif
    }
}
