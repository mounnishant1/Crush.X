using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    // Receives an ALREADY-ROTATED, ALREADY-CROPPED, viewport-aligned 2D face
    // landmark subset from a licensed camera/landmarker provider. UV origin is
    // bottom-left and both coordinates must match the rendered preview.
    [Serializable]
    public sealed class FaceWarpPacket
    {
        public int sequence;
        public bool hasFace;
        public float confidence;
        public float ageMilliseconds;
        public Vector2 leftEye;
        public Vector2 rightEye;
        public Vector2 mouth;
        public Vector2 eyeRadius;
        public Vector2 mouthRadius;
    }

    public enum FunnyWarpMode { Off, BigEyes, BigMouth, BeautyGlow, BeautyBlush }

    public sealed class FaceWarpFrameSource : MonoBehaviour
    {
        public const float MaximumFrameAgeSeconds = .18f;
        private const float MinimumConfidence = .65f;
        private const float MaxAcceptedTransportAgeMs = 120f;

        public static FaceWarpFrameSource Active { get; private set; }
        public FunnyWarpMode Mode { get; private set; }
        public float Intensity { get; private set; } = .72f;
        public float BeautyIntensity { get; private set; } = .52f;

        private int lastSequence;
        private float lastFrameAt = -999f;
        private FaceWarpPacket frame;
        public bool HasFreshFrame(float now) =>
            Mode != FunnyWarpMode.Off && frame != null && frame.hasFace &&
            now - lastFrameAt >= 0f && now - lastFrameAt <= MaximumFrameAgeSeconds;

        private void Awake()
        {
            Active = this;
        }

        private void OnDestroy()
        {
            if (Active == this) Active = null;
        }

        public void SetLens(string id)
        {
            FunnyWarpMode newMode = id == "funny-big-eyes" ? FunnyWarpMode.BigEyes :
                id == "funny-jumbo-mouth" ? FunnyWarpMode.BigMouth :
                id == "beauty-glow" ? FunnyWarpMode.BeautyGlow :
                id == "beauty-blush" ? FunnyWarpMode.BeautyBlush : FunnyWarpMode.Off;
            if (newMode != Mode)
            {
                Mode = newMode;
                frame = null;
                lastSequence = 0;
            }
        }

        public void SetIntensity(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) return;
            Intensity = Mathf.Clamp01(value);
        }

        public void SetBeautyIntensity(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) return;
            BeautyIntensity = Mathf.Clamp01(value);
        }

        public bool TryGetBeautyParameters(float now, out Vector4 face,
            out Vector4 leftEye, out Vector4 rightEye, out Vector4 mouth,
            out float intensity, out int mode)
        {
            face = leftEye = rightEye = mouth = Vector4.zero;
            intensity = 0f;
            mode = 0;
            if (!HasFreshFrame(now) || BeautyIntensity <= 0f ||
                (Mode != FunnyWarpMode.BeautyGlow &&
                 Mode != FunnyWarpMode.BeautyBlush)) return false;

            Vector2 eyeMidpoint = (frame.leftEye + frame.rightEye) * .5f;
            float eyeSpacing = Vector2.Distance(frame.leftEye, frame.rightEye);
            float eyeMouth = Vector2.Distance(eyeMidpoint, frame.mouth);
            if (eyeSpacing < .03f || eyeMouth < .035f) return false;

            // A conservative ellipse: avoid touching camera background.
            Vector2 center = new Vector2(eyeMidpoint.x,
                Mathf.Clamp01((eyeMidpoint.y + frame.mouth.y) * .5f));
            Vector2 radius = new Vector2(
                Mathf.Clamp(eyeSpacing * .88f, .09f, .38f),
                Mathf.Clamp(eyeMouth * 1.50f, .10f, .42f));
            if (center.x - radius.x < 0f || center.x + radius.x > 1f ||
                center.y - radius.y < 0f || center.y + radius.y > 1f)
                return false;

            face = new Vector4(center.x, center.y, radius.x, radius.y);
            leftEye = new Vector4(frame.leftEye.x, frame.leftEye.y,
                frame.eyeRadius.x, frame.eyeRadius.y);
            rightEye = new Vector4(frame.rightEye.x, frame.rightEye.y,
                frame.eyeRadius.x, frame.eyeRadius.y);
            mouth = new Vector4(frame.mouth.x, frame.mouth.y,
                frame.mouthRadius.x, frame.mouthRadius.y);
            intensity = BeautyIntensity;
            mode = Mode == FunnyWarpMode.BeautyGlow ? 1 : 2;
            return true;
        }

        public void Invalidate()
        {
            frame = null;
            lastFrameAt = -999f;
            lastSequence = 0;
        }

        private static bool ValidPosition(Vector2 point)
        {
            return !float.IsNaN(point.x) && !float.IsNaN(point.y) &&
                   !float.IsInfinity(point.x) && !float.IsInfinity(point.y) &&
                   point.x > .01f && point.x < .99f &&
                   point.y > .01f && point.y < .99f;
        }

        private static bool ValidRadius(Vector2 radius)
        {
            return !float.IsNaN(radius.x) && !float.IsNaN(radius.y) &&
                   !float.IsInfinity(radius.x) && !float.IsInfinity(radius.y) &&
                   radius.x >= .015f && radius.x <= .35f &&
                   radius.y >= .015f && radius.y <= .35f;
        }

        // Feed is not authentication: the Android caller MUST have authenticated
        // its model/runtime and must not pass external arbitrary JSON directly.
        public bool TryApplyJson(string payload, float now)
        {
            if (string.IsNullOrEmpty(payload) || payload.Length > 1200) return false;
            FaceWarpPacket incoming;
            try { incoming = JsonUtility.FromJson<FaceWarpPacket>(payload); }
            catch (Exception) { return false; }
            if (incoming == null || incoming.sequence <= lastSequence ||
                incoming.sequence <= 0) return false;

            if (!incoming.hasFace)
            {
                lastSequence = incoming.sequence;
                frame = null;
                return true;
            }

            if (incoming.confidence < MinimumConfidence || incoming.confidence > 1f ||
                float.IsNaN(incoming.confidence) ||
                float.IsNaN(incoming.ageMilliseconds) ||
                incoming.ageMilliseconds < 0f ||
                incoming.ageMilliseconds > MaxAcceptedTransportAgeMs ||
                !ValidPosition(incoming.leftEye) || !ValidPosition(incoming.rightEye) ||
                !ValidPosition(incoming.mouth) ||
                !ValidRadius(incoming.eyeRadius) || !ValidRadius(incoming.mouthRadius) ||
                Vector2.Distance(incoming.leftEye, incoming.rightEye) < .03f)
                return false;

            lastSequence = incoming.sequence;
            frame = incoming;
            lastFrameAt = now - incoming.ageMilliseconds * .001f;
            return true;
        }

        public bool TryGetShaderParameters(float now, out Vector4 leftEye,
            out Vector4 rightEye, out Vector4 mouth, out float eyeStrength,
            out float mouthStrength)
        {
            leftEye = rightEye = mouth = Vector4.zero;
            eyeStrength = mouthStrength = 0;
            if (!HasFreshFrame(now) || Intensity <= 0) return false;

            // Radius is in viewport UV coordinates. The GPU shader clamps UV.
            leftEye = new Vector4(frame.leftEye.x, frame.leftEye.y,
                frame.eyeRadius.x, frame.eyeRadius.y);
            rightEye = new Vector4(frame.rightEye.x, frame.rightEye.y,
                frame.eyeRadius.x, frame.eyeRadius.y);
            mouth = new Vector4(frame.mouth.x, frame.mouth.y,
                frame.mouthRadius.x, frame.mouthRadius.y);
            eyeStrength = Mode == FunnyWarpMode.BigEyes ? Intensity * .65f : 0f;
            mouthStrength = Mode == FunnyWarpMode.BigMouth ? Intensity * .75f : 0f;
            return eyeStrength > 0 || mouthStrength > 0;
        }
    }
}
