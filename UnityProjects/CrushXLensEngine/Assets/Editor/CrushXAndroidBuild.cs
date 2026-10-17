#if UNITY_EDITOR
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEngine;

namespace CrushX.LensEngine.Editor
{
    /// <summary>Development APK only. Never installs, launches, publishes, or changes production services.</summary>
    public static class CrushXAndroidBuild
    {
        [Serializable]
        public sealed class BuildInfo
        {
            public int schemaVersion = 1;
            public string buildId, commitSha, applicationVersion, packageId, unityVersion, buildUtc;
            public string arFoundationVersion, arCoreVersion, xrManagementVersion, inputSystemVersion, renderPipelineVersion;
            public bool developmentBuild = true;
            public bool sourceDirty;
        }

        [Serializable]
        sealed class BuildSummary
        {
            public string result, outputPath, buildInfoPath;
            public ulong bytes;
            public int errors, warnings;
            public string[] scenes;
        }

        public static void DevelopmentApk()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                throw new BuildFailedException("Select Android first; batch invocation must include -buildTarget Android.");
            string package = Argument("-crushxPackage") ?? "in.crushx.lens.pr3test";
            if (!Regex.IsMatch(package, @"\Ain\.crushx\.lens\.(pr3test|devtest)(\.[a-z][a-z0-9_]*)*\z"))
                throw new BuildFailedException("Only isolated in.crushx.lens.pr3test[.suffix] or devtest[.suffix] packages are allowed.");
            string projectRoot = Path.GetDirectoryName(Application.dataPath);
            string output = Path.GetFullPath(Path.Combine(projectRoot, Argument("-crushxApk") ?? "Builds/Android/CrushX-pr3test.apk"));
            if (!output.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
                throw new BuildFailedException("-crushxApk must name an APK file.");
            if (File.Exists(output) || File.Exists(output + ".build-info.json") || File.Exists(output + ".build-summary.json"))
                throw new BuildFailedException("Output or evidence already exists; choose a new path to preserve previous builds.");
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (!scenes.Contains("Assets/SCENES/CrushXNativeAR.unity"))
                throw new BuildFailedException("Enabled build scenes must include Assets/SCENES/CrushXNativeAR.unity.");
            if (scenes.Any(s => !File.Exists(Path.Combine(projectRoot, s)))) throw new BuildFailedException("An enabled scene is missing.");
            // The circular browser needs real cover resources, not a test APK full of placeholders.
            foreach (LensManifest lens in LensCatalog.All)
            {
                string cover = CrushXLensCoverBaker.CoverFolder + "/" + lens.Id + ".png";
                if (AssetDatabase.LoadAssetAtPath<Texture2D>(cover) == null)
                    throw new BuildFailedException("Lens cover missing: " + cover +
                        ". Run CrushX/Lens Covers/Generate Missing Covers or use -GenerateLensCovers with run_unity_checks.ps1 before building.");
            }

            string head = Git("rev-parse HEAD");
            string supplied = Argument("-crushxCommit");
            string sha = supplied ?? head;
            if (sha == null || !Regex.IsMatch(sha, @"\A[0-9a-fA-F]{40}\z"))
                throw new BuildFailedException("Cannot establish exact source commit; provide -crushxCommit <full 40-character SHA>.");
            if (supplied != null && head != null && !string.Equals(head, supplied, StringComparison.OrdinalIgnoreCase))
                throw new BuildFailedException("Supplied commit does not match this checkout's HEAD.");
            string status = Git("status --porcelain");
            var info = new BuildInfo
            {
                commitSha = sha.ToLowerInvariant(),
                buildId = Argument("-crushxBuildId") ?? (sha.Substring(0, 12) + "-" + DateTime.UtcNow.ToString("yyyyMMddTHHmmssZ")),
                applicationVersion = Application.version, packageId = package, unityVersion = Application.unityVersion,
                buildUtc = DateTime.UtcNow.ToString("o"), sourceDirty = status == null || status.Length > 0,
                arFoundationVersion = Version("com.unity.xr.arfoundation"), arCoreVersion = Version("com.unity.xr.arcore"),
                xrManagementVersion = Version("com.unity.xr.management"), inputSystemVersion = Version("com.unity.inputsystem"),
                renderPipelineVersion = Version("com.unity.render-pipelines.universal")
            };
            const string resourceAsset = "Assets/Resources/CrushXBuildInfo.json";
            string resources = Path.Combine(projectRoot, "Assets/Resources");
            string resource = Path.Combine(projectRoot, resourceAsset);
            bool folderExisted = Directory.Exists(resources);
            byte[] previous = File.Exists(resource) ? File.ReadAllBytes(resource) : null;
            byte[] previousMeta = File.Exists(resource + ".meta") ? File.ReadAllBytes(resource + ".meta") : null;
            byte[] previousFolderMeta = File.Exists(resources + ".meta") ? File.ReadAllBytes(resources + ".meta") : null;
            string streamingDirectory = Path.Combine(projectRoot, "Assets/StreamingAssets");
            string streamingInfo = Path.Combine(streamingDirectory, "CrushXBuildInfo.json");
            bool streamingFolderExisted = Directory.Exists(streamingDirectory);
            byte[] previousStreaming = File.Exists(streamingInfo) ? File.ReadAllBytes(streamingInfo) : null;
            byte[] previousStreamingMeta = File.Exists(streamingInfo + ".meta") ? File.ReadAllBytes(streamingInfo + ".meta") : null;
            byte[] previousStreamingFolderMeta = File.Exists(streamingDirectory + ".meta") ? File.ReadAllBytes(streamingDirectory + ".meta") : null;
            string previousPackage = PlayerSettings.GetApplicationIdentifier(NamedBuildTarget.Android);
            bool previousBundle = EditorUserBuildSettings.buildAppBundle;
            bool previousKeystore = PlayerSettings.Android.useCustomKeystore;
            string json = JsonUtility.ToJson(info, true);
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            string infoPath = output + ".build-info.json";
            try
            {
                Directory.CreateDirectory(resources);
                File.WriteAllText(resource, json);
                AssetDatabase.ImportAsset(resourceAsset, ImportAssetOptions.ForceSynchronousImport);
                // Raw JSON inside the APK remains inspectable even when Unity Resources are compressed.
                Directory.CreateDirectory(streamingDirectory);
                File.WriteAllText(streamingInfo, json);
                AssetDatabase.ImportAsset("Assets/StreamingAssets/CrushXBuildInfo.json", ImportAssetOptions.ForceSynchronousImport);
                PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, package);
                EditorUserBuildSettings.buildAppBundle = false;
                PlayerSettings.Android.useCustomKeystore = false;
                File.WriteAllText(infoPath, json);
                UnityEngine.Debug.Log("[CrushXBuild] " + json);
                BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = scenes, locationPathName = output, target = BuildTarget.Android,
                    options = BuildOptions.Development | BuildOptions.AllowDebugging | BuildOptions.StrictMode
                });
                File.WriteAllText(output + ".build-summary.json", JsonUtility.ToJson(new BuildSummary
                {
                    result = report.summary.result.ToString(), outputPath = output, buildInfoPath = infoPath,
                    bytes = report.summary.totalSize, errors = (int)report.summary.totalErrors,
                    warnings = (int)report.summary.totalWarnings, scenes = scenes
                }, true));
                if (report.summary.result != BuildResult.Succeeded)
                    throw new BuildFailedException("Development APK build failed: " + report.summary.result);
            }
            finally
            {
                PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, previousPackage);
                EditorUserBuildSettings.buildAppBundle = previousBundle;
                PlayerSettings.Android.useCustomKeystore = previousKeystore;
                Restore(resource, previous);
                Restore(resource + ".meta", previousMeta);
                if (!folderExisted && Directory.Exists(resources) && Directory.GetFileSystemEntries(resources).Length == 0)
                    Directory.Delete(resources);
                Restore(resources + ".meta", previousFolderMeta);
                Restore(streamingInfo, previousStreaming);
                Restore(streamingInfo + ".meta", previousStreamingMeta);
                if (!streamingFolderExisted && Directory.Exists(streamingDirectory) && Directory.GetFileSystemEntries(streamingDirectory).Length == 0)
                    Directory.Delete(streamingDirectory);
                Restore(streamingDirectory + ".meta", previousStreamingFolderMeta);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            }
        }

        static void Restore(string path, byte[] bytes)
        {
            if (bytes != null) File.WriteAllBytes(path, bytes);
            else if (File.Exists(path)) File.Delete(path);
        }

        static string Argument(string key)
        {
            string[] args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, key);
            if (index < 0) return null;
            if (index + 1 >= args.Length || args[index + 1].StartsWith("-"))
                throw new BuildFailedException("Missing value for " + key);
            return args[index + 1];
        }

        static string Version(string package)
        {
            PackageInfo found = PackageInfo.GetAllRegisteredPackages().FirstOrDefault(p => p.name == package);
            return found == null ? "unavailable" : found.version;
        }

        static string Git(string arguments)
        {
            try
            {
                using (var process = Process.Start(new ProcessStartInfo("git", arguments)
                {
                    WorkingDirectory = Path.GetFullPath(Path.Combine(Application.dataPath, "../../..")), UseShellExecute = false,
                    RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
                }))
                {
                    if (!process.WaitForExit(10000)) { process.Kill(); return null; }
                    return process.ExitCode == 0 ? process.StandardOutput.ReadToEnd().Trim() : null;
                }
            }
            catch (Exception) { return null; }
        }
    }
}
#endif
