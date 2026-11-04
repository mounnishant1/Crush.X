using System;
using CrushX.LensEngine.AssetLoading;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    /// <summary>Lifecycle control double only. It does not parse a graph or return inference results.</summary>
    public sealed class LocalModelControlRuntimeTests : MonoBehaviour, ILocalModelRuntime, IOnDeviceBlendshapeSource
    {
        public ModelRuntimeRegistration Registration { get; set; }
        public bool IsRunning { get; private set; }
        public string ModelId { get; private set; }
        public int Starts, Stops, Reads;
        public bool TryStart(LocalModelManifest model, ReadOnlyMemory<byte> verifiedBytes, out string error)
        { Starts++; ModelId = model.Id; IsRunning = true; error = ""; return true; }
        public bool TryGetBlendshapes(FaceIdentity identity, out OnDeviceBlendshapeFrame frame)
        { Reads++; frame = default; return false; }
        public void Stop() { Stops++; IsRunning = false; }
    }
}
