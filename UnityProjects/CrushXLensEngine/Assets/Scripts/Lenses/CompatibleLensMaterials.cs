using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>Shares pipeline conversions across face instances and lens reacquisition.</summary>
    public sealed class CompatibleLensMaterials : IDisposable
    {
        private readonly Dictionary<Material, Dictionary<Shader, Material>> copies =
            new Dictionary<Material, Dictionary<Shader, Material>>();
        private readonly Action<Material> destroy;
        public int Count { get; private set; }

        public CompatibleLensMaterials(Action<Material> destroy = null)
        {
            this.destroy = destroy ?? (material => UnityEngine.Object.Destroy(material));
        }

        public Material Get(Material source, Shader shader)
        {
            if (source == null || shader == null || source.shader == shader) return source;
            if (!copies.TryGetValue(source, out Dictionary<Shader, Material> shaders))
            {
                shaders = new Dictionary<Shader, Material>();
                copies[source] = shaders;
            }
            if (shaders.TryGetValue(shader, out Material existing) && existing != null) return existing;
            Texture texture = source.HasProperty("_BaseMap") ? source.GetTexture("_BaseMap") : source.mainTexture;
            Color color = source.HasProperty("_BaseColor") ? source.GetColor("_BaseColor") :
                source.HasProperty("_Color") ? source.GetColor("_Color") : Color.white;
            Material copy = new Material(source) { shader = shader, name = source.name + " (CrushX compatible)" };
            if (copy.HasProperty("_BaseMap")) copy.SetTexture("_BaseMap", texture);
            if (copy.HasProperty("_MainTex")) copy.SetTexture("_MainTex", texture);
            if (copy.HasProperty("_BaseColor")) copy.SetColor("_BaseColor", color);
            if (copy.HasProperty("_Color")) copy.SetColor("_Color", color);
            if (!shaders.ContainsKey(shader)) Count++;
            shaders[shader] = copy;
            return copy;
        }

        public void Apply(GameObject instance, Shader shader)
        {
            if (instance == null || shader == null) return;
            foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++) materials[i] = Get(materials[i], shader);
                renderer.sharedMaterials = materials;
            }
        }

        public void Dispose()
        {
            foreach (Dictionary<Shader, Material> shaders in copies.Values)
                foreach (Material material in shaders.Values)
                    if (material != null) destroy(material);
            copies.Clear();
            Count = 0;
        }
    }
}
