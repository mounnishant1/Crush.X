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
        public bool IsFavorite(string id) { return PlayerPrefs.GetInt(Prefix + "fav." + id, 0) == 1; }
        public int UsageCount(string id) { return PlayerPrefs.GetInt(Prefix + "usage." + id, 0); }
        public void ToggleFavorite(string id)
        {
            if (!LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Prefix + "fav." + id, IsFavorite(id) ? 0 : 1);
            PlayerPrefs.Save();
        }
        public void RecordUsage(string id)
        {
            if (!LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Prefix + "usage." + id, Math.Min(100000, UsageCount(id) + 1));
            PlayerPrefs.Save();
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
            PlayerPrefs.Save();
        }
    }
}
