using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace CrushX.LensEngine
{
    // Device-local storage. Each authenticated account must be assigned its
    // own scope by the trusted Android host on sign-in/account switch.
    // Legacy v02 unscoped preferences are intentionally NOT imported because
    // those records cannot safely be attributed to any specific account.
    public sealed class LensPersonalization
    {
        private const string Prefix = "crushx.lens.v03.";
        private const int MaximumRecent = 12;
        private string scope = "guest";
        public LensCustomCollections CustomCollections { get; private set; }
        internal string CollectionStorageKey { get { return Key("custom.collections"); } }

        public LensPersonalization()
        {
            CustomCollections = new LensCustomCollections(this);
        }

        public bool ConfigureAccountScope(string accountId)
        {
            if (string.IsNullOrWhiteSpace(accountId))
            {
                scope = "guest";
                return true;
            }
            if (accountId.Length > 128) return false;
            // Store a stable digest of the opaque account ID, never the raw ID.
            byte[] bytes = Encoding.UTF8.GetBytes(accountId.Trim());
            using (var hash = SHA256.Create())
                scope = BitConverter.ToString(hash.ComputeHash(bytes))
                    .Replace("-", "").Substring(0, 32).ToLowerInvariant();
            return true;
        }

        private string Key(string suffix) { return Prefix + scope + "." + suffix; }

        public bool IsFavorite(string id)
        {
            return LensCatalog.Find(id).HasValue &&
                PlayerPrefs.GetInt(Key("fav." + id), 0) == 1;
        }

        public int UsageCount(string id)
        {
            return LensCatalog.Find(id).HasValue ?
                PlayerPrefs.GetInt(Key("usage." + id), 0) : 0;
        }

        public void ToggleFavorite(string id)
        {
            if (!LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Key("fav." + id), IsFavorite(id) ? 0 : 1);
            PlayerPrefs.Save();
        }

        public List<string> RecentIds()
        {
            var result = new List<string>(MaximumRecent);
            string raw = PlayerPrefs.GetString(Key("recent"), "");
            if (string.IsNullOrEmpty(raw)) return result;
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (string id in raw.Split('|'))
            {
                if (result.Count == MaximumRecent) break;
                if (LensCatalog.Find(id).HasValue && seen.Add(id))
                    result.Add(id);
            }
            return result;
        }

        public void RecordUsage(string id)
        {
            if (!LensCatalog.Find(id).HasValue) return;
            PlayerPrefs.SetInt(Key("usage." + id),
                Math.Min(100000, UsageCount(id) + 1));
            var recent = RecentIds();
            recent.Remove(id);
            recent.Insert(0, id);
            if (recent.Count > MaximumRecent)
                recent.RemoveRange(MaximumRecent,
                    recent.Count - MaximumRecent);
            PlayerPrefs.SetString(Key("recent"), string.Join("|", recent));
            PlayerPrefs.Save();
        }

        public List<LensManifest> Ranked()
        {
            return LensCatalog.All
                .OrderByDescending(m => IsFavorite(m.Id) ? 1 : 0)
                .ThenByDescending(m => UsageCount(m.Id))
                .ThenBy(m => m.DisplayName, StringComparer.Ordinal)
                .ToList();
        }

        // Clears only recent/favorites/ranking for this account; intentionally
        // preserves explicitly saved custom folders until separately deleted.
        // Clears the CURRENT account scope only. Never clears other users.
        public void Reset()
        {
            foreach (LensManifest lens in LensCatalog.All)
            {
                PlayerPrefs.DeleteKey(Key("fav." + lens.Id));
                PlayerPrefs.DeleteKey(Key("usage." + lens.Id));
            }
            PlayerPrefs.DeleteKey(Key("recent"));
            PlayerPrefs.Save();
        }
    }
}
