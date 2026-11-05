using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace CrushX.LensEngine
{
    // A small, allow-listed collection feed. The host must fetch this JSON from an
    // authenticated Crush.X backend and verify publisher authorization BEFORE passing it here.
    // There is deliberately no scraping or automatic downloading/execution of third-party lenses.
    public sealed class LensTrendFeed
    {
        [Serializable] private sealed class Snapshot
        {
            public string expiresUtc;
            public Entry[] items;
        }

        [Serializable] private sealed class Entry
        {
            public string id;
            public int score;
        }

        private static readonly string[] OfflineHighlights =
        {
            "trend-hearts", "trend-pixels", "trend-disco", "trend-starlight",
            "funny-big-eyes", "funny-jumbo-mouth", "funny-party-clown",
            "beauty-glow", "alien-classic"
        };

        private readonly List<string> trendingIds = new List<string>();
        private DateTimeOffset expiresUtc = DateTimeOffset.MinValue;

        public bool TryApplyTrustedSnapshot(string json, DateTimeOffset nowUtc)
        {
            // UnitySendMessage is short-message only. Reject large or malformed payloads.
            if (string.IsNullOrEmpty(json) || json.Length > 4096) return false;
            Snapshot parsed;
            try { parsed = JsonUtility.FromJson<Snapshot>(json); }
            catch (Exception) { return false; }
            if (parsed == null || parsed.items == null || parsed.items.Length == 0 ||
                parsed.items.Length > 32 || string.IsNullOrEmpty(parsed.expiresUtc) ||
                !parsed.expiresUtc.EndsWith("Z", StringComparison.Ordinal)) return false;

            DateTimeOffset expiry;
            if (!DateTimeOffset.TryParse(parsed.expiresUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal, out expiry) ||
                expiry <= nowUtc || expiry > nowUtc.AddDays(7)) return false;

            var sorted = new List<Entry>(parsed.items);
            var known = new HashSet<string>(StringComparer.Ordinal);
            foreach (Entry item in sorted)
            {
                if (item == null || string.IsNullOrEmpty(item.id) || item.id.Length > 64 ||
                    item.score < 0 || item.score > 100000 ||
                    !LensCatalog.Find(item.id).HasValue || !known.Add(item.id))
                    return false;
            }
            sorted.Sort((a, b) =>
            {
                int scoreOrder = b.score.CompareTo(a.score);
                return scoreOrder != 0 ? scoreOrder : string.CompareOrdinal(a.id, b.id);
            });
            // Commit only after the entire snapshot has passed validation.
            trendingIds.Clear();
            foreach (Entry item in sorted) trendingIds.Add(item.id);
            expiresUtc = expiry;
            return true;
        }

        public IReadOnlyList<string> CurrentIds(DateTimeOffset nowUtc)
        {
            return nowUtc < expiresUtc && trendingIds.Count > 0
                ? (IReadOnlyList<string>)trendingIds.AsReadOnly()
                : OfflineHighlights;
        }
    }

    public static class LensDiscovery
    {
        // One canonical set for UI + Android receiver + search logic.
        // Trending, Favorites and Recent are dynamic collections,
        // not separate items added to the 37-lens source catalog.
        public static readonly IReadOnlyList<string> Collections =
            Array.AsReadOnly(new[] {
                "All", "Beauty", "Alien", "Funny", "Trending",
                "Animals", "Sci-Fi", "Fantasy", "Aesthetic",
                "Favorites", "Recent"
            });

        public static bool IsCollection(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            foreach (var collection in Collections)
                if (string.Equals(collection, name, StringComparison.Ordinal))
                    return true;
            return false;
        }

        private static bool FitsCategory(string collection, LensCategory category)
        {
            switch (collection)
            {
                case "Beauty": return category == LensCategory.Beauty;
                case "Alien": return category == LensCategory.Alien;
                case "Funny": return category == LensCategory.Funny;
                case "Animals": return category == LensCategory.Animals;
                case "Sci-Fi": return category == LensCategory.SciFi;
                case "Fantasy": return category == LensCategory.Fantasy;
                case "Aesthetic": return category == LensCategory.Aesthetic;
                default: return false;
            }
        }

        // Existing caller signature remains available; only the engine passes
        // its local personalization instance for Favorites/Recent.
        public static List<LensManifest> Browse(string name,
            IReadOnlyList<LensManifest> ranked, LensTrendFeed trends,
            DateTimeOffset nowUtc)
        {
            return Browse(name, ranked, trends, nowUtc, null);
        }

        public static List<LensManifest> Browse(string name,
            IReadOnlyList<LensManifest> ranked, LensTrendFeed trends,
            DateTimeOffset nowUtc, LensPersonalization personalization)
        {
            var output = new List<LensManifest>();
            if (!IsCollection(name) || ranked == null) return output;

            if (name == "Trending")
            {
                if (trends == null) return output;
                foreach (string id in trends.CurrentIds(nowUtc))
                {
                    foreach (LensManifest item in ranked)
                        if (item.Id == id) { output.Add(item); break; }
                }
                return output;
            }

            if (name == "Recent")
            {
                if (personalization == null) return output;
                foreach (string id in personalization.RecentIds())
                    foreach (LensManifest item in ranked)
                        if (item.Id == id) { output.Add(item); break; }
                return output;
            }

            foreach (LensManifest item in ranked)
            {
                if (name == "All" ||
                    (name == "Favorites" && personalization != null &&
                        personalization.IsFavorite(item.Id)) ||
                    FitsCategory(name, item.Category))
                    output.Add(item);
            }
            return output;
        }
    }
}
