#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine.Editor
{
    public static class CrushXFunnyWarpSetup
    {
        private const string ShaderPath = "Assets/Shaders/CrushXFunnyFaceWarp.shader";

        [MenuItem("CrushX/Lens Engine/Validate Face Warp Setup")]
        public static void Validate()
        {
            UniversalRenderPipelineAsset pipeline = CurrentPipeline();
            if (pipeline == null)
            {
                Debug.LogError("[FaceWarp] No active URP pipeline. " +
                    "Create a Universal Render Pipeline Asset + Universal Renderer, " +
                    "assign the asset in Project Settings > Graphics and Quality, " +
                    "then rerun this validation. No settings were changed.");
                return;
            }

            ScriptableRendererData data = ActiveRenderer(pipeline);
            if (data == null)
            {
                Debug.LogError("[FaceWarp] Active Universal Renderer Data is missing.");
                return;
            }

            bool found = false;
            foreach (var feature in data.rendererFeatures)
                if (feature is FunnyFaceWarpRendererFeature) found = true;

            if (!found)
                Debug.LogWarning("[FaceWarp] FunnyFaceWarpRendererFeature is not installed " +
                    "on the active Renderer Data asset. Run Install after assigning URP.");
            else
                Debug.Log("[FaceWarp] Renderer feature exists on the active URP renderer. " +
                    "This does not prove camera alignment or device runtime quality.");

            if (AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath) == null)
                Debug.LogError("[FaceWarp] Shader is not imported at " + ShaderPath);

            if (Object.FindFirstObjectByType<ARCameraBackground>() == null)
                Debug.LogWarning("[FaceWarp] No ARCameraBackground in the open scene. " +
                    "Image warp will not have native camera pixels until scene setup.");
        }

        [MenuItem("CrushX/Lens Engine/Install Face Warp Renderer Feature")]
        public static void Install()
        {
            var pipeline = CurrentPipeline();
            var data = pipeline == null ? null : ActiveRenderer(pipeline);
            if (data == null)
            {
                Debug.LogError("[FaceWarp] Installation blocked: assign an active URP asset " +
                    "and Universal Renderer before installing. Original Graphics/Quality " +
                    "settings were left untouched.");
                return;
            }

            Shader shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
            if (shader == null)
            {
                Debug.LogError("[FaceWarp] Missing shader: " + ShaderPath);
                return;
            }

            foreach (var feature in data.rendererFeatures)
            {
                if (feature is FunnyFaceWarpRendererFeature)
                {
                    Debug.Log("[FaceWarp] Already installed. No duplicate created.");
                    return;
                }
            }

            // Persist via SerializedObject to keep renderer feature list and
            // its local-id map consistent across Unity Editor restarts.
            var rendererObject = new SerializedObject(data);
            var features = rendererObject.FindProperty("m_RendererFeatures");
            var featureMap = rendererObject.FindProperty("m_RendererFeatureMap");
            if (features == null || featureMap == null)
            {
                Debug.LogError("[FaceWarp] Unsupported URP Renderer Data schema. " +
                    "Use the Inspector > Add Renderer Feature instead.");
                return;
            }

            var instance = ScriptableObject.CreateInstance<FunnyFaceWarpRendererFeature>();
            instance.name = "Crush.X Funny Face Warp";
            var featureObject = new SerializedObject(instance);
            var shaderField = featureObject.FindProperty("warpShader");
            if (shaderField == null)
            {
                Object.DestroyImmediate(instance);
                Debug.LogError("[FaceWarp] Shader setting not found.");
                return;
            }
            shaderField.objectReferenceValue = shader;
            featureObject.ApplyModifiedPropertiesWithoutUndo();

            AssetDatabase.AddObjectToAsset(instance, data);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(instance, out string unusedGuid,
                out long localId);
            rendererObject.Update();
            int count = features.arraySize;
            features.InsertArrayElementAtIndex(count);
            features.GetArrayElementAtIndex(count).objectReferenceValue = instance;
            featureMap.InsertArrayElementAtIndex(featureMap.arraySize);
            featureMap.GetArrayElementAtIndex(featureMap.arraySize - 1).longValue = localId;
            rendererObject.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(data);
            EditorUtility.SetDirty(instance);
            AssetDatabase.SaveAssets();

            Debug.Log("[FaceWarp] Added renderer feature to active renderer: " + data.name +
                ". Still requires a real face landmark provider and Android QA.");
        }

        private static UniversalRenderPipelineAsset CurrentPipeline()
        {
            return (QualitySettings.renderPipeline ??
                GraphicsSettings.defaultRenderPipeline) as UniversalRenderPipelineAsset;
        }

        private static ScriptableRendererData ActiveRenderer(UniversalRenderPipelineAsset pipeline)
        {
            var settings = new SerializedObject(pipeline);
            var list = settings.FindProperty("m_RendererDataList");
            var selected = settings.FindProperty("m_DefaultRendererIndex");
            if (list == null || list.arraySize == 0) return null;
            int index = selected == null ? 0 : selected.intValue;
            if (index < 0 || index >= list.arraySize) return null;
            return list.GetArrayElementAtIndex(index).objectReferenceValue as ScriptableRendererData;
        }
    }
}
#endif
