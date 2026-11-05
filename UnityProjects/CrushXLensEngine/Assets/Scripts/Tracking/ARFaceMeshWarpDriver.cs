using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Experimental on-device fallback: approximates eye/mouth locations from
    /// the tracked AR face mesh bounding rectangle. Unlike MediaPipe 478-point
    /// landmarks this is NOT precise anatomical feature tracking. It never
    /// invents a face when ARCore has no tracked mesh.
    /// </summary>
    public sealed class ARFaceMeshWarpDriver : MonoBehaviour
    {
        public ARFaceManager FaceManager;
        public Camera PreviewCamera;
        public LensEngineBootstrap Engine;
        [Range(5f, 30f)] public float TargetUpdatesPerSecond = 15f;

        private float nextReadAt;
        private int sequence;

        private void Update()
        {
            if (Engine == null || FaceManager == null || PreviewCamera == null) return;
            if (Engine.ActiveId != "funny-big-eyes" &&
                Engine.ActiveId != "funny-jumbo-mouth") return;
            if (Time.unscaledTime < nextReadAt) return;
            nextReadAt = Time.unscaledTime + 1f / Mathf.Max(5f, TargetUpdatesPerSecond);

            if (!FaceManager.isActiveAndEnabled || FaceManager.subsystem == null ||
                !FaceManager.subsystem.running)
            {
                Engine.ClearWarpTracking();
                return;
            }

            foreach (var face in FaceManager.trackables)
            {
                if (face == null || face.trackingState != TrackingState.Tracking ||
                    !face.vertices.IsCreated || face.vertices.Length < 100) continue;

                Vector2 min = new Vector2(2f, 2f), max = new Vector2(-1f, -1f);
                int visibleCount = 0;
                var vertices = face.vertices;
                for (int i = 0; i < vertices.Length; i += 2)
                {
                    Vector3 viewport = PreviewCamera.WorldToViewportPoint(
                        face.transform.TransformPoint(vertices[i]));
                    if (viewport.z <= 0f || viewport.x < -.2f || viewport.x > 1.2f ||
                        viewport.y < -.2f || viewport.y > 1.2f) continue;
                    visibleCount++;
                    min = Vector2.Min(min, (Vector2)viewport);
                    max = Vector2.Max(max, (Vector2)viewport);
                }

                Vector2 size = max - min;
                if (visibleCount < 40 || size.x < .08f || size.x > .9f ||
                    size.y < .10f || size.y > .9f) continue;

                Vector2 left = new Vector2(min.x + size.x * .35f,
                    min.y + size.y * .64f);
                Vector2 right = new Vector2(min.x + size.x * .65f,
                    min.y + size.y * .64f);
                Vector2 mouth = new Vector2(min.x + size.x * .5f,
                    min.y + size.y * .31f);
                Vector2 eyeSize = new Vector2(Mathf.Clamp(size.x * .14f, .015f, .35f),
                    Mathf.Clamp(size.y * .115f, .015f, .35f));
                Vector2 mouthSize = new Vector2(Mathf.Clamp(size.x * .23f, .015f, .35f),
                    Mathf.Clamp(size.y * .14f, .015f, .35f));

                var packet = new FaceWarpPacket
                {
                    sequence = ++sequence,
                    hasFace = true,
                    confidence = .75f, // ARCore tracking present, NOT a per-feature confidence.
                    ageMilliseconds = 0,
                    leftEye = left,
                    rightEye = right,
                    mouth = mouth,
                    eyeRadius = eyeSize,
                    mouthRadius = mouthSize
                };
                Engine.PushFaceWarpFrame(JsonUtility.ToJson(packet));
                return;
            }

            // Never keep a stale deformation when the tracked face is gone.
            Engine.ClearWarpTracking();
        }
    }
}
