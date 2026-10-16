using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace CrushX.LensEngine
{
    /// <summary>Built-in fullscreen color processing. No face, expression, or hand data is required.</summary>
    public abstract class ColorFilterLens : LensEffect
    {
        public const string ShaderResource = "CrushXLenses/CameraColorGrade";
        public Camera TargetCamera { get; set; }
        public Material FilterMaterial { get; private set; }
        public bool IsSelected { get; private set; }
        public string UnavailableReason { get; private set; }

        private readonly object ownerToken = new object();
        private CameraColorFilter cameraFilter;

        protected abstract int FilterMode { get; }
        protected virtual void Configure(Material material) { }

        public static bool IsSupported(out string reason)
        {
            if (GraphicsSettings.currentRenderPipeline != null)
            {
                reason = "Color filters currently require the Built-in Render Pipeline";
                return false;
            }
            // A Resources asset is an explicit player-build reference, rather than Shader.Find alone.
            Shader shader = Resources.Load<Shader>(ShaderResource);
            if (shader == null)
            {
                reason = "Camera color-grade shader is missing from Resources";
                return false;
            }
            if (!shader.isSupported)
            {
                reason = "Camera color-grade shader is unsupported by this graphics device";
                return false;
            }
            reason = string.Empty;
            return true;
        }

        public override void Build()
        {
            EnsureSupported();
            if (TargetCamera == null) TargetCamera = Camera.main;
            if (TargetCamera == null) throw new InvalidOperationException("Color filter needs an active camera");
            // No camera changes or GPU allocations on an inactive candidate. Unity does not
            // guarantee OnDestroy for components that have never been active in the hierarchy.
        }

        private void CreateMaterial()
        {
            Material material = new Material(Resources.Load<Shader>(ShaderResource))
            {
                name = "CrushX " + LensId,
                hideFlags = HideFlags.HideAndDontSave
            };
            try
            {
                material.SetFloat("_Mode", FilterMode);
                Configure(material);
                FilterMaterial = material;
            }
            catch
            {
                DisposeMaterial(material);
                throw;
            }
        }

        public override void OnSelected()
        {
            EnsureSupported();
            Build();
            bool created = FilterMaterial == null;
            if (created) CreateMaterial();
            try
            {
                AttachToCamera(true);
                IsSelected = true;
            }
            catch
            {
                DetachFromCamera();
                if (created) { DisposeMaterial(FilterMaterial); FilterMaterial = null; }
                throw;
            }
        }

        public override void OnDeselected()
        {
            IsSelected = false;
            DetachFromCamera();
            DisposeMaterial(FilterMaterial);
            FilterMaterial = null;
        }

        private void EnsureSupported()
        {
            if (IsSupported(out string reason)) { UnavailableReason = string.Empty; return; }
            UnavailableReason = reason;
            ARTrackingDiagnostics.RecordLensStatus(LensId, ARDiagnosticOutcome.LensRendererUnavailable, reason);
            throw new NotSupportedException(reason);
        }

        private void AttachToCamera(bool replaceOwner)
        {
            CameraColorFilter next = TargetCamera.GetComponent<CameraColorFilter>();
            if (next == null) next = TargetCamera.gameObject.AddComponent<CameraColorFilter>();
            // Re-enabling an old hierarchy must not steal a later explicit selection.
            if (!replaceOwner && next.OwnerToken != null && !ReferenceEquals(next.OwnerToken, ownerToken)) return;
            if (cameraFilter != null && cameraFilter != next) cameraFilter.ClearFilter(ownerToken);
            next.SetFilter(ownerToken, FilterMaterial);
            cameraFilter = next;
        }

        private void DetachFromCamera()
        {
            if (cameraFilter != null) cameraFilter.ClearFilter(ownerToken);
            cameraFilter = null;
        }

        private void OnEnable()
        {
            if (!IsSelected || FilterMaterial == null || TargetCamera == null) return;
            try { EnsureSupported(); AttachToCamera(false); }
            catch (Exception error)
            {
                UnavailableReason = error.Message;
                DetachFromCamera();
                ARTrackingDiagnostics.RecordLensStatus(LensId, ARDiagnosticOutcome.LensRendererUnavailable, UnavailableReason);
            }
        }

        private void OnDisable() { DetachFromCamera(); }

        protected override void OnDestroy()
        {
            OnDeselected();
            base.OnDestroy();
        }

        private static void DisposeMaterial(Material material)
        {
            if (material == null) return;
            if (Application.isPlaying) Destroy(material);
            else DestroyImmediate(material);
        }
    }

    // Shared per camera. A previous lens cannot clear the material installed by a later selection.
    [DisallowMultipleComponent, RequireComponent(typeof(Camera))]
    public sealed class CameraColorFilter : MonoBehaviour
    {
        public object OwnerToken { get; private set; }
        public Material CurrentMaterial { get; private set; }

        private void Awake() { enabled = false; }

        public void SetFilter(object ownerToken, Material material)
        {
            if (ownerToken == null) throw new ArgumentNullException(nameof(ownerToken));
            if (material == null) throw new ArgumentNullException(nameof(material));
            OwnerToken = ownerToken;
            CurrentMaterial = material;
            enabled = true;
        }

        public bool ClearFilter(object ownerToken)
        {
            if (ownerToken == null || !ReferenceEquals(ownerToken, OwnerToken)) return false;
            OwnerToken = null;
            CurrentMaterial = null;
            enabled = false;
            return true;
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (GraphicsSettings.currentRenderPipeline == null && CurrentMaterial != null && CurrentMaterial.shader != null && CurrentMaterial.shader.isSupported)
                Graphics.Blit(source, destination, CurrentMaterial, 0);
            else
                Graphics.Blit(source, destination);
        }

        private void OnDestroy()
        {
            OwnerToken = null;
            CurrentMaterial = null;
            // Material ownership belongs to the selected ColorFilterLens, never this component.
        }
    }

    public sealed class WarmCinemaLens : ColorFilterLens
    {
        public override string LensId { get { return "cinema-warm"; } }
        protected override int FilterMode { get { return 0; } }
        protected override void Configure(Material material)
        {
            material.SetFloat("_Warmth", .55f);
            material.SetFloat("_Contrast", 1.12f);
            material.SetFloat("_Saturation", .88f);
            material.SetFloat("_Vignette", .10f);
        }
    }

    public sealed class NoirFilmLens : ColorFilterLens
    {
        public override string LensId { get { return "noir-film"; } }
        protected override int FilterMode { get { return 1; } }
        protected override void Configure(Material material)
        {
            material.SetFloat("_Contrast", 1.30f);
            material.SetFloat("_Saturation", 0);
            material.SetFloat("_Vignette", .42f);
        }
    }

    public sealed class NeonDuotoneLens : ColorFilterLens
    {
        public override string LensId { get { return "neon-duotone"; } }
        protected override int FilterMode { get { return 2; } }
        protected override void Configure(Material material)
        {
            material.SetFloat("_Contrast", 1.18f);
            material.SetFloat("_Vignette", .18f);
            material.SetColor("_ShadowColor", new Color(.015f, .11f, .34f, 1));
            material.SetColor("_HighlightColor", new Color(1, .12f, .66f, 1));
        }
    }
}
