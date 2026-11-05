using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace CrushX.LensEngine
{
    [Serializable]
    public sealed class LensUserCollection
    {
        public string id;
        public string name;
        public List<string> lensIds = new List<string>();

        public LensUserCollection Copy()
        {
            return new LensUserCollection
            {
                id = id,
                name = name,
                lensIds = new List<string>(lensIds ?? new List<string>())
            };
        }
    }

    /// <summary>
    /// User-owned, on-device lens folders scoped through LensPersonalization.
    /// Only references existing allowlisted LensCatalog IDs, never downloads
    /// assets or accepts executable scripts / third-party lens packages.
    /// </summary>
    public sealed class LensCustomCollections
    {
        public const int MaximumCollections = 20;
        public const int MaximumLenses = 64;
        public const int MaximumNameLength = 32;
        private const int MaximumStoredCharacters = 32768;
        private const string IdentifierPrefix = "user:";

        [Serializable]
        private sealed class Store
        {
            public int schema = 1;
            public List<LensUserCollection> entries = new List<LensUserCollection>();
        }

        // Does not modify legacy v02 favorites/usage consent. User folders are
        // separately scoped and must use the verified Android account identity.
        private const string ScopePrefix = "crushx.lens.v03.";
        private string accountScope = "guest";
        private string CollectionStorageKey {
            get { return ScopePrefix + accountScope + ".custom.collections"; }
        }

        public bool ConfigureAccountScope(string authenticatedAccountId)
        {
            if (string.IsNullOrWhiteSpace(authenticatedAccountId))
            {
                accountScope = "guest";
                return true;
            }
            if (authenticatedAccountId.Length > 128) return false;
            byte[] bytes = Encoding.UTF8.GetBytes(authenticatedAccountId.Trim());
            using (var hash = SHA256.Create())
            {
                accountScope = BitConverter.ToString(hash.ComputeHash(bytes))
                    .Replace("-", "").Substring(0, 32).ToLowerInvariant();
            }
            return true;
        }

        public static bool IsCustomId(string id)
        {
            if (string.IsNullOrEmpty(id) ||
                id.Length != IdentifierPrefix.Length + 32 ||
                !id.StartsWith(IdentifierPrefix, StringComparison.Ordinal)) return false;
            for (int i = IdentifierPrefix.Length; i < id.Length; i++)
            {
                char c = id[i];
                if (!((c >= '0' && c <= '9') ||
                      (c >= 'a' && c <= 'f'))) return false;
            }
            return true;
        }

        public static string NormalizeName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            string cleaned;
            try { cleaned = name.Trim().Normalize(NormalizationForm.FormC); }
            catch (ArgumentException) { return null; }
            if (cleaned.Length < 1 || cleaned.Length > MaximumNameLength) return null;
            for (int i = 0; i < cleaned.Length; i++)
            {
                char c = cleaned[i];
                // Permit valid emoji pairs, reject malformed surrogate
                // fragments and invisible bidi overrides in visible names.
                if (char.IsHighSurrogate(c))
                {
                    if (i + 1 >= cleaned.Length ||
                        !char.IsLowSurrogate(cleaned[i + 1])) return null;
                    i++;
                    continue;
                }
                if (char.IsLowSurrogate(c) || char.IsControl(c) ||
                    (c >= '\u202A' && c <= '\u202E') ||
                    (c >= '\u2066' && c <= '\u2069'))
                    return null;
            }
            // Do not shadow native camera filter names, or any currently
            // defined lens-category enum label in this installed catalog.
            foreach (string reserved in new[] {
                "All", "Favorites", "Recent", "Trending", "My Collections",
                "Folders", "Saved"
            })
                if (string.Equals(reserved, cleaned,
                    StringComparison.OrdinalIgnoreCase)) return null;
            foreach (string category in Enum.GetNames(typeof(LensCategory)))
            {
                if (string.Equals(cleaned, category,
                    StringComparison.OrdinalIgnoreCase) ||
                    (category == "SciFi" &&
                     string.Equals(cleaned, "Sci-Fi",
                         StringComparison.OrdinalIgnoreCase)))
                    return null;
            }
            return cleaned;
        }

        private bool TryLoad(out Store store)
        {
            store = new Store();
            string raw = PlayerPrefs.GetString(CollectionStorageKey, "");
            if (string.IsNullOrEmpty(raw)) return true;
            if (raw.Length > MaximumStoredCharacters) return false;

            Store loaded;
            try { loaded = JsonUtility.FromJson<Store>(raw); }
            catch (Exception) { return false; }
            if (loaded == null || loaded.schema != 1 ||
                loaded.entries == null ||
                loaded.entries.Count > MaximumCollections) return false;

            var ids = new HashSet<string>(StringComparer.Ordinal);
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (LensUserCollection entry in loaded.entries)
            {
                if (entry == null || !IsCustomId(entry.id) ||
                    !ids.Add(entry.id) ||
                    !string.Equals(entry.name, NormalizeName(entry.name),
                        StringComparison.Ordinal) ||
                    !names.Add(entry.name) || entry.lensIds == null ||
                    entry.lensIds.Count > MaximumLenses) return false;
                var seenLensIds = new HashSet<string>(StringComparer.Ordinal);
                foreach (string lensId in entry.lensIds)
                {
                    if (string.IsNullOrEmpty(lensId) ||
                        !seenLensIds.Add(lensId)) return false;
                    // Removed catalog items are filtered from UI. Keep the
                    // reference intact in storage for a later compatible build.
                }
            }
            store = loaded;
            return true;
        }

        private void Save(Store store)
        {
            string encoded = JsonUtility.ToJson(store);
            if (encoded.Length > MaximumStoredCharacters)
                throw new InvalidOperationException("Collection data limit exceeded");
            PlayerPrefs.SetString(CollectionStorageKey, encoded);
            PlayerPrefs.Save();
        }

        public bool IsHealthy
        {
            get { Store unused; return TryLoad(out unused); }
        }

        public List<LensUserCollection> All()
        {
            Store loaded;
            if (!TryLoad(out loaded)) return new List<LensUserCollection>();
            var result = new List<LensUserCollection>(loaded.entries.Count);
            foreach (var entry in loaded.entries) result.Add(entry.Copy());
            return result;
        }

        public LensUserCollection Get(string id)
        {
            Store loaded;
            if (!IsCustomId(id) || !TryLoad(out loaded)) return null;
            foreach (var entry in loaded.entries)
                if (entry.id == id) return entry.Copy();
            return null;
        }

        public bool TryCreate(string name, out string id)
        {
            return TryCreateWithLens(name, null, out id);
        }

        // Create folder + save first lens in ONE write, so a failed create
        // cannot leave a misleading empty folder from the quick-save sheet.
        public bool TryCreateWithLens(string name, string lensId, out string id)
        {
            id = null;
            name = NormalizeName(name);
            Store loaded;
            if (name == null || (lensId != null &&
                    !LensCatalog.Find(lensId).HasValue) ||
                !TryLoad(out loaded) ||
                loaded.entries.Count >= MaximumCollections) return false;
            foreach (var entry in loaded.entries)
                if (string.Equals(entry.name, name,
                    StringComparison.OrdinalIgnoreCase)) return false;

            string newId = IdentifierPrefix + Guid.NewGuid().ToString("N");
            var folder = new LensUserCollection { id = newId, name = name };
            if (lensId != null) folder.lensIds.Add(lensId);
            loaded.entries.Add(folder);
            Save(loaded);
            id = newId;
            return true;
        }

        public bool ContainsLens(string id, string lensId)
        {
            Store loaded;
            if (!IsCustomId(id) || !LensCatalog.Find(lensId).HasValue ||
                !TryLoad(out loaded)) return false;
            LensUserCollection entry = loaded.entries.Find(x => x.id == id);
            return entry != null && entry.lensIds.Contains(lensId);
        }

        public bool Rename(string id, string name)
        {
            name = NormalizeName(name);
            Store loaded;
            if (!IsCustomId(id) || name == null || !TryLoad(out loaded))
                return false;
            LensUserCollection target = null;
            foreach (var entry in loaded.entries)
            {
                if (entry.id == id) target = entry;
                else if (string.Equals(entry.name, name,
                    StringComparison.OrdinalIgnoreCase)) return false;
            }
            if (target == null) return false;
            target.name = name;
            Save(loaded);
            return true;
        }

        public bool Delete(string id)
        {
            Store loaded;
            if (!IsCustomId(id) || !TryLoad(out loaded)) return false;
            int removed = loaded.entries.RemoveAll(item => item.id == id);
            if (removed != 1) return false;
            Save(loaded);
            return true;
        }

        public bool MoveCollection(string id, int direction)
        {
            Store loaded;
            if (!IsCustomId(id) || !TryLoad(out loaded) ||
                (direction != -1 && direction != 1)) return false;
            int from = loaded.entries.FindIndex(entry => entry.id == id);
            int to = from + direction;
            if (from < 0 || to < 0 || to >= loaded.entries.Count) return false;
            LensUserCollection temp = loaded.entries[from];
            loaded.entries[from] = loaded.entries[to];
            loaded.entries[to] = temp;
            Save(loaded);
            return true;
        }

        public bool AddLens(string id, string lensId)
        {
            Store loaded;
            if (!IsCustomId(id) || !LensCatalog.Find(lensId).HasValue ||
                !TryLoad(out loaded)) return false;
            LensUserCollection entry = loaded.entries.Find(x => x.id == id);
            if (entry == null || entry.lensIds.Count >= MaximumLenses ||
                entry.lensIds.Contains(lensId)) return false;
            entry.lensIds.Add(lensId);
            Save(loaded);
            return true;
        }

        public bool RemoveLens(string id, string lensId)
        {
            Store loaded;
            if (!IsCustomId(id) || !TryLoad(out loaded)) return false;
            LensUserCollection entry = loaded.entries.Find(x => x.id == id);
            if (entry == null || !entry.lensIds.Remove(lensId)) return false;
            Save(loaded);
            return true;
        }

        public bool MoveLens(string id, string lensId, int direction)
        {
            Store loaded;
            if (!IsCustomId(id) || !TryLoad(out loaded) ||
                (direction != -1 && direction != 1)) return false;
            LensUserCollection entry = loaded.entries.Find(x => x.id == id);
            if (entry == null) return false;
            int from = entry.lensIds.IndexOf(lensId);
            int to = from + direction;
            if (from < 0 || to < 0 || to >= entry.lensIds.Count) return false;
            string temporary = entry.lensIds[from];
            entry.lensIds[from] = entry.lensIds[to];
            entry.lensIds[to] = temporary;
            Save(loaded);
            return true;
        }

        // Explicit destructive action only; never called from ranking reset.
        public void ClearAllCurrentAccountCollections()
        {
            PlayerPrefs.DeleteKey(CollectionStorageKey);
            PlayerPrefs.Save();
        }
    }
}
