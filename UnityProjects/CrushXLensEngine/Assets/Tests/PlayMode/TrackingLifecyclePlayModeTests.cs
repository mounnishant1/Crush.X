using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CrushX.LensEngine.Tests
{
    // Explicit test provider; excluded from ordinary players by the test assembly definition.
    public sealed class LifecycleTestFaceProvider : MonoBehaviour, ITrackingProvider
    {
        public bool HasFace;
        public Vector3 Position;
        public string ProviderName { get { return "Lifecycle test fixture"; } }
        public bool TryGetFace(out FaceSample sample)
        {
            sample = new FaceSample { Valid = HasFace, Position = Position, Rotation = Quaternion.identity, Confidence = 1 };
            return HasFace;
        }
    }

    public sealed class TrackingLifecyclePlayModeTests
    {
        [UnityTest]
        public IEnumerator DeferredDestroy_DoesNotLeaveTwoActiveAttachments()
        {
            var face = new GameObject("Test face transform");
            var set = new TrackedFaceAttachments<int>(parent =>
            {
                var instance = new GameObject("Test mask instance");
                instance.transform.SetParent(parent, false);
                return instance;
            });
            try
            {
                set.BeginFrame();
                GameObject old = set.Bind(1, face.transform, out _, out _);
                set.EndFrame();
                set.BeginFrame(); set.EndFrame();
                Assert.IsFalse(old.activeSelf);
                set.BeginFrame();
                GameObject replacement = set.Bind(1, face.transform, out _, out _);
                set.EndFrame();
                Assert.IsTrue(replacement.activeSelf);
                Assert.AreEqual(1, set.Count);
                yield return null;
                Assert.IsTrue(old == null, "Real player destruction must complete after the frame");
                Assert.IsTrue(replacement != null);
            }
            finally { set.Clear("test cleanup"); Object.Destroy(face); }
            yield return null;
        }

        [UnityTest]
        public IEnumerator AcquisitionLossAndReacquisition_ResetTheSmoothedPose()
        {
            var go = new GameObject("Tracking lifecycle test");
            try
            {
                var provider = go.AddComponent<LifecycleTestFaceProvider>();
                var tracker = go.AddComponent<FaceTrackingManager>();
                tracker.TrackingTimeout = .05f;
                tracker.SetProvider(provider);
                provider.Position = new Vector3(1, 2, 3);
                provider.HasFace = true;
                yield return null;
                Assert.IsTrue(tracker.IsTracking);
                Assert.AreEqual(provider.Position, tracker.Current.Position);
                provider.HasFace = false;
                yield return new WaitForSecondsRealtime(.12f);
                Assert.IsFalse(tracker.IsTracking);
                provider.Position = new Vector3(5, 6, 7);
                provider.HasFace = true;
                yield return null;
                Assert.IsTrue(tracker.IsTracking);
                Assert.AreEqual(provider.Position, tracker.Current.Position);
                tracker.SendMessage("OnApplicationPause", true);
                Assert.IsFalse(tracker.IsTracking);
                Assert.IsFalse(tracker.Current.Valid);
            }
            finally { Object.Destroy(go); }
            yield return null;
        }
    }
}
