#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;

namespace CrushX.LensEngine.EditorTools
{
    /// <summary>Review-only original art importer. Never registers a public lens.</summary>
    public static class AuraGeneratedPreviewImporter
    {
        [Serializable] private sealed class FileHash
        {
            public string Name;
            public string Sha256;
            public int SizeBytes;
        }

        [Serializable] private sealed class PackageManifest
        {
            public int SchemaVersion;
            public string Id;
            public string Status;
            public bool AutoPublish;
            public bool ProductionReady;
            public FileHash[] FileHashes;
        }

        [MenuItem("CrushX/AURA-X/Import Generated Assets (Review Preview Only)")]
        public static void ImportFromPicker()
        {
            string path = EditorUtility.OpenFilePanel("Select AURA-X review manifest", "", "json");
            if (string.IsNullOrEmpty(path)) return;
            try
            {
                string imported = ImportPreview(path);
                EditorUtility.DisplayDialog("AURA-X preview imported",
                    "EditorOnly prefab created:\n" + imported +
                    "\n\nThe package is still UNREVIEWED and cannot be published.", "OK");
            }
            catch (Exception ex)
            {
                Debug.LogError("AURA-X review import blocked: " + ex.Message);
                EditorUtility.DisplayDialog("Review import blocked", ex.Message, "OK");
            }
        }

        public static string ImportPreview(string manifestPath)
        {
            if (string.IsNullOrEmpty(manifestPath) ||
                !string.Equals(Path.GetFileName(manifestPath), "manifest.json", StringComparison.Ordinal))
                throw new InvalidDataException("Select a generated manifest.json file");
            var manifestFile = new FileInfo(manifestPath);
            if (!manifestFile.Exists || manifestFile.Length > 32768)
                throw new InvalidDataException("Missing or oversized manifest");
            var manifest = JsonUtility.FromJson<PackageManifest>(File.ReadAllText(manifestFile.FullName));
            if (manifest == null || manifest.SchemaVersion != 1 ||
                string.IsNullOrEmpty(manifest.Id) ||
                !System.Text.RegularExpressions.Regex.IsMatch(manifest.Id, @"\Aaura-[a-z]+-[0-9a-f]{12}\z") ||
                manifest.Status != "DRAFT_REVIEW_REQUIRED" || manifest.AutoPublish ||
                manifest.ProductionReady)
                throw new InvalidDataException("Unsupported or publish-enabled package");
            string[] required = { "overlay.png", "ornament.obj", "creator-lens.json", "game-theme.json" };
            if (manifest.FileHashes == null || manifest.FileHashes.Length != required.Length)
                throw new InvalidDataException("Invalid review package inventory");
            string folder = manifestFile.DirectoryName ?? "";
            foreach (string file in required)
            {
                var entry = manifest.FileHashes.SingleOrDefault(x => x != null && x.Name == file);
                if (entry == null || entry.SizeBytes < 1 || entry.SizeBytes > 2 * 1024 * 1024)
                    throw new InvalidDataException("Missing or oversized asset " + file);
                string full = Path.Combine(folder, file);
                var info = new FileInfo(full);
                if (!info.Exists || info.Length != entry.SizeBytes)
                    throw new InvalidDataException("Invalid size for " + file);
                using (var stream = File.OpenRead(full))
                using (var hash = SHA256.Create())
                {
                    string digest = BitConverter.ToString(hash.ComputeHash(stream))
                        .Replace("-", "").ToLowerInvariant();
                    if (!string.Equals(entry.Sha256, digest, StringComparison.Ordinal))
                        throw new InvalidDataException("Asset checksum mismatch: " + file);
                }
            }

            EnsureFolder("Assets/CrushX");
            EnsureFolder("Assets/CrushX/AURAReviewOnly");
            string destination = "Assets/CrushX/AURAReviewOnly/" + manifest.Id;
            if (AssetDatabase.IsValidFolder(destination))
                throw new InvalidOperationException("Immutable preview ID already exists; refusing overwrite");
            AssetDatabase.CreateFolder("Assets/CrushX/AURAReviewOnly", manifest.Id);
            string objPath = destination + "/ornament.obj";
            string pngPath = destination + "/overlay.png";
            try
            {
                File.Copy(Path.Combine(folder, "ornament.obj"), objPath);
                File.Copy(Path.Combine(folder, "overlay.png"), pngPath);
                File.Copy(Path.Combine(folder, "creator-lens.json"), destination + "/creator-lens.json");
                File.Copy(Path.Combine(folder, "game-theme.json"), destination + "/game-theme.json");
                File.Copy(manifestFile.FullName, destination + "/manifest.json");
                AssetDatabase.ImportAsset(objPath, ImportAssetOptions.ForceSynchronousImport);
                AssetDatabase.ImportAsset(pngPath, ImportAssetOptions.ForceSynchronousImport);
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(objPath);
                var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(pngPath);
                if (model == null || texture == null) throw new InvalidOperationException("OBJ or PNG did not import");
                Shader shader = Shader.Find("Universal Render Pipeline/Unlit") ??
                                Shader.Find("Unlit/Transparent") ?? Shader.Find("Standard");
                if (shader == null) throw new InvalidOperationException("No supported preview shader");
                var material = new Material(shader) { name = "AURA Original Preview (Unreviewed)" };
                if (material.HasProperty("_BaseMap")) material.SetTexture("_BaseMap", texture);
                if (material.HasProperty("_MainTex")) material.SetTexture("_MainTex", texture);
                AssetDatabase.CreateAsset(material, destination + "/ReviewPreview.mat");
                var root = new GameObject("AURA Review Preview");
                root.tag = "EditorOnly";
                try
                {
                    var child = UnityEngine.Object.Instantiate(model, root.transform);
                    child.name = "Original Procedural Mesh";
                    foreach (Renderer renderer in child.GetComponentsInChildren<Renderer>(true))
                        renderer.sharedMaterial = material;
                    string output = destination + "/ReviewOnly.prefab";
                    PrefabUtility.SaveAsPrefabAsset(root, output);
                    AssetDatabase.SaveAssets();
                    return output;
                }
                finally { UnityEngine.Object.DestroyImmediate(root); }
            }
            catch
            {
                AssetDatabase.DeleteAsset(destination);
                throw;
            }
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            if (string.IsNullOrEmpty(parent) || !AssetDatabase.IsValidFolder(parent))
                throw new InvalidOperationException("Missing Unity asset parent folder: " + parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }
}
#endif
