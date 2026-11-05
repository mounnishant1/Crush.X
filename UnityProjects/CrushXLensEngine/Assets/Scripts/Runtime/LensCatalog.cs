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
            new LensManifest("beauty-glow", "Pearl Glow", LensCategory.Beauty, false),
            new LensManifest("beauty-blush", "Rosy Makeup", LensCategory.Beauty, false),
            new LensManifest("beauty-freckles", "Soft Freckles", LensCategory.Beauty, false),
            new LensManifest("beauty-crystals", "Crystal Glam", LensCategory.Beauty, false),
            new LensManifest("alien-classic", "Classic Alien", LensCategory.Alien, false),
            new LensManifest("alien-nebula", "Nebula Alien", LensCategory.Alien, false),
            new LensManifest("alien-mech", "Mecha Alien", LensCategory.Alien, false),
            new LensManifest("alien-royal", "Royal Alien", LensCategory.Alien, false),
            new LensManifest("trend-hearts", "Pink Hearts", LensCategory.Aesthetic, false),
            new LensManifest("trend-pixels", "Pixel Glasses", LensCategory.Funny, false),
            new LensManifest("trend-disco", "Disco Orbit", LensCategory.Aesthetic, false),
            new LensManifest("trend-starlight", "Starlight", LensCategory.Aesthetic, false),
            new LensManifest("funny-big-eyes", "Pop Eyes", LensCategory.Funny, false),
            new LensManifest("funny-jumbo-mouth", "Jumbo Mouth", LensCategory.Funny, true),
            new LensManifest("funny-balloon-cheeks", "Balloon Cheeks", LensCategory.Funny, true),
            new LensManifest("funny-long-nose", "Rubber Nose", LensCategory.Funny, false),
            new LensManifest("funny-mini-eyes", "Tiny Eyes", LensCategory.Funny, false),
            new LensManifest("funny-wiggle-brows", "Wiggle Brows", LensCategory.Funny, false),
            new LensManifest("funny-party-clown", "Party Clown", LensCategory.Funny, false),
            new LensManifest("funny-toothy-grin", "Toothy Grin", LensCategory.Funny, true),
            new LensManifest("funny-noodle-stache", "Noodle Mustache", LensCategory.Funny, false),
            new LensManifest("funny-bubble-pop", "Bubble Pop", LensCategory.Funny, true),
            new LensManifest("funny-goofy-glasses", "Goofy Glasses", LensCategory.Funny, false),
            new LensManifest("funny-jelly-head", "Jelly Head Outline", LensCategory.Funny, false),
            new LensManifest("funny-game-blinkpop", "Blink Pop", LensCategory.Funny, true),
            new LensManifest("funny-game-mouthcatch", "Mouth Catch", LensCategory.Funny, true)
        };
        public static IReadOnlyList<LensManifest> All { get { return all; } }

        public static Type ResolveType(string id)
        {
            switch (id)
            {
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
                case "beauty-glow": return typeof(BeautyGlowLens);
                case "beauty-blush": return typeof(BeautyBlushLens);
                case "beauty-freckles": return typeof(BeautyFrecklesLens);
                case "beauty-crystals": return typeof(BeautyCrystalsLens);
                case "alien-classic": return typeof(AlienClassicLens);
                case "alien-nebula": return typeof(AlienNebulaLens);
                case "alien-mech": return typeof(AlienMechLens);
                case "alien-royal": return typeof(AlienRoyalLens);
                case "trend-hearts": return typeof(TrendHeartsLens);
                case "trend-pixels": return typeof(TrendPixelLens);
                case "trend-disco": return typeof(TrendDiscoLens);
                case "trend-starlight": return typeof(TrendStarlightLens);
                case "funny-big-eyes": return typeof(FunnyBigEyesLens);
                case "funny-jumbo-mouth": return typeof(FunnyJumboMouthLens);
                case "funny-balloon-cheeks": return typeof(FunnyBalloonCheeksLens);
                case "funny-long-nose": return typeof(FunnyLongNoseLens);
                case "funny-mini-eyes": return typeof(FunnyMiniEyesLens);
                case "funny-wiggle-brows": return typeof(FunnyWiggleBrowsLens);
                case "funny-party-clown": return typeof(FunnyPartyClownLens);
                case "funny-toothy-grin": return typeof(FunnyToothyGrinLens);
                case "funny-noodle-stache": return typeof(FunnyNoodleStacheLens);
                case "funny-bubble-pop": return typeof(FunnyBubblePopLens);
                case "funny-goofy-glasses": return typeof(FunnyGoofyGlassesLens);
                case "funny-jelly-head": return typeof(FunnyJellyHeadLens);
                case "funny-game-blinkpop": return typeof(BlinkPopFunnyLens);
                case "funny-game-mouthcatch": return typeof(MouthCatchFunnyLens);
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
