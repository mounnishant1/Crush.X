using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine.Creator
{
    /// <summary>Applies a validated preset after the engine has positioned/scaled the tracked parent.</summary>
    [DefaultExecutionOrder(200)]
    public sealed class CreatorLensPreset : MonoBehaviour
    {
        private LensEngineBootstrap engine;
        private CreatorLensDocument document;
        private readonly CreatorRuleState ruleState = new CreatorRuleState();
        private Func<string, float?> readExpression;
        private FaceExpressionSample expressions;
        private Vector3 originalPosition, originalScale;
        private Quaternion originalRotation;
        private Renderer[] renderers = Array.Empty<Renderer>();
        private Material[][] originalMaterials = Array.Empty<Material[]>();
        private MaterialPropertyBlock[] originalBlocks = Array.Empty<MaterialPropertyBlock>();
        private readonly List<Material> ownedMaterials = new List<Material>();
        private MaterialPropertyBlock tintBlock;
        private bool configured;
        public string PresetId => configured ? document.Id : string.Empty;
        public int PresetRevision => configured ? document.Revision : 0;
        public string ConfigurationSha256 { get; private set; } = string.Empty;

        public void Configure(LensEngineBootstrap source, CreatorLensDocument preset, Shader shader)
        {
            CreatorValidationResult validation = CreatorLensRuntime.Validate(preset);
            if (!validation.IsValid) throw new ArgumentException(string.Join("; ", validation.Errors));
            CreatorLensDocument copy = JsonUtility.FromJson<CreatorLensDocument>(JsonUtility.ToJson(preset));
            Clear();
            engine = source; document = copy;
            ConfigurationSha256 = CreatorDocumentStore.Sha256(System.Text.Encoding.UTF8.GetBytes(JsonUtility.ToJson(copy)));
            originalPosition = transform.localPosition; originalRotation = transform.localRotation; originalScale = transform.localScale;
            configured = true;
            readExpression = ReadExpression;
            renderers = GetComponentsInChildren<Renderer>(true);
            originalMaterials = new Material[renderers.Length][];
            originalBlocks = new MaterialPropertyBlock[renderers.Length];
            tintBlock = new MaterialPropertyBlock();
            for (int i = 0; i < renderers.Length; i++)
            {
                originalMaterials[i] = renderers[i].sharedMaterials;
                originalBlocks[i] = new MaterialPropertyBlock();
                renderers[i].GetPropertyBlock(originalBlocks[i]);
                if (shader == null) continue;
                Material[] changed = new Material[originalMaterials[i].Length];
                for (int m = 0; m < changed.Length; m++)
                {
                    Material original = originalMaterials[i][m];
                    if (original == null) continue;
                    var material = new Material(original) { shader = shader, hideFlags = HideFlags.DontSave };
                    ownedMaterials.Add(material); changed[m] = material;
                }
                renderers[i].sharedMaterials = changed;
            }
            Apply(0, default);
        }

        private float? ReadExpression(string name)
        {
            if (Enum.TryParse(name, false, out ExpressionSignal signal) && expressions.TryGet(signal, out float value)) return value;
            return null;
        }

        private void LateUpdate()
        {
            if (!configured || engine == null) return;
            if (engine.ActiveLensTransform != transform) { Clear(); return; }
            FaceSample face = engine.CurrentFace;
            Apply(Time.unscaledTime, face.Valid ? face.Expressions : default);
        }

        public void Apply(float elapsedSeconds, FaceExpressionSample availableExpressions)
        {
            if (!configured) return;
            if (float.IsNaN(elapsedSeconds) || float.IsInfinity(elapsedSeconds)) elapsedSeconds = 0;
            expressions = availableExpressions;
            CreatorEffectParameters p = document.Parameters;
            float expressionScale = ruleState.Evaluate(document.ExpressionRules, readExpression);
            float pulse = 1 + p.PulseAmplitude * Mathf.Sin(elapsedSeconds * p.PulseHz * Mathf.PI * 2);
            transform.localPosition = originalPosition + new Vector3(p.OffsetX, p.OffsetY, p.OffsetZ);
            transform.localRotation = originalRotation * Quaternion.Euler(p.RotationX, p.RotationY, p.RotationZ);
            transform.localScale = originalScale * (p.Scale * expressionScale * pulse);
            if (!p.OverrideTint) return;
            Color tint = new Color(p.TintRed, p.TintGreen, p.TintBlue, 1);
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null) continue;
                renderers[i].GetPropertyBlock(tintBlock);
                tintBlock.SetColor("_BaseColor", tint); tintBlock.SetColor("_Color", tint);
                renderers[i].SetPropertyBlock(tintBlock);
            }
        }

        public void Clear()
        {
            if (!configured) return;
            transform.localPosition = originalPosition; transform.localRotation = originalRotation; transform.localScale = originalScale;
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null) continue;
                if (i < originalMaterials.Length && originalMaterials[i] != null) renderers[i].sharedMaterials = originalMaterials[i];
                if (i < originalBlocks.Length) renderers[i].SetPropertyBlock(originalBlocks[i]);
            }
            foreach (Material material in ownedMaterials)
                if (material != null) { if (Application.isPlaying) Destroy(material); else DestroyImmediate(material); }
            ownedMaterials.Clear(); ruleState.Reset(); configured = false; document = null; ConfigurationSha256 = string.Empty;
        }
        private void OnDisable() { ruleState.Reset(); }
        private void OnDestroy() { Clear(); }
    }
}
