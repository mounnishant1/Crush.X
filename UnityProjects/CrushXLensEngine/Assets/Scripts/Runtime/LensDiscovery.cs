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
        public static bool IsCollection(string name)
        {
            return name == "All" || name == "Beauty" ||
                   name == "Alien" || name == "Trending";
        }

        public static List<LensManifest> Browse(string name,
            IReadOnlyList<LensManifest> ranked, LensTrendFeed trends, DateTimeOffset nowUtc)
        {
            var output = new List<LensManifest>();
            if (!IsCollection(name)) return output;

            if (name == "Trending")
            {
                foreach (string id in trends.CurrentIds(nowUtc))
                {
                    foreach (LensManifest item in ranked)
                        if (item.Id == id) { output.Add(item); break; }
                }
                return output;
            }

            foreach (LensManifest item in ranked)
            {
                if (name == "All" ||
                    (name == "Beauty" && item.Category == LensCategory.Beauty) ||
                    (name == "Alien" && item.Category == LensCategory.Alien))
                    output.Add(item);
            }
            return output;
        }
    }
}
