using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.ImportedLenses
{
    /// <summary>
    /// Rigid fox mask attached to each tracked ARFace.
    /// Does not enable or emulate AR tracking. Requires functioning AR Foundation face tracking.
    /// UnitySendMessage("CrushX_LensBridge", "SelectLens", "fox-mask-3d") to activate.
    /// SelectLens with another lens id disables it.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class FoxMaskARLens : MonoBehaviour
    {
        public const string LensId = "fox-mask-3d";
        public ARFaceManager faceManager;
        public GameObject foxMaskPrefab;
        public bool enabledOnStart = true; // test preview; turn off after connecting existing lens picker

        private bool isSelected;
        private bool warnedNoManager;
        private readonly Dictionary<TrackableId, GameObject> instances =
            new Dictionary<TrackableId, GameObject>();
        private readonly HashSet<TrackableId> current = new HashSet<TrackableId>();
        private readonly List<TrackableId> toRemove = new List<TrackableId>();

        private void Awake()
        {
            isSelected = enabledOnStart;
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
            if (faceManager == null || !faceManager.isActiveAndEnabled) return;

            current.Clear();
            foreach (ARFace face in faceManager.trackables)
            {
                if (face == null || face.trackingState != TrackingState.Tracking) continue;
                current.Add(face.trackableId);
                if (!instances.TryGetValue(face.trackableId, out GameObject instance) || instance == null)
                {
                    instance = Instantiate(foxMaskPrefab, face.transform, false);
                    instance.name = "CrushX_FoxMask_Tracked";
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

        private void ClearInstances()
        {
            foreach (GameObject go in instances.Values)
                if (go != null) Destroy(go);
            instances.Clear();
        }

        private void OnDisable() { ClearInstances(); }
        private void OnDestroy() { ClearInstances(); }
    }
}
