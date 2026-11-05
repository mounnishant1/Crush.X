#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CrushX.LensEngine.Editor
{
    /// <summary>
    /// Creates ORIGINAL debug URP assets once. Never overwrites an existing
    /// pipeline/renderer, and refuses headless mutation without explicit env opt-in.
    /// Intended only for isolated Unity source, not main app production settings.
    /// </summary>
    public static class CrushXIsolatedURPSetup
    {
        private const string Folder = "Assets/CrushXGenerated";
        private const string RendererPath = Folder + "/CrushXUniversalRenderer.asset";
        private const string PipelinePath = Folder + "/CrushXUniversalPipeline.asset";

        [MenuItem("CrushX/Lens Engine/Create Isolated URP Test Renderer")]
        public static void CreateViaEditor()
        {
            if (!EditorUtility.DisplayDialog("Create isolated lens test renderer",
                "Creates new URP asset in Assets/CrushXGenerated and assigns it " +
                "only when no render pipeline is currently configured. " +
                "Does not alter any existing pipeline asset. Continue?",
                "Create test assets", "Cancel")) return;
            Create(true);
        }

        // CI: use -executeMethod CrushX.LensEngine.Editor.CrushXIsolatedURPSetup.CreateForCI
        // with CRUSHX_ALLOW_DEBUG_URP_SETUP=1. NEVER set it in production builds.
        public static void CreateForCI()
        {
            if (Environment.GetEnvironmentVariable("CRUSHX_ALLOW_DEBUG_URP_SETUP") != "1")
                throw new InvalidOperationException(
                    "Explicit CRUSHX_ALLOW_DEBUG_URP_SETUP=1 is required.");
            Create(true);
        }

        private static void Create(bool useAsDefault)
        {
            if (GraphicsSettings.defaultRenderPipeline != null ||
                QualitySettings.renderPipeline != null)
            {
                Debug.LogWarning("[Crush.X URP] Existing active pipeline found. " +
                    "No assets or settings were altered.");
                return;
            }
            if (AssetDatabase.LoadAssetAtPath<ScriptableObject>(RendererPath) != null ||
                AssetDatabase.LoadAssetAtPath<ScriptableObject>(PipelinePath) != null)
            {
                throw new InvalidOperationException(
                    "Test asset paths already exist. Refusing to overwrite.");
            }
            if (!AssetDatabase.IsValidFolder(Folder))
                AssetDatabase.CreateFolder("Assets", "CrushXGenerated");

            var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
            renderer.name = "Crush.X Universal Renderer (test)";
            AssetDatabase.CreateAsset(renderer, RendererPath);
            var pipeline = UniversalRenderPipelineAsset.Create(renderer);
            pipeline.name = "Crush.X URP (test)";
            pipeline.supportsHDR = false;
            pipeline.msaaSampleCount = 1;
            pipeline.renderScale = 1f;
            AssetDatabase.CreateAsset(pipeline, PipelinePath);
            AssetDatabase.SaveAssets();

            if (useAsDefault)
                GraphicsSettings.defaultRenderPipeline = pipeline;

            // Installer methods use the active renderer data and refuse duplicates.
            CrushXFunnyWarpSetup.Install();
            CrushXBeautySetup.Install();
            AssetDatabase.SaveAssets();
            Debug.Log("[Crush.X URP] Isolated original debug pipeline created: " +
                PipelinePath + ". Confirm ARCameraBackground and run device QA.");
        }
    }
}
#endif
