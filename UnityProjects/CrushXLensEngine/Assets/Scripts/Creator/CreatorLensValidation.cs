using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace CrushX.LensEngine.Creator
{
    public static class CreatorLensValidation
    {
        public const int MaximumDocumentBytes = 65536;
        public const int MaximumRules = 8;
        private static readonly Regex IdPattern = new Regex("\\A[a-z0-9][a-z0-9-]{1,63}\\z", RegexOptions.CultureInvariant);
        private static readonly HashSet<string> Categories = new HashSet<string>(StringComparer.Ordinal)
        { "Animals", "Beauty", "SciFi", "Fantasy", "Funny", "Aesthetic", "Gaming", "Anime", "Masks", "Cinematic", "Creative" };
        private static readonly HashSet<string> Shaders = new HashSet<string>(StringComparer.Ordinal)
        { "Installed", "Standard", "Universal Render Pipeline/Lit", "Unlit/Color", "Universal Render Pipeline/Unlit" };
        private static readonly HashSet<string> Expressions = new HashSet<string>(StringComparer.Ordinal)
        { "MouthOpen", "Blink", "BlinkLeft", "BlinkRight", "Smile", "SmileLeft", "SmileRight", "BrowRaise", "BrowRaiseLeft", "BrowRaiseRight" };

        public static bool ValidId(string value) { return value != null && IdPattern.IsMatch(value); }
        public static bool IsAllowedShader(string value) { return value != null && Shaders.Contains(value); }
        public static bool IsAllowedExpression(string value) { return value != null && Expressions.Contains(value); }

        public static CreatorValidationResult Validate(CreatorLensDocument document,
            Func<string, bool> installedLens, Func<string, bool> installedAsset)
        {
            var errors = new List<string>();
            if (document == null) return new CreatorValidationResult(new[] { "Lens document is missing" });
            if (document.SchemaVersion != 1) errors.Add("Only schema version 1 is supported");
            if (document.Revision < 1 || document.Revision > 1000000) errors.Add("Revision must be between 1 and 1000000");
            if (!ValidId(document.Id)) errors.Add("ID must contain 2–64 lower-case letters, numbers or hyphens");
            Text(document.DisplayName, "Display name", 80, false, errors);
            Text(document.Author, "Author", 100, true, errors);
            Text(document.Description, "Description", 2048, true, errors);
            Text(document.AssetLicense, "Asset licence", 200, false, errors);
            if (!Categories.Contains(document.Category ?? "")) errors.Add("Unknown lens category");
            if (!ValidId(document.BaseLensId) || installedLens == null || !installedLens(document.BaseLensId))
                errors.Add("Base lens must be an installed catalogue effect");
            if (!IsAllowedShader(document.Shader)) errors.Add("Shader is not allowlisted");
            if (!string.IsNullOrEmpty(document.ThumbnailReference) && !Asset(document.ThumbnailReference, installedAsset))
                errors.Add("Thumbnail is not an installed, allowlisted asset");
            if (document.RequiredAssets == null || document.RequiredAssets.Length > 16) errors.Add("Required assets must contain at most 16 installed references");
            else
            {
                var unique = new HashSet<string>(StringComparer.Ordinal);
                foreach (string asset in document.RequiredAssets)
                    if (!Asset(asset, installedAsset) || !unique.Add(asset)) errors.Add("Missing, unsafe or duplicate asset reference");
            }
            CreatorEffectParameters p = document.Parameters;
            if (p == null) errors.Add("Effect parameters are missing");
            else
            {
                Range(p.Scale, .25f, 2, "Scale", errors);
                Range(p.OffsetX, -.3f, .3f, "Offset X", errors); Range(p.OffsetY, -.3f, .3f, "Offset Y", errors); Range(p.OffsetZ, -.3f, .3f, "Offset Z", errors);
                Range(p.RotationX, -45, 45, "Rotation X", errors); Range(p.RotationY, -45, 45, "Rotation Y", errors); Range(p.RotationZ, -45, 45, "Rotation Z", errors);
                Range(p.TintRed, 0, 1, "Tint red", errors); Range(p.TintGreen, 0, 1, "Tint green", errors); Range(p.TintBlue, 0, 1, "Tint blue", errors);
                Range(p.PulseAmplitude, 0, .1f, "Pulse amplitude", errors); Range(p.PulseHz, 0, 2, "Pulse frequency", errors);
            }
            if (document.ExpressionRules == null || document.ExpressionRules.Length > MaximumRules) errors.Add("At most 8 expression rules are supported");
            else
            {
                var expressions = new HashSet<string>(StringComparer.Ordinal);
                foreach (CreatorExpressionRule rule in document.ExpressionRules)
                {
                    if (rule == null) { errors.Add("Expression rule is missing"); continue; }
                    if (!IsAllowedExpression(rule.Expression) || !expressions.Add(rule.Expression)) errors.Add("Unknown or duplicate expression rule");
                    Range(rule.ActivateAbove, 0, 1, "Expression activation", errors);
                    Range(rule.ReleaseBelow, 0, 1, "Expression release", errors);
                    if (rule.ReleaseBelow >= rule.ActivateAbove) errors.Add("Expression release must be below activation");
                    Range(rule.ScaleMultiplier, 1, 1.5f, "Expression scale multiplier", errors);
                }
            }
            return new CreatorValidationResult(errors.ToArray());
        }

        public static bool CanPublish(string sha256, ICreatorPublishReview review, out string reason)
        {
            reason = "Publishing requires a moderation and asset-licence review of this exact package";
            if (!CreatorDocumentStore.IsSha256(sha256) || review == null) return false;
            try
            {
                if (!review.HasApprovedReview(sha256.ToLowerInvariant(), out string receipt) || string.IsNullOrWhiteSpace(receipt)) return false;
                reason = "Reviewed package receipt: " + receipt;
                return true;
            }
            catch { reason = "Review provider failed; publishing remains blocked"; return false; }
        }

        private static bool Asset(string reference, Func<string, bool> installedAsset)
        {
            if (string.IsNullOrEmpty(reference) || reference.Length > 240 || reference.IndexOf('\\') >= 0 ||
                reference.IndexOf("..", StringComparison.Ordinal) >= 0 || reference.IndexOf('\0') >= 0) return false;
            if (!reference.StartsWith("Assets/", StringComparison.Ordinal) && !reference.StartsWith("procedural:", StringComparison.Ordinal)) return false;
            return installedAsset != null && installedAsset(reference);
        }

        private static void Text(string value, string name, int maximum, bool emptyAllowed, List<string> errors)
        {
            if (value == null || value.Length > maximum || (!emptyAllowed && string.IsNullOrWhiteSpace(value))) { errors.Add(name + " is missing or too long"); return; }
            foreach (char c in value) if (char.IsControl(c) && c != '\n' && c != '\r' && c != '\t') { errors.Add(name + " contains control characters"); break; }
        }
        private static void Range(float value, float minimum, float maximum, string name, List<string> errors)
        {
            if (float.IsNaN(value) || float.IsInfinity(value) || value < minimum || value > maximum) errors.Add(name + " is outside its supported range");
        }
    }

    public sealed class CreatorRuleState
    {
        private readonly bool[] active = new bool[CreatorLensValidation.MaximumRules];
        public void Reset() { Array.Clear(active, 0, active.Length); }
        public float Evaluate(CreatorExpressionRule[] rules, Func<string, float?> readAvailableExpression)
        {
            if (rules == null || rules.Length > active.Length || readAvailableExpression == null) { Reset(); return 1; }
            float multiplier = 1;
            for (int i = 0; i < rules.Length; i++)
            {
                CreatorExpressionRule rule = rules[i];
                if (rule == null || !CreatorLensValidation.IsAllowedExpression(rule.Expression) ||
                    float.IsNaN(rule.ActivateAbove) || float.IsNaN(rule.ReleaseBelow) || float.IsNaN(rule.ScaleMultiplier) ||
                    rule.ActivateAbove > 1 || rule.ActivateAbove <= 0 || rule.ReleaseBelow < 0 || rule.ReleaseBelow >= rule.ActivateAbove ||
                    rule.ScaleMultiplier < 1 || rule.ScaleMultiplier > 1.5f)
                { active[i] = false; continue; }
                float? sample = readAvailableExpression(rule.Expression);
                if (!sample.HasValue || float.IsNaN(sample.Value) || float.IsInfinity(sample.Value) || sample < 0 || sample > 1) active[i] = false;
                else if (active[i]) active[i] = sample.Value > rule.ReleaseBelow;
                else active[i] = sample.Value >= rule.ActivateAbove;
                if (active[i]) multiplier = Math.Max(multiplier, rule.ScaleMultiplier);
            }
            return multiplier;
        }
    }
}
