using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace CrushX.LensEngine
{
    // Device-local ordering only, no user tracking is sent off-device.
    public sealed class LensPersonalization
    {
        private const string Prefix = "crushx.lens.v02.";
        public bool UsageEnabled { get { return PlayerPrefs.GetInt(Prefix + "remember", 0) == 1; } }
        public void SetUsageEnabled(bool enabled)
        {
            PlayerPrefs.SetInt(Prefix + "remember", enabled ? 1 : 0);
            if (!enabled)
            {
                PlayerPrefs.DeleteKey(Prefix + "recent");
                foreach (LensManifest lens in LensCatalog.All) PlayerPrefs.DeleteKey(Prefix + "usage." + lens.Id);
            }
            PlayerPrefs.Save();
        }
        public bool IsFavorite(string id) { return PlayerPrefs.GetInt(Prefix + "fav." + id, 0) == 1; }
        public int UsageCount(string id) { return UsageEnabled ? Math.Max(0, PlayerPrefs.GetInt(Prefix + "usage." + id, 0)) : 0; }
        public void ToggleFavorite(string id)
        {
            if (!LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Prefix + "fav." + id, IsFavorite(id) ? 0 : 1);
            PlayerPrefs.Save();
        }
        public void RecordUsage(string id)
        {
            if (!UsageEnabled || !LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Prefix + "usage." + id, Math.Min(100000, UsageCount(id) + 1));
            List<string> recent = RecentIds();
            recent.Remove(id);
            recent.Insert(0, id);
            if (recent.Count > 16) recent.RemoveRange(16, recent.Count - 16);
            PlayerPrefs.SetString(Prefix + "recent", string.Join("|", recent));
            PlayerPrefs.Save();
        }
        public List<string> RecentIds()
        {
            var recent = new List<string>();
            if (!UsageEnabled) return recent;
            foreach (string id in PlayerPrefs.GetString(Prefix + "recent", string.Empty).Split('|'))
                if (LensCatalog.Find(id).HasValue && !recent.Contains(id) && recent.Count < 16) recent.Add(id);
            return recent;
        }
        public List<LensManifest> Ranked()
        {
            return LensCatalog.All.OrderByDescending(m => IsFavorite(m.Id) ? 1 : 0)
                .ThenByDescending(m => UsageCount(m.Id))
                .ThenBy(m => m.DisplayName, StringComparer.Ordinal).ToList();
        }
        public void Reset()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
                PlayerPrefs.DeleteKey(Prefix + "fav." + lens.Id);
                PlayerPrefs.DeleteKey(Prefix + "usage." + lens.Id);
            }
            PlayerPrefs.DeleteKey(Prefix + "recent");
            PlayerPrefs.Save();
        }
    }
}
