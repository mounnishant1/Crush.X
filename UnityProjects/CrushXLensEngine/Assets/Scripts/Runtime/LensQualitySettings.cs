using UnityEngine;

namespace CrushX.LensEngine
{
    public enum LensQualityTier { Economy, Balanced, High }

    public static class LensQualitySettings
    {
        // Conservative geometry budgets, not measured device performance ratings.
        public static LensQualityTier Current { get; private set; } = LensQualityTier.Balanced;
        public static int RingSegments { get { return Current == LensQualityTier.Economy ? 20 : Current == LensQualityTier.High ? 40 : 32; } }
        public static void Set(LensQualityTier tier)
        {
            if (!System.Enum.IsDefined(typeof(LensQualityTier), tier)) throw new System.ArgumentOutOfRangeException(nameof(tier));
            Current = tier;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() { Current = LensQualityTier.Balanced; }
    }
}
