using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CrushX.LensEngine.Creator
{
    public static class CreatorLensRuntime
    {
        public static bool IsInstalledBase(string id)
        {
            LensManifest? lens = LensCatalog.Find(id);
            // Scene-controller assets and full-frame color filters need their own parameter adapter.
            return lens.HasValue && !lens.Value.SceneProvided && lens.Value.Implementation == LensImplementation.ProceduralPrototype;
        }

        public static bool IsInstalledAsset(string reference)
        {
            foreach (LensManifest lens in LensCatalog.All)
                if (reference == lens.EffectAssetReference || reference == lens.PreviewAssetPath && !string.IsNullOrEmpty(reference)) return true;
            return false;
        }

        public static CreatorLensDocument FromInstalled(string id)
        {
            if (!IsInstalledBase(id)) throw new ArgumentException("This lens has no creator parameter adapter");
            LensManifest lens = LensCatalog.Find(id).Value;
            return new CreatorLensDocument
            {
                Id = "my-" + id, DisplayName = "My " + lens.DisplayName, BaseLensId = id,
                Category = lens.Category.ToString(), ThumbnailReference = lens.PreviewAssetPath,
                RequiredAssets = new[] { lens.EffectAssetReference }
            };
        }

        public static CreatorValidationResult Validate(CreatorLensDocument document)
        {
            CreatorValidationResult result = CreatorLensValidation.Validate(document, IsInstalledBase, IsInstalledAsset);
            if (!result.IsValid) return result;
            LensManifest lens = LensCatalog.Find(document.BaseLensId).Value;
            if (Array.IndexOf(document.RequiredAssets, lens.EffectAssetReference) < 0)
                return new CreatorValidationResult(new[] { "Required assets must include the installed base effect reference" });
            return result;
        }

        public static bool TryLoadAndApply(LensEngineBootstrap engine, string path, string reviewedSha256, out string error)
        {
            if (!CreatorDocumentStore.TryLoadReviewed(path, reviewedSha256, json => JsonUtility.FromJson<CreatorLensDocument>(json),
                IsInstalledBase, IsInstalledAsset, out CreatorLensDocument document, out error)) return false;
            return TryApply(engine, document, out error);
        }

        public static bool TryApply(LensEngineBootstrap engine, CreatorLensDocument document, out string error)
        {
            CreatorValidationResult validation = Validate(document);
            error = string.Join("; ", validation.Errors);
            if (!validation.IsValid) return false;
            if (engine == null) { error = "Open the lens engine before applying a creator preset"; return false; }
            if (!TryResolveShader(document.Shader, out Shader shader, out error)) return false;
            // Copy before selecting: caller edits cannot alter a validated, active package behind our back.
            CreatorLensDocument copy = JsonUtility.FromJson<CreatorLensDocument>(JsonUtility.ToJson(document));
            if (!engine.SelectLens(copy.BaseLensId)) { error = engine.LastLensError; return false; }
            Transform root = engine.ActiveLensTransform;
            if (root == null) { error = "The selected lens exposes no parameter root"; return false; }
            CreatorLensPreset preset = root.GetComponent<CreatorLensPreset>();
            if (preset == null) preset = root.gameObject.AddComponent<CreatorLensPreset>();
            try { preset.Configure(engine, copy, shader); error = ""; return true; }
            catch (Exception exception) { preset.Clear(); error = "Creator parameters could not be applied: " + exception.Message; return false; }
        }

        public static bool TryResolveShader(string selection, out Shader shader, out string error)
        {
            shader = null; error = "";
            if (!CreatorLensValidation.IsAllowedShader(selection)) { error = "Shader is not allowlisted"; return false; }
            if (selection == "Installed") return true;
            bool srp = GraphicsSettings.currentRenderPipeline != null;
            if (selection.StartsWith("Universal ", StringComparison.Ordinal) != srp)
            { error = "Selected shader does not match the active render pipeline"; return false; }
            shader = Shader.Find(selection);
            if (shader == null || !shader.isSupported) { error = "Selected shader is unavailable in this player build"; return false; }
            return true;
        }
    }

}
