using System;

namespace CrushX.LensEngine
{
    /// <summary>Small local command vocabulary for host integration; not an AI model or image analysis.</summary>
    public static class LensNaturalLanguage
    {
        public static bool TryParse(string text, out LensCommand command, out string error)
        {
            command = null;
            error = "No supported local lens command was recognized";
            if (string.IsNullOrWhiteSpace(text) || text.Length > 256) return false;
            string normalized = text.Trim().ToLowerInvariant().TrimEnd('.', '!', '?');
            if (normalized.Contains("trending")) { error = "No verified trend source is connected"; return false; }
            if (normalized.StartsWith("publish ") || normalized.StartsWith("send ") || normalized.StartsWith("upload "))
            { error = "Lens commands prepare editable drafts; publishing and sending belong to explicit app controls"; return false; }
            if (normalized.Contains("most-used") || normalized.Contains("most used"))
            { command = new LensCommand { action = "mostUsed" }; return true; }
            if (normalized.Contains("draft"))
            {
                foreach (LensDraftDestination destination in Enum.GetValues(typeof(LensDraftDestination)))
                    if (normalized.Contains(destination.ToString().ToLowerInvariant()))
                    { command = new LensCommand { action = "prepareDraft", destination = destination.ToString() }; return true; }
                return false;
            }
            foreach (LensManifest lens in LensCatalog.All)
                if ((normalized.StartsWith("apply ") || normalized.StartsWith("select ")) &&
                    (normalized.Substring(normalized.IndexOf(' ') + 1) == lens.Id ||
                     normalized.Substring(normalized.IndexOf(' ') + 1) == lens.DisplayName.ToLowerInvariant()))
                { command = new LensCommand { action = "select", lensId = lens.Id }; return true; }
            if (normalized == "choose a good lens for this selfie" || normalized == "recommend a lens")
            { command = new LensCommand { action = "recommend", query = string.Empty }; return true; }
            string[] categories = { "animal", "beauty", "funny", "gaming", "anime", "mask", "cinematic", "fantasy", "aesthetic" };
            foreach (string category in categories)
                if (normalized.Contains(category) && (normalized.Contains("lens") || normalized.Contains("look")))
                { command = new LensCommand { action = "search", query = category }; return true; }
            return false;
        }
    }
}
