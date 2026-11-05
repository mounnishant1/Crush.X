using System;
using Unity.Collections;
using UnityEngine;
using UnityEngine.Rendering;

namespace CrushX.LensEngine
{
    /// <summary>Three bounded owned readbacks, consumed in source order. Cancellation retires only
    /// these requests; their arrays/texture stay alive until their own callbacks complete.</summary>
    internal sealed class AsyncVideoReadback
    {
        private sealed class Slot
        {
            internal readonly AsyncVideoReadback Owner;
            internal NativeArray<byte> Pixels;
            internal readonly byte[] Bytes;
            internal readonly Action<AsyncGPUReadbackRequest> Callback;
            internal bool Busy, Complete, Failed;
            internal double CapturedAt, CompletedAt;
            internal Slot(AsyncVideoReadback owner, int bytes)
            {
                Owner = owner; Bytes = new byte[bytes]; Callback = Finish;
                // Perform all managed allocations before native ownership begins, so a constructor
                // allocation failure cannot strand a Persistent array outside the owner's slot list.
                Pixels = new NativeArray<byte>(bytes, Allocator.Persistent, NativeArrayOptions.UninitializedMemory);
            }
            private void Finish(AsyncGPUReadbackRequest request) { Owner.Completed(this, request); }
        }

        private const int Capacity = 3;
        private readonly Slot[] slots = new Slot[Capacity];
        private readonly Action<AsyncGPUReadbackRequest> calibrationCallback;
        private NativeArray<byte> calibrationPixels;
        private Texture2D calibrationSource;
        private RenderTexture calibrationTarget, ownedSource;
        private int head, tail, occupied, pending;
        private bool retired, retirementCounted, calibrationPending;
        private static int retirements;
        internal static bool HasPendingRetirement => retirements != 0;
        internal bool Calibrated { get; private set; }
        internal bool RowsBottomUp { get; private set; }
        internal string CalibrationError { get; private set; }
        internal int Outstanding => occupied;
        internal bool CanRequest => !retired && Calibrated && occupied < Capacity;

        internal AsyncVideoReadback(RenderTexture source, int byteCount)
        {
            if (HasPendingRetirement) throw new InvalidOperationException("Previous GPU readback is still releasing; retry after it completes");
            if (source == null || byteCount <= 0) throw new ArgumentException("An owned capture texture and byte size are required");
            ownedSource = source;
            calibrationCallback = CalibrationFinished;
            try { for (int i = 0; i < Capacity; i++) slots[i] = new Slot(this, byteCount); }
            catch
            {
                for (int i = 0; i < slots.Length; i++)
                    if (slots[i] != null && slots[i].Pixels.IsCreated) slots[i].Pixels.Dispose();
                ownedSource = null; // The caller retains its texture when construction failed.
                throw;
            }
        }

        internal void BeginCalibration()
        {
            if (retired || calibrationPending || Calibrated) throw new InvalidOperationException("Invalid GPU readback calibration state");
            calibrationSource = new Texture2D(2, 2, TextureFormat.RGBA32, false, true)
                { name = "CrushX GPU row calibration", filterMode = FilterMode.Point };
            // Unity Texture2D rows are bottom-up. These asymmetric corners identify byte rows and RGBA ordering.
            calibrationSource.SetPixels32(new[] { new Color32(255, 0, 0, 255), new Color32(0, 255, 0, 255),
                new Color32(0, 0, 255, 255), new Color32(255, 255, 255, 255) });
            calibrationSource.Apply(false, false);
            calibrationTarget = new RenderTexture(2, 2, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
                { name = "CrushX GPU row calibration target", filterMode = FilterMode.Point };
            if (!calibrationTarget.Create()) throw new InvalidOperationException("Cannot allocate GPU calibration texture");
            calibrationPixels = new NativeArray<byte>(16, Allocator.Persistent, NativeArrayOptions.UninitializedMemory);
            RenderTexture previousTarget = RenderTexture.active;
            try { Graphics.Blit(calibrationSource, calibrationTarget); }
            finally { RenderTexture.active = previousTarget; }
            calibrationPending = true;
            try { AsyncGPUReadback.RequestIntoNativeArray(ref calibrationPixels, calibrationTarget, 0, TextureFormat.RGBA32, calibrationCallback); }
            catch { calibrationPending = false; ReleaseCalibration(); throw; }
        }

        private void CalibrationFinished(AsyncGPUReadbackRequest request)
        {
            calibrationPending = false;
            if (!retired)
            {
                if (request.hasError) CalibrationError = "GPU readback calibration failed";
                else
                {
                    bool bottom = Pixel(0, 255, 0, 0) && Pixel(1, 0, 255, 0) && Pixel(2, 0, 0, 255) && Pixel(3, 255, 255, 255);
                    bool top = Pixel(0, 0, 0, 255) && Pixel(1, 255, 255, 255) && Pixel(2, 255, 0, 0) && Pixel(3, 0, 255, 0);
                    if (!bottom && !top) CalibrationError = "GPU readback channel/row layout could not be verified";
                    else { RowsBottomUp = bottom; Calibrated = true; }
                }
            }
            ReleaseCalibration();
            FinishRetirement();
        }

        private bool Pixel(int pixel, byte red, byte green, byte blue)
        {
            int offset = pixel * 4;
            return Math.Abs(calibrationPixels[offset] - red) <= 2 && Math.Abs(calibrationPixels[offset + 1] - green) <= 2 &&
                Math.Abs(calibrationPixels[offset + 2] - blue) <= 2 && calibrationPixels[offset + 3] >= 253;
        }

        internal bool TryRequest(double capturedAt)
        {
            if (!CanRequest) return false;
            Slot slot = slots[tail];
            slot.Busy = true; slot.Complete = slot.Failed = false; slot.CapturedAt = capturedAt;
            occupied++; pending++; tail = (tail + 1) % Capacity;
            try { AsyncGPUReadback.RequestIntoNativeArray(ref slot.Pixels, ownedSource, 0, TextureFormat.RGBA32, slot.Callback); }
            catch
            {
                tail = (tail + Capacity - 1) % Capacity; occupied--; pending--; slot.Busy = false;
                throw;
            }
            return true;
        }

        private void Completed(Slot slot, AsyncGPUReadbackRequest request)
        {
            // Unity request handles expire after completion; retain only the result and our owned data.
            slot.Failed = request.hasError; slot.Complete = true; slot.CompletedAt = Time.realtimeSinceStartupAsDouble;
            pending--;
            if (retired && slot.Pixels.IsCreated) slot.Pixels.Dispose();
            FinishRetirement();
        }

        internal bool TryTake(out byte[] bytes, out double capturedAt, out double latencySeconds, out bool error)
        {
            bytes = null; capturedAt = latencySeconds = 0; error = false;
            if (retired || occupied == 0 || !slots[head].Complete) return false;
            Slot slot = slots[head];
            error = slot.Failed;
            if (!error) { slot.Pixels.CopyTo(slot.Bytes); bytes = slot.Bytes; }
            capturedAt = slot.CapturedAt; latencySeconds = Math.Max(0, slot.CompletedAt - slot.CapturedAt);
            slot.Busy = slot.Complete = false; head = (head + 1) % Capacity; occupied--;
            return true;
        }

        internal void Retire()
        {
            if (retired) return;
            retired = true;
            for (int i = 0; i < slots.Length; i++)
            {
                Slot slot = slots[i];
                if (slot != null && (!slot.Busy || slot.Complete) && slot.Pixels.IsCreated) slot.Pixels.Dispose();
            }
            if (pending > 0 || calibrationPending) { retirementCounted = true; retirements++; }
            FinishRetirement();
        }

        private void FinishRetirement()
        {
            if (!retired || pending != 0 || calibrationPending) return;
            ReleaseCalibration();
            if (ownedSource != null) { ownedSource.Release(); UnityEngine.Object.Destroy(ownedSource); ownedSource = null; }
            if (retirementCounted) { retirementCounted = false; retirements--; }
        }

        private void ReleaseCalibration()
        {
            if (calibrationPixels.IsCreated) calibrationPixels.Dispose();
            if (calibrationTarget != null) { calibrationTarget.Release(); UnityEngine.Object.Destroy(calibrationTarget); calibrationTarget = null; }
            if (calibrationSource != null) { UnityEngine.Object.Destroy(calibrationSource); calibrationSource = null; }
        }
    }
}
