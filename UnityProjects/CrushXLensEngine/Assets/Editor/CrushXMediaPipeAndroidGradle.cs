#if UNITY_EDITOR
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor.Android;
using UnityEngine;

namespace CrushX.LensEngine.Editor
{
    /// <summary>
    /// Only alters GENERATED unityLibrary Gradle output, never a checked-in
    /// Android host or another project's Gradle build.
    /// </summary>
    public sealed class CrushXMediaPipeAndroidGradle :
        IPostGenerateGradleAndroidProject
    {
        public int callbackOrder { get { return 500; } }

        public void OnPostGenerateGradleAndroidProject(string path)
        {
            string gradlePath = Path.Combine(path, "build.gradle");
            if (!File.Exists(gradlePath))
                throw new FileNotFoundException("Unity library build.gradle missing", gradlePath);

            string content = File.ReadAllText(gradlePath);
            const string dependency = "com.google.mediapipe:tasks-vision:0.10.35";
            if (!content.Contains(dependency))
            {
                var match = Regex.Match(content, @"(?m)^\s*dependencies\s*\{");
                if (!match.Success)
                    throw new System.InvalidOperationException(
                        "Could not find Gradle dependencies block; refusing unsafe edit.");
                content = content.Insert(match.Index + match.Length,
                    "\n    implementation '" + dependency + "' // Crush.X Face AI Step 2");
                File.WriteAllText(gradlePath, content);
                Debug.Log("[CrushX Face AI] Pinned MediaPipe dependency added to generated unityLibrary.");
            }

            // A model is OPTIONAL for compiling the integration but is required
            // to enable inference. Do not fetch models from random URLs at build.
            string source = Path.Combine(Application.dataPath,
                "StreamingAssets/CrushXModels/face_landmarker.task");
            if (File.Exists(source) && new FileInfo(source).Length > 1024 * 1024)
            {
                string assets = Path.Combine(path, "src/main/assets");
                Directory.CreateDirectory(assets);
                File.Copy(source, Path.Combine(assets, "face_landmarker.task"), true);
                Debug.Log("[CrushX Face AI] Locally supplied model packaged in unityLibrary assets.");
            }
            else
            {
                Debug.LogWarning("[CrushX Face AI] Approved face_landmarker.task missing or " +
                    "too small: native inference will remain disabled; existing AR fallback stays.");
            }
        }
    }
}
#endif
