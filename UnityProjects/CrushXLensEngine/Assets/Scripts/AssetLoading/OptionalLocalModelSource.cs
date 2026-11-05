using UnityEngine;

namespace CrushX.LensEngine.AssetLoading
{
    /// <summary>Optional verified local runtime adapter. It owns no camera and bundles no model or inference implementation.</summary>
    [DisallowMultipleComponent]
    public sealed class OptionalLocalModelSource : MonoBehaviour, IOnDeviceBlendshapeSource
    {
        public MonoBehaviour RuntimeComponent;
        public LocalModelState State => session.State;
        public string StatusMessage => session.StatusMessage;
        public string ModelId => session.ModelId;
        public bool IsRunning
        {
            get
            {
                if (!ReferenceEquals(RuntimeComponent, boundRuntime)) { session.Stop(); return false; }
                return isActiveAndEnabled && boundRuntime != null && boundRuntime.isActiveAndEnabled && session.IsReady;
            }
        }
        private readonly LocalModelSession session = new LocalModelSession();
        private MonoBehaviour boundRuntime;

        public bool TryLoadReviewed(string artifactRoot, LocalModelManifest manifest, IModelApprovalRegistry hostApprovals)
        {
            if (!isActiveAndEnabled || RuntimeComponent == null || !RuntimeComponent.isActiveAndEnabled)
            { session.Stop(); return false; }
            if (!session.TryStart(artifactRoot, manifest, hostApprovals, RuntimeComponent as ILocalModelRuntime)) return false;
            boundRuntime = RuntimeComponent; return true;
        }

        public bool TryGetBlendshapes(FaceIdentity identity, out OnDeviceBlendshapeFrame frame)
        {
            frame = default;
            if (!IsRunning || session.Purpose != ModelPurpose.FaceBlendshapes || !identity.IsKnown) return false;
            var source = boundRuntime as IOnDeviceBlendshapeSource;
            try
            {
                if (source == null || !source.IsRunning || source.ModelId != ModelId) return false;
                return source.TryGetBlendshapes(identity, out frame);
            }
            catch (System.Exception) { session.Stop(); return false; }
        }

        private void Update()
        {
            if (session.State != LocalModelState.Ready) return;
            if (!ReferenceEquals(RuntimeComponent, boundRuntime) || RuntimeComponent == null || !RuntimeComponent.isActiveAndEnabled || !session.IsReady) session.Stop();
        }
        private void OnApplicationPause(bool paused) { if (paused) session.Stop(); }
        private void OnApplicationFocus(bool focused) { if (!focused) session.Stop(); }
        private void OnDisable() { session.Stop(); }
        private void OnDestroy() { session.Dispose(); }
    }
}
