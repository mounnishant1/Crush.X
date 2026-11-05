#if UNITY_EDITOR
using System;
using System.IO;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine.Editor
{
    /// <summary>Read-only validation: never changes project settings or assets.</summary>
    public static class CrushXLensReleasePreflight
    {
        [MenuItem("CrushX/Lens Engine/Check Android Release Gates")]
        public static void ValidateFromMenu() { Validate(true); }

        public static void RunDevCI()
        {
            int issues = Validate(false);
            EditorApplication.Exit(issues == 0 ? 0 : 41);
        }

        public static void RunReleaseCI()
        {
            int issues = Validate(true);
            EditorApplication.Exit(issues == 0 ? 0 : 42);
        }

        private static int Validate(bool release)
        {
            int failures = 0;
            UniversalRenderPipelineAsset pipeline =
                (QualitySettings.renderPipeline ??
                    GraphicsSettings.defaultRenderPipeline)
                as UniversalRenderPipelineAsset;
            if (pipeline == null)
            {
                Debug.LogError("[LENS_GATE] No active URP pipeline.");
                failures++;
            }
            else
            {
                bool warp = false, beauty = false;
                var so = new SerializedObject(pipeline);
                var items = so.FindProperty("m_RendererDataList");
                var selected = so.FindProperty("m_DefaultRendererIndex");
                int index = selected == null ? 0 : selected.intValue;
                if (items == null || index < 0 || index >= items.arraySize)
                {
                    Debug.LogError("[LENS_GATE] Active URP renderer missing.");
                    failures++;
                }
                else
                {
                    var data = items.GetArrayElementAtIndex(index)
                        .objectReferenceValue as ScriptableRendererData;
                    if (data == null)
                    {
                        Debug.LogError("[LENS_GATE] Renderer asset is null.");
                        failures++;
                    }
                    else foreach (var feature in data.rendererFeatures)
                    {
                        if (feature is FunnyFaceWarpRendererFeature) warp = true;
                        if (feature is CrushXBeautyRendererFeature) beauty = true;
                    }
                    if (!warp || !beauty)
                    {
                        Debug.LogError("[LENS_GATE] Missing Funny/Beauty renderer feature. " +
                            "Funny=" + warp + " Beauty=" + beauty);
                        failures++;
                    }
                }
            }

            string[] shaders = {
                "Assets/Shaders/CrushXFunnyFaceWarp.shader",
                "Assets/Shaders/CrushXOriginalBeauty.shader"
            };
            foreach (var item in shaders)
            {
                Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(item);
                if (shader == null || !shader.isSupported)
                {
                    Debug.LogError("[LENS_GATE] Shader missing/unsupported: " + item);
                    failures++;
                }
            }

            string modelPath = Path.Combine(Application.dataPath,
                "StreamingAssets/CrushXModels/face_landmarker.task");
            string receiptPath = modelPath + ".sha256";
            string ownerApprovalPath = Path.Combine(Application.dataPath,
                "StreamingAssets/CrushXModels/approval.txt");
            bool modelOk = false;
            if (File.Exists(modelPath) && File.Exists(receiptPath) &&
                File.Exists(ownerApprovalPath) &&
                File.ReadAllText(ownerApprovalPath).Trim() == "MODEL-LICENSE-APPROVED")
            {
                using (var stream = File.OpenRead(modelPath))
                using (var sha = SHA256.Create())
                {
                    string actual = BitConverter.ToString(sha.ComputeHash(stream))
                        .Replace("-", "");
                    modelOk = string.Equals(actual,
                        File.ReadAllText(receiptPath).Trim(),
                        StringComparison.OrdinalIgnoreCase);
                }
            }
            if (!modelOk)
            {
                if (release)
                {
                    failures++;
                    Debug.LogError("[LENS_GATE] Approved model bundle/hash absent.");
                }
                else Debug.LogWarning("[LENS_GATE] Dev build without licensed model: " +
                    "native inference will remain disabled.");
            }

            bool sceneOk = false;
            foreach (EditorBuildSettingsScene scene in EditorBuildSettings.scenes)
            {
                if (!scene.enabled) continue;
                if (scene.path.EndsWith("CrushXNativeAR.unity",
                    StringComparison.OrdinalIgnoreCase))
                {
                    sceneOk = true;
                    break;
                }
            }
            if (!sceneOk)
            {
                Debug.LogError("[LENS_GATE] Real AR scene not in Build Settings. " +
                    "Use CrushX > Lens Engine > Create Native Android AR Scene.");
                failures++;
            }
            if (LensCatalog.All.Count != 37)
            {
                Debug.LogError("[LENS_GATE] Lens catalog expected 37 registered items.");
                failures++;
            }
            Debug.Log("[LENS_GATE] Dev/release validation completed: " +
                (release ? "release" : "development") +
                " failures=" + failures +
                ". Unity compilation, real device FPS and encoded video QA " +
                "must still be verified separately.");
            return failures;
        }
    }
}
#endif
