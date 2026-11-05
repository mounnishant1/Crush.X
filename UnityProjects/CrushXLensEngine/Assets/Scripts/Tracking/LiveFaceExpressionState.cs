using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    [Serializable]
    public sealed class FaceExpressionPacket
    {
        public int sequence;
        public bool hasFace;
        public float confidence;
        public float ageMilliseconds;
        public float jawOpen;
        public float eyeBlinkLeft;
        public float eyeBlinkRight;
        public float mouthSmileLeft;
        public float mouthSmileRight;
        public float browInnerUp;
    }

    /// <summary>Only frames from the native Face Landmarker are admitted.</summary>
    public sealed class LiveFaceExpressionState
    {
        private const float MaxAge = .18f;
        private FaceExpressionPacket current;
        private float receivedAt = -999f;
        private int lastSequence;

        private static bool Unit(float x) =>
            !float.IsNaN(x) && !float.IsInfinity(x) && x >= 0f && x <= 1f;

        public void Invalidate()
        {
            current = null;
            receivedAt = -999f;
            lastSequence = 0;
        }

        public bool TryApply(string json, float now)
        {
            if (string.IsNullOrEmpty(json) || json.Length > 1200) return false;
            FaceExpressionPacket packet;
            try { packet = JsonUtility.FromJson<FaceExpressionPacket>(json); }
            catch (Exception) { return false; }

            if (packet == null || packet.sequence <= lastSequence ||
                packet.sequence <= 0) return false;
            if (!packet.hasFace)
            {
                lastSequence = packet.sequence;
                current = null;
                return true;
            }
            if (!Unit(packet.confidence) || packet.confidence < .65f ||
                !Unit(packet.jawOpen) || !Unit(packet.eyeBlinkLeft) ||
                !Unit(packet.eyeBlinkRight) || !Unit(packet.mouthSmileLeft) ||
                !Unit(packet.mouthSmileRight) || !Unit(packet.browInnerUp) ||
                float.IsNaN(packet.ageMilliseconds) ||
                float.IsInfinity(packet.ageMilliseconds) ||
                packet.ageMilliseconds < 0f || packet.ageMilliseconds > 120f)
                return false;

            lastSequence = packet.sequence;
            receivedAt = now - packet.ageMilliseconds * .001f;
            current = packet;
            return true;
        }

        public bool TryRead(float now, out float jawOpen, out float blink,
            out float smile, out float eyebrow)
        {
            jawOpen = blink = smile = eyebrow = 0f;
            if (current == null || now < receivedAt || now - receivedAt > MaxAge)
                return false;
            jawOpen = current.jawOpen;
            blink = Mathf.Max(current.eyeBlinkLeft, current.eyeBlinkRight);
            smile = (current.mouthSmileLeft + current.mouthSmileRight) * .5f;
            eyebrow = current.browInnerUp;
            return true;
        }
    }
}
