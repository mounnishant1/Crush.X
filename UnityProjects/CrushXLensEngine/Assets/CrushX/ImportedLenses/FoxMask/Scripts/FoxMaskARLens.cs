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
        private readonly Dictionary<Material, Material> compatibleMaterials = new Dictionary<Material, Material>();
        private bool warnedNoManager;
        private readonly Dictionary<TrackableId, GameObject> instances =
            new Dictionary<TrackableId, GameObject>();
        private readonly HashSet<TrackableId> current = new HashSet<TrackableId>();
        private readonly List<TrackableId> toRemove = new List<TrackableId>();

        private void Awake()
        {
            if (!selectionSet) isSelected = enabledOnStart;
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
            if (!isSelected) ClearInstances();
        }

        public void EnableFoxMask(string ignored) { SelectLens(LensId); }
        public void DisableFoxMask(string ignored) { SelectLens(string.Empty); }

        private void Update()
        {
            if (!isSelected || foxMaskPrefab == null)
            {
                if (instances.Count > 0) ClearInstances();
                return;
            }
            if (faceManager == null) ResolveManager();
            if (faceManager == null || !faceManager.isActiveAndEnabled || faceManager.subsystem == null || !faceManager.subsystem.running)
            {
                ClearInstances();
                return;
            }

            current.Clear();
            foreach (ARFace face in faceManager.trackables)
            {
                if (face == null || face.trackingState != TrackingState.Tracking) continue;
                current.Add(face.trackableId);
                if (!instances.TryGetValue(face.trackableId, out GameObject instance) || instance == null)
                {
                    instance = Instantiate(foxMaskPrefab, face.transform, false);
                    instance.name = "CrushX_FoxMask_Tracked";
                    ApplyCompatibleMaterials(instance);
                    instance.transform.localPosition = Vector3.zero;
                    instance.transform.localRotation = Quaternion.identity;
                    instances[face.trackableId] = instance;
                }
                else if (instance.transform.parent != face.transform)
                {
                    instance.transform.SetParent(face.transform, false);
                }
            }

            toRemove.Clear();
            foreach (KeyValuePair<TrackableId, GameObject> item in instances)
                if (!current.Contains(item.Key)) toRemove.Add(item.Key);

            foreach (TrackableId id in toRemove)
            {
                if (instances.TryGetValue(id, out GameObject orphan) && orphan != null)
                    Destroy(orphan);
                instances.Remove(id);
            }
        }

        private void ApplyCompatibleMaterials(GameObject instance)
        {
            // The imported material uses URP, while this project currently selects Built-in.
            Shader shader = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null
                ? Shader.Find("Standard") : Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) return;
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    Material source = materials[i];
                    if (source == null || source.shader == shader) continue;
                    if (!compatibleMaterials.TryGetValue(source, out Material copy))
                    {
                        Texture texture = source.HasProperty("_BaseMap") ? source.GetTexture("_BaseMap") : source.mainTexture;
                        copy = new Material(source) { shader = shader };
                        if (copy.HasProperty("_BaseMap")) copy.SetTexture("_BaseMap", texture);
                        if (copy.HasProperty("_MainTex")) copy.SetTexture("_MainTex", texture);
                        compatibleMaterials[source] = copy;
                    }
                    materials[i] = copy;
                }
                renderer.sharedMaterials = materials;
            }
        }

        private void ClearInstances()
        {
            foreach (GameObject go in instances.Values)
                if (go != null) Destroy(go);
            instances.Clear();
        }

        private void OnDisable() { ClearInstances(); }
        private void OnDestroy()
        {
            ClearInstances();
            foreach (Material material in compatibleMaterials.Values) if (material != null) Destroy(material);
            compatibleMaterials.Clear();
        }
    }
}
