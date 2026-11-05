using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Adds an actual image-space warp pass to the URP camera output.
    /// Add this feature to the *active* UniversalRendererData (it is opt-in).
    /// ARCameraBackground must have rendered the aligned camera image first.
    /// </summary>
    public sealed class FunnyFaceWarpRendererFeature : ScriptableRendererFeature
    {
        [SerializeField] private Shader warpShader;
        private Material warpMaterial;
        private FunnyWarpPass pass;

        private static readonly int LeftId = Shader.PropertyToID("_CrushLeftEye");
        private static readonly int RightId = Shader.PropertyToID("_CrushRightEye");
        private static readonly int MouthId = Shader.PropertyToID("_CrushMouth");
        private static readonly int EyeStrengthId = Shader.PropertyToID("_CrushEyeStrength");
        private static readonly int MouthStrengthId = Shader.PropertyToID("_CrushMouthStrength");

        public override void Create()
        {
            if (warpMaterial != null)
            {
                CoreUtils.Destroy(warpMaterial);
                warpMaterial = null;
            }
            Shader shader = warpShader != null ?
                warpShader : Shader.Find("Hidden/CrushX/FunnyFaceWarp");
            if (shader == null)
            {
                pass = null;
                Debug.LogWarning("Crush.X face warp shader not found; warp disabled");
                return;
            }
            warpMaterial = CoreUtils.CreateEngineMaterial(shader);
            pass = new FunnyWarpPass(warpMaterial);
            pass.renderPassEvent = RenderPassEvent.AfterRenderingTransparents;
        }

        public override void AddRenderPasses(ScriptableRenderer renderer,
            ref RenderingData renderingData)
        {
            if (pass == null || warpMaterial == null ||
                renderingData.cameraData.cameraType != CameraType.Game) return;
            var state = FaceWarpFrameSource.Active;
            if (state == null) return;

            Vector4 left, right, mouth;
            float eyeStrength, mouthStrength;
            if (!state.TryGetShaderParameters(Time.realtimeSinceStartup,
                out left, out right, out mouth, out eyeStrength, out mouthStrength))
                return;

            warpMaterial.SetVector(LeftId, left);
            warpMaterial.SetVector(RightId, right);
            warpMaterial.SetVector(MouthId, mouth);
            warpMaterial.SetFloat(EyeStrengthId, eyeStrength);
            warpMaterial.SetFloat(MouthStrengthId, mouthStrength);
            renderer.EnqueuePass(pass);
        }

        protected override void Dispose(bool disposing)
        {
            if (warpMaterial != null) CoreUtils.Destroy(warpMaterial);
            warpMaterial = null;
            pass = null;
        }

        private sealed class FunnyWarpPass : ScriptableRenderPass
        {
            private readonly Material material;
            private RenderTextureDescriptor descriptor;
            internal FunnyWarpPass(Material material) { this.material = material; }

            public override void RecordRenderGraph(RenderGraph renderGraph,
                ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                var camera = frameData.Get<UniversalCameraData>();
                if (resources.isActiveTargetBackBuffer) return;

                TextureHandle source = resources.activeColorTexture;
                if (!source.IsValid()) return;

                descriptor = camera.cameraTargetDescriptor;
                descriptor.depthBufferBits = 0;
                descriptor.msaaSamples = 1;
                TextureHandle temporary = UniversalRenderer.CreateRenderGraphTexture(
                    renderGraph, descriptor, "_CrushFunnyWarpFrame", false);
                if (!temporary.IsValid()) return;

                // Two passes avoid reading and writing the same texture in one pass.
                var warped = new RenderGraphUtils.BlitMaterialParameters(
                    source, temporary, material, 0);
                renderGraph.AddBlitPass(warped, "Crush.X funny face warp");
                var copyBack = new RenderGraphUtils.BlitMaterialParameters(
                    temporary, source, material, 1);
                renderGraph.AddBlitPass(copyBack, "Crush.X funny face warp copy back");
            }
        }
    }
}
