using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Optional ORIGINAL camera post-process for BeautyGlow and BeautyBlush.
    /// No third-party filter binary, no face-image data upload, no other SDK.
    /// Requires the active UniversalRenderer to have this feature installed.
    /// </summary>
    public sealed class CrushXBeautyRendererFeature : ScriptableRendererFeature
    {
        [SerializeField] private Shader beautyShader;
        private Material material;
        private BeautyPass pass;

        private static readonly int FaceId = Shader.PropertyToID("_CrushBeautyFace");
        private static readonly int EyeLeftId = Shader.PropertyToID("_CrushBeautyEyeL");
        private static readonly int EyeRightId = Shader.PropertyToID("_CrushBeautyEyeR");
        private static readonly int MouthId = Shader.PropertyToID("_CrushBeautyMouth");
        private static readonly int AmountId = Shader.PropertyToID("_CrushBeautyIntensity");
        private static readonly int ModeId = Shader.PropertyToID("_CrushBeautyMode");

        public override void Create()
        {
            if (material != null) CoreUtils.Destroy(material);
            Shader chosen = beautyShader != null ?
                beautyShader : Shader.Find("Hidden/CrushX/OriginalBeauty");
            if (chosen == null)
            {
                pass = null;
                material = null;
                Debug.LogWarning("Crush.X original beauty shader missing; beauty pass off");
                return;
            }
            material = CoreUtils.CreateEngineMaterial(chosen);
            pass = new BeautyPass(material)
            {
                renderPassEvent = RenderPassEvent.AfterRenderingTransparents
            };
        }

        public override void AddRenderPasses(ScriptableRenderer renderer,
            ref RenderingData renderingData)
        {
            if (pass == null || material == null ||
                renderingData.cameraData.cameraType != CameraType.Game) return;

            var state = FaceWarpFrameSource.Active;
            if (state == null) return;
            Vector4 face, left, right, mouth;
            float amount;
            int mode;
            if (!state.TryGetBeautyParameters(Time.realtimeSinceStartup,
                out face, out left, out right, out mouth, out amount, out mode))
                return;

            material.SetVector(FaceId, face);
            material.SetVector(EyeLeftId, left);
            material.SetVector(EyeRightId, right);
            material.SetVector(MouthId, mouth);
            material.SetFloat(AmountId, amount);
            material.SetFloat(ModeId, mode);
            renderer.EnqueuePass(pass);
        }

        protected override void Dispose(bool disposing)
        {
            if (material != null) CoreUtils.Destroy(material);
            material = null;
            pass = null;
        }

        private sealed class BeautyPass : ScriptableRenderPass
        {
            private readonly Material material;

            public BeautyPass(Material material)
            {
                this.material = material;
                // Do not sample the backbuffer in an image-effect pass.
                requiresIntermediateTexture = true;
            }

            public override void RecordRenderGraph(RenderGraph graph,
                ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                var camera = frameData.Get<UniversalCameraData>();
                if (resources.isActiveTargetBackBuffer) return;
                TextureHandle source = resources.activeColorTexture;
                if (!source.IsValid()) return;

                RenderTextureDescriptor desc = camera.cameraTargetDescriptor;
                desc.depthBufferBits = 0;
                desc.msaaSamples = 1;
                TextureHandle intermediate = UniversalRenderer.CreateRenderGraphTexture(
                    graph, desc, "_CrushBeautyTemp", false);
                if (!intermediate.IsValid()) return;

                var apply = new RenderGraphUtils.BlitMaterialParameters(
                    source, intermediate, material, 0);
                graph.AddBlitPass(apply, "Crush.X original beauty");
                var copy = new RenderGraphUtils.BlitMaterialParameters(
                    intermediate, source, material, 1);
                graph.AddBlitPass(copy, "Crush.X original beauty copy");
            }
        }
    }
}
