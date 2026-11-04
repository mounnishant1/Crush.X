using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CrushX.LensEngine.Tests
{
    /// <summary>These require an actual Unity graphics device. They do not test a phone camera or encoder.</summary>
    public sealed class AsyncReadbackLifecycleTests
    {
        private static RenderTexture CreateTarget()
        {
            if (!SystemInfo.supportsAsyncGPUReadback) Assert.Ignore("An actual graphics device with asynchronous readback is required");
            var target = new RenderTexture(4, 4, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            Assert.IsTrue(target.Create());
            RenderTexture previous = RenderTexture.active;
            try { RenderTexture.active = target; GL.Clear(false, true, Color.black); }
            finally { RenderTexture.active = previous; }
            return target;
        }

        [UnityTest]
        public IEnumerator RealReadbacksAreBoundedAndConsumedInSubmissionOrder()
        {
            RenderTexture target = CreateTarget();
            var readback = new AsyncVideoReadback(target, 4 * 4 * 4);
            try
            {
                readback.BeginCalibration();
                double deadline = Time.realtimeSinceStartupAsDouble + 3;
                while (!readback.Calibrated && readback.CalibrationError == null && Time.realtimeSinceStartupAsDouble < deadline) yield return null;
                Assert.IsTrue(readback.Calibrated, readback.CalibrationError ?? "Calibration deadline expired");
                Assert.IsTrue(readback.TryRequest(1)); Assert.IsTrue(readback.TryRequest(2)); Assert.IsTrue(readback.TryRequest(3));
                Assert.IsFalse(readback.TryRequest(4)); Assert.AreEqual(3, readback.Outstanding);
                int consumed = 0;
                deadline = Time.realtimeSinceStartupAsDouble + 3;
                while (consumed < 3 && Time.realtimeSinceStartupAsDouble < deadline)
                {
                    if (readback.TryTake(out byte[] bytes, out double capturedAt, out _, out bool error))
                    {
                        Assert.IsFalse(error); Assert.AreEqual(64, bytes.Length); Assert.AreEqual(++consumed, capturedAt);
                    }
                    yield return null;
                }
                Assert.AreEqual(3, consumed); Assert.AreEqual(0, readback.Outstanding);
            }
            finally { readback.Retire(); }
            yield return null;
            Assert.IsTrue(target == null, "The owned capture texture should release after completed requests");
        }

        [UnityTest]
        public IEnumerator CancellationKeepsOwnedResourcesUntilItsCallbacksComplete()
        {
            RenderTexture target = CreateTarget();
            var readback = new AsyncVideoReadback(target, 64);
            readback.BeginCalibration();
            // Cancel even before calibration completes; no global WaitAllRequests is permitted.
            readback.Retire();
            Assert.IsFalse(readback.TryRequest(1));
            double deadline = Time.realtimeSinceStartupAsDouble + 3;
            while (AsyncVideoReadback.HasPendingRetirement && Time.realtimeSinceStartupAsDouble < deadline) yield return null;
            Assert.IsFalse(AsyncVideoReadback.HasPendingRetirement, "Owned cancellation did not finish");
            yield return null;
            Assert.IsTrue(target == null);
        }
    }
}
