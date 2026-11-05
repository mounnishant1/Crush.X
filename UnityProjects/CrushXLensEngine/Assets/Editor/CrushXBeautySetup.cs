#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine.Editor
{
    /// <summary>
    /// Safe installation into existing URP asset only. Does not silently
    /// replace the user's renderer/quality settings or production camera.
    /// </summary>
    public static class CrushXBeautySetup
    {
        private const string ShaderPath = "Assets/Shaders/CrushXOriginalBeauty.shader";

        [MenuItem("CrushX/Lens Engine/Install Original Beauty Renderer")]
        public static void Install()
        {
            UniversalRenderPipelineAsset pipeline = CurrentPipeline();
            if (pipeline == null)
            {
                Debug.LogError("[Crush.X Beauty] Active URP pipeline asset missing. " +
                    "Create and assign one under Graphics and Android Quality settings.");
                return;
            }

            var data = GetRenderer(pipeline);
            if (data == null)
            {
                Debug.LogError("[Crush.X Beauty] Cannot resolve Universal Renderer Data.");
                return;
            }
            foreach (var f in data.rendererFeatures)
                if (f is CrushXBeautyRendererFeature)
                {
                    Debug.Log("[Crush.X Beauty] Already installed; no duplicate created.");
                    return;
                }

            Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
            if (shader == null)
            {
                Debug.LogError("[Crush.X Beauty] Shader not imported: " + ShaderPath);
                return;
            }

            var asset = new SerializedObject(data);
            var list = asset.FindProperty("m_RendererFeatures");
            var ids = asset.FindProperty("m_RendererFeatureMap");
            if (list == null || ids == null)
            {
                Debug.LogError("[Crush.X Beauty] Unsupported URP renderer schema. " +
                    "Add the feature manually in the Renderer Data Inspector.");
                return;
            }

            var feature = ScriptableObject.CreateInstance<CrushXBeautyRendererFeature>();
            feature.name = "Crush.X Original Beauty";
            var config = new SerializedObject(feature);
            var shaderSetting = config.FindProperty("beautyShader");
            if (shaderSetting == null)
            {
                Object.DestroyImmediate(feature);
                Debug.LogError("[Crush.X Beauty] Serialized shader property missing.");
                return;
            }
            shaderSetting.objectReferenceValue = shader;
            config.ApplyModifiedPropertiesWithoutUndo();

            AssetDatabase.AddObjectToAsset(feature, data);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out string ignored,
                out long localId);
            asset.Update();
            list.InsertArrayElementAtIndex(list.arraySize);
            list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = feature;
            ids.InsertArrayElementAtIndex(ids.arraySize);
            ids.GetArrayElementAtIndex(ids.arraySize - 1).longValue = localId;
            asset.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(data);
            EditorUtility.SetDirty(feature);
            AssetDatabase.SaveAssets();

            Debug.Log("[Crush.X Beauty] Renderer feature installed on " + data.name +
                ". Camera preview and recording still require Android QA.");
        }

        [MenuItem("CrushX/Lens Engine/Validate Original Beauty Setup")]
        public static void Validate()
        {
            var pipeline = CurrentPipeline();
            var data = pipeline == null ? null : GetRenderer(pipeline);
            bool installed = false;
            if (data != null)
                foreach (var f in data.rendererFeatures)
                    if (f is CrushXBeautyRendererFeature) installed = true;

            bool shaderLoaded = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath) != null;
            bool cameraConfigured = Object.FindFirstObjectByType<ARCameraBackground>() != null;

            if (!installed || !shaderLoaded || !cameraConfigured)
            {
                Debug.LogWarning("[Crush.X Beauty] Not ready: renderer feature=" +
                    installed + " shader=" + shaderLoaded +
                    " ARCameraBackground=" + cameraConfigured);
            }
            else
            {
                Debug.Log("[Crush.X Beauty] Editor configuration present. " +
                    "No device, model or preview parity QA has yet been proven.");
            }
        }

        private static UniversalRenderPipelineAsset CurrentPipeline()
        {
            return (QualitySettings.renderPipeline ??
                GraphicsSettings.defaultRenderPipeline) as UniversalRenderPipelineAsset;
        }

        private static ScriptableRendererData GetRenderer(UniversalRenderPipelineAsset pipeline)
        {
            var settings = new SerializedObject(pipeline);
            var list = settings.FindProperty("m_RendererDataList");
            var selected = settings.FindProperty("m_DefaultRendererIndex");
            if (list == null || list.arraySize == 0) return null;
            int index = selected == null ? 0 : selected.intValue;
            if (index < 0 || index >= list.arraySize) return null;
            return list.GetArrayElementAtIndex(index)
                .objectReferenceValue as ScriptableRendererData;
        }
    }
}
#endif
