using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Owns one attachment per provider trackable. The caller supplies only currently tracked faces;
    /// this class does not generate poses or establish tracking readiness.
    /// </summary>
    public sealed class TrackedFaceAttachments<TKey> where TKey : struct
    {
        private readonly Func<Transform, GameObject> create;
        private readonly Action<GameObject> destroy;
        private readonly Dictionary<TKey, GameObject> instances = new Dictionary<TKey, GameObject>();
        private readonly HashSet<TKey> seen = new HashSet<TKey>();
        private readonly List<TKey> removed = new List<TKey>();

        public int Count { get { return instances.Count; } }
        public IReadOnlyDictionary<TKey, GameObject> Instances { get { return instances; } }
        public event Action<TKey, GameObject, string> Removing;

        public TrackedFaceAttachments(Func<Transform, GameObject> create, Action<GameObject> destroy = null)
        {
            this.create = create ?? throw new ArgumentNullException(nameof(create));
            this.destroy = destroy ?? (instance => UnityEngine.Object.Destroy(instance));
        }

        public void BeginFrame() { seen.Clear(); }

        public GameObject Bind(TKey id, Transform face, out bool created, out bool rebound)
        {
            created = false;
            rebound = false;
            if (face == null) return null;
            seen.Add(id);
            if (!instances.TryGetValue(id, out GameObject instance) || instance == null)
            {
                instance = create(face);
                if (instance == null) return null;
                instance.transform.SetParent(face, false);
                instances[id] = instance;
                created = true;
            }
            else if (instance.transform.parent != face)
            {
                instance.transform.SetParent(face, false);
                rebound = true;
            }
            if (created || rebound)
            {
                // The imported prefab retains its own scale; the attachment origin is the ARFace.
                instance.transform.localPosition = Vector3.zero;
                instance.transform.localRotation = Quaternion.identity;
            }
            return instance;
        }

        public void EndFrame()
        {
            removed.Clear();
            foreach (KeyValuePair<TKey, GameObject> item in instances)
                if (!seen.Contains(item.Key) || item.Value == null) removed.Add(item.Key);
            foreach (TKey id in removed) Remove(id, "face no longer tracking");
        }

        public void Clear(string reason)
        {
            removed.Clear();
            foreach (TKey id in instances.Keys) removed.Add(id);
            foreach (TKey id in removed) Remove(id, reason);
            seen.Clear();
        }

        private void Remove(TKey id, string reason)
        {
            if (!instances.TryGetValue(id, out GameObject instance)) return;
            instances.Remove(id);
            if (instance == null) return;
            // Destroy is deferred in a player. Hide now, so loss/reacquisition or a lens switch
            // within the same frame cannot leave a second visible mask awaiting destruction.
            instance.SetActive(false);
            Removing?.Invoke(id, instance, reason);
            destroy(instance);
        }
    }
}
