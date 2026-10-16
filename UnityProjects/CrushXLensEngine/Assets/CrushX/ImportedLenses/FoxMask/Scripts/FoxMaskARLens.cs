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
        [Header("Device-calibrated local Fox alignment")]
        public Vector3 localPositionOffset = Vector3.zero;
        public Vector3 localEulerOffset = Vector3.zero;
        [Range(.5f, 2f)] public float localScaleMultiplier = 1f;

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
                faceManager = FindFirstObjectByType<ARFaceManager>();
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
                if (instance != null) ApplyCalibration(instance);
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
            nextRendererSnapshot = 0;
            return instance;
        }

        private void ApplyCalibration(GameObject instance)
        {
            // Defaults preserve the imported prefab exactly. Tune these fields
            // only from measured face footage; arbitrary scale guesses hide bugs.
            Transform root = instance.transform;
            root.localPosition = localPositionOffset;
            root.localRotation = Quaternion.Euler(localEulerOffset);
            // A pre-existing serialized scene may not contain this new field yet.
            float multiplier = localScaleMultiplier <= 0f ? 1f : Mathf.Clamp(localScaleMultiplier, .5f, 2f);
            root.localScale = foxMaskPrefab.transform.localScale * multiplier;
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
