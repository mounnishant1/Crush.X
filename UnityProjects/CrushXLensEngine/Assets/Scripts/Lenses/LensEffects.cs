using UnityEngine;

namespace CrushX.LensEngine
{
    public abstract class LensEffect : MonoBehaviour, ILensEffect
    {
        public abstract string LensId { get; }
        public abstract void Build();
        public virtual void OnSelected() { }
        public virtual void OnDeselected() { }
        public virtual void Animate(FaceSample face, float elapsedSeconds) { }
        private bool resourcesReleased;
        public void ReleaseResources()
        {
            if (resourcesReleased) return;
            resourcesReleased = true;
            foreach (MeshFilter filter in GetComponentsInChildren<MeshFilter>(true))
            {
                Mesh mesh = filter.sharedMesh;
                if (mesh != null && (mesh.name.EndsWith("-torus") || mesh.name.EndsWith("-mesh")))
                {
                    if (Application.isPlaying) Destroy(mesh);
                    else DestroyImmediate(mesh);
                }
            }
        }
        protected virtual void OnDestroy() { ReleaseResources(); }

        protected Transform Piece(string name, PrimitiveType type, Vector3 position, Vector3 scale, Color color, Vector3? rotation = null)
        { return LensGeometry.Add(transform, name, type, position, scale, color, rotation); }
        protected Transform Ring(string name, Vector3 position, float radius, float thickness, Color color)
        { return LensGeometry.Ring(transform, name, position, radius, thickness, color); }
        protected Transform Spire(string name, Vector3 position, float radius, float height, Color color)
        { return LensGeometry.Spire(transform, name, position, radius, height, color); }
    }

    // 01: ears tilt with head; pupils/nose/whiskers are fully 3D.
    public sealed class CatEarsLens : LensEffect
    {
        public override string LensId { get { return "cat-ears"; } }
        private Transform left, right;
        public override void Build()
        {
            left = Spire("LeftCatEar", new Vector3(-.21f, .26f, 0), .13f, .29f, new Color(.97f, .62f, .73f));
            right = Spire("RightCatEar", new Vector3(.21f, .26f, 0), .13f, .29f, new Color(.97f, .62f, .73f));
            Piece("Nose", PrimitiveType.Sphere, new Vector3(0, -.085f, -.26f), new Vector3(.07f, .04f, .045f), Color.magenta);
            for (int side = -1; side <= 1; side += 2)
                for (int w = -1; w <= 1; w++)
                    Piece("Whisker", PrimitiveType.Cylinder, new Vector3(side * .18f, -.12f + w * .029f, -.20f), new Vector3(.006f, .135f, .006f), Color.white, new Vector3(0, 0, 90 + w * 15));
        }
        public override void Animate(FaceSample face, float t)
        {
            left.localRotation = Quaternion.Euler(0, 0, -7 + Mathf.Sin(t * 3) * 5);
            right.localRotation = Quaternion.Euler(0, 0, 7 - Mathf.Sin(t * 3) * 5);
        }
    }

    // 02: dog ears bounce; tongue appearance follows expression input when available.
    public sealed class PuppyLens : LensEffect
    {
        public override string LensId { get { return "puppy"; } }
        private Transform left, right, tongue;
        public override void Build()
        {
            var brown = new Color(.55f, .30f, .15f);
            left = Piece("LeftFloppyEar", PrimitiveType.Capsule, new Vector3(-.28f, .14f, .03f), new Vector3(.17f, .31f, .13f), brown, new Vector3(0, 0, -32));
            right = Piece("RightFloppyEar", PrimitiveType.Capsule, new Vector3(.28f, .14f, .03f), new Vector3(.17f, .31f, .13f), brown, new Vector3(0, 0, 32));
            Piece("Muzzle", PrimitiveType.Sphere, new Vector3(0, -.12f, -.255f), new Vector3(.19f, .12f, .11f), new Color(.93f, .80f, .62f));
            Piece("Nose", PrimitiveType.Sphere, new Vector3(0, -.07f, -.32f), new Vector3(.085f, .052f, .045f), new Color(.09f, .07f, .08f));
            tongue = Piece("Tongue", PrimitiveType.Capsule, new Vector3(0, -.23f, -.28f), new Vector3(.055f, .11f, .035f), new Color(.96f, .32f, .55f));
        }
        public override void Animate(FaceSample face, float t)
        {
            left.localRotation = Quaternion.Euler(0, 0, -32 - Mathf.Sin(t * 7) * 6);
            right.localRotation = Quaternion.Euler(0, 0, 32 + Mathf.Sin(t * 7) * 6);
            tongue.localScale = new Vector3(.055f, .025f + face.MouthOpen * .16f, .035f);
        }
    }

    // 03: fully 3D sci-fi visor with moving scan line and antennae.
    public sealed class CyberVisorLens : LensEffect
    {
        public override string LensId { get { return "cyber-visor"; } }
        private Transform scan;
        public override void Build()
        {
            var dark = new Color(.045f, .09f, .15f);
            Piece("Frame", PrimitiveType.Cube, new Vector3(0, .055f, -.265f), new Vector3(.66f, .17f, .07f), dark);
            Piece("Display", PrimitiveType.Cube, new Vector3(0, .05f, -.315f), new Vector3(.56f, .11f, .015f), new Color(.0f, .75f, .85f));
            scan = Piece("ScanLine", PrimitiveType.Cube, new Vector3(-.22f, .05f, -.328f), new Vector3(.012f, .12f, .008f), Color.white);
            for (int side = -1; side <= 1; side += 2)
                Piece("SideAntenna", PrimitiveType.Cylinder, new Vector3(side * .32f, .10f, -.1f), new Vector3(.02f, .11f, .02f), Color.cyan, new Vector3(0, 0, side * 16));
        }
        public override void Animate(FaceSample face, float t)
        { scan.localPosition = new Vector3(Mathf.PingPong(t * .24f, .45f) - .225f, .05f, -.328f); }
    }

    // 04: fox ears with animated asymmetrical expression and muzzle.
    public sealed class FoxLens : LensEffect
    {
        public override string LensId { get { return "fox"; } }
        private Transform left, right;
        public override void Build()
        {
            Color fur = new Color(1f, .36f, .075f);
            left = Spire("FoxEarL", new Vector3(-.205f, .24f, 0), .15f, .36f, fur);
            right = Spire("FoxEarR", new Vector3(.205f, .24f, 0), .15f, .36f, fur);
            Piece("MuzzleL", PrimitiveType.Sphere, new Vector3(-.085f, -.12f, -.25f), new Vector3(.15f, .09f, .10f), Color.white);
            Piece("MuzzleR", PrimitiveType.Sphere, new Vector3(.085f, -.12f, -.25f), new Vector3(.15f, .09f, .10f), Color.white);
            Piece("FoxNose", PrimitiveType.Sphere, new Vector3(0, -.078f, -.32f), new Vector3(.06f, .04f, .04f), Color.black);
        }
        public override void Animate(FaceSample face, float t)
        {
            left.localRotation = Quaternion.Euler(0, Mathf.Sin(t * 2) * 8, -7);
            right.localRotation = Quaternion.Euler(0, -Mathf.Sin(t * 2) * 8, 7);
        }
    }

    // 05: gemstone crown rotates slowly above head.
    public sealed class HoloCrownLens : LensEffect
    {
        public override string LensId { get { return "holo-crown"; } }
        private Transform crown;
        public override void Build()
        {
            crown = new GameObject("RotatingCrown").transform;
            crown.SetParent(transform, false);
            crown.localPosition = new Vector3(0, .42f, 0);
            LensGeometry.Ring(crown, "CrownBand", Vector3.zero, .26f, .025f, new Color(.92f, .70f, .18f));
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI * 2 / 8;
                LensGeometry.Spire(crown, "Crystal" + i, new Vector3(Mathf.Cos(a) * .26f, Mathf.Sin(a) * .26f, 0), .06f, i % 2 == 0 ? .16f : .10f,
                    i % 2 == 0 ? new Color(.4f, 1f, 1f) : new Color(.90f, .35f, 1f));
            }
        }
        public override void Animate(FaceSample face, float t)
        { crown.localRotation = Quaternion.Euler(12f, t * 26f, 0); }
    }

    // 06: geometric butterfly wings beat by pivot (no static color overlay).
    public sealed class ButterflyLens : LensEffect
    {
        public override string LensId { get { return "butterfly"; } }
        private Transform left, right;
        public override void Build()
        {
            left = new GameObject("WingPivotL").transform;
            right = new GameObject("WingPivotR").transform;
            left.SetParent(transform, false); right.SetParent(transform, false);
            left.localPosition = new Vector3(-.22f, .03f, .05f);
            right.localPosition = new Vector3(.22f, .03f, .05f);
            for (int i = 0; i < 2; i++)
            {
                float y = i == 0 ? .18f : -.13f;
                LensGeometry.Add(left, "PurpleWing", PrimitiveType.Sphere, new Vector3(-.20f, y, 0), new Vector3(.39f, i == 0 ? .29f : .22f, .025f), new Color(.65f, .28f, 1));
                LensGeometry.Add(right, "BlueWing", PrimitiveType.Sphere, new Vector3(.20f, y, 0), new Vector3(.39f, i == 0 ? .29f : .22f, .025f), new Color(.25f, .72f, 1));
            }
            Piece("Body", PrimitiveType.Capsule, new Vector3(0, .03f, -.27f), new Vector3(.04f, .27f, .04f), new Color(.09f, .10f, .21f));
        }
        public override void Animate(FaceSample face, float t)
        {
            float wing = 25 + Mathf.Sin(t * 8) * 35;
            left.localRotation = Quaternion.Euler(0, wing, -9);
            right.localRotation = Quaternion.Euler(0, -wing, 9);
        }
    }

    // 07: robotic housing with blinking optics and articulated antenna.
    public sealed class RoboHelmetLens : LensEffect
    {
        public override string LensId { get { return "robo-helmet"; } }
        private Transform leftEye, rightEye;
        public override void Build()
        {
            Color metal = new Color(.35f, .43f, .51f);
            Piece("HelmetTop", PrimitiveType.Cube, new Vector3(0, .21f, .02f), new Vector3(.60f, .20f, .34f), metal);
            Piece("HelmetSideL", PrimitiveType.Cube, new Vector3(-.285f, 0, .02f), new Vector3(.09f, .26f, .25f), metal);
            Piece("HelmetSideR", PrimitiveType.Cube, new Vector3(.285f, 0, .02f), new Vector3(.09f, .26f, .25f), metal);
            leftEye = Piece("EyeL", PrimitiveType.Sphere, new Vector3(-.12f, .05f, -.28f), new Vector3(.075f, .065f, .018f), Color.cyan);
            rightEye = Piece("EyeR", PrimitiveType.Sphere, new Vector3(.12f, .05f, -.28f), new Vector3(.075f, .065f, .018f), Color.cyan);
            Piece("Antenna", PrimitiveType.Cylinder, new Vector3(0, .39f, 0), new Vector3(.014f, .11f, .014f), metal);
            Piece("AntennaTip", PrimitiveType.Sphere, new Vector3(0, .51f, 0), new Vector3(.055f, .055f, .055f), Color.red);
        }
        public override void Animate(FaceSample face, float t)
        {
            float blink = face.Blink > .5f || Mathf.Sin(t * .65f) > .995f ? .01f : .065f;
            leftEye.localScale = new Vector3(.075f, blink, .018f);
            rightEye.localScale = new Vector3(.075f, blink, .018f);
        }
    }

    // 08: orbiting halo beads with independent rotation.
    public sealed class CelestialHaloLens : LensEffect
    {
        public override string LensId { get { return "celestial-halo"; } }
        private Transform orbit;
        public override void Build()
        {
            orbit = new GameObject("Orbit").transform;
            orbit.SetParent(transform, false);
            orbit.localPosition = new Vector3(0, .45f, 0);
            LensGeometry.Ring(orbit, "GoldenOrbit", Vector3.zero, .23f, .014f, new Color(1f, .78f, .16f));
            for (int i = 0; i < 7; i++)
            {
                float a = i * Mathf.PI * 2 / 7;
                LensGeometry.Add(orbit, "OrbitStar", PrimitiveType.Sphere, new Vector3(Mathf.Cos(a) * .23f, Mathf.Sin(a) * .23f, 0),
                    Vector3.one * (i % 2 == 0 ? .07f : .04f), new Color(.99f, .86f, .29f));
            }
        }
        public override void Animate(FaceSample face, float t)
        {
            orbit.localRotation = Quaternion.Euler(15, 0, t * 40);
            orbit.localPosition = new Vector3(0, .45f + Mathf.Sin(t * 2) * .018f, 0);
        }
    }

    // 09: dual 3D neon eye rings, dynamic cheek bars.
    public sealed class NeonMaskLens : LensEffect
    {
        public override string LensId { get { return "neon-mask"; } }
        private Transform left, right;
        public override void Build()
        {
            left = Ring("LeftEyeLoop", new Vector3(-.14f, .07f, -.28f), .105f, .012f, Color.cyan);
            right = Ring("RightEyeLoop", new Vector3(.14f, .07f, -.28f), .105f, .012f, Color.magenta);
            Piece("CheekL", PrimitiveType.Cube, new Vector3(-.19f, -.13f, -.235f), new Vector3(.19f, .018f, .014f), Color.cyan, new Vector3(0, 0, 15));
            Piece("CheekR", PrimitiveType.Cube, new Vector3(.19f, -.13f, -.235f), new Vector3(.19f, .018f, .014f), Color.magenta, new Vector3(0, 0, -15));
        }
        public override void Animate(FaceSample face, float t)
        {
            float breathe = 1 + Mathf.Sin(t * 3f) * .06f;
            left.localScale = Vector3.one * breathe; right.localScale = Vector3.one * breathe;
        }
    }

    // 10: pair of swept dragon horns + a procedural mouth-reactive flame.
    public sealed class DragonLens : LensEffect
    {
        public override string LensId { get { return "dragon"; } }
        private Transform flame;
        public override void Build()
        {
            var horns = new Color(.18f, .68f, .38f);
            Transform l = Spire("HornL", new Vector3(-.18f, .25f, .02f), .095f, .32f, horns);
            Transform r = Spire("HornR", new Vector3(.18f, .25f, .02f), .095f, .32f, horns);
            l.localRotation = Quaternion.Euler(0, 0, 23);
            r.localRotation = Quaternion.Euler(0, 0, -23);
            Piece("ScaleL", PrimitiveType.Sphere, new Vector3(-.28f, -.09f, -.05f), new Vector3(.13f, .15f, .065f), horns);
            Piece("ScaleR", PrimitiveType.Sphere, new Vector3(.28f, -.09f, -.05f), new Vector3(.13f, .15f, .065f), horns);
            flame = Spire("Flame", new Vector3(0, -.30f, -.39f), .08f, .27f, new Color(1f, .35f, .05f));
            flame.localRotation = Quaternion.Euler(180, 0, 0);
        }
        public override void Animate(FaceSample face, float t)
        {
            float expression = Mathf.Max(.1f, face.MouthOpen);
            flame.localScale = new Vector3(1 + Mathf.Sin(t * 14) * .2f, expression, 1);
        }
    }
}
