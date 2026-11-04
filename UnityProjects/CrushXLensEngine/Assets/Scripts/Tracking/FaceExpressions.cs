using System;
using System.Collections.Generic;

namespace CrushX.LensEngine
{
    // Names describe model-derived signals, not physical eye fixation points or emotions.
    public enum ExpressionSignal { MouthOpen, BlinkLeft, BlinkRight, Blink, SmileLeft, SmileRight, Smile, BrowRaiseLeft, BrowRaiseRight, BrowRaise, GazeLeftX, GazeLeftY, GazeRightX, GazeRightY }

    [Flags]
    public enum FaceExpressionChannels
    {
        None = 0, MouthOpen = 1, BlinkLeft = 2, BlinkRight = 4, SmileLeft = 8,
        SmileRight = 16, BrowRaiseLeft = 32, BrowRaiseRight = 64, GazeLeft = 128, GazeRight = 256
    }

    [Serializable]
    public struct FaceExpressionSample
    {
        public FaceExpressionChannels Available;
        public double Timestamp;
        public float MouthOpen, BlinkLeft, BlinkRight, SmileLeft, SmileRight, BrowRaiseLeft, BrowRaiseRight;
        public float GazeLeftX, GazeLeftY, GazeRightX, GazeRightY;

        public bool TryGet(ExpressionSignal signal, out float value)
        {
            value = 0;
            FaceExpressionChannels neededChannels;
            switch (signal)
            {
                case ExpressionSignal.MouthOpen: neededChannels = FaceExpressionChannels.MouthOpen; value = MouthOpen; break;
                case ExpressionSignal.BlinkLeft: neededChannels = FaceExpressionChannels.BlinkLeft; value = BlinkLeft; break;
                case ExpressionSignal.BlinkRight: neededChannels = FaceExpressionChannels.BlinkRight; value = BlinkRight; break;
                case ExpressionSignal.Blink: return Pair(ExpressionSignal.BlinkLeft, ExpressionSignal.BlinkRight, true, out value);
                case ExpressionSignal.SmileLeft: neededChannels = FaceExpressionChannels.SmileLeft; value = SmileLeft; break;
                case ExpressionSignal.SmileRight: neededChannels = FaceExpressionChannels.SmileRight; value = SmileRight; break;
                case ExpressionSignal.Smile: return Pair(ExpressionSignal.SmileLeft, ExpressionSignal.SmileRight, false, out value);
                case ExpressionSignal.BrowRaiseLeft: neededChannels = FaceExpressionChannels.BrowRaiseLeft; value = BrowRaiseLeft; break;
                case ExpressionSignal.BrowRaiseRight: neededChannels = FaceExpressionChannels.BrowRaiseRight; value = BrowRaiseRight; break;
                case ExpressionSignal.BrowRaise: return Pair(ExpressionSignal.BrowRaiseLeft, ExpressionSignal.BrowRaiseRight, false, out value);
                case ExpressionSignal.GazeLeftX: neededChannels = FaceExpressionChannels.GazeLeft; value = GazeLeftX; break;
                case ExpressionSignal.GazeLeftY: neededChannels = FaceExpressionChannels.GazeLeft; value = GazeLeftY; break;
                case ExpressionSignal.GazeRightX: neededChannels = FaceExpressionChannels.GazeRight; value = GazeRightX; break;
                case ExpressionSignal.GazeRightY: neededChannels = FaceExpressionChannels.GazeRight; value = GazeRightY; break;
                default: return false;
            }
            bool signed = signal == ExpressionSignal.GazeLeftX || signal == ExpressionSignal.GazeLeftY || signal == ExpressionSignal.GazeRightX || signal == ExpressionSignal.GazeRightY;
            if ((Available & neededChannels) != neededChannels || !TrackingSampleGate.Finite(value) || value < (signed ? -1 : 0) || value > 1)
            { value = 0; return false; }
            return true;
        }

        private bool Pair(ExpressionSignal left, ExpressionSignal right, bool minimum, out float value)
        {
            value = 0;
            if (!TryGet(left, out float a) || !TryGet(right, out float b)) return false;
            value = minimum ? Math.Min(a, b) : (a + b) * .5f;
            return true;
        }

        public FaceExpressionSample Sanitized()
        {
            FaceExpressionSample result = this;
            if (!TryGet(ExpressionSignal.MouthOpen, out result.MouthOpen)) result.Available &= ~FaceExpressionChannels.MouthOpen;
            if (!TryGet(ExpressionSignal.BlinkLeft, out result.BlinkLeft)) result.Available &= ~FaceExpressionChannels.BlinkLeft;
            if (!TryGet(ExpressionSignal.BlinkRight, out result.BlinkRight)) result.Available &= ~FaceExpressionChannels.BlinkRight;
            if (!TryGet(ExpressionSignal.SmileLeft, out result.SmileLeft)) result.Available &= ~FaceExpressionChannels.SmileLeft;
            if (!TryGet(ExpressionSignal.SmileRight, out result.SmileRight)) result.Available &= ~FaceExpressionChannels.SmileRight;
            if (!TryGet(ExpressionSignal.BrowRaiseLeft, out result.BrowRaiseLeft)) result.Available &= ~FaceExpressionChannels.BrowRaiseLeft;
            if (!TryGet(ExpressionSignal.BrowRaiseRight, out result.BrowRaiseRight)) result.Available &= ~FaceExpressionChannels.BrowRaiseRight;
            bool leftX = TryGet(ExpressionSignal.GazeLeftX, out result.GazeLeftX);
            bool leftY = TryGet(ExpressionSignal.GazeLeftY, out result.GazeLeftY);
            bool rightX = TryGet(ExpressionSignal.GazeRightX, out result.GazeRightX);
            bool rightY = TryGet(ExpressionSignal.GazeRightY, out result.GazeRightY);
            if (!leftX || !leftY) result.Available &= ~FaceExpressionChannels.GazeLeft;
            if (!rightX || !rightY) result.Available &= ~FaceExpressionChannels.GazeRight;
            return result;
        }

        public static FaceExpressionSample Smooth(FaceExpressionSample previous, FaceExpressionSample incoming, float weight)
        {
            incoming = incoming.Sanitized();
            weight = TrackingSampleGate.Finite(weight) ? Math.Max(0, Math.Min(1, weight)) : 1;
            incoming.MouthOpen = Blend(previous, incoming, ExpressionSignal.MouthOpen, weight);
            incoming.BlinkLeft = Blend(previous, incoming, ExpressionSignal.BlinkLeft, weight);
            incoming.BlinkRight = Blend(previous, incoming, ExpressionSignal.BlinkRight, weight);
            incoming.SmileLeft = Blend(previous, incoming, ExpressionSignal.SmileLeft, weight);
            incoming.SmileRight = Blend(previous, incoming, ExpressionSignal.SmileRight, weight);
            incoming.BrowRaiseLeft = Blend(previous, incoming, ExpressionSignal.BrowRaiseLeft, weight);
            incoming.BrowRaiseRight = Blend(previous, incoming, ExpressionSignal.BrowRaiseRight, weight);
            incoming.GazeLeftX = Blend(previous, incoming, ExpressionSignal.GazeLeftX, weight);
            incoming.GazeLeftY = Blend(previous, incoming, ExpressionSignal.GazeLeftY, weight);
            incoming.GazeRightX = Blend(previous, incoming, ExpressionSignal.GazeRightX, weight);
            incoming.GazeRightY = Blend(previous, incoming, ExpressionSignal.GazeRightY, weight);
            return incoming;
        }

        private static float Blend(FaceExpressionSample previous, FaceExpressionSample incoming, ExpressionSignal signal, float weight)
        {
            if (!incoming.TryGet(signal, out float next)) return 0;
            return previous.TryGet(signal, out float old) ? old + (next - old) * weight : next;
        }
    }

    /// <summary>Maps canonical MediaPipe-style blendshape coefficients supplied by a local inference runner.</summary>
    public static class BlendshapeExpressionMapper
    {
        public static bool TryMap(IReadOnlyDictionary<string, float> coefficients, double timestamp, out FaceExpressionSample sample)
        {
            sample = new FaceExpressionSample { Timestamp = timestamp };
            if (coefficients == null || !TrackingSampleGate.Finite(timestamp) || timestamp < 0) return false;
            if (Read(coefficients, "jawOpen", out sample.MouthOpen)) sample.Available |= FaceExpressionChannels.MouthOpen;
            if (Read(coefficients, "eyeBlinkLeft", out sample.BlinkLeft)) sample.Available |= FaceExpressionChannels.BlinkLeft;
            if (Read(coefficients, "eyeBlinkRight", out sample.BlinkRight)) sample.Available |= FaceExpressionChannels.BlinkRight;
            if (Read(coefficients, "mouthSmileLeft", out sample.SmileLeft)) sample.Available |= FaceExpressionChannels.SmileLeft;
            if (Read(coefficients, "mouthSmileRight", out sample.SmileRight)) sample.Available |= FaceExpressionChannels.SmileRight;
            bool inner = Read(coefficients, "browInnerUp", out float innerUp);
            if (inner && Read(coefficients, "browOuterUpLeft", out float outerLeft))
            { sample.BrowRaiseLeft = Math.Max(innerUp, outerLeft); sample.Available |= FaceExpressionChannels.BrowRaiseLeft; }
            if (inner && Read(coefficients, "browOuterUpRight", out float outerRight))
            { sample.BrowRaiseRight = Math.Max(innerUp, outerRight); sample.Available |= FaceExpressionChannels.BrowRaiseRight; }
            if (Gaze(coefficients, "eyeLookOutLeft", "eyeLookInLeft", "eyeLookUpLeft", "eyeLookDownLeft", out float leftX, out float leftY))
            { sample.GazeLeftX = leftX; sample.GazeLeftY = leftY; sample.Available |= FaceExpressionChannels.GazeLeft; }
            if (Gaze(coefficients, "eyeLookOutRight", "eyeLookInRight", "eyeLookUpRight", "eyeLookDownRight", out float rightX, out float rightY))
            { sample.GazeRightX = -rightX; sample.GazeRightY = rightY; sample.Available |= FaceExpressionChannels.GazeRight; }
            return sample.Available != FaceExpressionChannels.None;
        }

        private static bool Read(IReadOnlyDictionary<string, float> coefficients, string name, out float value)
        {
            if (coefficients.TryGetValue(name, out value) && TrackingSampleGate.Finite(value) && value >= 0 && value <= 1) return true;
            value = 0; return false;
        }

        private static bool Gaze(IReadOnlyDictionary<string, float> coefficients, string outsideKey, string insideKey, string upKey, string downKey, out float x, out float y)
        {
            x = y = 0;
            if (!Read(coefficients, outsideKey, out float outside) || !Read(coefficients, insideKey, out float inside) ||
                !Read(coefficients, upKey, out float up) || !Read(coefficients, downKey, out float down)) return false;
            x = outside - inside; y = up - down; return true;
        }
    }

    public struct OnDeviceBlendshapeFrame
    {
        public FaceIdentity Identity;
        public double Timestamp; // Same monotonic clock as the associated pose; never wall-clock time.
        public float Confidence;
        public IReadOnlyDictionary<string, float> Coefficients;
    }

    // Implemented by an installed on-device model runner; this contract performs no inference itself.
    public interface IOnDeviceBlendshapeSource
    {
        bool IsRunning { get; }
        string ModelId { get; }
        bool TryGetBlendshapes(FaceIdentity identity, out OnDeviceBlendshapeFrame frame);
    }

    public static class BlendshapeFramePolicy
    {
        public static bool CanJoin(FaceIdentity poseIdentity, double poseTime, OnDeviceBlendshapeFrame model,
            double now, double maximumAge, double maximumSkew, float minimumConfidence)
        {
            if (!poseIdentity.IsKnown || poseIdentity != model.Identity || !TrackingSampleGate.Finite(poseTime) ||
                !TrackingSampleGate.Finite(model.Timestamp) || !TrackingSampleGate.Finite(now) ||
                !TrackingSampleGate.Finite(maximumAge) || maximumAge <= 0 ||
                !TrackingSampleGate.Finite(maximumSkew) || maximumSkew < 0 ||
                !TrackingSampleGate.Finite(model.Confidence) || model.Confidence < minimumConfidence || model.Confidence > 1 ||
                !TrackingSampleGate.Finite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1)
                return false;
            return poseTime >= 0 && model.Timestamp >= 0 && model.Timestamp <= now + TrackingSampleGate.FutureToleranceSeconds &&
                now - model.Timestamp < maximumAge && Math.Abs(poseTime - model.Timestamp) <= maximumSkew;
        }
    }
}
