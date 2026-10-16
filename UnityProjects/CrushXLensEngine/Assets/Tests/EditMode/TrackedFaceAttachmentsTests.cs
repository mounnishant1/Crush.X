using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    // Exercises attachment ownership with explicit test transforms, not an AR provider or device.
    public sealed class TrackedFaceAttachmentsTests
    {
        private readonly List<GameObject> objects = new List<GameObject>();
        private readonly List<GameObject> pendingDestruction = new List<GameObject>();
        private int createdCount;

        private GameObject Object(string name)
        {
            var instance = new GameObject(name);
            objects.Add(instance);
            return instance;
        }

        private GameObject CreateAttachment(Transform parent)
        {
            createdCount++;
            GameObject instance = Object("Test attachment");
            instance.transform.localScale = Vector3.one * .12f;
            return instance;
        }

        private TrackedFaceAttachments<int> Set()
        {
            return new TrackedFaceAttachments<int>(CreateAttachment, instance =>
            {
                Assert.IsFalse(instance.activeSelf, "Removal must hide synchronously before deferred destruction");
                pendingDestruction.Add(instance);
            });
        }

        [SetUp]
        public void SetUp() { createdCount = 0; pendingDestruction.Clear(); }

        [TearDown]
        public void TearDown()
        {
            foreach (GameObject instance in objects)
                if (instance != null) UnityEngine.Object.DestroyImmediate(instance);
            objects.Clear();
        }

        [Test]
        public void RepeatedTrackable_BindsOneInstanceAcrossFrames()
        {
            var set = Set();
            Transform face = Object("Face A").transform;
            set.BeginFrame();
            GameObject first = set.Bind(1, face, out bool created, out bool rebound);
            Assert.IsTrue(created);
            Assert.IsFalse(rebound);
            Assert.AreSame(first, set.Bind(1, face, out created, out rebound));
            Assert.IsFalse(created);
            set.EndFrame();
            set.BeginFrame();
            Assert.AreSame(first, set.Bind(1, face, out created, out rebound));
            set.EndFrame();
            Assert.AreEqual(1, createdCount);
            Assert.AreEqual(1, set.Count);
            Assert.AreSame(face, first.transform.parent);
        }

        [Test]
        public void DistinctTrackables_BindToTheirOwnFacesAndPreserveScale()
        {
            var set = Set();
            Transform a = Object("Face A").transform;
            Transform b = Object("Face B").transform;
            a.position = new Vector3(1, 2, 3);
            b.rotation = Quaternion.Euler(5, 25, 35);
            set.BeginFrame();
            GameObject first = set.Bind(1, a, out _, out _);
            GameObject second = set.Bind(2, b, out _, out _);
            set.EndFrame();
            Assert.AreNotSame(first, second);
            Assert.AreSame(a, first.transform.parent);
            Assert.AreSame(b, second.transform.parent);
            Assert.AreEqual(Vector3.zero, first.transform.localPosition);
            Assert.AreEqual(Quaternion.identity, second.transform.localRotation);
            Assert.AreEqual(Vector3.one * .12f, first.transform.localScale);
            Assert.AreEqual(2, set.Count);
        }

        [Test]
        public void FaceLossAndImmediateReacquisition_NeverLeaveTwoVisibleMasks()
        {
            var set = Set();
            Transform face = Object("Face A").transform;
            set.BeginFrame();
            GameObject previous = set.Bind(1, face, out _, out _);
            set.EndFrame();
            set.BeginFrame();
            set.EndFrame();
            Assert.AreEqual(0, set.Count);
            Assert.IsFalse(previous.activeSelf);
            Assert.AreEqual(1, pendingDestruction.Count);

            // Old instance is intentionally still alive: this reproduces player Destroy deferral.
            set.BeginFrame();
            GameObject replacement = set.Bind(1, face, out bool created, out _);
            set.EndFrame();
            Assert.IsTrue(created);
            Assert.AreNotSame(previous, replacement);
            Assert.IsTrue(replacement.activeSelf);
            Assert.IsFalse(previous.activeSelf);
            Assert.AreEqual(1, set.Count);
        }

        [TestCase("lens deselected")]
        [TestCase("application paused")]
        [TestCase("controller disabled")]
        [TestCase("face manager or subsystem unavailable")]
        public void Clear_HidesAllAttachmentsAndIsIdempotent(string reason)
        {
            var set = Set();
            var removedReasons = new List<string>();
            set.Removing += (id, instance, detail) => removedReasons.Add(detail);
            set.BeginFrame();
            GameObject first = set.Bind(1, Object("Face A").transform, out _, out _);
            GameObject second = set.Bind(2, Object("Face B").transform, out _, out _);
            set.EndFrame();
            set.Clear(reason);
            set.Clear(reason);
            Assert.IsFalse(first.activeSelf);
            Assert.IsFalse(second.activeSelf);
            Assert.AreEqual(0, set.Count);
            Assert.AreEqual(2, pendingDestruction.Count);
            CollectionAssert.AreEqual(new[] { reason, reason }, removedReasons);
        }

        [Test]
        public void SameIdWithReplacementFace_RebindsExistingMask()
        {
            var set = Set();
            set.BeginFrame();
            GameObject attachment = set.Bind(1, Object("Old face").transform, out _, out _);
            set.EndFrame();
            attachment.transform.localPosition = Vector3.one;
            attachment.transform.localRotation = Quaternion.Euler(10, 15, 20);
            Transform replacementFace = Object("Replacement face").transform;
            set.BeginFrame();
            Assert.AreSame(attachment, set.Bind(1, replacementFace, out bool created, out bool rebound));
            set.EndFrame();
            Assert.IsFalse(created);
            Assert.IsTrue(rebound);
            Assert.AreSame(replacementFace, attachment.transform.parent);
            Assert.AreEqual(Vector3.zero, attachment.transform.localPosition);
            Assert.AreEqual(Quaternion.identity, attachment.transform.localRotation);
            Assert.AreEqual(Vector3.one * .12f, attachment.transform.localScale);
            Assert.AreEqual(1, createdCount);
        }

        [Test]
        public void ExternallyDestroyedAttachment_IsRecreatedForTrackedFace()
        {
            var set = Set();
            Transform face = Object("Face A").transform;
            set.BeginFrame();
            GameObject previous = set.Bind(1, face, out _, out _);
            set.EndFrame();
            UnityEngine.Object.DestroyImmediate(previous);
            set.BeginFrame();
            GameObject replacement = set.Bind(1, face, out bool created, out _);
            set.EndFrame();
            Assert.IsTrue(created);
            Assert.IsNotNull(replacement);
            Assert.AreEqual(1, set.Count);
        }

        [Test]
        public void MissingFaceTransform_DoesNotKeepStaleAttachmentAlive()
        {
            var set = Set();
            set.BeginFrame();
            GameObject previous = set.Bind(1, Object("Face A").transform, out _, out _);
            set.EndFrame();
            set.BeginFrame();
            Assert.IsNull(set.Bind(1, null, out bool created, out bool rebound));
            set.EndFrame();
            Assert.IsFalse(created);
            Assert.IsFalse(rebound);
            Assert.IsFalse(previous.activeSelf);
            Assert.AreEqual(0, set.Count);
        }

        [Test]
        public void FailedCreation_DoesNotReserveIdOrPreventRetry()
        {
            bool fail = true;
            var set = new TrackedFaceAttachments<int>(parent => fail ? null : CreateAttachment(parent), instance => UnityEngine.Object.DestroyImmediate(instance));
            Transform face = Object("Face A").transform;
            set.BeginFrame();
            Assert.IsNull(set.Bind(1, face, out bool created, out _));
            set.EndFrame();
            Assert.IsFalse(created);
            Assert.AreEqual(0, set.Count);
            fail = false;
            set.BeginFrame();
            Assert.IsNotNull(set.Bind(1, face, out created, out _));
            set.EndFrame();
            Assert.IsTrue(created);
            Assert.AreEqual(1, set.Count);
        }
    }
}
