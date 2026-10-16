using System;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace CrushX.LensEngine.Tests
{
    public class ColorFilterTests
    {
        private GameObject cameraObject;
        private GameObject firstObject, secondObject;
        private Material firstMaterial, secondMaterial;

        [TearDown]
        public void Cleanup()
        {
            if (firstObject != null) Object.DestroyImmediate(firstObject);
            if (secondObject != null) Object.DestroyImmediate(secondObject);
            if (cameraObject != null) Object.DestroyImmediate(cameraObject);
            if (firstMaterial != null) Object.DestroyImmediate(firstMaterial);
            if (secondMaterial != null) Object.DestroyImmediate(secondMaterial);
        }

        private Camera Camera()
        {
            cameraObject = new GameObject("Color filter test camera");
            return cameraObject.AddComponent<Camera>();
        }

        private static Shader GradeShader()
        {
            Shader shader = Resources.Load<Shader>(ColorFilterLens.ShaderResource);
            Assert.IsNotNull(shader, "The explicit Resources shader must be included in the project");
            return shader;
        }

        [Test]
        public void ShaderAsset_ExposesActualGradeProperties()
        {
            firstMaterial = new Material(GradeShader());
            foreach (string property in new[] { "_Mode", "_Warmth", "_Contrast", "_Saturation", "_Vignette", "_ShadowColor", "_HighlightColor" })
                Assert.IsTrue(firstMaterial.HasProperty(property), property);
        }

        [Test]
        public void StaleOwner_CannotClearNewSelectionOrDisposeItsMaterial()
        {
            Camera camera = Camera();
            CameraColorFilter filter = camera.gameObject.AddComponent<CameraColorFilter>();
            firstMaterial = new Material(GradeShader());
            secondMaterial = new Material(GradeShader());
            object previous = new object(), current = new object();
            filter.SetFilter(previous, firstMaterial);
            filter.SetFilter(current, secondMaterial);
            Assert.IsFalse(filter.ClearFilter(previous));
            Assert.AreSame(current, filter.OwnerToken);
            Assert.AreSame(secondMaterial, filter.CurrentMaterial);
            Assert.IsTrue(filter.enabled);
            Assert.IsTrue(filter.ClearFilter(current));
            Assert.IsNull(filter.CurrentMaterial);
            Assert.IsFalse(filter.enabled);
            Assert.IsTrue(firstMaterial != null && secondMaterial != null, "The camera component does not own lens materials");
        }

        [Test]
        public void InvalidOwnershipClaim_PreservesCurrentFilter()
        {
            CameraColorFilter filter = Camera().gameObject.AddComponent<CameraColorFilter>();
            firstMaterial = new Material(GradeShader());
            object owner = new object();
            filter.SetFilter(owner, firstMaterial);
            Assert.Throws<ArgumentNullException>(() => filter.SetFilter(null, firstMaterial));
            Assert.Throws<ArgumentNullException>(() => filter.SetFilter(new object(), null));
            Assert.AreSame(owner, filter.OwnerToken);
            Assert.AreSame(firstMaterial, filter.CurrentMaterial);
        }

        [Test]
        public void BuildInactiveCandidate_LeavesCameraUnchangedAndAllocatesNoMaterial()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason + "; material lifecycle requires a graphics-capable Built-in test runner");
            Camera camera = Camera();
            firstObject = new GameObject("Inactive candidate");
            firstObject.SetActive(false);
            var lens = firstObject.AddComponent<WarmCinemaLens>();
            lens.TargetCamera = camera;
            lens.Build();
            Assert.IsNull(lens.FilterMaterial, "Never-active candidates cannot rely on OnDestroy, so Build owns no GPU material");
            Assert.IsFalse(lens.IsSelected);
            Assert.IsNull(camera.GetComponent<CameraColorFilter>());
            Object.DestroyImmediate(firstObject);
            Assert.IsNull(camera.GetComponent<CameraColorFilter>());
        }

        [Test]
        public void DestroyingPreviousLens_PreservesNewFilterAndItsMaterial()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason + "; material lifecycle requires a graphics-capable Built-in test runner");
            Camera camera = Camera();
            firstObject = new GameObject("First grade");
            secondObject = new GameObject("Second grade");
            var first = firstObject.AddComponent<NoirFilmLens>(); first.TargetCamera = camera; first.Build(); first.OnSelected();
            var second = secondObject.AddComponent<NeonDuotoneLens>(); second.TargetCamera = camera; second.Build(); second.OnSelected();
            Material oldMaterial = first.FilterMaterial, newMaterial = second.FilterMaterial;
            first.OnDeselected();
            Object.DestroyImmediate(firstObject);
            Assert.IsTrue(oldMaterial == null);
            Assert.IsTrue(newMaterial != null);
            Assert.AreSame(newMaterial, camera.GetComponent<CameraColorFilter>().CurrentMaterial);
            second.OnDeselected();
            Assert.IsNull(camera.GetComponent<CameraColorFilter>().CurrentMaterial);
            Assert.IsFalse(camera.GetComponent<CameraColorFilter>().enabled);
        }

        [Test]
        public void Deselection_ReleasesMaterialIdempotentlyAndCanSelectAgain()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason);
            Camera camera = Camera();
            firstObject = new GameObject("Reselectable grade");
            var lens = firstObject.AddComponent<WarmCinemaLens>(); lens.TargetCamera = camera; lens.Build(); lens.OnSelected();
            Material previous = lens.FilterMaterial;
            lens.OnDeselected(); lens.OnDeselected();
            Assert.IsTrue(previous == null);
            Assert.IsNull(lens.FilterMaterial);
            Assert.IsFalse(lens.IsSelected);
            lens.OnSelected();
            Assert.IsNotNull(lens.FilterMaterial);
            Assert.AreSame(lens.FilterMaterial, camera.GetComponent<CameraColorFilter>().CurrentMaterial);
        }

        [Test]
        public void ReenablingOldHierarchy_DoesNotStealNewSelection()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason);
            Camera camera = Camera();
            firstObject = new GameObject("Old grade"); secondObject = new GameObject("New grade");
            var old = firstObject.AddComponent<WarmCinemaLens>(); old.TargetCamera = camera; old.OnSelected();
            firstObject.SetActive(false);
            var current = secondObject.AddComponent<NoirFilmLens>(); current.TargetCamera = camera; current.OnSelected();
            firstObject.SetActive(true);
            Assert.AreSame(current.FilterMaterial, camera.GetComponent<CameraColorFilter>().CurrentMaterial);
        }

        [Test]
        public void RollbackOfNeverActiveCandidate_ReleasesMaterialWithoutRelyingOnDestroy()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason);
            Camera camera = Camera();
            firstObject = new GameObject("Inactive selection transaction"); firstObject.SetActive(false);
            var candidate = firstObject.AddComponent<WarmCinemaLens>(); candidate.TargetCamera = camera;
            candidate.Build(); candidate.OnSelected();
            Material created = candidate.FilterMaterial;
            Assert.IsNotNull(created);
            candidate.OnDeselected();
            Assert.IsTrue(created == null);
            Assert.IsNull(camera.GetComponent<CameraColorFilter>().CurrentMaterial);
            Assert.IsFalse(candidate.IsSelected);
        }

        [Test]
        public void FilterModes_AreDistinctMaterialsWithDifferentProcessingParameters()
        {
            if (!ColorFilterLens.IsSupported(out string reason)) Assert.Ignore(reason);
            Camera camera = Camera();
            firstObject = new GameObject("Warm");
            secondObject = new GameObject("Noir");
            var warm = firstObject.AddComponent<WarmCinemaLens>(); warm.TargetCamera = camera; warm.Build(); warm.OnSelected();
            var noir = secondObject.AddComponent<NoirFilmLens>(); noir.TargetCamera = camera; noir.Build(); noir.OnSelected();
            Assert.AreEqual(0, warm.FilterMaterial.GetFloat("_Mode"));
            Assert.AreEqual(1, noir.FilterMaterial.GetFloat("_Mode"));
            Assert.Greater(warm.FilterMaterial.GetFloat("_Saturation"), noir.FilterMaterial.GetFloat("_Saturation"));
            Assert.Greater(noir.FilterMaterial.GetFloat("_Vignette"), warm.FilterMaterial.GetFloat("_Vignette"));
            Assert.AreNotSame(warm.FilterMaterial, noir.FilterMaterial);
        }
    }
}
