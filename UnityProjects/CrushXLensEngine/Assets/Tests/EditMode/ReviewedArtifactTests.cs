using System;
using System.IO;
using NUnit.Framework;
using CrushX.LensEngine.AssetLoading;

namespace CrushX.LensEngine.Tests
{
    /// <summary>Real file/trust/lifecycle tests. Header fixtures and a control runtime do not perform inference.</summary>
    public sealed class ReviewedArtifactTests
    {
        private string root;
        private byte[] header;
        private LocalModelManifest manifest;
        private ModelRuntimeRegistration registration;

        [SetUp] public void Setup()
        {
            root = Path.Combine(Path.GetTempPath(), "crushx-artifact-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            // FlatBuffer identifier fixture only; it is deliberately not a trained TFLite graph.
            header = new byte[] { 8, 0, 0, 0, (byte)'T', (byte)'F', (byte)'L', (byte)'3', 1, 2, 3, 4 };
            File.WriteAllBytes(Path.Combine(root, "fixture.tflite"), header);
            manifest = new LocalModelManifest
            {
                Id = "face-fixture", Version = "1.0", RelativePath = "fixture.tflite", FileBytes = header.Length,
                Sha256 = VerifiedArtifactLoader.Sha256(header), Format = ModelFileFormat.TensorFlowLite,
                Purpose = ModelPurpose.FaceBlendshapes, RuntimeId = "test-control", RuntimeVersion = "1.0",
                InputContract = "viewport-rgb-v1", OutputContract = "face-coefficients-v1", LicenseId = "unit-test-only",
                InputWidth = 192, InputHeight = 192, InputChannels = 3,
                InputLayout = ModelInputLayout.Hwc, InputType = ModelInputType.Float32
            };
            registration = Runtime(manifest);
        }
        [TearDown] public void Cleanup() { if (Directory.Exists(root)) Directory.Delete(root, true); }
        private static ModelRuntimeRegistration Runtime(LocalModelManifest m) => new ModelRuntimeRegistration(m.RuntimeId, m.RuntimeVersion,
            m.Format, m.Purpose, m.InputContract, m.OutputContract, m.InputWidth, m.InputHeight, m.InputChannels, m.InputLayout, m.InputType);
        private IModelApprovalRegistry Approvals(LocalModelManifest m = null)
        {
            m = m ?? manifest;
            return new FixedModelApprovalRegistry(new[] { new ModelApproval(m.Id, m.Version, m.Sha256, m.FileBytes,
                m.Purpose, m.LicenseId, "reviewed-test-fixture-not-a-model") });
        }
        private bool Load(IModelApprovalRegistry approvals, out VerifiedModelArtifact loaded, out ModelLoadStatus status) =>
            VerifiedArtifactLoader.TryLoad(root, manifest, approvals, registration, out loaded, out status, out _);

        [Test] public void VerifiedBytesAreSnapshotBoundAndLeaseDisposalIsIdempotent()
        {
            Assert.IsTrue(Load(Approvals(), out VerifiedModelArtifact lease, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.Verified, status);
            CollectionAssert.AreEqual(header, lease.Bytes.ToArray());
            manifest.Id = "changed";
            Assert.AreEqual("face-fixture", lease.Manifest.Id);
            LocalModelManifest copy = lease.Manifest; copy.RuntimeId = "changed";
            Assert.AreEqual("test-control", lease.Manifest.RuntimeId);
            lease.Dispose(); lease.Dispose();
            Assert.Throws<ObjectDisposedException>(() => { var ignored = lease.Bytes; });
        }

        [Test] public void SelfClaimedLicenceCannotReplaceIndependentApproval()
        {
            IModelApprovalRegistry approval = Approvals();
            manifest.LicenseId = "Apache-2.0-approved";
            Assert.IsFalse(Load(approval, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.Unapproved, status);
            Assert.IsFalse(Load(null, out _, out status));
            Assert.AreEqual(ModelLoadStatus.Unapproved, status);
        }

        [Test] public void RegistryRequiresReviewedReceiptAndExactHash()
        {
            Assert.Throws<ArgumentException>(() => new FixedModelApprovalRegistry(new[] { new ModelApproval("x", "1", manifest.Sha256,
                manifest.FileBytes, manifest.Purpose, "MIT", "") }));
            Assert.Throws<ArgumentException>(() => new FixedModelApprovalRegistry(new[] { new ModelApproval("x", "1", "bad",
                manifest.FileBytes, manifest.Purpose, "MIT", "receipt") }));
        }

        [Test] public void RuntimeTensorAndOutputContractsMustMatchExactly()
        {
            IModelApprovalRegistry approval = Approvals();
            manifest.InputWidth = 256;
            Assert.IsFalse(Load(approval, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.IncompatibleRuntime, status);
            manifest.InputWidth = 192; manifest.OutputContract = "unsupported-output";
            Assert.IsFalse(Load(approval, out _, out status));
            Assert.AreEqual(ModelLoadStatus.IncompatibleRuntime, status);
            manifest.OutputContract = "face-coefficients-v1"; manifest.RuntimeVersion = "2.0";
            Assert.IsFalse(Load(approval, out _, out status));
            Assert.AreEqual(ModelLoadStatus.IncompatibleRuntime, status);
        }

        [Test] public void ApprovalPurposeCannotBeRepurposedByManifest()
        {
            IModelApprovalRegistry approval = Approvals();
            manifest.Purpose = ModelPurpose.HandLandmarks;
            registration = Runtime(manifest);
            Assert.IsFalse(Load(approval, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.Unapproved, status);
        }

        [Test] public void TamperedBytesAreRejectedBeforeRuntimeUse()
        {
            IModelApprovalRegistry approval = Approvals();
            header[11] = 99; File.WriteAllBytes(Path.Combine(root, manifest.RelativePath), header);
            Assert.IsFalse(Load(approval, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.RejectedFile, status);
        }

        [Test] public void MissingFilesAndLengthChangesStayUnavailable()
        {
            IModelApprovalRegistry approval = Approvals();
            File.WriteAllBytes(Path.Combine(root, manifest.RelativePath), new byte[8]);
            Assert.IsFalse(Load(approval, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.RejectedFile, status);
            File.Delete(Path.Combine(root, manifest.RelativePath));
            Assert.IsFalse(Load(approval, out _, out status));
            Assert.AreEqual(ModelLoadStatus.MissingFile, status);
        }

        [TestCase("../fixture.tflite")]
        [TestCase("/fixture.tflite")]
        [TestCase("nested//fixture.tflite")]
        [TestCase("nested/./fixture.tflite")]
        [TestCase("C:/fixture.tflite")]
        [TestCase("nested\\fixture.tflite")]
        public void UnsafeModelPathsAreRejected(string path)
        {
            manifest.RelativePath = path;
            Assert.IsFalse(Load(Approvals(), out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.InvalidManifest, status);
        }

        [Test] public void OversizedFilesAndUnknownSchemasAreRejectedWithoutReading()
        {
            manifest.FileBytes = ArtifactPolicy.MaximumModelBytes + 1;
            Assert.IsFalse(Load(null, out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.InvalidManifest, status);
            manifest.FileBytes = header.Length; manifest.SchemaVersion = 2;
            Assert.IsFalse(Load(Approvals(), out _, out status));
            Assert.AreEqual(ModelLoadStatus.InvalidManifest, status);
        }

        [Test] public void WrongTfliteIdentifierDoesNotPassEvenWithAFileHashApproval()
        {
            header[4] = 0; File.WriteAllBytes(Path.Combine(root, manifest.RelativePath), header);
            manifest.Sha256 = VerifiedArtifactLoader.Sha256(header);
            Assert.IsFalse(Load(Approvals(), out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.RejectedFile, status);
        }

        [Test] public void VerificationAloneCannotStartAReadinessState()
        {
            using (var session = new LocalModelSession())
            {
                Assert.IsFalse(session.TryStart(root, manifest, Approvals(), null));
                Assert.IsFalse(session.IsReady);
                Assert.AreEqual(LocalModelState.Failed, session.State);
                var runtime = new ControlRuntime(registration) { StartResult = true, RunningAfterStart = false };
                Assert.IsFalse(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.IsTrue(runtime.Stopped); Assert.IsFalse(session.IsReady);
            }
        }

        [Test] public void RuntimeGraphRejectionStopsAndDisposesVerifiedBytes()
        {
            var runtime = new ControlRuntime(registration) { StartResult = false };
            using (var session = new LocalModelSession())
            {
                Assert.IsFalse(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.IsTrue(runtime.Stopped); Assert.IsFalse(session.IsReady); Assert.IsEmpty(session.ModelId);
            }
            CollectionAssert.AreEqual(new byte[header.Length], runtime.BorrowedBytes.ToArray());
        }

        [Test] public void RunningControlRuntimeRequiresLivenessAndStopsBeforeLeaseRelease()
        {
            var runtime = new ControlRuntime(registration) { StartResult = true, RunningAfterStart = true };
            using (var session = new LocalModelSession())
            {
                Assert.IsTrue(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.IsTrue(session.IsReady); Assert.AreEqual(manifest.Id, session.ModelId);
                runtime.RunningAfterStart = false;
                Assert.IsFalse(session.IsReady); Assert.IsTrue(runtime.Stopped); Assert.AreEqual(LocalModelState.Failed, session.State);
            }
            CollectionAssert.AreEqual(new byte[header.Length], runtime.BorrowedBytes.ToArray());
        }

        [Test] public void RuntimeExceptionsDoNotLeaveLoadingOrRunningStates()
        {
            var runtime = new ControlRuntime(registration) { ThrowOnStart = true, ThrowOnStop = true };
            using (var session = new LocalModelSession())
            {
                Assert.IsFalse(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.AreEqual(LocalModelState.Failed, session.State); Assert.IsFalse(session.IsReady);
                Assert.DoesNotThrow(session.Stop); Assert.DoesNotThrow(session.Stop);
            }
        }

        [Test] public void FailedNativeTeardownRetainsBytesAndBlocksRestartUntilConfirmedStopped()
        {
            var runtime = new ControlRuntime(registration) { StartResult = true, RunningAfterStart = true };
            using (var session = new LocalModelSession())
            {
                Assert.IsTrue(session.TryStart(root, manifest, Approvals(), runtime));
                runtime.ThrowOnStop = true;
                Assert.IsFalse(session.TryStop());
                Assert.IsTrue(session.HasPendingTeardown); Assert.IsFalse(session.IsReady);
                CollectionAssert.AreEqual(header, runtime.BorrowedBytes.ToArray(), "Potentially borrowed native bytes must not be cleared");
                Assert.IsFalse(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.AreEqual(1, runtime.Starts);
                using (var replacement = new LocalModelSession())
                {
                    Assert.IsFalse(replacement.TryStart(root, manifest, Approvals(), runtime));
                    Assert.AreEqual(1, runtime.Starts);
                }
                runtime.ThrowOnStop = false;
                Assert.IsTrue(session.TryStop()); Assert.IsFalse(session.HasPendingTeardown);
                CollectionAssert.AreEqual(new byte[header.Length], runtime.BorrowedBytes.ToArray());
                Assert.IsTrue(session.TryStart(root, manifest, Approvals(), runtime));
                Assert.AreEqual(2, runtime.Starts);
            }
        }

        [Test] public void FailedStopCanReleaseBytesOnlyWhenRuntimeConfirmsItIsNoLongerRunning()
        {
            var runtime = new ControlRuntime(registration) { StartResult = true, RunningAfterStart = true };
            using (var session = new LocalModelSession())
            {
                Assert.IsTrue(session.TryStart(root, manifest, Approvals(), runtime));
                runtime.ThrowOnStop = true; runtime.RunningAfterStart = false;
                Assert.IsTrue(session.TryStop()); Assert.IsFalse(session.HasPendingTeardown);
                CollectionAssert.AreEqual(new byte[header.Length], runtime.BorrowedBytes.ToArray());
            }
        }

        [Test] public void ApprovalRegistryExceptionIsARejectedLoadWithoutFileAccess()
        {
            Assert.IsFalse(Load(new ThrowingRegistry(), out _, out ModelLoadStatus status));
            Assert.AreEqual(ModelLoadStatus.Unapproved, status);
        }

        [Test] public void ConcurrentModelSessionsHaveABoundedAdmissionLimit()
        {
            var sessions = new LocalModelSession[LocalModelSession.MaximumConcurrentSessions + 1];
            try
            {
                for (int i = 0; i < sessions.Length; i++)
                {
                    sessions[i] = new LocalModelSession();
                    var runtime = new ControlRuntime(registration) { StartResult = true, RunningAfterStart = true };
                    Assert.AreEqual(i < LocalModelSession.MaximumConcurrentSessions,
                        sessions[i].TryStart(root, manifest, Approvals(), runtime));
                }
            }
            finally { foreach (LocalModelSession session in sessions) session?.Dispose(); }
        }

        [Test] public void ResourceRegistrationsCannotComeFromRemoteOrUnreviewedPaths()
        {
            Assert.Throws<ArgumentException>(() => Resource("https://example/model", "receipt"));
            Assert.Throws<ArgumentException>(() => Resource("CrushXLenses/cat-ears", ""));
            Assert.Throws<ArgumentException>(() => Resource("../CrushXLenses/cat-ears", "receipt"));
            var registered = Resource("CrushXLenses/cat-ears", "reviewed-host-receipt");
            var registry = new ReviewedResourceRegistry(new[] { registered });
            Assert.IsTrue(registry.TryGet("cat-art", out ReviewedResourceRegistration found));
            Assert.AreSame(registered, found); Assert.IsTrue(found.AllowsComponent("UnityEngine.MeshRenderer"));
            Assert.IsFalse(found.AllowsComponent("Unknown.UploadScript")); Assert.IsFalse(found.AllowsShader("Unknown/Shader"));
            Assert.IsFalse(registry.TryGet("unreviewed-fox", out _));
        }

        private static ReviewedResourceRegistration Resource(string path, string receipt) => new ReviewedResourceRegistration("cat-art", path,
            "unit-test-only", receipt, new[] { "UnityEngine.Transform", "UnityEngine.MeshRenderer" }, new[] { "Standard" });

        // A lifecycle control double only: it never returns landmarks, masks or predictions.
        private sealed class ControlRuntime : ILocalModelRuntime
        {
            public ModelRuntimeRegistration Registration { get; }
            public bool StartResult, RunningAfterStart, Stopped, ThrowOnStart, ThrowOnStop;
            public ReadOnlyMemory<byte> BorrowedBytes;
            private bool started;
            public int Starts;
            public bool IsRunning => started && RunningAfterStart && !Stopped;
            public ControlRuntime(ModelRuntimeRegistration registration) { Registration = registration; }
            public bool TryStart(LocalModelManifest model, ReadOnlyMemory<byte> verifiedBytes, out string error)
            { Starts++; started = true; Stopped = false; BorrowedBytes = verifiedBytes; error = "graph rejected"; if (ThrowOnStart) throw new InvalidOperationException(); return StartResult; }
            public void Stop() { if (ThrowOnStop) throw new InvalidOperationException(); Stopped = true; }
        }
        private sealed class ThrowingRegistry : IModelApprovalRegistry
        {
            public bool TryGet(string id, string version, out ModelApproval approval) { approval = null; throw new InvalidOperationException(); }
        }
    }
}
