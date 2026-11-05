#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using UnityEngine.SceneManagement;
using UnityEngine.XR.ARFoundation;

namespace CrushX.LensEngine.Editor
{
    /// <summary>
    /// Opt-in, idempotent scene installer for the Unity 6 native runtime UI.
    /// Does not edit the Windows React frontend, AR renderer, or production build.
    /// </summary>
    public static class CrushXLensProductionUISetup
    {
        private const string Folder = "Assets/CrushXGenerated";
        private const string PanelPath =
            Folder + "/CrushXCameraProductionPanel.asset";

        [MenuItem("CrushX/Lens Engine/Install Production Camera UI")]
        public static void InstallFromMenu()
        {
            if (Application.isBatchMode)
            {
                throw new InvalidOperationException(
                    "Use the explicitly approved isolated-AR scene setup for batchmode.");
            }
            EnsureInstalledForCurrentScene();
        }

        // Only call from CreateNativeAndroidScene or an explicit editor menu.
        public static bool EnsureInstalledForCurrentScene()
        {
            var camera = UnityEngine.Object.FindFirstObjectByType<ARCameraManager>();
            var engine = UnityEngine.Object.FindFirstObjectByType<LensEngineBootstrap>();
            if (camera == null || engine == null)
            {
                Debug.LogError("[Crush.X Camera UI] Active scene must contain an " +
                    "ARCameraManager and LensEngineBootstrap. No scene changed.");
                return false;
            }

            var existing =
                UnityEngine.Object.FindFirstObjectByType<LensCameraProductionUI>();
            if (existing != null)
            {
                var document = existing.GetComponent<UIDocument>();
                if (document != null && document.panelSettings != null)
                {
                    Debug.Log("[Crush.X Camera UI] Runtime UIDocument already installed.");
                    return true;
                }
                Debug.LogError("[Crush.X Camera UI] Existing UI has no panel. " +
                    "Refusing to create a second overlay.");
                return false;
            }

            if (!AssetDatabase.IsValidFolder(Folder))
                AssetDatabase.CreateFolder("Assets", "CrushXGenerated");
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelPath);
            if (panel == null)
            {
                // Do not overwrite a different asset at this path.
                if (AssetDatabase.LoadMainAssetAtPath(PanelPath) != null)
                {
                    Debug.LogError("[Crush.X Camera UI] Panel destination occupied.");
                    return false;
                }
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                panel.name = "Crush.X Camera Production Panel";
                panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                panel.referenceResolution = new Vector2Int(440, 900);
                panel.sortingOrder = 200;
                panel.clearColor = false;
                AssetDatabase.CreateAsset(panel, PanelPath);
                AssetDatabase.SaveAssets();
            }

            GameObject go = new GameObject("CrushX Production Camera UI");
            var documentNew = go.AddComponent<UIDocument>();
            documentNew.panelSettings = panel;
            documentNew.sortingOrder = 200;
            var controller = go.AddComponent<LensCameraProductionUI>();
            controller.Engine = engine;
            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
            Debug.Log("[Crush.X Camera UI] Dedicated UI Toolkit camera panel added. " +
                "Press Play to verify safe-area, UI input and 11 collections. " +
                "The older NativeLensUI remains as a fallback.");
            return true;
        }
    }
}
#endif
