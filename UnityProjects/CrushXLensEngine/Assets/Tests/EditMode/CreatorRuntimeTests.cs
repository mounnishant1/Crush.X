using CrushX.LensEngine.Creator;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class CreatorRuntimeTests
    {
        [Test]
        public void JsonRoundTrip_PreservesRulesParametersAndDependencies()
        {
            CreatorLensDocument original = CreatorLensRuntime.FromInstalled("cat-ears");
            original.Parameters.Scale = 1.25f;
            original.Parameters.PulseAmplitude = .05f;
            original.ExpressionRules = new[] { new CreatorExpressionRule { Expression = "Blink", ScaleMultiplier = 1.3f } };
            CreatorLensDocument copy = JsonUtility.FromJson<CreatorLensDocument>(JsonUtility.ToJson(original));
            Assert.That(CreatorLensRuntime.Validate(copy).IsValid, Is.True);
            Assert.That(copy.Parameters.Scale, Is.EqualTo(1.25f));
            Assert.That(copy.RequiredAssets, Is.EqualTo(original.RequiredAssets));
            Assert.That(copy.ExpressionRules[0].Expression, Is.EqualTo("Blink"));
        }

        [Test]
        public void InstalledPresets_KeepCatalogueDefinitionsAndRejectUnsupportedSceneAdapter()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
                if (!CreatorLensRuntime.IsInstalledBase(lens.Id)) continue;
                CreatorLensDocument preset = CreatorLensRuntime.FromInstalled(lens.Id);
                Assert.That(CreatorLensRuntime.Validate(preset).IsValid, Is.True, lens.Id);
                preset.RequiredAssets = new string[0];
                Assert.That(CreatorLensRuntime.Validate(preset).IsValid, Is.False, "Base asset dependency must be declared");
            }
            Assert.That(CreatorLensRuntime.IsInstalledBase("fox-mask-3d"), Is.False);
        }

        [Test]
        public void AppliedPreset_UsesAvailableExpressionsAndRestoresOriginalTransformAndTint()
        {
            var root = GameObject.CreatePrimitive(PrimitiveType.Cube);
            root.transform.localPosition = new Vector3(.1f, .2f, 0);
            Vector3 original = root.transform.localPosition;
            CreatorLensDocument document = CreatorLensRuntime.FromInstalled("cat-ears");
            document.Parameters.Scale = 1.2f; document.Parameters.OffsetX = .1f;
            document.Parameters.OverrideTint = true; document.Parameters.TintRed = .25f;
            document.ExpressionRules = new[] { new CreatorExpressionRule { ScaleMultiplier = 1.5f } };
            try
            {
                CreatorLensPreset preset = root.AddComponent<CreatorLensPreset>();
                preset.Configure(null, document, null);
                Assert.AreEqual(document.Id, preset.PresetId);
                Assert.AreEqual(document.Revision, preset.PresetRevision);
                Assert.IsTrue(CreatorDocumentStore.IsSha256(preset.ConfigurationSha256));
                preset.Apply(0, default);
                Assert.That(root.transform.localScale.x, Is.EqualTo(1.2f).Within(.0001f));
                var block = new MaterialPropertyBlock(); root.GetComponent<Renderer>().GetPropertyBlock(block);
                Assert.That(block.GetColor("_Color").r, Is.EqualTo(.25f).Within(.0001f));
                preset.Apply(0, new FaceExpressionSample { Available = FaceExpressionChannels.MouthOpen, MouthOpen = .9f });
                Assert.That(root.transform.localScale.x, Is.EqualTo(1.8f).Within(.0001f));
                preset.Apply(0, default);
                Assert.That(root.transform.localScale.x, Is.EqualTo(1.2f).Within(.0001f));
                preset.Clear();
                Assert.IsEmpty(preset.PresetId);
                Assert.IsEmpty(preset.ConfigurationSha256);
                Assert.That(root.transform.localPosition, Is.EqualTo(original));
                Assert.That(root.transform.localScale, Is.EqualTo(Vector3.one));
                root.GetComponent<Renderer>().GetPropertyBlock(block);
                Assert.That(block.isEmpty, Is.True);
            }
            finally { Object.DestroyImmediate(root); }
        }
    }
}
