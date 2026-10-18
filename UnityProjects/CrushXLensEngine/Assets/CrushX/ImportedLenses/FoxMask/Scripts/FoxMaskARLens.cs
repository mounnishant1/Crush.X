using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using CrushX.LensEngine;

namespace CrushX.ImportedLenses
{
    /// <summary>
    /// Rigid fox mask attached to each tracked ARFace.
    /// Does not enable or emulate AR tracking. Requires functioning AR Foundation face tracking.
    /// UnitySendMessage("CrushX_LensBridge", "SelectLens", "fox-mask-3d") to activate.
    /// SelectLens with another lens id disables it.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class FoxMaskARLens : MonoBehaviour, ISceneLens
    {
        public const string LensId = "fox-mask-3d";
        public ARFaceManager faceManager;
        public GameObject foxMaskPrefab;
        public bool enabledOnStart = false; // the shared lens picker controls selection

        string ISceneLens.LensId { get { return LensId; } }
        public bool IsAvailable { get { ResolveManager(); return isActiveAndEnabled && foxMaskPrefab != null && faceManager != null && faceManager.isActiveAndEnabled; } }
        private bool selectionSet;
        private bool isSelected;
        private readonly CompatibleLensMaterials compatibleMaterials = new CompatibleLensMaterials();
        private bool warnedNoManager;
        private TrackedFaceAttachments<TrackableId> attachments;
        private GameObject instancePrefab;
        private Material builtInShaderReference;
        private Shader compatibleShader;
        private bool shaderReferenceLoaded;
        private bool applicationPaused;
        private ARDiagnosticOutcome? lastOutcome;
        private float nextRendererSnapshot;
        private float modelFrontZ = float.NaN;
        public int InstanceCount { get { return attachments == null ? 0 : attachments.Count; } }

        private void Awake()
        {
            if (!selectionSet) isSelected = enabledOnStart;
            attachments = new TrackedFaceAttachments<TrackableId>(CreateInstance);
            attachments.Removing += OnRemovingInstance;
            ResolveManager();
        }

        private void ResolveManager()
        {
            if (faceManager == null)
                faceManager = FindFirstObjectByType<ARFaceManager>(FindObjectsInactive.Include);
            if (faceManager == null && !warnedNoManager)
            {
                warnedNoManager = true;
                Debug.LogWarning("[CrushX FoxMask] ARFaceManager missing. Add AR Session + XR Origin with ARFaceManager, configure ARCore front camera.");
            }
        }

        public void SelectLens(string selectedLensId)
        {
            selectionSet = true;
            bool newSelection = string.Equals(selectedLensId, LensId, StringComparison.OrdinalIgnoreCase);
            if (newSelection == isSelected) return;
            isSelected = newSelection;
            lastOutcome = null;
            if (isSelected)
                ARTrackingDiagnostics.RecordLensSelection(LensId, IsAvailable, "Fox controller selected; face acquisition is checked independently");
            else
            {
                ARTrackingDiagnostics.RecordFoxEvent("deselected", null, null, "nextLens=" + selectedLensId);
                ClearInstances("lens deselected");
            }
        }

        public void EnableFoxMask(string ignored) { SelectLens(LensId); }
        public void DisableFoxMask(string ignored) { SelectLens(string.Empty); }

        private void Update()
        {
            if (!isSelected)
            {
                if (InstanceCount > 0) ClearInstances("lens deselected");
                return;
            }
            if (applicationPaused) return;
            if (foxMaskPrefab == null)
            {
                ClearInstances("prefab missing");
                ReportOutcome(ARDiagnosticOutcome.LensPrefabMissing, "Fox Mask prefab is not assigned");
                return;
            }
            if (instancePrefab != foxMaskPrefab)
            {
                ClearInstances("prefab changed");
                instancePrefab = foxMaskPrefab;
                modelFrontZ = float.NaN;
            }
            if (faceManager == null) ResolveManager();
            if (faceManager == null || !faceManager.isActiveAndEnabled || faceManager.subsystem == null || !faceManager.subsystem.running)
            {
                ClearInstances("face manager or subsystem unavailable");
                ReportOutcome(faceManager == null ? ARDiagnosticOutcome.ManagerMissing :
                    !faceManager.isActiveAndEnabled ? ARDiagnosticOutcome.ManagerDisabled :
                    faceManager.subsystem == null ? ARDiagnosticOutcome.SubsystemMissing : ARDiagnosticOutcome.SubsystemStopped,
                    "Fox is waiting for a running ARFaceManager subsystem");
                return;
            }

            attachments.BeginFrame();
            int faces = 0, tracked = 0;
            foreach (ARFace face in faceManager.trackables)
            {
                faces++;
                if (face == null || face.trackingState != TrackingState.Tracking) continue;
                tracked++;
                GameObject instance = attachments.Bind(face.trackableId, face.transform, out bool created, out bool rebound);
                if (instance != null) FitToFace(face, instance, created || rebound);
                if (created) ARTrackingDiagnostics.RecordFoxEvent("created-and-bound", face, instance);
                else if (rebound) ARTrackingDiagnostics.RecordFoxEvent("rebound", face, instance);
            }
            attachments.EndFrame();

            if (tracked == 0)
            {
                ReportOutcome(faces == 0 ? ARDiagnosticOutcome.NoFacesDetected : ARDiagnosticOutcome.FacesNotTracking,
                    faces == 0 ? "Face subsystem running; no faces detected" : "Faces exist, but none is Tracking");
                return;
            }
            // isVisible is an observation from a previous render and is not a tracking failure.
            // Expensive hierarchy/material inspection is bounded; never scan renderers every frame.
            if (lastOutcome == null || Time.unscaledTime >= nextRendererSnapshot)
                InspectInstances();
        }

        private GameObject CreateInstance(Transform parent)
        {
            GameObject instance = Instantiate(foxMaskPrefab, parent, false);
            instance.name = "CrushX_FoxMask_Tracked";
            ApplyCompatibleMaterials(instance);
            if (float.IsNaN(modelFrontZ))
                modelFrontZ = MeasureModelFrontZ(instance);
            nextRendererSnapshot = 0;
            return instance;
        }

        private static float MeasureModelFrontZ(GameObject instance)
        {
            float front = float.PositiveInfinity;
            // Model geometry is measured once, relative to the tracked attachment root.
            // Imported OBJ child scales/offsets are included; no mesh read/write is needed.
            foreach (MeshFilter filter in instance.GetComponentsInChildren<MeshFilter>(true))
            {
                if (filter.sharedMesh == null) continue;
                Bounds bounds = filter.sharedMesh.bounds;
                Matrix4x4 toRoot = instance.transform.worldToLocalMatrix * filter.transform.localToWorldMatrix;
                for (int x = -1; x <= 1; x += 2)
                    for (int y = -1; y <= 1; y += 2)
                        for (int z = -1; z <= 1; z += 2)
                        {
                            Vector3 corner = bounds.center + Vector3.Scale(bounds.extents, new Vector3(x, y, z));
                            front = Mathf.Min(front, toRoot.MultiplyPoint3x4(corner).z);
                        }
            }
            return float.IsInfinity(front) ? float.NaN : front;
        }

        private void FitToFace(ARFace face, GameObject instance, bool firstFrame)
        {
            if (float.IsNaN(modelFrontZ)) return;
            var vertices = face.vertices;
            if (!vertices.IsCreated || vertices.Length < 3) return;
            float minX = float.PositiveInfinity, maxX = float.NegativeInfinity;
            float frontZ = float.PositiveInfinity;
            for (int i = 0; i < vertices.Length; i++)
            {
                Vector3 point = vertices[i];
                if (float.IsNaN(point.x) || float.IsInfinity(point.x) ||
                    float.IsNaN(point.z) || float.IsInfinity(point.z)) continue;
                minX = Mathf.Min(minX, point.x);
                maxX = Mathf.Max(maxX, point.x);
                frontZ = Mathf.Min(frontZ, point.z);
            }
            Vector3 prefabScale = foxMaskPrefab.transform.localScale;
            if (!FaceMaskFit.TryTarget(minX, maxX, frontZ, modelFrontZ * prefabScale.z,
                out float scale, out float depth)) return;

            // The ARFace parent already follows head pose. Only size and front-surface
            // offset are eased, avoiding a second (laggy) head-pose smoother.
            float blend = firstFrame ? 1f : 1f - Mathf.Exp(-12f * Mathf.Min(.1f, Time.unscaledDeltaTime));
            Transform transformToFit = instance.transform;
            transformToFit.localScale = Vector3.Lerp(transformToFit.localScale, prefabScale * scale, blend);
            Vector3 desiredPosition = foxMaskPrefab.transform.localPosition + Vector3.forward * depth;
            transformToFit.localPosition = Vector3.Lerp(transformToFit.localPosition, desiredPosition, blend);
        }

        private void OnRemovingInstance(TrackableId id, GameObject instance, string reason)
        {
            ARTrackingDiagnostics.RecordFoxEvent("removed", instance.GetComponentInParent<ARFace>(), instance,
                "trackable=" + id + "; reason=" + reason);
        }

        private void ReportOutcome(ARDiagnosticOutcome outcome, string detail)
        {
            if (lastOutcome == outcome) return;
            lastOutcome = outcome;
            ARTrackingDiagnostics.RecordLensStatus(LensId, outcome, detail);
        }

        private void InspectInstances()
        {
            nextRendererSnapshot = Time.unscaledTime + 5f;
            bool renderable = false;
            Camera camera = Camera.main;
            foreach (KeyValuePair<TrackableId, GameObject> item in attachments.Instances)
            {
                GameObject instance = item.Value;
                if (instance == null) continue;
                foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
                {
                    if (!renderer.enabled || !renderer.gameObject.activeInHierarchy || renderer.forceRenderingOff) continue;
                    if (camera != null && (camera.cullingMask & (1 << renderer.gameObject.layer)) == 0) continue;
                    MeshFilter filter = renderer.GetComponent<MeshFilter>();
                    if (renderer is MeshRenderer && (filter == null || filter.sharedMesh == null || filter.sharedMesh.vertexCount == 0)) continue;
                    foreach (Material material in renderer.sharedMaterials)
                        if (material != null && compatibleShader != null && material.shader == compatibleShader && material.shader.isSupported) renderable = true;
                }
                ARTrackingDiagnostics.RecordFoxEvent("renderer-snapshot", instance.GetComponentInParent<ARFace>(), instance);
            }
            ReportOutcome(renderable ? ARDiagnosticOutcome.Tracking : ARDiagnosticOutcome.LensRendererUnavailable,
                renderable ? "Tracked Fox attachment has an active renderer with a supported shader; visibility still requires device verification" :
                    "Tracked face exists, but no active Fox renderer with a supported shader is available to the camera");
        }

        private void ApplyCompatibleMaterials(GameObject instance)
        {
            // The imported material uses URP, while this project currently selects Built-in.
            bool builtIn = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null;
            if (builtIn && !shaderReferenceLoaded)
            {
                shaderReferenceLoaded = true;
                // A Resources material keeps Standard and its needed variants in Android builds.
                // Shader.Find alone can succeed in the Editor while the player strips the shader.
                builtInShaderReference = Resources.Load<Material>("CrushXLenses/FoxMaskBuiltIn");
            }
            Shader shader = builtIn && builtInShaderReference != null ? builtInShaderReference.shader :
                Shader.Find(builtIn ? "Standard" : "Universal Render Pipeline/Lit");
            compatibleShader = shader;
            if (shader == null || !shader.isSupported)
            {
                ARTrackingDiagnostics.RecordFoxEvent("compatible-shader-unavailable", instance.GetComponentInParent<ARFace>(), instance,
                    "pipeline=" + (builtIn ? "Built-in" : "SRP") + "; expected=" + (builtIn ? "Standard" : "Universal Render Pipeline/Lit"));
                return;
            }
            compatibleMaterials.Apply(instance, shader);
        }

        private void ClearInstances(string reason)
        {
            if (attachments != null) attachments.Clear(reason);
        }

        private void OnApplicationPause(bool paused)
        {
            applicationPaused = paused;
            lastOutcome = null;
            nextRendererSnapshot = 0;
            ARTrackingDiagnostics.RecordFoxEvent(paused ? "application-paused" : "application-resumed", null, null);
            if (paused) ClearInstances("application paused");
        }
        private void OnDisable() { ClearInstances("controller disabled"); lastOutcome = null; }
        private void OnDestroy()
        {
            ClearInstances("controller destroyed");
            compatibleMaterials.Dispose();
        }
    }
}
