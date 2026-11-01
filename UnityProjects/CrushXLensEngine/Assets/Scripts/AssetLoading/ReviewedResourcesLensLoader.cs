using System;
using UnityEngine;

namespace CrushX.LensEngine.AssetLoading
{
    public static class ReviewedResourcesLensLoader
    {
        /// <summary>Loads only host-registered installed prefabs. On missing/rejected art, builds a real existing procedural lens.</summary>
        public static bool TryCreate(string reviewedResourceId, string fallbackLensId, Transform parent,
            ReviewedResourceRegistry hostRegistry, out GameObject instance, out bool usedFallback, out string reason)
        {
            instance = null; usedFallback = false; reason = "Reviewed installed artwork is unavailable";
            try
            {
                if (hostRegistry != null && hostRegistry.TryGet(reviewedResourceId, out ReviewedResourceRegistration registration))
                {
                    GameObject prefab = Resources.Load<GameObject>(registration.ResourcePath);
                    if (ValidatePrefab(prefab, registration, out reason))
                    {
                        instance = UnityEngine.Object.Instantiate(prefab, parent, false);
                        reason = "Loaded reviewed installed artwork"; return true;
                    }
                }
            }
            catch (Exception) { reason = "Reviewed artwork could not be instantiated"; }
            LensManifest? fallback = LensCatalog.Find(fallbackLensId);
            if (!fallback.HasValue || fallback.Value.SceneProvided || fallback.Value.Implementation != LensImplementation.ProceduralPrototype)
            { reason += "; no installed procedural fallback is configured"; return false; }
            try
            {
                instance = new GameObject("Fallback-" + fallback.Value.Id);
                instance.SetActive(false); instance.transform.SetParent(parent, false);
                var effect = (LensEffect)instance.AddComponent(LensCatalog.ResolveType(fallback.Value.Id));
                effect.Build(); instance.SetActive(true); usedFallback = true;
                reason += "; using procedural prototype " + fallback.Value.DisplayName; return true;
            }
            catch (Exception)
            {
                if (instance != null)
                {
                    if (Application.isPlaying) UnityEngine.Object.Destroy(instance); else UnityEngine.Object.DestroyImmediate(instance);
                    instance = null;
                }
                reason = "Installed artwork and procedural fallback could not be created"; return false;
            }
        }

        public static bool ValidatePrefab(GameObject prefab, ReviewedResourceRegistration registration, out string reason)
        {
            reason = "Installed prefab is missing or unreviewed";
            if (prefab == null || registration == null) return false;
            foreach (Component component in prefab.GetComponentsInChildren<Component>(true))
                if (component == null || !registration.AllowsComponent(component.GetType().FullName))
                { reason = "Installed prefab contains missing or incompatible components"; return false; }
            Renderer[] renderers = prefab.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0 || renderers.Length > registration.MaximumRenderers)
            { reason = "Installed prefab exceeds its reviewed renderer budget"; return false; }
            long vertices = 0;
            foreach (Renderer renderer in renderers)
            {
                Material[] materials = renderer.sharedMaterials;
                if (materials.Length == 0) { reason = "Installed prefab renderer has no material"; return false; }
                foreach (Material material in materials)
                    if (material == null || material.shader == null || !material.shader.isSupported || !registration.AllowsShader(material.shader.name))
                    { reason = "Installed prefab material/shader is unavailable or incompatible"; return false; }
                foreach (Material material in materials)
                {
                    string pipelineTag = material.GetTag("RenderPipeline", false, "");
                    bool srp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null;
                    if ((!srp && pipelineTag.Length != 0) || (srp && pipelineTag != "UniversalPipeline"))
                    { reason = "Installed prefab shader does not match the configured render pipeline"; return false; }
                }
                Mesh mesh = renderer is SkinnedMeshRenderer skinned ? skinned.sharedMesh : renderer.GetComponent<MeshFilter>()?.sharedMesh;
                if (mesh == null || mesh.vertexCount < 3)
                { reason = "Installed prefab contains no usable reviewed mesh"; return false; }
                vertices += mesh.vertexCount;
                if (vertices > registration.MaximumVertices)
                { reason = "Installed prefab exceeds its reviewed geometry budget"; return false; }
            }
            reason = ""; return true;
        }
    }
}
