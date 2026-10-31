using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class ExpressionLensTests
    {
        private GameObject root;
        [TearDown] public void Cleanup()
        {
            if (root != null) Object.DestroyImmediate(root);
            LensGeometry.ReleaseMaterials();
        }

        private T Build<T>() where T : LensEffect
        {
            root = new GameObject("Expression lens test");
            var lens = root.AddComponent<T>(); lens.Build(); return lens;
        }

        [Test]
        public void MouthEffectsRequireAnAvailableMeasuredChannel()
        {
            var lens = Build<PuppyLens>();
            var face = new FaceSample { MouthOpen = 1 }; // Legacy numbers alone cannot claim expression support.
            lens.Animate(face, 0);
            Assert.IsFalse(root.transform.Find("Tongue").gameObject.activeSelf);
            face.Expressions = new FaceExpressionSample { Available = FaceExpressionChannels.MouthOpen, MouthOpen = .7f };
            lens.Animate(face, 0);
            Assert.IsTrue(root.transform.Find("Tongue").gameObject.activeSelf);
            face.Expressions = default;
            lens.Animate(face, 0);
            Assert.IsFalse(root.transform.Find("Tongue").gameObject.activeSelf);
        }

        [Test]
        public void DragonDoesNotEmitFlameForMissingOrClosedMouth()
        {
            var lens = Build<DragonLens>();
            lens.Animate(default, 1);
            Assert.IsFalse(root.transform.Find("Flame").gameObject.activeSelf);
            var face = new FaceSample { Expressions = new FaceExpressionSample
                { Available = FaceExpressionChannels.MouthOpen, MouthOpen = .9f } };
            lens.Animate(face, 1);
            Assert.IsTrue(root.transform.Find("Flame").gameObject.activeSelf);
            face.Expressions.MouthOpen = 0;
            lens.Animate(face, 1);
            Assert.IsFalse(root.transform.Find("Flame").gameObject.activeSelf);
        }

        [Test]
        public void RobotNeverFabricatesAClockDrivenBlink()
        {
            var lens = Build<RoboHelmetLens>();
            lens.Animate(default, Mathf.PI / (2 * .65f));
            Assert.AreEqual(.065f, root.transform.Find("EyeL").localScale.y);
            var face = new FaceSample { Expressions = new FaceExpressionSample
                { Available = FaceExpressionChannels.BlinkLeft | FaceExpressionChannels.BlinkRight,
                  BlinkLeft = .9f, BlinkRight = .9f } };
            lens.Animate(face, 0);
            Assert.AreEqual(.01f, root.transform.Find("EyeL").localScale.y);
        }

        [Test]
        public void GeneratedMeshesAreReleasedExactlyOnce()
        {
            var lens = Build<CatEarsLens>();
            var ear = root.transform.Find("LeftCatEar").GetComponent<MeshFilter>();
            Assert.IsNotNull(ear.sharedMesh);
            lens.ReleaseResources();
            Assert.IsNull(ear.sharedMesh);
            Assert.DoesNotThrow(lens.ReleaseResources);
        }
    }
}
