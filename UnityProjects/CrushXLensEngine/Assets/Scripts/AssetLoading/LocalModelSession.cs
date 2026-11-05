using System;
using System.Collections.Generic;

namespace CrushX.LensEngine.AssetLoading
{
    /// <summary>A separately installed on-device runtime must parse the full graph and register actual outputs.</summary>
    public interface ILocalModelRuntime
    {
        ModelRuntimeRegistration Registration { get; }
        bool IsRunning { get; }
        bool TryStart(LocalModelManifest manifest, ReadOnlyMemory<byte> verifiedBytes, out string error);
        // Stop must synchronously stop use of verifiedBytes before returning.
        void Stop();
    }

    public enum LocalModelState { Unavailable, Loading, Ready, Failed, Stopped }

    /// <summary>Owns verified bytes and runtime lifecycle; verification alone cannot produce Ready.</summary>
    public sealed class LocalModelSession : IDisposable
    {
        public LocalModelState State { get; private set; } = LocalModelState.Unavailable;
        public string StatusMessage { get; private set; } = "No reviewed local model/runtime is configured";
        public string ModelId { get; private set; } = string.Empty;
        public ModelPurpose Purpose { get; private set; }
        private ILocalModelRuntime runtime;
        private VerifiedModelArtifact artifact;
        private bool startAttempted;
        public bool HasPendingTeardown => State == LocalModelState.Failed && runtime != null && artifact != null;

        // Admission keeps failed native runtimes and their borrowed bytes alive even if a Unity
        // component is destroyed. It is bounded before any file allocation or runtime start.
        public const int MaximumConcurrentSessions = 4;
        public const long MaximumResidentModelBytes = 256L * 1024 * 1024;
        private static readonly object AdmissionLock = new object();
        private static readonly Dictionary<LocalModelSession, long> Leases = new Dictionary<LocalModelSession, long>();

        private bool Reserve(ILocalModelRuntime candidate, long bytes)
        {
            lock (AdmissionLock)
            {
                long total = 0;
                foreach (KeyValuePair<LocalModelSession, long> entry in Leases)
                {
                    if (ReferenceEquals(entry.Key.runtime, candidate)) return false;
                    total += entry.Value;
                }
                if (Leases.Count >= MaximumConcurrentSessions || bytes > MaximumResidentModelBytes - total) return false;
                runtime = candidate; Leases.Add(this, bytes); return true;
            }
        }

        private void ReleaseReservation()
        {
            lock (AdmissionLock) { Leases.Remove(this); }
        }

        /// <summary>Explicit cold-path retry for bounded quarantines after a host/native cleanup completes.</summary>
        public static int RetryPendingTeardowns()
        {
            var pending = new List<LocalModelSession>();
            lock (AdmissionLock)
                foreach (LocalModelSession owner in Leases.Keys)
                    if (owner.State == LocalModelState.Failed) pending.Add(owner);
            int stopped = 0;
            foreach (LocalModelSession owner in pending) if (owner.TryStop()) stopped++;
            return stopped;
        }

        public bool IsReady
        {
            get
            {
                if (State != LocalModelState.Ready || runtime == null || artifact == null) return false;
                try { if (runtime.IsRunning) return true; }
                catch (Exception) { }
                TryStop(); State = LocalModelState.Failed; StatusMessage = "The local model runtime stopped; effects are unavailable"; return false;
            }
        }

        public bool TryStart(string root, LocalModelManifest manifest, IModelApprovalRegistry approvals, ILocalModelRuntime installedRuntime)
        {
            if (!TryStop()) return false;
            State = LocalModelState.Loading;
            if (installedRuntime == null) return Fail("A compatible on-device runtime is not installed");
            try
            {
                LocalModelManifest requested = manifest?.Copy();
                if (!ArtifactPolicy.Validate(requested, out string manifestError)) return Fail(manifestError);
                if (installedRuntime.IsRunning) return Fail("The installed runtime is already running outside this session");
                if (!Reserve(installedRuntime, requested.FileBytes)) return Fail("Model runtime is already owned or the bounded resident model budget is exhausted");
                if (!VerifiedArtifactLoader.TryLoad(root, requested, approvals, installedRuntime.Registration,
                    out artifact, out _, out string error)) return Fail(error);
                startAttempted = true;
                if (!runtime.TryStart(artifact.Manifest, artifact.Bytes, out error) || !runtime.IsRunning)
                    return Fail("The installed runtime could not start this verified model" + (string.IsNullOrEmpty(error) ? "" : "; consult its local diagnostics"));
                LocalModelManifest loaded = artifact.Manifest;
                ModelId = loaded.Id; Purpose = loaded.Purpose;
                State = LocalModelState.Ready; StatusMessage = "Reviewed local model runtime is running"; return true;
            }
            catch (Exception) { return Fail("The installed local model runtime failed; effects are unavailable"); }
        }

        private bool Fail(string error)
        {
            bool stopped = TryStop(); State = LocalModelState.Failed;
            StatusMessage = error + (stopped ? "" : "; native teardown is pending and restart is blocked"); return false;
        }
        public bool TryStop()
        {
            if (runtime != null && startAttempted)
            {
                bool confirmed = false;
                try { runtime.Stop(); confirmed = !runtime.IsRunning; }
                catch (Exception)
                {
                    // Some runtimes can confirm they stopped despite a later cleanup exception.
                    // A throwing/true liveness result cannot authorize releasing borrowed memory.
                    try { confirmed = !runtime.IsRunning; } catch (Exception) { }
                }
                if (!confirmed)
                {
                    State = LocalModelState.Failed;
                    StatusMessage = "Native runtime teardown is pending; verified bytes retained and restart blocked";
                    return false;
                }
            }
            runtime = null; startAttempted = false;
            artifact?.Dispose(); artifact = null; ModelId = string.Empty;
            ReleaseReservation();
            State = LocalModelState.Stopped; StatusMessage = "Local model stopped; optional effects are unavailable";
            return true;
        }
        public void Stop() { TryStop(); }
        public void Dispose() { Stop(); }
    }
}
