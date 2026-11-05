using System;
using UnityEngine;

namespace CrushX.LensEngine
{
    [Serializable]
    public sealed class MultiFaceFunnyPacket
    {
        [Serializable]
        public sealed class Face
        {
            public float x;
            public float y;
            public float size;
        }
        public int sequence;
        public bool hasFace;
        public float ageMilliseconds;
        public Face[] faces;
    }

    /// <summary>
    /// In-memory, temporary screen-space comic crowns for up to three faces.
    /// Per-frame face slots are NOT stable people IDs; photo/MP4 QA is pending.
    /// Never writes photos/landmarks or makes network requests.
    /// </summary>
    public sealed class MultiFaceFunnyOverlay : MonoBehaviour
    {
        public LensEngineBootstrap Engine;
        private MultiFaceFunnyPacket last;
        private float lastAt = -999f;
        private int lastSequence;
        private GUIStyle faceStyle;
        private bool activeLastFrame;

        public int VisibleFaces(float now)
        {
            if (last == null || last.faces == null ||
                now < lastAt || now - lastAt > .18f) return 0;
            return last.faces.Length;
        }

        public void Invalidate()
        {
            last = null;
            lastAt = -999f;
            lastSequence = 0;
        }

        private static bool Range(float x, float min, float max) =>
            !float.IsNaN(x) && !float.IsInfinity(x) && x >= min && x <= max;

        public bool Apply(string json, float now)
        {
            if (string.IsNullOrEmpty(json) || json.Length > 1200) return false;
            MultiFaceFunnyPacket packet;
            try { packet = JsonUtility.FromJson<MultiFaceFunnyPacket>(json); }
            catch (Exception) { return false; }
            if (packet == null || packet.sequence <= lastSequence ||
                packet.sequence <= 0 || !Range(packet.ageMilliseconds, 0, 120f))
                return false;
            if (!packet.hasFace)
            {
                Invalidate();
                lastSequence = packet.sequence;
                return true;
            }
            if (packet.faces == null || packet.faces.Length == 0 ||
                packet.faces.Length > 3) return false;
            foreach (var face in packet.faces)
                if (face == null || !Range(face.x, .01f, .99f) ||
                    !Range(face.y, .01f, .99f) ||
                    !Range(face.size, .06f, .35f)) return false;

            lastSequence = packet.sequence;
            lastAt = now - packet.ageMilliseconds / 1000f;
            last = packet;
            return true;
        }

        private void OnGUI()
        {
            if (Engine == null ||
                Engine.ActiveId != "funny-group-party" ||
                VisibleFaces(Time.realtimeSinceStartup) == 0)
                return;
            if (faceStyle == null)
            {
                faceStyle = new GUIStyle(GUI.skin.label)
                {
                    fontSize = Mathf.RoundToInt(Mathf.Clamp(Screen.width / 18f, 22f, 44f)),
                    alignment = TextAnchor.MiddleCenter,
                    fontStyle = FontStyle.Bold
                };
                faceStyle.normal.textColor = new Color(1f, .85f, .23f, 1f);
            }

            // GUI coordinates originate at top-left. Packet UV y is bottom-left.
            foreach (var face in last.faces)
            {
                float x = face.x * Screen.width;
                float y = (1f - face.y) * Screen.height;
                float size = Mathf.Min(Screen.width, Screen.height) * face.size;
                if (x - size < 0 || x + size > Screen.width ||
                    y - size < 0 || y + size > Screen.height) continue;

                // Original comic symbol, not a vendor lens asset or trademark.
                GUI.Label(new Rect(x - size, y - size * 1.35f, size * 2,
                    size * .7f), "✦ ✦ ✦", faceStyle);
            }
        }
    }

    public sealed class GroupPartyFunnyLens : LensEffect
    {
        public override string LensId { get { return "funny-group-party"; } }
        private Transform orbit;
        public override void Build()
        {
            orbit = new GameObject("GroupPartyOrbit").transform;
            orbit.SetParent(transform, false);
            orbit.localPosition = new Vector3(0, .39f, 0);
            LensGeometry.Ring(orbit, "PartyRing", Vector3.zero,
                .22f, .018f, new Color(1f, .7f, .18f));
            for (int i = 0; i < 5; i++)
            {
                float a = Mathf.PI * 2f * i / 5f;
                LensGeometry.Add(orbit, "OriginalConfetti" + i,
                    PrimitiveType.Sphere,
                    new Vector3(Mathf.Cos(a) * .22f,
                        Mathf.Sin(a) * .22f, 0f),
                    Vector3.one * .045f, i % 2 == 0 ? Color.cyan : Color.magenta);
            }
        }

        public override void Animate(FaceSample face, float time)
        {
            if (orbit != null)
                orbit.localRotation = Quaternion.Euler(0f, 0f, time * 26f);
        }
    }
}
