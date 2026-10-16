using System;

namespace CrushX.LensEngine
{
    public readonly struct LensCompatibilityResult
    {
        public readonly bool CanSelect;
        public readonly bool PendingCapabilities;
        public readonly TrackingCapabilities MissingRequired;
        public readonly TrackingCapabilities MissingOptional;
        public readonly string Message;

        public LensCompatibilityResult(bool canSelect, bool pending, TrackingCapabilities required,
            TrackingCapabilities optional, string message)
        {
            CanSelect = canSelect; PendingCapabilities = pending;
            MissingRequired = required; MissingOptional = optional; Message = message;
        }
    }

    public static class LensCompatibility
    {
        public static LensCompatibilityResult Evaluate(LensManifest lens, bool capabilitiesKnown,
            TrackingCapabilities supported)
        {
            if (lens.RequiredCapabilities == TrackingCapabilities.None && lens.OptionalCapabilities == TrackingCapabilities.None)
                return new LensCompatibilityResult(true, false, TrackingCapabilities.None, TrackingCapabilities.None, string.Empty);
            if (!capabilitiesKnown)
                return new LensCompatibilityResult(true, true, TrackingCapabilities.None,
                    TrackingCapabilities.None, "Waiting for tracking capabilities");
            TrackingCapabilities missing = lens.RequiredCapabilities & ~supported;
            TrackingCapabilities optional = lens.OptionalCapabilities & ~supported;
            return new LensCompatibilityResult(missing == TrackingCapabilities.None, false, missing, optional,
                missing != TrackingCapabilities.None ? "Provider does not support " + missing :
                optional != TrackingCapabilities.None ? "Optional " + optional + " unavailable" : string.Empty);
        }

        public static string NormalizeId(string id)
        {
            return string.IsNullOrWhiteSpace(id) ? string.Empty : id.Trim().ToLowerInvariant();
        }
    }
}
