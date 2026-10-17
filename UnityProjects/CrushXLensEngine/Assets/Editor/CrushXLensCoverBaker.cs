#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace CrushX.LensEngine.Editor
{
    /// <summary>
    /// Bakes missing circular catalog cover art from the actual effect implementations. The neutral
    /// preview head is a mannequin, not a camera photograph or evidence of tracking/device behavior.
    /// Uses an isolated, unsaved additive scene; never opens or edits AR scenes or lens prefabs.
    /// Existing covers and their import settings are preserved. New PNGs/metas remain source changes.
    /// Batch use requires a graphics device: -quit -executeMethod
    /// CrushX.LensEngine.Editor.CrushXLensCoverBaker.BatchGenerate (do not pass -nographics).
    /// </summary>
    public static class CrushXLensCoverBaker
    {
        public const string CoverFolder = "Assets/Resources/CrushXLensCovers";
        private const int Size = 256;

        public static void BatchGenerate() { GenerateMissing(); }

        [MenuItem("CrushX/Lens Covers/Generate Missing Covers")]
        public static void GenerateMissing()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Generate lens covers in Edit Mode.");
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
                throw new InvalidOperationException("Lens cover baking requires a graphics device; remove -nographics.");

            int created = 0, preserved = 0;
            foreach (LensManifest lens in LensCatalog.All)
            {
                string assetPath = CoverFolder + "/" + lens.Id + ".png";
                string fullPath = FullPath(assetPath);
                if (File.Exists(fullPath)) { preserved++; continue; }
                // An orphan meta could be a user's in-progress asset. Never replace or repurpose it.
                if (File.Exists(fullPath + ".meta"))
                    throw new IOException("Cover PNG is missing but its meta exists; restore or review it first: " + assetPath);

                Texture2D image = null;
                try
                {
                    image = lens.SceneProvided ? ReadImportedCover(lens) : RenderEffectCover(lens);
                    ApplyCircularAlpha(image);
                    byte[] png = image.EncodeToPNG();
                    if (png == null || png.Length == 0)
                        throw new InvalidOperationException("PNG encoding returned no data for " + lens.Id);
                    EnsureFolder(CoverFolder);
                    // CreateNew also protects an asset created by another process after our check.
                    using (var stream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write))
                        stream.Write(png, 0, png.Length);
                    AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
                    TextureImporter importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
                    if (importer == null) throw new InvalidOperationException("No texture importer for generated cover: " + assetPath);
                    importer.textureType = TextureImporterType.Default;
                    importer.alphaSource = TextureImporterAlphaSource.FromInput;
                    importer.alphaIsTransparency = true;
                    importer.mipmapEnabled = false;
                    importer.isReadable = false;
                    importer.wrapMode = TextureWrapMode.Clamp;
                    importer.maxTextureSize = Size;
                    importer.textureCompression = TextureImporterCompression.Uncompressed;
                    importer.SaveAndReimport();
                    created++;
                    Debug.Log("[CrushXLensCovers] Created preview cover art: " + assetPath);
                }
                catch (Exception error)
                {
                    // Preserve partial assets for inspection too; this command never deletes files.
                    throw new InvalidOperationException("Failed to bake cover for " + lens.Id + ": " + error.Message, error);
                }
                finally { if (image != null) Object.DestroyImmediate(image); }
            }
            Debug.Log("[CrushXLensCovers] Created " + created + "; preserved " + preserved +
                " existing covers. Preview cover art does not verify physical-device rendering or tracking.");
        }

        private static Texture2D ReadImportedCover(LensManifest lens)
        {
            if (string.IsNullOrEmpty(lens.PreviewAssetPath))
                throw new InvalidOperationException("Imported lens has no real thumbnail asset reference.");
            Texture2D original = AssetDatabase.LoadAssetAtPath<Texture2D>(lens.PreviewAssetPath);
            if (original == null) throw new FileNotFoundException("Imported lens thumbnail is missing: " + lens.PreviewAssetPath);
            RenderTexture previous = RenderTexture.active;
            RenderTexture target = null;
            try
            {
                target = CreateTarget(0);
                // GPU readback keeps the source thumbnail and its importer settings untouched.
                Vector2 scale = original.width > original.height
                    ? new Vector2((float)original.height / original.width, 1)
                    : new Vector2(1, (float)original.width / original.height);
                Graphics.Blit(original, target, scale, (Vector2.one - scale) * .5f);
                Texture2D image = Readback(target);
                try { ValidateImage(image, lens.Id); return image; }
                catch { Object.DestroyImmediate(image); throw; }
            }
            finally
            {
                RenderTexture.active = previous;
                DisposeTarget(target);
            }
        }

        private static Texture2D RenderEffectCover(LensManifest lens)
        {
            Scene previousScene = SceneManager.GetActiveScene();
            Scene previewScene = default;
            RenderTexture previousTarget = RenderTexture.active;
            RenderTexture target = null, filtered = null;
            Texture2D baseline = null, result = null;
            GameObject root = null;
            Camera camera = null;
            LensEffect effect = null;
            var ownedMaterials = new HashSet<Material>();
            var existingMaterialIds = new HashSet<int>();
            foreach (Material material in Resources.FindObjectsOfTypeAll<Material>())
                existingMaterialIds.Add(material.GetInstanceID());
            try
            {
                // A normal additive scene supports public SetActiveScene, so even GameObjects
                // created inside production Build methods go directly into our disposable scene.
                previewScene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
                if (!previewScene.IsValid() || !SceneManager.SetActiveScene(previewScene))
                    throw new InvalidOperationException("Cannot activate an isolated cover scene; no cover was rendered.");
                ulong sceneMask = EditorSceneManager.CalculateAvailableSceneCullingMask();
                if (sceneMask == 0 || (sceneMask & SceneCullingMasks.DefaultSceneCullingMask) != 0)
                    throw new InvalidOperationException("No isolated scene culling mask is available for cover rendering.");
                EditorSceneManager.SetSceneCullingMask(previewScene, sceneMask);
                root = new GameObject("CrushX Cover Preview") { hideFlags = HideFlags.HideAndDontSave };
                camera = CreateCamera(root.transform, previewScene, sceneMask);
                CreateLight(root.transform, "Key", new Vector3(28, -28, 0), 1.25f, Color.white);
                CreateLight(root.transform, "Fill", new Vector3(340, 35, 0), .65f, new Color(.72f, .81f, 1));
                CreatePreviewHead(root.transform, ownedMaterials);
                target = CreateTarget(24);
                camera.targetTexture = target;
                camera.Render();
                baseline = Readback(target);
                ValidateImage(baseline, "neutral preview head");

                GameObject effectObject = new GameObject("Actual effect: " + lens.Id);
                effectObject.transform.SetParent(root.transform, false);
                effect = effectObject.AddComponent(LensCatalog.ResolveType(lens.Id)) as LensEffect;
                if (effect == null) throw new InvalidOperationException("Catalog type is not a LensEffect.");
                ColorFilterLens colorFilter = effect as ColorFilterLens;
                if (colorFilter != null) colorFilter.TargetCamera = camera; // Never resolves Camera.main.
                effect.Build();
                effect.Animate(new FaceSample
                {
                    Valid = true, Position = Vector3.zero, Rotation = Quaternion.identity,
                    Confidence = 1, MouthOpen = .45f, Blink = 0, Timestamp = .375
                }, .375f);

                if (colorFilter != null)
                {
                    colorFilter.OnSelected();
                    Material grade = colorFilter.FilterMaterial;
                    if (grade == null || grade.shader == null || !grade.shader.isSupported)
                        throw new InvalidOperationException("Actual color filter material is unavailable.");
                    // Apply the configured production shader exactly once. Editor callbacks need not
                    // execute OnRenderImage, so use its same material/pass explicitly for this bake.
                    CameraColorFilter component = camera.GetComponent<CameraColorFilter>();
                    if (component != null) component.enabled = false;
                    filtered = CreateTarget(0);
                    Graphics.Blit(target, filtered, grade, 0);
                    result = Readback(filtered);
                }
                else
                {
                    ValidateEffectMeshes(effect);
                    camera.Render();
                    result = Readback(target);
                }
                ValidateImage(result, lens.Id);
                ValidateVisibleChange(baseline, result, lens.Id);
                Texture2D returned = result;
                result = null;
                return returned;
            }
            finally
            {
                RenderTexture.active = previousTarget;
                try
                {
                    if (camera != null) camera.targetTexture = null;
                    if (effect != null)
                    {
                        // LensGeometry caches materials shared with live scenes. Never clear that
                        // cache or destroy a preexisting material; only collect our new allocations.
                        foreach (Renderer renderer in effect.GetComponentsInChildren<Renderer>(true))
                            foreach (Material material in renderer.sharedMaterials)
                                if (material != null && !existingMaterialIds.Contains(material.GetInstanceID()) && !AssetDatabase.Contains(material))
                                    ownedMaterials.Add(material);
                        try { effect.OnDeselected(); }
                        finally { effect.ReleaseResources(); }
                    }
                }
                finally
                {
                    try
                    {
                        DisposeTarget(filtered);
                        DisposeTarget(target);
                        if (baseline != null) Object.DestroyImmediate(baseline);
                        if (result != null) Object.DestroyImmediate(result);
                        if (root != null) Object.DestroyImmediate(root);
                        foreach (Material material in ownedMaterials) if (material != null) Object.DestroyImmediate(material);
                    }
                    finally
                    {
                        try
                        {
                            if (previousScene.IsValid() && previousScene.isLoaded) SceneManager.SetActiveScene(previousScene);
                        }
                        finally
                        {
                            try { if (previewScene.IsValid()) EditorSceneManager.CloseScene(previewScene, true); }
                            finally { RenderTexture.active = previousTarget; }
                        }
                    }
                }
            }
        }

        private static Camera CreateCamera(Transform root, Scene scene, ulong sceneMask)
        {
            var cameraObject = new GameObject("Cover Camera");
            cameraObject.transform.SetParent(root, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.enabled = false;
            camera.cameraType = CameraType.Preview;
            camera.scene = scene;
            camera.overrideSceneCullingMask = sceneMask;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.10f, .13f, .18f, 1);
            camera.orthographic = true;
            camera.orthographicSize = .73f;
            camera.aspect = 1;
            camera.nearClipPlane = .01f;
            camera.farClipPlane = 10;
            camera.renderingPath = RenderingPath.Forward;
            camera.allowHDR = false;
            camera.allowMSAA = false;
            camera.useOcclusionCulling = false;
            camera.transform.position = new Vector3(0, .12f, -3);
            camera.transform.rotation = Quaternion.identity;
            return camera;
        }

        private static void CreateLight(Transform root, string name, Vector3 angles, float intensity, Color color)
        {
            var lightObject = new GameObject(name);
            lightObject.transform.SetParent(root, false);
            lightObject.transform.rotation = Quaternion.Euler(angles);
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = color;
            light.intensity = intensity;
            light.shadows = LightShadows.None;
        }

        private static void CreatePreviewHead(Transform root, HashSet<Material> materials)
        {
            Shader shader = Shader.Find("Standard");
            if (shader == null || !shader.isSupported)
                throw new InvalidOperationException("The preview mannequin requires a supported Standard shader.");
            Material clay = new Material(shader) { name = "Cover mannequin", hideFlags = HideFlags.HideAndDontSave };
            materials.Add(clay);
            clay.color = new Color(.56f, .60f, .64f);
            clay.SetFloat("_Glossiness", .18f);
            Material detail = new Material(clay) { name = "Cover mannequin details" };
            materials.Add(detail);
            detail.color = new Color(.14f, .17f, .20f);
            AddPreviewPrimitive(root, "Head", PrimitiveType.Sphere, Vector3.zero, new Vector3(.47f, .60f, .43f), clay);
            AddPreviewPrimitive(root, "Neck", PrimitiveType.Capsule, new Vector3(0, -.32f, .05f), new Vector3(.18f, .18f, .18f), clay);
            AddPreviewPrimitive(root, "Shoulders", PrimitiveType.Sphere, new Vector3(0, -.53f, .08f), new Vector3(.78f, .32f, .32f), clay);
            AddPreviewPrimitive(root, "Eye L", PrimitiveType.Sphere, new Vector3(-.09f, .055f, -.205f), new Vector3(.035f, .025f, .023f), detail);
            AddPreviewPrimitive(root, "Eye R", PrimitiveType.Sphere, new Vector3(.09f, .055f, -.205f), new Vector3(.035f, .025f, .023f), detail);
            AddPreviewPrimitive(root, "Nose", PrimitiveType.Sphere, new Vector3(0, -.025f, -.22f), new Vector3(.045f, .075f, .065f), clay);
            AddPreviewPrimitive(root, "Mouth", PrimitiveType.Cube, new Vector3(0, -.13f, -.195f), new Vector3(.07f, .008f, .015f), detail);
        }

        private static void AddPreviewPrimitive(Transform root, string name, PrimitiveType type, Vector3 position, Vector3 scale, Material material)
        {
            GameObject piece = GameObject.CreatePrimitive(type);
            piece.name = name;
            piece.transform.SetParent(root, false);
            piece.transform.localPosition = position;
            piece.transform.localScale = scale;
            Object.DestroyImmediate(piece.GetComponent<Collider>());
            piece.GetComponent<Renderer>().sharedMaterial = material;
        }

        private static void ValidateEffectMeshes(LensEffect effect)
        {
            MeshFilter[] meshes = effect.GetComponentsInChildren<MeshFilter>();
            if (meshes.Length == 0) throw new InvalidOperationException("Actual effect built no preview meshes.");
            foreach (MeshFilter filter in meshes)
            {
                if (filter.sharedMesh == null || filter.sharedMesh.vertexCount == 0)
                    throw new InvalidOperationException("Missing or empty effect mesh: " + filter.name);
                Renderer renderer = filter.GetComponent<Renderer>();
                if (renderer == null || renderer.sharedMaterials.Length == 0)
                    throw new InvalidOperationException("Missing effect renderer/material: " + filter.name);
                foreach (Material material in renderer.sharedMaterials)
                    if (material == null || material.shader == null || !material.shader.isSupported)
                        throw new InvalidOperationException("Unsupported effect shader: " + filter.name);
            }
        }

        private static RenderTexture CreateTarget(int depth)
        {
            var texture = new RenderTexture(Size, Size, depth, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
            {
                name = "CrushX cover bake", hideFlags = HideFlags.HideAndDontSave,
                antiAliasing = 1, useMipMap = false
            };
            if (!texture.Create())
            {
                Object.DestroyImmediate(texture);
                throw new InvalidOperationException("Cannot allocate a cover render target.");
            }
            return texture;
        }

        private static Texture2D Readback(RenderTexture target)
        {
            if (target == null || !target.IsCreated()) throw new InvalidOperationException("Cover render target is unavailable.");
            RenderTexture previous = RenderTexture.active;
            var texture = new Texture2D(Size, Size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0, 0, Size, Size), 0, 0, false);
                texture.Apply(false, false);
                return texture;
            }
            catch { Object.DestroyImmediate(texture); throw; }
            finally { RenderTexture.active = previous; }
        }

        private static void ValidateImage(Texture2D texture, string id)
        {
            Color32[] pixels = texture.GetPixels32();
            Color32 first = pixels[0];
            int visible = 0, varied = 0;
            foreach (Color32 pixel in pixels)
            {
                if (pixel.a > 16) visible++;
                if (Math.Abs(pixel.r - first.r) + Math.Abs(pixel.g - first.g) + Math.Abs(pixel.b - first.b) > 12) varied++;
            }
            if (visible < 128 || varied < 128)
                throw new InvalidOperationException("Cover readback is empty or uniform: " + id);
        }

        private static void ValidateVisibleChange(Texture2D baseline, Texture2D result, string id)
        {
            Color32[] before = baseline.GetPixels32(), after = result.GetPixels32();
            int changed = 0;
            for (int i = 0; i < before.Length; i++)
                if (Math.Abs(before[i].r - after[i].r) + Math.Abs(before[i].g - after[i].g) + Math.Abs(before[i].b - after[i].b) > 12) changed++;
            if (changed < 24) throw new InvalidOperationException("Actual effect produced no visible preview change: " + id);
        }

        private static void ApplyCircularAlpha(Texture2D image)
        {
            Color32[] pixels = image.GetPixels32();
            float center = Size * .5f, radius = center - 1;
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    float dx = x + .5f - center, dy = y + .5f - center;
                    float coverage = Mathf.Clamp01(radius + .5f - Mathf.Sqrt(dx * dx + dy * dy));
                    int i = y * Size + x;
                    Color32 pixel = pixels[i];
                    pixel.a = (byte)Mathf.RoundToInt(pixel.a * coverage);
                    pixels[i] = pixel;
                }
            image.SetPixels32(pixels);
            image.Apply(false, false);
        }

        private static void DisposeTarget(RenderTexture texture)
        {
            if (texture == null) return;
            texture.Release();
            Object.DestroyImmediate(texture);
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath), assetPath);
        }

        private static void EnsureFolder(string assetPath)
        {
            if (AssetDatabase.IsValidFolder(assetPath)) return;
            if (File.Exists(FullPath(assetPath) + ".meta"))
                throw new IOException("Cannot create cover folder over an orphan meta: " + assetPath);
            string parent = Path.GetDirectoryName(assetPath).Replace('\\', '/');
            EnsureFolder(parent);
            string guid = AssetDatabase.CreateFolder(parent, Path.GetFileName(assetPath));
            if (string.IsNullOrEmpty(guid)) throw new IOException("Cannot create cover asset folder: " + assetPath);
        }
    }
}
#endif
