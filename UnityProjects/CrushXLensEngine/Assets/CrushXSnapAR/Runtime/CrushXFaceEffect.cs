using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace CrushX.SnapAR
{
    public class CrushXFaceEffect : MonoBehaviour
    {
        private ARFaceManager manager;
        private readonly Dictionary<TrackableId, GameObject> effects =
            new Dictionary<TrackableId, GameObject>();

        private int selected = 0;

        private readonly string[] names = {
            "Golden Crown", "Fox", "Neon Halo",
            "Cyber Visor", "Bunny", "Fire Horns",
            "Star Crown", "Robot", "Alien",
            "Cat", "Sunset Shades", "Crystal"
        };

        private void Awake()
        {
            manager = GetComponent<ARFaceManager>();
        }

        private void OnEnable()
        {
            if (manager != null)
                manager.trackablesChanged.AddListener(OnFaces);
        }

        private void OnDisable()
        {
            if (manager != null)
                manager.trackablesChanged.RemoveListener(OnFaces);

            ClearEffects();
        }

        private void OnFaces(ARTrackablesChangedEventArgs<ARFace> args)
        {
            foreach (var item in args.removed)
            {
                if (effects.TryGetValue(item.Key, out var obj))
                {
                    if (obj != null) Destroy(obj);
                    effects.Remove(item.Key);
                }
            }

            foreach (var face in args.added) UpdateFace(face);
            foreach (var face in args.updated) UpdateFace(face);
        }

        private void UpdateFace(ARFace face)
        {
            if (face == null) return;

            if (face.trackingState != TrackingState.Tracking)
            {
                if (effects.TryGetValue(face.trackableId, out var old))
                    if (old != null) old.SetActive(false);
                return;
            }

            if (!effects.TryGetValue(face.trackableId, out var effect)
                || effect == null)
            {
                effect = CreateEffect(face.transform);
                effects[face.trackableId] = effect;
            }

            effect.SetActive(true);
        }

        private GameObject CreateEffect(Transform face)
        {
            var root = new GameObject("CrushX_Tracked_Lens");
            root.transform.SetParent(face, false);

            Color primary = selected % 3 == 0 ? Color.yellow :
                            selected % 3 == 1 ? Color.cyan :
                            Color.magenta;

            if (selected == 0 || selected == 6 || selected == 11)
            {
                for (int i = -2; i <= 2; i++)
                    AddPart(root.transform, PrimitiveType.Sphere,
                        new Vector3(i * .05f, .18f + (2 - Mathf.Abs(i)) * .02f, 0),
                        new Vector3(.045f, .09f, .04f), primary);
            }
            else if (selected == 1 || selected == 4 || selected == 9)
            {
                for (int side = -1; side <= 1; side += 2)
                    AddPart(root.transform, PrimitiveType.Sphere,
                        new Vector3(side * .11f, .18f, 0),
                        new Vector3(.085f, selected == 4 ? .25f : .14f, .05f),
                        primary);
            }
            else if (selected == 3 || selected == 7 || selected == 10)
            {
                for (int side = -1; side <= 1; side += 2)
                    AddPart(root.transform, PrimitiveType.Cube,
                        new Vector3(side * .08f, .025f, -.1f),
                        new Vector3(.14f, .075f, .025f), primary);
            }
            else
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    AddPart(root.transform, PrimitiveType.Capsule,
                        new Vector3(side * .12f, .19f, 0),
                        new Vector3(.04f, .17f, .04f), primary);
                    AddPart(root.transform, PrimitiveType.Sphere,
                        new Vector3(side * .12f, .3f, 0),
                        new Vector3(.065f, .065f, .065f), primary);
                }
            }

            return root;
        }

        private static void AddPart(
            Transform root, PrimitiveType type,
            Vector3 position, Vector3 scale, Color color)
        {
            var part = GameObject.CreatePrimitive(type);
            part.transform.SetParent(root, false);
            part.transform.localPosition = position;
            part.transform.localScale = scale;

            var collider = part.GetComponent<Collider>();
            if (collider != null) Destroy(collider);

            var renderer = part.GetComponent<Renderer>();

            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            if (shader == null) shader = Shader.Find("Unlit/Color");

            if (renderer != null && shader != null)
            {
                var material = new Material(shader);
                if (material.HasProperty("_BaseColor"))
                    material.SetColor("_BaseColor", color);
                if (material.HasProperty("_Color"))
                    material.SetColor("_Color", color);
                renderer.material = material;
            }
        }

        private void ClearEffects()
        {
            foreach (var effect in effects.Values)
                if (effect != null) Destroy(effect);

            effects.Clear();
        }

        public void ChangeLens(int direction)
        {
            selected = (selected + direction + names.Length) % names.Length;
            ClearEffects();

            if (manager != null)
                foreach (var face in manager.trackables)
                    UpdateFace(face);
        }

        private void OnGUI()
        {
            float w = Screen.width;
            float h = Screen.height;

            GUI.Box(new Rect(15, 15, w - 30, 75),
                "Crush.X AR Test - " + names[selected]);

            if (GUI.Button(new Rect(20, h - 115, 90, 70), "<"))
                ChangeLens(-1);

            if (GUI.Button(new Rect(w - 110, h - 115, 90, 70), ">"))
                ChangeLens(1);
        }
    }
}