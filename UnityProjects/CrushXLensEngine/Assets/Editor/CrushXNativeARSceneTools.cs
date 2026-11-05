#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using UnityEngine.SceneManagement;

namespace CrushX.LensEngine.Editor
{
    public static class CrushXNativeARSceneTools
    {
        private static void ReportFailure(string title, string description)
        {
            if (Application.isBatchMode)
                throw new InvalidOperationException(title + ": " + description);
            EditorUtility.DisplayDialog(title, description, "OK");
        }

        // CI may generate this scene ONLY from an explicitly isolated checkout.
        public static void CreateForIsolatedCI()
        {
            if (Environment.GetEnvironmentVariable("CRUSHX_ALLOW_DEBUG_AR_SCENE_SETUP") != "1")
                throw new InvalidOperationException(
                    "CRUSHX_ALLOW_DEBUG_AR_SCENE_SETUP=1 is required.");
            CreateNativeAndroidScene();
        }

        [MenuItem("CrushX/Lens Engine/Create Native Android AR Scene")]
        public static void CreateNativeAndroidScene()
        {
            if (!Application.isBatchMode &&
                !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            // AR Foundation editor menu constructs XR Origin, camera, tracked-pose driver and AR background correctly.
            if (!EditorApplication.ExecuteMenuItem("GameObject/XR/AR Session"))
            {
                ReportFailure("AR Foundation required", "Install Unity AR Foundation 6 and its XR scene-setup menus.");
                return;
            }
            if (!EditorApplication.ExecuteMenuItem("GameObject/XR/XR Origin (Mobile AR)"))
            {
                ReportFailure("XR Origin unavailable", "Add GameObject > XR > XR Origin (Mobile AR), then retry. Check AR Foundation installation.");
                return;
            }
            var faceManager = UnityEngine.Object.FindFirstObjectByType<ARFaceManager>();
            if (faceManager == null)
            {
                GameObject origin = GameObject.Find("XR Origin");
                if (origin == null)
                {
                    ReportFailure("XR Origin missing", "AR scene setup did not produce an XR Origin.");
                    return;
                }
                faceManager = origin.AddComponent<ARFaceManager>();
            }
            ARCameraManager cameraManager = UnityEngine.Object.FindFirstObjectByType<ARCameraManager>();
            ARCameraBackground background = UnityEngine.Object.FindFirstObjectByType<ARCameraBackground>();
            if (cameraManager == null || background == null)
            {
                ReportFailure("AR camera missing", "XR Origin should include AR Camera Manager and AR Camera Background. Check the provider installation.");
                return;
            }
            cameraManager.requestedFacingDirection = CameraFacingDirection.User;
            Directory.CreateDirectory("Assets/Materials");
            Material occlusion = AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/CrushXFaceDepth.mat");
            if (occlusion == null)
            {
                Shader shader = Shader.Find("CrushX/ARFaceDepthOnly");
                if (shader == null)
                {
                    ReportFailure("Depth shader missing", "Assets/Shaders/CrushXFaceDepth.shader failed to import.");
                    return;
                }
                occlusion = new Material(shader);
                AssetDatabase.CreateAsset(occlusion, "Assets/Materials/CrushXFaceDepth.mat");
            }
            Directory.CreateDirectory("Assets/Prefabs");
            GameObject face = new GameObject("CrushX AR Face Occlusion");
            face.AddComponent<ARFace>();
            face.AddComponent<MeshFilter>();
            MeshRenderer renderer = face.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = occlusion;
            face.AddComponent<ARFaceMeshVisualizer>();
            string path = "Assets/Prefabs/CrushXARFace.prefab";
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(face, path);
            UnityEngine.Object.DestroyImmediate(face);
            faceManager.facePrefab = prefab;
            var engine = new GameObject("CrushX Native 3D AR Runtime");
            engine.AddComponent<LensEngineBootstrap>();
            new GameObject("CrushX Native Lens UI").AddComponent<NativeLensUI>();
            if (!CrushXLensProductionUISetup.EnsureInstalledForCurrentScene())
            {
                ReportFailure("Production camera UI setup incomplete",
                    "UI Toolkit panel installation failed; the native IMGUI fallback was preserved.");
                return;
            }
            Directory.CreateDirectory("Assets/Scenes");
            const string scenePath = "Assets/Scenes/CrushXNativeAR.unity";
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene(), scenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(scenePath, true) };
            AssetDatabase.SaveAssets();
            Selection.activeGameObject = engine;
            Debug.Log("Native AR scene created. Enable ARCore in Android XR Plug-in Management and TEST REAL FRONT CAMERA on a supported device.");
        }
    }
}
#endif
