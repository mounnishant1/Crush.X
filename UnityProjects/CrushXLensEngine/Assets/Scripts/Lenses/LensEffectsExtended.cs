using UnityEngine;

namespace CrushX.LensEngine
{
    // Procedural prototypes: geometry follows the tracked face pose. These are NOT
    // skin-retouch, face-warp or production-grade makeup shaders.
    public sealed class BeautyGlowLens : LensEffect
    {
        public override string LensId { get { return "beauty-glow"; } }
        private Transform left, right;
        public override void Build()
        {
            Color pearl = new Color(1f, .76f, .85f);
            left = Ring("LeftCheekHighlight", new Vector3(-.19f, -.105f, -.23f), .072f, .009f, pearl);
            right = Ring("RightCheekHighlight", new Vector3(.19f, -.105f, -.23f), .072f, .009f, pearl);
            Piece("ForeheadPearl", PrimitiveType.Sphere, new Vector3(0, .235f, -.19f), Vector3.one * .042f, Color.white);
        }
        public override void Animate(FaceSample f, float t)
        {
            float s = 1f + Mathf.Sin(t * 2.4f) * .045f;
            left.localScale = right.localScale = Vector3.one * s;
        }
    }

    public sealed class BeautyBlushLens : LensEffect
    {
        public override string LensId { get { return "beauty-blush"; } }
        public override void Build()
        {
            for (int side = -1; side <= 1; side += 2)
            {
                Piece("Blush", PrimitiveType.Sphere, new Vector3(side * .19f, -.12f, -.238f),
                    new Vector3(.135f, .055f, .012f), new Color(.98f, .37f, .56f));
                Piece("Eyeliner", PrimitiveType.Cube, new Vector3(side * .13f, .087f, -.262f),
                    new Vector3(.18f, .012f, .012f), new Color(.19f, .10f, .17f),
                    new Vector3(0, 0, side * 8f));
            }
            Piece("LipTint", PrimitiveType.Sphere, new Vector3(0, -.211f, -.253f),
                new Vector3(.12f, .024f, .014f), new Color(.89f, .15f, .33f));
        }
    }

    public sealed class BeautyFrecklesLens : LensEffect
    {
        public override string LensId { get { return "beauty-freckles"; } }
        public override void Build()
        {
            Color c = new Color(.61f, .31f, .19f);
            for (int side = -1; side <= 1; side += 2)
            {
                for (int i = 0; i < 9; i++)
                {
                    float x = side * (.085f + (i % 3) * .044f);
                    float y = -.047f - (i / 3) * .031f;
                    Piece("Freckle" + side + "-" + i, PrimitiveType.Sphere,
                        new Vector3(x, y, -.267f + (i % 3) * .007f),
                        Vector3.one * (.008f + (i % 2) * .005f), c);
                }
            }
        }
    }

    public sealed class BeautyCrystalsLens : LensEffect
    {
        public override string LensId { get { return "beauty-crystals"; } }
        private Transform gems;
        public override void Build()
        {
            gems = new GameObject("CrystalJewels").transform;
            gems.SetParent(transform, false);
            Color rose = new Color(.92f, .43f, .89f);
            for (int side = -1; side <= 1; side += 2)
                for (int i = 0; i < 4; i++)
                    LensGeometry.Add(gems, "CheekGem", PrimitiveType.Sphere,
                        new Vector3(side * (.19f + i * .025f), -.095f - i * .028f, -.24f),
                        Vector3.one * (.035f - i * .005f), rose);
            LensGeometry.Ring(gems, "ForeheadJewel", new Vector3(0, .22f, -.21f),
                .035f, .007f, Color.cyan);
        }
        public override void Animate(FaceSample f, float t)
        {
            gems.localScale = Vector3.one * (1f + .045f * Mathf.Sin(t * 4f));
        }
    }

    public sealed class AlienClassicLens : LensEffect
    {
        public override string LensId { get { return "alien-classic"; } }
        private Transform antennaL, antennaR;
        public override void Build()
        {
            Color green = new Color(.28f, .93f, .47f);
            for (int side = -1; side <= 1; side += 2)
            {
                Ring("AlienEye", new Vector3(side * .14f, .06f, -.282f), .13f, .02f, green);
                Piece("OuterEye", PrimitiveType.Sphere, new Vector3(side * .14f, .06f, -.31f),
                    new Vector3(.12f, .16f, .016f), Color.black);
            }
            antennaL = Spire("AntennaL", new Vector3(-.16f, .37f, .02f), .055f, .29f, green);
            antennaR = Spire("AntennaR", new Vector3(.16f, .37f, .02f), .055f, .29f, green);
            Piece("AlienNose", PrimitiveType.Sphere, new Vector3(0, -.14f, -.26f),
                new Vector3(.055f, .04f, .04f), green);
        }
        public override void Animate(FaceSample f, float t)
        {
            antennaL.localRotation = Quaternion.Euler(0, 0, -12 + Mathf.Sin(t * 4) * 8);
            antennaR.localRotation = Quaternion.Euler(0, 0, 12 - Mathf.Sin(t * 4) * 8);
        }
    }

    public sealed class AlienNebulaLens : LensEffect
    {
        public override string LensId { get { return "alien-nebula"; } }
        private Transform orbit;
        public override void Build()
        {
            orbit = new GameObject("NebulaOrbit").transform;
            orbit.SetParent(transform, false);
            orbit.localPosition = new Vector3(0, .37f, 0);
            LensGeometry.Ring(orbit, "Orbit", Vector3.zero, .28f, .012f, Color.magenta);
            for (int i = 0; i < 9; i++)
            {
                float a = i * Mathf.PI * 2 / 9;
                LensGeometry.Add(orbit, "Planet", PrimitiveType.Sphere,
                    new Vector3(Mathf.Cos(a) * .28f, Mathf.Sin(a) * .28f, 0),
                    Vector3.one * (i % 2 == 0 ? .052f : .028f),
                    i % 2 == 0 ? Color.cyan : Color.magenta);
            }
            for (int side = -1; side <= 1; side += 2)
                Ring("NebulaEye", new Vector3(side * .14f, .06f, -.28f), .105f, .014f, Color.cyan);
        }
        public override void Animate(FaceSample f, float t)
        {
            orbit.localRotation = Quaternion.Euler(22, t * 38, 0);
        }
    }

    public sealed class AlienMechLens : LensEffect
    {
        public override string LensId { get { return "alien-mech"; } }
        private Transform scan;
        public override void Build()
        {
            Color metal = new Color(.25f, .33f, .43f);
            Piece("Helmet", PrimitiveType.Cube, new Vector3(0, .23f, .01f),
                new Vector3(.58f, .14f, .3f), metal);
            Piece("Visor", PrimitiveType.Cube, new Vector3(0, .055f, -.28f),
                new Vector3(.58f, .18f, .038f), Color.black);
            scan = Piece("AlienScan", PrimitiveType.Cube, new Vector3(-.23f, .055f, -.31f),
                new Vector3(.016f, .14f, .012f), Color.cyan);
            for (int side = -1; side <= 1; side += 2)
                Piece("CheekCircuit", PrimitiveType.Cube, new Vector3(side * .24f, -.14f, -.23f),
                    new Vector3(.08f, .022f, .025f), Color.cyan);
        }
        public override void Animate(FaceSample f, float t)
        {
            scan.localPosition = new Vector3(Mathf.PingPong(t * .3f, .46f) - .23f, .055f, -.31f);
        }
    }

    public sealed class AlienRoyalLens : LensEffect
    {
        public override string LensId { get { return "alien-royal"; } }
        private Transform crown;
        public override void Build()
        {
            crown = new GameObject("RoyalAlienCrown").transform;
            crown.SetParent(transform, false);
            crown.localPosition = new Vector3(0, .39f, 0);
            LensGeometry.Ring(crown, "CrownRing", Vector3.zero, .24f, .017f, Color.cyan);
            for (int i = 0; i < 5; i++)
                LensGeometry.Spire(crown, "CrownHorn",
                    new Vector3((i - 2) * .10f, .08f, 0),
                    .055f, .18f + (2 - Mathf.Abs(i - 2)) * .042f, Color.magenta);
            for (int side = -1; side <= 1; side += 2)
                Ring("RoyalEye", new Vector3(side * .14f, .07f, -.28f), .10f, .017f, Color.cyan);
        }
        public override void Animate(FaceSample f, float t)
        {
            crown.localRotation = Quaternion.Euler(0, Mathf.Sin(t * 1.5f) * 14f, 0);
        }
    }

    public sealed class TrendHeartsLens : LensEffect
    {
        public override string LensId { get { return "trend-hearts"; } }
        private Transform hearts;
        public override void Build()
        {
            hearts = new GameObject("Hearts").transform;
            hearts.SetParent(transform, false);
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI * 2 / 8;
                LensGeometry.Add(hearts, "PinkHeartSpark",
                    PrimitiveType.Sphere, new Vector3(Mathf.Cos(a) * .33f, .18f + Mathf.Sin(a) * .25f, 0),
                    Vector3.one * (.04f + .015f * (i % 2)), new Color(1f, .19f, .52f));
            }
        }
        public override void Animate(FaceSample f, float t)
        {
            hearts.localPosition = new Vector3(0, Mathf.Sin(t * 2.8f) * .035f, 0);
            hearts.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * .6f) * 5f);
        }
    }

    public sealed class TrendPixelLens : LensEffect
    {
        public override string LensId { get { return "trend-pixels"; } }
        public override void Build()
        {
            for (int side = -1; side <= 1; side += 2)
            {
                for (int x = 0; x < 5; x++)
                {
                    Piece("PixelGlassesTop", PrimitiveType.Cube,
                        new Vector3(side * (.06f + x * .04f), .095f, -.30f),
                        new Vector3(.037f, .031f, .02f), Color.black);
                    if (x > 1)
                        Piece("PixelGlassesBottom", PrimitiveType.Cube,
                            new Vector3(side * (.06f + x * .04f), .061f, -.30f),
                            new Vector3(.037f, .031f, .02f), Color.black);
                }
            }
        }
    }

    public sealed class TrendDiscoLens : LensEffect
    {
        public override string LensId { get { return "trend-disco"; } }
        private Transform sphere;
        public override void Build()
        {
            sphere = new GameObject("OrbitingDisco").transform;
            sphere.SetParent(transform, false);
            sphere.localPosition = new Vector3(0, .44f, 0);
            for (int i = 0; i < 12; i++)
            {
                float a = i * Mathf.PI * 2 / 12;
                LensGeometry.Add(sphere, "DiscoDot", PrimitiveType.Sphere,
                    new Vector3(Mathf.Cos(a) * .15f, Mathf.Sin(a) * .15f, 0),
                    Vector3.one * .047f, i % 2 == 0 ? Color.cyan : Color.magenta);
            }
        }
        public override void Animate(FaceSample f, float t)
        {
            sphere.localRotation = Quaternion.Euler(t * 25f, t * 49f, 0);
        }
    }

    public sealed class TrendStarlightLens : LensEffect
    {
        public override string LensId { get { return "trend-starlight"; } }
        private Transform stars;
        public override void Build()
        {
            stars = new GameObject("OrbitingStarlight").transform;
            stars.SetParent(transform, false);
            for (int i = 0; i < 9; i++)
            {
                float a = i * Mathf.PI * 2 / 9;
                LensGeometry.Add(stars, "Star", PrimitiveType.Sphere,
                    new Vector3(Mathf.Cos(a) * .34f, .11f + Mathf.Sin(a) * .30f, 0),
                    Vector3.one * (i % 3 == 0 ? .059f : .027f),
                    i % 2 == 0 ? Color.yellow : Color.white);
            }
        }
        public override void Animate(FaceSample f, float t)
        {
            stars.localRotation = Quaternion.Euler(0, 0, t * 11f);
        }
    }
}
