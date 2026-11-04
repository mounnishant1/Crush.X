using System;
using System.IO;
using System.Text;
using CrushX.LensEngine.Creator;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class CreatorManifestTests
    {
        private string directory;
        private static bool InstalledLens(string id) { return id == "cat-ears"; }
        private static bool InstalledAsset(string reference) { return reference == "procedural:cat-ears" || reference == "Assets/Thumbnail.png"; }
        private static CreatorLensDocument Valid()
        {
            return new CreatorLensDocument { RequiredAssets = new[] { "procedural:cat-ears" } };
        }
        private static CreatorValidationResult Validate(CreatorLensDocument document)
        { return CreatorLensValidation.Validate(document, InstalledLens, InstalledAsset); }

        [SetUp] public void SetUp() { directory = Path.Combine(Path.GetTempPath(), "crushx-creator-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory); }
        [TearDown] public void TearDown() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

        [Test] public void InstalledPreset_WithBoundedParameters_IsLocallyValidButCannotPublish()
        {
            Assert.That(Validate(Valid()).IsValid, Is.True);
            Assert.That(CreatorLensValidation.CanPublish(new string('a', 64), null, out string reason), Is.False);
            Assert.That(reason, Does.Contain("review"));
        }

        [TestCase("../escape")]
        [TestCase("My-Lens")]
        [TestCase("x")]
        [TestCase("https://example.com/code")]
        [TestCase("cat\0ears")]
        [TestCase("my-lens\n")]
        [TestCase("my-lens\r\n")]
        public void UnsafePackageIds_AreRejectedBeforeFilePaths(string id)
        {
            CreatorLensDocument document = Valid(); document.Id = id;
            Assert.That(Validate(document).IsValid, Is.False);
            Assert.That(CreatorDocumentStore.TrySaveRevision(directory, document, _ => "{}", InstalledLens, InstalledAsset, out _, out _, out _), Is.False);
            Assert.That(Directory.GetFiles(directory), Is.Empty);
        }

        [TestCase(0)] [TestCase(2)]
        public void UnknownSchemaVersions_AreNotSilentlyDowngraded(int schema)
        {
            CreatorLensDocument document = Valid(); document.SchemaVersion = schema;
            Assert.That(Validate(document).IsValid, Is.False);
        }

        [TestCase(float.NaN)] [TestCase(float.PositiveInfinity)] [TestCase(-1)] [TestCase(3)]
        public void NonFiniteOrUnboundedTransforms_AreRejected(float scale)
        {
            CreatorLensDocument document = Valid(); document.Parameters.Scale = scale;
            Assert.That(Validate(document).IsValid, Is.False);
        }

        [Test] public void UnknownCodeAssetsAndShaders_AreRejected()
        {
            CreatorLensDocument document = Valid();
            document.BaseLensId = "uninstalled-code";
            document.RequiredAssets = new[] { "Assets/../Escape.dll" };
            document.Shader = "Downloaded/CustomShader";
            Assert.That(Validate(document).Errors.Length, Is.GreaterThanOrEqualTo(3));
        }

        [Test] public void MissingOrDuplicateDependencies_AreRejected()
        {
            CreatorLensDocument document = Valid(); document.RequiredAssets = new[] { "Assets/Missing.prefab" };
            Assert.That(Validate(document).IsValid, Is.False);
            document.RequiredAssets = new[] { "procedural:cat-ears", "procedural:cat-ears" };
            Assert.That(Validate(document).IsValid, Is.False);
            document.ThumbnailReference = "https://example.com/pixel.png";
            Assert.That(Validate(document).IsValid, Is.False);
        }

        [Test] public void UnknownExpressionAndReversedHysteresis_AreRejected()
        {
            CreatorLensDocument document = Valid();
            document.ExpressionRules = new[] { new CreatorExpressionRule { Expression = "EmotionScore", ActivateAbove = .2f, ReleaseBelow = .8f } };
            Assert.That(Validate(document).Errors.Length, Is.GreaterThanOrEqualTo(2));
        }

        [Test] public void Rules_HoldThroughThresholdNoise_AndResetOnUnavailableModelSignal()
        {
            var state = new CreatorRuleState();
            CreatorExpressionRule[] rules = { new CreatorExpressionRule { ActivateAbove = .7f, ReleaseBelow = .4f, ScaleMultiplier = 1.3f } };
            Assert.That(state.Evaluate(rules, _ => .6f), Is.EqualTo(1));
            Assert.That(state.Evaluate(rules, _ => .8f), Is.EqualTo(1.3f));
            Assert.That(state.Evaluate(rules, _ => .5f), Is.EqualTo(1.3f));
            Assert.That(state.Evaluate(rules, _ => null), Is.EqualTo(1));
            Assert.That(state.Evaluate(rules, _ => .5f), Is.EqualTo(1));
            Assert.That(state.Evaluate(rules, _ => float.NaN), Is.EqualTo(1));
        }

        [Test] public void CombinedRules_UseBoundedMaximumInsteadOfCompoundingScale()
        {
            var state = new CreatorRuleState();
            CreatorExpressionRule[] rules = { new CreatorExpressionRule { ScaleMultiplier = 1.5f }, new CreatorExpressionRule { Expression = "Blink", ScaleMultiplier = 1.4f } };
            Assert.That(state.Evaluate(rules, _ => 1), Is.EqualTo(1.5f));
            state.Reset();
            Assert.That(state.Evaluate(rules, _ => .5f), Is.EqualTo(1));
        }

        [Test] public void MaximumLengthId_WithTrailingNewlineIsRejected()
        {
            Assert.That(CreatorLensValidation.ValidId(new string('a', 64)), Is.True);
            Assert.That(CreatorLensValidation.ValidId(new string('a', 64) + "\n"), Is.False);
        }

        [Test] public void InvalidRule_CannotApplyUnboundedScaleEvenThroughDirectEvaluatorUse()
        {
            var state = new CreatorRuleState();
            Assert.That(state.Evaluate(new[] { new CreatorExpressionRule { ScaleMultiplier = float.NaN } }, _ => 1), Is.EqualTo(1));
            Assert.That(state.Evaluate(new[] { new CreatorExpressionRule { ScaleMultiplier = 100 } }, _ => 1), Is.EqualTo(1));
        }

        [Test] public void SaveRevision_DoesNotOverwriteAnExistingRevision_AndHashPinsExactUtf8Bytes()
        {
            CreatorLensDocument document = Valid();
            const string encoded = "{\"DisplayName\":\"Cat 🐈\"}";
            Assert.That(CreatorDocumentStore.TrySaveRevision(directory, document, _ => encoded, InstalledLens, InstalledAsset,
                out string first, out string hash, out string error), Is.True, error);
            Assert.That(File.ReadAllText(first), Is.EqualTo(encoded));
            Assert.That(hash, Is.EqualTo(CreatorDocumentStore.Sha256(Encoding.UTF8.GetBytes(encoded))));
            Assert.That(CreatorDocumentStore.TrySaveRevision(directory, document, _ => "replacement", InstalledLens, InstalledAsset,
                out _, out _, out error), Is.False);
            Assert.That(File.ReadAllText(first), Is.EqualTo(encoded));
            document.Revision++;
            Assert.That(CreatorDocumentStore.TrySaveRevision(directory, document, _ => encoded, InstalledLens, InstalledAsset,
                out string second, out _, out error), Is.True, error);
            Assert.That(first, Is.Not.EqualTo(second));
        }

        [Test] public void UntrustedOrTamperedPackage_NeverInvokesDecoder()
        {
            string path = Path.Combine(directory, "tampered.json"); File.WriteAllText(path, "{}");
            int decodeCalls = 0;
            Func<string, CreatorLensDocument> decode = _ => { decodeCalls++; return Valid(); };
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, null, decode, InstalledLens, InstalledAsset, out _, out _), Is.False);
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, new string('a', 64), decode, InstalledLens, InstalledAsset, out _, out string error), Is.False);
            Assert.That(decodeCalls, Is.Zero); Assert.That(error, Does.Contain("SHA-256"));
        }

        [Test] public void ReviewedBytes_AreValidatedAfterDecode_AndInvalidDocumentIsNotReturned()
        {
            string path = Path.Combine(directory, "reviewed.json"); byte[] bytes = Encoding.UTF8.GetBytes("{\"SchemaVersion\":1}"); File.WriteAllBytes(path, bytes);
            string hash = CreatorDocumentStore.Sha256(bytes); string decoded = null;
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, hash.ToUpperInvariant(), json => { decoded = json; return Valid(); }, InstalledLens, InstalledAsset,
                out CreatorLensDocument valid, out string error), Is.True, error);
            Assert.That(decoded, Is.EqualTo(Encoding.UTF8.GetString(bytes))); Assert.That(valid.Id, Is.EqualTo("my-lens"));
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, hash, _ => new CreatorLensDocument { BaseLensId = "external-code" }, InstalledLens, InstalledAsset,
                out CreatorLensDocument invalid, out _), Is.False);
            Assert.That(invalid, Is.Null);
        }

        [Test] public void OversizedAndInvalidUtf8Files_FailBeforeDecode()
        {
            string path = Path.Combine(directory, "oversized.json"); byte[] bytes = new byte[CreatorLensValidation.MaximumDocumentBytes + 1]; File.WriteAllBytes(path, bytes);
            int calls = 0; Func<string, CreatorLensDocument> decode = _ => { calls++; return Valid(); };
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, CreatorDocumentStore.Sha256(bytes), decode, InstalledLens, InstalledAsset, out _, out _), Is.False);
            bytes = new byte[] { 0xff, 0xff }; File.WriteAllBytes(path, bytes);
            Assert.That(CreatorDocumentStore.TryLoadReviewed(path, CreatorDocumentStore.Sha256(bytes), decode, InstalledLens, InstalledAsset, out _, out _), Is.False);
            Assert.That(calls, Is.Zero);
        }

        [Test] public void FailedSave_RemovesTemporaryFiles_AndDoesNotClaimSavedPath()
        {
            Assert.That(CreatorDocumentStore.TrySaveRevision(directory, Valid(), _ => throw new IOException("test codec failure"), InstalledLens, InstalledAsset,
                out string path, out string hash, out string error), Is.False);
            Assert.That(path, Is.Empty); Assert.That(hash, Is.Empty); Assert.That(error, Does.Contain("codec failure"));
            Assert.That(Directory.GetFiles(directory), Is.Empty);
        }

        private sealed class FailingReview : ICreatorPublishReview
        { public bool HasApprovedReview(string hash, out string receipt) { receipt = null; throw new InvalidOperationException(); } }
        [Test] public void ModerationFailure_LeavesPublishingBlocked()
        {
            Assert.That(CreatorLensValidation.CanPublish(new string('a', 64), new FailingReview(), out string error), Is.False);
            Assert.That(error, Does.Contain("blocked"));
        }
    }
}
