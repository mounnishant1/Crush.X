using System;
using System.IO;
using CrushX.LensEngine.AssetLoading;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class OptionalLocalModelSourceTests
    {
        [Test]
        public void RuntimeComponentSwapCannotForwardFromAnUnverifiedReplacement()
        {
            string directory = Path.Combine(Path.GetTempPath(), "crushx-model-component-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            var root = new GameObject("Model lifecycle control fixture - no inference");
            try
            {
                byte[] fixture = { 8, 0, 0, 0, (byte)'T', (byte)'F', (byte)'L', (byte)'3' };
                File.WriteAllBytes(Path.Combine(directory, "fixture.tflite"), fixture);
                var model = new LocalModelManifest
                {
                    Id = "control-fixture", Version = "1", RelativePath = "fixture.tflite", FileBytes = fixture.Length,
                    Sha256 = VerifiedArtifactLoader.Sha256(fixture), Format = ModelFileFormat.TensorFlowLite,
                    Purpose = ModelPurpose.FaceBlendshapes, RuntimeId = "control", RuntimeVersion = "1",
                    InputContract = "rgb-v1", OutputContract = "coefficients-v1", LicenseId = "unit-test-only",
                    InputWidth = 1, InputHeight = 1, InputChannels = 3
                };
                var registration = new ModelRuntimeRegistration("control", "1", model.Format, model.Purpose,
                    model.InputContract, model.OutputContract, 1, 1, 3, model.InputLayout, model.InputType);
                var approval = new FixedModelApprovalRegistry(new[] { new ModelApproval(model.Id, model.Version, model.Sha256,
                    model.FileBytes, model.Purpose, model.LicenseId, "reviewed-control-fixture-not-a-model") });
                var original = root.AddComponent<LocalModelControlRuntimeTests>(); original.Registration = registration;
                var replacement = root.AddComponent<LocalModelControlRuntimeTests>(); replacement.Registration = registration;
                var source = root.AddComponent<OptionalLocalModelSource>(); source.RuntimeComponent = original;
                Assert.IsTrue(source.TryLoadReviewed(directory, model, approval));
                Assert.IsTrue(source.IsRunning);
                source.RuntimeComponent = replacement;
                Assert.IsFalse(source.TryGetBlendshapes(new FaceIdentity(1, 2), out _));
                Assert.IsFalse(source.IsRunning);
                Assert.AreEqual(1, original.Starts); Assert.GreaterOrEqual(original.Stops, 1);
                Assert.AreEqual(0, replacement.Starts); Assert.AreEqual(0, replacement.Reads);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); Directory.Delete(directory, true); }
        }

        [Test]
        public void MissingReviewedArtBuildsARealInstalledProceduralFallback()
        {
            GameObject created = null;
            try
            {
                Assert.IsTrue(ReviewedResourcesLensLoader.TryCreate("missing-unreviewed-art", "fox", null, null,
                    out created, out bool usedFallback, out string reason));
                Assert.IsTrue(usedFallback);
                Assert.AreEqual("fox", created.GetComponent<LensEffect>().LensId);
                Assert.Greater(created.GetComponentsInChildren<MeshRenderer>().Length, 0);
                Assert.That(reason, Does.Contain("procedural prototype"));
            }
            finally
            {
                if (created != null) UnityEngine.Object.DestroyImmediate(created);
                LensGeometry.ReleaseMaterials();
            }
        }
    }
}
