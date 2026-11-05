#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace CrushX.LensEngine.Editor
{
    public static class CrushXLensAndroidExport
    {
        /// <summary>
        /// Explicit opt-in only; development IL2CPP ARM64 Unity Gradle export.
        /// Not a release-signing or app deployment pipeline.
        /// </summary>
        public static void ExportArm64Development()
        {
            if (Environment.GetEnvironmentVariable("CRUSHX_ALLOW_LENS_EXPORT") != "1")
                throw new InvalidOperationException(
                    "Explicit CRUSHX_ALLOW_LENS_EXPORT=1 required for export.");

            string output = Environment.GetEnvironmentVariable("CRUSHX_LENS_EXPORT_DIR");
            if (string.IsNullOrEmpty(output) || !Path.IsPathRooted(output))
                throw new InvalidOperationException("Absolute CRUSHX_LENS_EXPORT_DIR required.");

            if (!AssetDatabase.IsValidFolder("Assets/Scenes") ||
                AssetDatabase.LoadAssetAtPath<UnityEngine.SceneManagement.SceneAsset>(
                    "Assets/Scenes/CrushXNativeAR.unity") == null)
                throw new InvalidOperationException(
                    "Real AR scene missing. Create Native Android AR Scene in Unity first.");

            if (!EditorUserBuildSettings.SwitchActiveBuildTarget(
                BuildTargetGroup.Android, BuildTarget.Android))
                throw new InvalidOperationException("Android target switch failed.");

            PlayerSettings.SetScriptingBackend(
                UnityEditor.Build.NamedBuildTarget.Android,
                ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            EditorUserBuildSettings.exportAsGoogleAndroidProject = true;

            Directory.CreateDirectory(output);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { "Assets/Scenes/CrushXNativeAR.unity" },
                locationPathName = output,
                target = BuildTarget.Android,
                options = BuildOptions.Development |
                    BuildOptions.AllowDebugging |
                    BuildOptions.AcceptExternalModificationsToPlayer
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError("[Crush.X Lens] ARM64 export FAILED: " +
                    report.summary.result);
                EditorApplication.Exit(51);
                return;
            }
            Debug.Log("[Crush.X Lens] Dev Unity Gradle export success: " + output +
                ". Build with Gradle separately. Do not claim APK/device pass.");
            EditorApplication.Exit(0);
        }
    }
}
#endif
