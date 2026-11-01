using System;
using System.Collections.Generic;

namespace CrushX.LensEngine.AssetLoading
{
    /// <summary>Host-authored registration of an installed, reviewed Resources prefab. No package can add one.</summary>
    public sealed class ReviewedResourceRegistration
    {
        public readonly string Id, ResourcePath, LicenseId, ReviewReceipt;
        public readonly int MaximumRenderers, MaximumVertices;
        private readonly HashSet<string> components, shaders;
        public ReviewedResourceRegistration(string id, string resourcePath, string licenseId, string reviewReceipt,
            IEnumerable<string> allowedComponentNames, IEnumerable<string> allowedShaderNames,
            int maximumRenderers = 32, int maximumVertices = 200000)
        {
            if (!ArtifactPolicy.ValidToken(id) || !ArtifactPolicy.ValidRelativePath(resourcePath) || resourcePath.IndexOf('.') >= 0 ||
                !ArtifactPolicy.ValidText(licenseId, 120) || !ArtifactPolicy.ValidText(reviewReceipt, 500) ||
                maximumRenderers < 1 || maximumRenderers > 64 || maximumVertices < 3 || maximumVertices > 500000)
                throw new ArgumentException("Resources registrations require an installed path, bounded budget and reviewed licence receipt");
            Id = id; ResourcePath = resourcePath; LicenseId = licenseId; ReviewReceipt = reviewReceipt;
            MaximumRenderers = maximumRenderers; MaximumVertices = maximumVertices;
            components = Copy(allowedComponentNames); shaders = Copy(allowedShaderNames);
            if (components.Count == 0 || shaders.Count == 0) throw new ArgumentException("Resources registrations require component and shader allowlists");
        }
        private static HashSet<string> Copy(IEnumerable<string> names)
        {
            if (names == null) throw new ArgumentNullException(nameof(names));
            var result = new HashSet<string>(StringComparer.Ordinal);
            foreach (string name in names)
            {
                if (!ArtifactPolicy.ValidText(name, 160) || result.Count >= 64) throw new ArgumentException("Invalid installed resource allowlist");
                result.Add(name);
            }
            return result;
        }
        public bool AllowsComponent(string fullName) => fullName != null && components.Contains(fullName);
        public bool AllowsShader(string name) => name != null && shaders.Contains(name);
    }

    public sealed class ReviewedResourceRegistry
    {
        private readonly Dictionary<string, ReviewedResourceRegistration> entries = new Dictionary<string, ReviewedResourceRegistration>(StringComparer.Ordinal);
        public ReviewedResourceRegistry(IEnumerable<ReviewedResourceRegistration> reviewedEntries)
        {
            if (reviewedEntries == null) throw new ArgumentNullException(nameof(reviewedEntries));
            foreach (ReviewedResourceRegistration item in reviewedEntries)
            {
                if (item == null || entries.Count >= 128) throw new ArgumentException("Invalid resources registration");
                entries.Add(item.Id, item);
            }
        }
        public bool TryGet(string id, out ReviewedResourceRegistration registration)
        {
            registration = null;
            return id != null && entries.TryGetValue(id, out registration);
        }
    }
}
