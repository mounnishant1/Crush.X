using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace CrushX.LensEngine.Creator.Editor
{
    public sealed class CreatorLensWindow : EditorWindow
    {
        [Serializable]
        private sealed class ReviewRequest
        {
            public string Status = "PendingReview";
            public string PackageSha256, LensId, BaseLensId, AssetLicense;
            public int Revision;
        }

        [SerializeField] private CreatorLensDocument document;
        [SerializeField] private string expectedHash = "";
        [SerializeField] private string lastSavedHash = "";
        [SerializeField] private string notice = "";
        private string[] baseIds = Array.Empty<string>();
        private Vector2 scroll;
        private PreviewRenderUtility preview;
        private GameObject previewRoot;
        private LensEffect previewEffect;
        private CreatorLensPreset previewPreset;
        private bool previewDirty = true;

        [MenuItem("CrushX/Lens Creator/Local Preset Editor")]
        public static void Open() { GetWindow<CreatorLensWindow>("Crush.X Lens Creator").minSize = new Vector2(440, 680); }

        private void OnEnable()
        {
            baseIds = LensCatalog.All.Where(lens => CreatorLensRuntime.IsInstalledBase(lens.Id)).Select(lens => lens.Id).ToArray();
            if (document == null && baseIds.Length > 0) document = CreatorLensRuntime.FromInstalled(baseIds[0]);
            EditorApplication.update += Tick;
        }
        private void Tick() { if (preview != null) Repaint(); }
        private void OnDisable() { EditorApplication.update -= Tick; ClearPreview(); }

        private void OnGUI()
        {
            if (document == null) { EditorGUILayout.HelpBox("No installed 3D lens parameter adapters are available", MessageType.Warning); return; }
            EditorGUILayout.HelpBox("Local presets over installed 3D prototypes. This editor saves data and renders actual lens geometry. Scene-controlled assets, binary bundles and publishing require separate adapters/review.", MessageType.Info);
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUI.BeginChangeCheck();
            int selected = Mathf.Max(0, Array.IndexOf(baseIds, document.BaseLensId));
            int next = EditorGUILayout.Popup("Installed base", selected, baseIds);
            if (next != selected) { document = CreatorLensRuntime.FromInstalled(baseIds[next]); lastSavedHash = ""; }
            document.Id = EditorGUILayout.TextField("Lens ID", document.Id);
            document.DisplayName = EditorGUILayout.TextField("Display name", document.DisplayName);
            document.Revision = EditorGUILayout.IntField("Revision", document.Revision);
            EditorGUILayout.LabelField("Schema version", document.SchemaVersion.ToString());
            string[] categories = Enum.GetNames(typeof(LensCategory));
            int category = Array.IndexOf(categories, document.Category);
            int selectedCategory = EditorGUILayout.Popup("Category", Mathf.Max(0, category), categories);
            if (category >= 0 || selectedCategory != 0) document.Category = categories[selectedCategory];
            document.Author = EditorGUILayout.TextField("Author", document.Author);
            document.Description = EditorGUILayout.TextField("Description", document.Description);
            document.AssetLicense = EditorGUILayout.TextField("Asset licence / review", document.AssetLicense);
            document.ThumbnailReference = EditorGUILayout.TextField("Installed thumbnail", document.ThumbnailReference);
            string[] shaders = { "Installed", "Standard", "Universal Render Pipeline/Lit", "Unlit/Color", "Universal Render Pipeline/Unlit" };
            int shader = Array.IndexOf(shaders, document.Shader);
            int chosenShader = EditorGUILayout.Popup("Shader", Mathf.Max(0, shader), shaders);
            if (shader >= 0 || chosenShader != 0) document.Shader = shaders[chosenShader];
            if (document.Parameters == null) document.Parameters = new CreatorEffectParameters();
            CreatorEffectParameters p = document.Parameters;
            p.Scale = EditorGUILayout.Slider("Scale", p.Scale, .25f, 2);
            Vector3 offset = EditorGUILayout.Vector3Field("Local offset (asset units)", new Vector3(p.OffsetX, p.OffsetY, p.OffsetZ));
            p.OffsetX = offset.x; p.OffsetY = offset.y; p.OffsetZ = offset.z;
            Vector3 rotation = EditorGUILayout.Vector3Field("Local rotation (degrees)", new Vector3(p.RotationX, p.RotationY, p.RotationZ));
            p.RotationX = rotation.x; p.RotationY = rotation.y; p.RotationZ = rotation.z;
            p.OverrideTint = EditorGUILayout.Toggle("Override tint", p.OverrideTint);
            if (p.OverrideTint)
            {
                Color tint = EditorGUILayout.ColorField("Tint", new Color(p.TintRed, p.TintGreen, p.TintBlue, 1));
                p.TintRed = tint.r; p.TintGreen = tint.g; p.TintBlue = tint.b;
            }
            p.PulseAmplitude = EditorGUILayout.Slider("Pulse amplitude", p.PulseAmplitude, 0, .1f);
            p.PulseHz = EditorGUILayout.Slider("Pulse frequency (Hz)", p.PulseHz, 0, 2);
            DrawRules();
            EditorGUILayout.LabelField("Required installed assets");
            foreach (string reference in document.RequiredAssets ?? Array.Empty<string>()) EditorGUILayout.SelectableLabel(reference, GUILayout.Height(18));
            if (EditorGUI.EndChangeCheck()) previewDirty = true;
            if (GUILayout.Button("Validate and rebuild preview")) { previewDirty = true; notice = ValidateForEditor(); }
            DrawPreview();
            if (GUILayout.Button("Apply to running lens engine"))
            {
                LensEngineBootstrap engine = FindFirstObjectByType<LensEngineBootstrap>();
                notice = !Application.isPlaying ? "Enter Play Mode to apply this preset to the running engine" :
                    CreatorLensRuntime.TryApply(engine, document, out string error) ? "Preset applied; real tracking/expression capabilities remain provider-dependent" : error;
            }
            expectedHash = EditorGUILayout.TextField("Reviewed import SHA-256", expectedHash);
            if (GUILayout.Button("Import reviewed local JSON")) Import();
            if (GUILayout.Button("Save new immutable revision")) Save();
            if (GUILayout.Button("Increment revision")) document.Revision++;
            if (!string.IsNullOrEmpty(lastSavedHash)) EditorGUILayout.SelectableLabel("Saved SHA-256: " + lastSavedHash, EditorStyles.wordWrappedLabel, GUILayout.Height(38));
            if (GUILayout.Button("Export pending review request")) ExportReview();
            EditorGUILayout.HelpBox("Publishing is blocked until an external moderation and licence reviewer approves the exact saved package hash. This window performs no upload or publishing.", MessageType.Warning);
            if (!string.IsNullOrEmpty(notice)) EditorGUILayout.HelpBox(notice, MessageType.Info);
            EditorGUILayout.EndScrollView();
        }

        private void DrawRules()
        {
            document.ExpressionRules = document.ExpressionRules ?? Array.Empty<CreatorExpressionRule>();
            EditorGUILayout.LabelField("Expression rules", EditorStyles.boldLabel);
            string[] signals = { "MouthOpen", "Blink", "BlinkLeft", "BlinkRight", "Smile", "SmileLeft", "SmileRight", "BrowRaise", "BrowRaiseLeft", "BrowRaiseRight" };
            for (int i = 0; i < document.ExpressionRules.Length; i++)
            {
                CreatorExpressionRule rule = document.ExpressionRules[i];
                if (rule == null) { EditorGUILayout.HelpBox("Missing expression rule: remove or repair it in JSON", MessageType.Error); continue; }
                EditorGUILayout.BeginVertical(EditorStyles.helpBox);
                int current = Array.IndexOf(signals, rule.Expression);
                int choice = EditorGUILayout.Popup("Signal", Mathf.Max(0, current), signals);
                if (current >= 0 || choice != 0) rule.Expression = signals[choice];
                rule.ActivateAbove = EditorGUILayout.Slider("Activate above", rule.ActivateAbove, 0, 1);
                rule.ReleaseBelow = EditorGUILayout.Slider("Release below", rule.ReleaseBelow, 0, 1);
                rule.ScaleMultiplier = EditorGUILayout.Slider("Scale multiplier", rule.ScaleMultiplier, 1, 1.5f);
                bool remove = GUILayout.Button("Remove rule");
                EditorGUILayout.EndVertical();
                if (remove) { document.ExpressionRules = document.ExpressionRules.Where((item, index) => index != i).ToArray(); break; }
            }
            if (document.ExpressionRules.Length < CreatorLensValidation.MaximumRules && GUILayout.Button("Add expression rule"))
                document.ExpressionRules = document.ExpressionRules.Concat(new[] { new CreatorExpressionRule() }).ToArray();
            EditorGUILayout.LabelField("Preview supplies no synthetic expression values. Rules remain neutral without model-derived input.", EditorStyles.wordWrappedMiniLabel);
        }

        private string ValidateForEditor()
        {
            CreatorValidationResult validation = CreatorLensRuntime.Validate(document);
            if (!validation.IsValid) return string.Join("\n", validation.Errors);
            foreach (string reference in document.RequiredAssets)
                if (reference.StartsWith("Assets/", StringComparison.Ordinal) && AssetDatabase.LoadMainAssetAtPath(reference) == null) return "Missing installed asset: " + reference;
            if (!string.IsNullOrEmpty(document.ThumbnailReference) && AssetDatabase.LoadMainAssetAtPath(document.ThumbnailReference) == null) return "Thumbnail asset is missing";
            if (!CreatorLensRuntime.TryResolveShader(document.Shader, out _, out string error)) return error;
            return "Valid local preset; artistic quality, licences and Android behavior are not certified";
        }

        private bool IsValidForEditor()
        {
            string result = ValidateForEditor();
            if (!result.StartsWith("Valid local preset", StringComparison.Ordinal)) { notice = result; return false; }
            return true;
        }

        private void DrawPreview()
        {
            Rect rect = GUILayoutUtility.GetRect(200, 220, GUILayout.ExpandWidth(true));
            if (Event.current.type != EventType.Repaint) return;
            if (previewDirty)
            {
                ClearPreview(); previewDirty = false;
                if (!IsValidForEditor()) return;
                try
                {
                    preview = new PreviewRenderUtility();
                    preview.camera.transform.position = new Vector3(0, 0, -2);
                    preview.camera.transform.rotation = Quaternion.identity;
                    preview.camera.nearClipPlane = .01f; preview.camera.farClipPlane = 10; preview.camera.fieldOfView = 40;
                    preview.camera.clearFlags = CameraClearFlags.SolidColor; preview.camera.backgroundColor = new Color(.04f, .05f, .09f);
                    preview.lights[0].intensity = 1.2f; preview.lights[0].transform.rotation = Quaternion.Euler(30, -25, 0);
                    preview.lights[1].intensity = .6f;
                    previewRoot = new GameObject("Creator preview - no camera or tracking input") { hideFlags = HideFlags.HideAndDontSave };
                    preview.AddSingleGO(previewRoot);
                    previewEffect = (LensEffect)previewRoot.AddComponent(LensCatalog.ResolveType(document.BaseLensId));
                    previewEffect.Build();
                    CreatorLensRuntime.TryResolveShader(document.Shader, out Shader shader, out _);
                    previewPreset = previewRoot.AddComponent<CreatorLensPreset>();
                    previewPreset.Configure(null, JsonUtility.FromJson<CreatorLensDocument>(JsonUtility.ToJson(document)), shader);
                }
                catch (Exception exception) { notice = "Preview could not build: " + exception.Message; ClearPreview(); return; }
            }
            if (preview == null) return;
            float time = (float)(EditorApplication.timeSinceStartup % 3600);
            previewEffect.Animate(default, time);
            previewPreset.Apply(time, default);
            preview.BeginPreview(rect, GUIStyle.none);
            preview.Render(true);
            GUI.DrawTexture(rect, preview.EndPreview(), ScaleMode.StretchToFill, false);
        }

        private void ClearPreview()
        {
            if (previewRoot != null) DestroyImmediate(previewRoot);
            previewRoot = null; previewEffect = null; previewPreset = null;
            if (preview != null) preview.Cleanup();
            preview = null;
        }

        private void Save()
        {
            if (!IsValidForEditor()) return;
            string directory = EditorUtility.OpenFolderPanel("Save local lens preset revision", Application.persistentDataPath, "");
            if (string.IsNullOrEmpty(directory)) return;
            if (CreatorDocumentStore.TrySaveRevision(directory, document, doc => JsonUtility.ToJson(doc, true),
                CreatorLensRuntime.IsInstalledBase, CreatorLensRuntime.IsInstalledAsset, out string path, out string sha256, out string error))
            { lastSavedHash = sha256; expectedHash = sha256; notice = "Saved " + path; }
            else notice = error;
        }

        private void Import()
        {
            string path = EditorUtility.OpenFilePanel("Import a reviewed local preset", "", "json");
            if (string.IsNullOrEmpty(path)) return;
            if (CreatorDocumentStore.TryLoadReviewed(path, expectedHash, json => JsonUtility.FromJson<CreatorLensDocument>(json),
                CreatorLensRuntime.IsInstalledBase, CreatorLensRuntime.IsInstalledAsset, out CreatorLensDocument imported, out string error))
            { document = imported; previewDirty = true; lastSavedHash = expectedHash.ToLowerInvariant(); notice = "Imported reviewed data-only preset"; }
            else notice = error;
        }

        private void ExportReview()
        {
            string actual = CreatorDocumentStore.Sha256(Encoding.UTF8.GetBytes(JsonUtility.ToJson(document, true)));
            if (!IsValidForEditor() || actual != lastSavedHash) { notice = "Save this exact revision before requesting review"; return; }
            string path = EditorUtility.SaveFilePanel("Export pending moderation/licence request", "", document.Id + ".review.json", "json");
            if (string.IsNullOrEmpty(path)) return;
            try
            {
                var request = new ReviewRequest { PackageSha256 = actual, LensId = document.Id, BaseLensId = document.BaseLensId, Revision = document.Revision, AssetLicense = document.AssetLicense };
                File.WriteAllText(path, JsonUtility.ToJson(request, true), new UTF8Encoding(false));
                notice = "Pending review request saved locally; no publication or upload occurred";
            }
            catch (Exception exception) { notice = "Could not save review request: " + exception.Message; }
        }
    }
}
