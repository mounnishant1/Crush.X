using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    public static class LensCatalog
    {
        private static readonly LensManifest[] all =
        {
            new LensManifest("cat-ears", "Animated Cat", LensCategory.Animals, true),
            new LensManifest("puppy", "Playful Puppy", LensCategory.Animals, true),
            new LensManifest("cyber-visor", "Cyber Visor", LensCategory.SciFi, false),
            new LensManifest("fox", "Fox Spirit", LensCategory.Animals, false),
            new LensManifest("holo-crown", "Holographic Crown", LensCategory.Fantasy, false),
            new LensManifest("butterfly", "Butterfly Wings", LensCategory.Beauty, false),
            new LensManifest("robo-helmet", "Robo Helmet", LensCategory.SciFi, true),
            new LensManifest("celestial-halo", "Celestial Halo", LensCategory.Aesthetic, false),
            new LensManifest("neon-mask", "Neon Glow Mask", LensCategory.SciFi, false),
            new LensManifest("dragon", "Dragon Breath", LensCategory.Fantasy, true),
            new LensManifest("fox-mask-3d", "Fox Mask 3D", LensCategory.Animals, false, true),
            ColorFilter("cinema-warm", "Warm Cinema", LensCategory.Cinematic),
            ColorFilter("noir-film", "Noir Film", LensCategory.Cinematic),
            ColorFilter("neon-duotone", "Neon Duotone", LensCategory.Creative)
        };
        public static IReadOnlyList<LensManifest> All { get { return all; } }

        private static LensManifest ColorFilter(string id, string name, LensCategory category)
        {
            return new LensManifest(id, name, category, false)
            {
                RequiredCapabilities = TrackingCapabilities.None,
                OptionalCapabilities = TrackingCapabilities.None,
                Implementation = LensImplementation.ColorFilter,
                QualityTier = "Built-in fullscreen color filter; performance unmeasured",
                EffectAssetReference = "Assets/Resources/" + ColorFilterLens.ShaderResource + ".shader",
                Compatibility = "Requires a running camera and supported Built-in shader; no face tracking required"
            };
        }

        public static Type ResolveType(string id)
        {
            switch (id)
            {
                case "fox-mask-3d": throw new InvalidOperationException("Fox Mask 3D requires an available scene lens controller.");
                case "cat-ears": return typeof(CatEarsLens);
                case "puppy": return typeof(PuppyLens);
                case "cyber-visor": return typeof(CyberVisorLens);
                case "fox": return typeof(FoxLens);
                case "holo-crown": return typeof(HoloCrownLens);
                case "butterfly": return typeof(ButterflyLens);
                case "robo-helmet": return typeof(RoboHelmetLens);
                case "celestial-halo": return typeof(CelestialHaloLens);
                case "neon-mask": return typeof(NeonMaskLens);
                case "dragon": return typeof(DragonLens);
                case "cinema-warm": return typeof(WarmCinemaLens);
                case "noir-film": return typeof(NoirFilmLens);
                case "neon-duotone": return typeof(NeonDuotoneLens);
                default: throw new ArgumentException("Unknown lens ID: " + id);
            }
        }

        public static LensManifest? Find(string id)
        {
            foreach (LensManifest lens in all) if (lens.Id == id) return lens;
            return null;
        }
    }
}
