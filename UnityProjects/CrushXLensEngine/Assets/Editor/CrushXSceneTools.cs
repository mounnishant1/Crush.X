#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace CrushX.LensEngine.Editor
{
    public static class CrushXSceneTools
    {
        [MenuItem("CrushX/Lens Engine/Create Mock Demo Scene")]
        public static void CreateMockDemoScene()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            cameraObject.AddComponent<AudioListener>();
            cameraObject.transform.position = new Vector3(0, 0, -2);
            cameraObject.transform.rotation = Quaternion.identity;
            camera.backgroundColor = new Color(.04f, .065f, .105f);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.fieldOfView = 56;
            var engine = new GameObject("CrushX Lens Engine (Mock)");
            engine.AddComponent<LensEngineBootstrap>();
            string folder = "Assets/SCENES";
            if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);
            EditorSceneManager.SaveScene(scene, folder + "/CrushXMockDemo.unity");
            var scenes = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            string scenePath = folder + "/CrushXMockDemo.unity";
            if (!scenes.Exists(s => s.path == scenePath)) scenes.Add(new EditorBuildSettingsScene(scenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            Selection.activeGameObject = engine;
            Debug.Log("CrushX MOCK demo created. Press Play. On Android, create a separate AR scene using XR Origin (AR) + AR Face Manager.");
        }
    }
}
#endif
