using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.XR.ARFoundation;
using CrushX.ImportedLenses;

namespace CrushX.ImportedLenses.Editor
{
    /// <summary>
    /// Creates a native Unity prefab from an optimized OBJ and inserts a non-destructive lens bridge
    /// into the CURRENT open scene. Does not overwrite camera settings, existing lenses or catalog.
    /// </summary>
    public static class FoxMaskInstaller
    {
        private const string Root = "Assets/CrushX/ImportedLenses/FoxMask";
        private const string ObjPath = Root + "/Model/FoxMask_Mobile.obj";
        private const string TexturePath = Root + "/Model/FoxMask_Color.jpg";
        private const string MaterialPath = Root + "/Model/FoxMask_Unity.mat";
        private const string PrefabPath = Root + "/FoxMask_AR.prefab";
        private const string BridgeName = "CrushX_LensBridge";

        [MenuItem("Crush.X/Lenses/Install Fox Mask into Open Scene")]
        public static void Install()
        {
            AssetDatabase.Refresh();
            GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(ObjPath);
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(TexturePath);
            if (model == null || texture == null)
            {
                EditorUtility.DisplayDialog("Crush.X Fox Mask", "Model or texture not imported. Check Assets/CrushX/ImportedLenses/FoxMask/Model", "OK");
                return;
            }

            Shader shader = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null
                ? Shader.Find("Standard") : Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null)
            {
                EditorUtility.DisplayDialog("Crush.X Fox Mask", "No compatible shader found. Install URP or Standard rendering support.", "OK");
                return;
            }

            Material mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (mat == null)
            {
                mat = new Material(shader);
                mat.name = "CrushX_FoxMask_Material";
                AssetDatabase.CreateAsset(mat, MaterialPath);
            }
            else mat.shader = shader;
            if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", texture);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", texture);
            EditorUtility.SetDirty(mat);

            GameObject root = new GameObject("CrushX_FoxMask_AR");
            GameObject imported = Object.Instantiate(model);
            imported.name = "FoxMask_Optimized_Mesh";
            imported.transform.SetParent(root.transform, false);
            imported.transform.localPosition = Vector3.zero;
            imported.transform.localRotation = Quaternion.identity;
            imported.transform.localScale = Vector3.one * 0.12f; // ~23 cm wide, tweak for your handset

            foreach (Renderer renderer in imported.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                if (materials.Length == 0) materials = new Material[1];
                for (int i = 0; i < materials.Length; i++) materials[i] = mat;
                renderer.sharedMaterials = materials;
            }

            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
            Object.DestroyImmediate(root);
            if (prefab == null)
            {
                EditorUtility.DisplayDialog("Crush.X Fox Mask", "Unity failed to save the lens prefab.", "OK");
                return;
            }

            GameObject bridge = GameObject.Find(BridgeName);
            if (bridge == null) bridge = new GameObject(BridgeName);
            FoxMaskARLens controller = bridge.GetComponent<FoxMaskARLens>();
            if (controller == null) controller = Undo.AddComponent<FoxMaskARLens>(bridge);
            Undo.RecordObject(controller, "Register Crush.X Fox Mask Lens");
            controller.foxMaskPrefab = prefab;
            controller.enabledOnStart = false; // selection comes from the shared lens catalog
            controller.faceManager = Object.FindFirstObjectByType<ARFaceManager>(FindObjectsInactive.Include);
            EditorUtility.SetDirty(controller);
            Scene active = SceneManager.GetActiveScene();
            if (active.IsValid()) EditorSceneManager.MarkSceneDirty(active);
            AssetDatabase.SaveAssets();

            string status = controller.faceManager == null
                ? "No ARFaceManager found in this open scene. Prefab created, but face tracking cannot work until AR Foundation is configured."
                : "Lens bridge and prefab created. Save this scene, build Android, verify tracking and alignment on phone.";
            Debug.Log("[CrushX FoxMask] " + status);
            EditorUtility.DisplayDialog("Crush.X: Fox Mask Installed in Open Scene", status + "\n\nLens ID: fox-mask-3d", "OK");
        }
    }
}
