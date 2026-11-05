using UnityEngine;

namespace CrushX.LensEngine
{
    // Original procedural comedy looks. These are tracked 3D overlays, not
    // image-space deformation of the phone camera or copied third-party lenses.
    public abstract class FunnyLensEffect : LensEffect
    {
        protected static float Open(FaceSample face)
        {
            return face.Valid ? Mathf.Clamp01(face.MouthOpen) : 0f;
        }

        protected static float Blinking(FaceSample face)
        {
            return face.Valid ? Mathf.Clamp01(face.Blink) : 0f;
        }

        protected static float Pulse(float t, float rate, float amplitude)
        {
            return 1f + Mathf.Sin(t * rate) * amplitude;
        }
    }

    public sealed class FunnyBigEyesLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-big-eyes"; } }
        private Transform left, right;
        public override void Build()
        {
            left = MakeEye(-1);
            right = MakeEye(1);
        }

        private Transform MakeEye(int side)
        {
            Transform eye = new GameObject(side < 0 ? "PopEyeLeft" : "PopEyeRight").transform;
            eye.SetParent(transform, false);
            eye.localPosition = new Vector3(side * .15f, .07f, -.30f);
            LensGeometry.Add(eye, "White", PrimitiveType.Sphere, Vector3.zero,
                new Vector3(.18f, .19f, .065f), Color.white);
            LensGeometry.Add(eye, "Iris", PrimitiveType.Sphere,
                new Vector3(side * .018f, 0, -.064f), new Vector3(.079f, .087f, .018f),
                new Color(.12f, .60f, .74f));
            LensGeometry.Add(eye, "Pupil", PrimitiveType.Sphere,
                new Vector3(side * .018f, 0, -.082f), new Vector3(.043f, .052f, .016f), Color.black);
            return eye;
        }
        public override void Animate(FaceSample f, float t)
        {
            float y = Mathf.Max(.10f, 1f - Blinking(f) * .85f);
            float x = Pulse(t, 3.5f, .04f);
            left.localScale = new Vector3(x, y, 1);
            right.localScale = new Vector3(x, y, 1);
        }
    }

    public sealed class FunnyJumboMouthLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-jumbo-mouth"; } }
        private Transform mouth, tongue;
        public override void Build()
        {
            mouth = new GameObject("CartoonMouth").transform;
            mouth.SetParent(transform, false);
            mouth.localPosition = new Vector3(0, -.18f, -.285f);
            LensGeometry.Add(mouth, "DarkInside", PrimitiveType.Sphere,
                Vector3.zero, new Vector3(.28f, .17f, .024f), new Color(.18f, .02f, .08f));
            LensGeometry.Ring(mouth, "Lips", Vector3.zero, .17f, .028f, new Color(.96f, .26f, .44f));
            tongue = LensGeometry.Add(mouth, "Tongue", PrimitiveType.Sphere,
                new Vector3(0, -.075f, -.028f),
                new Vector3(.13f, .052f, .012f), new Color(1f, .48f, .62f));
        }
        public override void Animate(FaceSample f, float t)
        {
            float open = Open(f);
            mouth.localScale = new Vector3(1.12f, .6f + open * 1.45f, 1);
            tongue.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 3) * 8);
        }
    }

    public sealed class FunnyBalloonCheeksLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-balloon-cheeks"; } }
        private Transform left, right;
        public override void Build()
        {
            Color rose = new Color(1f, .48f, .58f);
            left = Piece("CheekL", PrimitiveType.Sphere,
                new Vector3(-.23f, -.115f, -.19f), new Vector3(.18f, .15f, .11f), rose);
            right = Piece("CheekR", PrimitiveType.Sphere,
                new Vector3(.23f, -.115f, -.19f), new Vector3(.18f, .15f, .11f), rose);
        }
        public override void Animate(FaceSample f, float t)
        {
            float s = 1f + Open(f) * .30f + Mathf.Sin(t * 3.2f) * .045f;
            left.localScale = right.localScale = new Vector3(.18f * s, .15f * s, .11f * s);
        }
    }

    public sealed class FunnyLongNoseLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-long-nose"; } }
        private Transform nose;
        public override void Build()
        {
            nose = new GameObject("RubberNose").transform;
            nose.SetParent(transform, false);
            nose.localPosition = new Vector3(0, -.032f, -.27f);
            LensGeometry.Add(nose, "LongNose", PrimitiveType.Capsule,
                new Vector3(0, 0, -.15f), new Vector3(.085f, .25f, .09f),
                new Color(.96f, .62f, .39f), new Vector3(90, 0, 0));
            LensGeometry.Add(nose, "NoseTip", PrimitiveType.Sphere,
                new Vector3(0, 0, -.36f), new Vector3(.105f, .09f, .105f),
                new Color(1f, .73f, .53f));
        }
        public override void Animate(FaceSample f, float t)
        {
            nose.localRotation = Quaternion.Euler(Mathf.Sin(t * 2) * 6,
                Mathf.Sin(t * 1.7f) * 8, 0);
        }
    }

    public sealed class FunnyMiniEyesLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-mini-eyes"; } }
        private Transform eyes;
        public override void Build()
        {
            eyes = new GameObject("TinyEyes").transform;
            eyes.SetParent(transform, false);
            for (int side = -1; side <= 1; side += 2)
            {
                LensGeometry.Ring(eyes, "OversizeFrame", new Vector3(side * .14f, .075f, -.272f),
                    .12f, .013f, Color.black);
                LensGeometry.Add(eyes, "TinyWhite", PrimitiveType.Sphere,
                    new Vector3(side * .14f, .075f, -.308f), Vector3.one * .047f, Color.white);
                LensGeometry.Add(eyes, "TinyPupil", PrimitiveType.Sphere,
                    new Vector3(side * .14f, .075f, -.34f), Vector3.one * .022f, Color.black);
            }
        }
        public override void Animate(FaceSample f, float t)
        {
            eyes.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 2.5f) * 3.5f);
        }
    }

    public sealed class FunnyWiggleBrowsLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-wiggle-brows"; } }
        private Transform left, right;
        public override void Build()
        {
            left = Piece("WiggleBrowL", PrimitiveType.Capsule,
                new Vector3(-.15f, .18f, -.247f), new Vector3(.16f, .034f, .025f),
                new Color(.23f, .09f, .035f), new Vector3(0, 0, -8));
            right = Piece("WiggleBrowR", PrimitiveType.Capsule,
                new Vector3(.15f, .18f, -.247f), new Vector3(.16f, .034f, .025f),
                new Color(.23f, .09f, .035f), new Vector3(0, 0, 8));
        }
        public override void Animate(FaceSample f, float t)
        {
            left.localPosition = new Vector3(-.15f, .18f + Mathf.Sin(t * 5) * .045f, -.247f);
            right.localPosition = new Vector3(.15f, .18f - Mathf.Sin(t * 5) * .045f, -.247f);
            left.localRotation = Quaternion.Euler(0, 0, -8f - 12f * Mathf.Sin(t * 5));
            right.localRotation = Quaternion.Euler(0, 0, 8f - 12f * Mathf.Sin(t * 5));
        }
    }

    public sealed class FunnyPartyClownLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-party-clown"; } }
        private Transform nose, hat;
        public override void Build()
        {
            nose = Piece("ClownNose", PrimitiveType.Sphere,
                new Vector3(0, -.025f, -.31f), new Vector3(.14f, .13f, .11f), Color.red);
            for (int side = -1; side <= 1; side += 2)
            {
                Piece("ClownCheek", PrimitiveType.Sphere,
                    new Vector3(side * .21f, -.16f, -.23f),
                    new Vector3(.075f, .05f, .015f), new Color(1f, .16f, .43f));
                Ring("EyeCircle", new Vector3(side * .13f, .075f, -.26f),
                    .12f, .012f, side < 0 ? Color.cyan : Color.magenta);
            }
            hat = Spire("PartyHat", new Vector3(0, .30f, .02f),
                .15f, .37f, new Color(.91f, .19f, .99f));
            Piece("HatPom", PrimitiveType.Sphere, new Vector3(0, .67f, .02f),
                Vector3.one * .074f, Color.yellow);
        }
        public override void Animate(FaceSample f, float t)
        {
            nose.localScale = new Vector3(.14f, .13f, .11f) * Pulse(t, 6f, .10f);
            hat.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 4f) * 11f);
        }
    }

    public sealed class FunnyToothyGrinLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-toothy-grin"; } }
        private Transform smile;
        public override void Build()
        {
            smile = new GameObject("GiganticGrin").transform;
            smile.SetParent(transform, false);
            smile.localPosition = new Vector3(0, -.205f, -.29f);
            LensGeometry.Add(smile, "SmileBackground", PrimitiveType.Sphere,
                Vector3.zero, new Vector3(.36f, .10f, .022f),
                new Color(.19f, .018f, .037f));
            for (int i = 0; i < 9; i++)
            {
                LensGeometry.Add(smile, "Tooth" + i, PrimitiveType.Cube,
                    new Vector3((i - 4) * .068f, .01f, -.026f),
                    new Vector3(.062f, .06f, .013f), Color.white);
            }
        }
        public override void Animate(FaceSample f, float t)
        {
            smile.localScale = new Vector3(1f + Open(f) * .20f,
                1f + Open(f) * .95f, 1);
            smile.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 2.2f) * 4f);
        }
    }

    public sealed class FunnyNoodleStacheLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-noodle-stache"; } }
        private Transform left, right;
        public override void Build()
        {
            Color brown = new Color(.23f, .10f, .055f);
            left = Piece("CurlyMustacheL", PrimitiveType.Capsule,
                new Vector3(-.11f, -.137f, -.27f),
                new Vector3(.14f, .047f, .037f), brown, new Vector3(0, 0, -18));
            right = Piece("CurlyMustacheR", PrimitiveType.Capsule,
                new Vector3(.11f, -.137f, -.27f),
                new Vector3(.14f, .047f, .037f), brown, new Vector3(0, 0, 18));
            Ring("MustacheCurlL", new Vector3(-.255f, -.11f, -.28f), .045f, .009f, brown);
            Ring("MustacheCurlR", new Vector3(.255f, -.11f, -.28f), .045f, .009f, brown);
        }
        public override void Animate(FaceSample f, float t)
        {
            left.localRotation = Quaternion.Euler(0, 0, -18 + Mathf.Sin(t * 4) * 14);
            right.localRotation = Quaternion.Euler(0, 0, 18 - Mathf.Sin(t * 4) * 14);
        }
    }

    public sealed class FunnyBubblePopLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-bubble-pop"; } }
        private Transform[] bubbles;
        public override void Build()
        {
            bubbles = new Transform[7];
            for (int i = 0; i < bubbles.Length; i++)
            {
                bubbles[i] = Piece("SoapBubble" + i, PrimitiveType.Sphere,
                    new Vector3(0, -.20f, -.3f), Vector3.one * .055f,
                    i % 2 == 0 ? Color.cyan : new Color(.81f, .57f, 1f));
                bubbles[i].gameObject.SetActive(false);
            }
            Ring("BubbleMouth", new Vector3(0, -.18f, -.27f), .06f, .008f, Color.cyan);
        }
        public override void Animate(FaceSample f, float t)
        {
            bool active = Open(f) > .55f;
            for (int i = 0; i < bubbles.Length; i++)
            {
                Transform bubble = bubbles[i];
                bubble.gameObject.SetActive(active);
                if (!active) continue;
                float phase = Mathf.Repeat(t * .42f + i / 7f, 1f);
                bubble.localPosition = new Vector3(
                    Mathf.Sin(i * 2.3f + t) * (.065f + phase * .16f),
                    -.15f + phase * .48f, -.31f - phase * .08f);
                bubble.localScale = Vector3.one * (.045f + phase * .04f);
            }
        }
    }

    public sealed class FunnyGoofyGlassesLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-goofy-glasses"; } }
        private Transform glasses;
        public override void Build()
        {
            glasses = new GameObject("GoofyGlasses").transform;
            glasses.SetParent(transform, false);
            for (int side = -1; side <= 1; side += 2)
            {
                LensGeometry.Ring(glasses, "ThickFrame", new Vector3(side * .145f, .07f, -.27f),
                    .145f, .03f, side < 0 ? Color.yellow : Color.magenta);
                LensGeometry.Add(glasses, "FunnyPupil", PrimitiveType.Sphere,
                    new Vector3(side * .145f, .07f, -.34f),
                    new Vector3(.055f, .078f, .014f), Color.black);
            }
            LensGeometry.Add(glasses, "Bridge", PrimitiveType.Cube,
                new Vector3(0, .08f, -.26f), new Vector3(.11f, .025f, .025f),
                Color.yellow);
        }
        public override void Animate(FaceSample f, float t)
        {
            glasses.localPosition = new Vector3(0, Mathf.Sin(t * 3) * .01f, 0);
            glasses.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 2f) * 4);
        }
    }

    public sealed class FunnyJellyHeadLens : FunnyLensEffect
    {
        public override string LensId { get { return "funny-jelly-head"; } }
        private Transform outline;
        public override void Build()
        {
            outline = Ring("JellyHeadOutline", new Vector3(0, .04f, .10f), .37f, .036f,
                new Color(.91f, .28f, .87f));
            Piece("JellyTop", PrimitiveType.Sphere, new Vector3(0, .365f, 0),
                new Vector3(.24f, .07f, .10f), Color.cyan);
            Piece("JellyChin", PrimitiveType.Sphere, new Vector3(0, -.36f, .02f),
                new Vector3(.21f, .07f, .10f), Color.magenta);
        }
        public override void Animate(FaceSample f, float t)
        {
            outline.localScale = new Vector3(1f + .15f * Mathf.Sin(t * 4.2f),
                1f - .12f * Mathf.Sin(t * 4.2f), 1f);
        }
    }
}
