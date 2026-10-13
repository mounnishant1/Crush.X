using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    // Runtime primitives keep this project runnable without paid meshes/textures.
    public static class LensGeometry
    {
        private static readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();
        public static Material MakeMaterial(Color color, float metallic = 0, float smoothness = .45f)
        {
            string key = ColorUtility.ToHtmlStringRGBA(color) + ":" + metallic.ToString("F2") + ":" + smoothness.ToString("F2");
            if (cache.TryGetValue(key, out Material reused) && reused != null) return reused;
            Shader shader = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline == null
                ? Shader.Find("Standard") : Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Unlit/Color");
            Material mat = new Material(shader);
            mat.color = color;
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", metallic);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            cache[key] = mat;
            return mat;
        }

        public static Transform Add(Transform parent, string name, PrimitiveType kind, Vector3 pos, Vector3 scale, Color color, Vector3? rotation = null)
        {
            GameObject obj = GameObject.CreatePrimitive(kind);
            obj.name = name;
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = pos;
            obj.transform.localScale = scale;
            if (rotation.HasValue) obj.transform.localRotation = Quaternion.Euler(rotation.Value);
            Collider collider = obj.GetComponent<Collider>();
            if (collider != null) Object.Destroy(collider);
            obj.GetComponent<MeshRenderer>().sharedMaterial = MakeMaterial(color);
            return obj.transform;
        }

        public static Transform Ring(Transform parent, string name, Vector3 pos, float radius, float thickness, Color color, int segments = 40)
        {
            // XY plane ring; local z points out of face. Solid 3D torus approximation.
            GameObject obj = new GameObject(name);
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = pos;
            MeshFilter mf = obj.AddComponent<MeshFilter>();
            MeshRenderer mr = obj.AddComponent<MeshRenderer>();
            const int sides = 8;
            var verts = new Vector3[(segments + 1) * (sides + 1)];
            var indices = new int[segments * sides * 6];
            for (int i = 0; i <= segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                Vector3 center = new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, 0);
                for (int j = 0; j <= sides; j++)
                {
                    float b = j * Mathf.PI * 2 / sides;
                    verts[i * (sides + 1) + j] = center + new Vector3(Mathf.Cos(a) * Mathf.Cos(b) * thickness, Mathf.Sin(a) * Mathf.Cos(b) * thickness, Mathf.Sin(b) * thickness);
                }
            }
            int n = 0;
            for (int i = 0; i < segments; i++) for (int j = 0; j < sides; j++)
            {
                int a = i * (sides + 1) + j;
                int b = a + sides + 1;
                indices[n++] = a; indices[n++] = b; indices[n++] = a + 1;
                indices[n++] = b; indices[n++] = b + 1; indices[n++] = a + 1;
            }
            var mesh = new Mesh { name = name + "-torus" };
            mesh.vertices = verts; mesh.triangles = indices;
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            mf.sharedMesh = mesh;
            mr.sharedMaterial = MakeMaterial(color, .2f, .85f);
            return obj.transform;
        }

        public static Transform Spire(Transform parent, string name, Vector3 pos, float radius, float height, Color color, int sides = 5)
        {
            GameObject obj = new GameObject(name);
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = pos;
            var vertices = new Vector3[sides + 2];
            vertices[0] = new Vector3(0, height, 0);
            for (int i = 0; i < sides; i++)
            {
                float a = Mathf.PI * 2 * i / sides;
                vertices[i + 1] = new Vector3(Mathf.Sin(a) * radius, 0, Mathf.Cos(a) * radius);
            }
            vertices[sides + 1] = Vector3.zero;
            var triangles = new int[sides * 6];
            for (int i = 0; i < sides; i++)
            {
                int b = i * 6;
                triangles[b] = 0; triangles[b + 1] = i + 1; triangles[b + 2] = (i + 1) % sides + 1;
                triangles[b + 3] = sides + 1; triangles[b + 4] = (i + 1) % sides + 1; triangles[b + 5] = i + 1;
            }
            var mesh = new Mesh { name = name + "-mesh" };
            mesh.vertices = vertices; mesh.triangles = triangles; mesh.RecalculateNormals(); mesh.RecalculateBounds();
            obj.AddComponent<MeshFilter>().sharedMesh = mesh;
            obj.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(color);
            return obj.transform;
        }
    }
}
