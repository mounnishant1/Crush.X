using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace CrushX.LensEngine
{
    [Serializable]
    public sealed class VisualEffectSettings
    {
        [Range(0, 1)] public float SkinSmoothing = .5f;
        [Range(0, 1)] public float SkinToneAmount;
        public Color SkinTone = Color.white;
        [Range(0, 1)] public float EyeEnhancement;
        [Range(0, 1)] public float LipAmount;
        public Color LipColor = new Color(.65f, .12f, .23f, 1);
        [Range(0, 1)] public float BlushAmount;
        public Color BlushColor = new Color(.9f, .3f, .4f, 1);
        [Range(0, 1)] public float HairAmount;
        public Color HairColor = new Color(.5f, .2f, .6f, 1);
        [Range(0, 1)] public float BackgroundBlur;
        [Range(0, 1)] public float BackgroundReplacement;
        public Texture BackgroundTexture;
        public Color BackgroundColor = new Color(.08f, .09f, .14f, 1);
        [Range(0, 1)] public float ChromaAmount;
        public Color ChromaColor = Color.green;
        [Range(.01f, .8f)] public float ChromaThreshold = .2f;
        [Range(.01f, .4f)] public float ChromaSoftness = .1f;
    }

    /// <summary>Source-owned red-channel confidence masks, registered to the fully corrected camera viewport.
    /// Timestamp is Unity realtimeSinceStartupAsDouble at inference input; this is not an inference result claim.</summary>
    public struct VisualMaskFrame
    {
        public int CameraInstanceId, ViewportWidth, ViewportHeight;
        public double Timestamp;
        public Texture Skin, Eyes, Lips, Cheeks, Hair, Person;
    }

    /// <summary>Built-in GPU compositor. Uses genuine registered masks or bypasses mask-specific effects.
    /// Runs after image effects and before NativeMediaCapture's AfterEverything copy, with no camera UI.</summary>
    [DisallowMultipleComponent, RequireComponent(typeof(Camera))]
    public sealed class GpuBeautyPipeline : MonoBehaviour
    {
        public VisualEffectSettings Settings = new VisualEffectSettings();
        public bool Supported { get; private set; }
        public string StatusMessage { get; private set; } = "Beauty needs registered local model masks";
        public bool EffectsActive => commands != null;
        public CameraColorGrade ColorGrade
        {
            get => colorGrade;
            set => colorGrade = VisualEffectPolicy.ValidGrade(value);
        }
        public float GradeIntensity
        {
            get => gradeIntensity;
            set => gradeIntensity = (float)VisualEffectPolicy.Unit(value);
        }
        public float BeautyIntensity
        {
            get => beautyIntensity;
            set => beautyIntensity = (float)VisualEffectPolicy.Unit(value);
        }
        public bool SkinMaskReady => Supported && MasksFresh && masks.Skin != null;
        public bool PersonMaskReady => Supported && MasksFresh && masks.Person != null;

        private Camera targetCamera;
        private Shader compositeShader;
        private Material material;
        private CommandBuffer commands;
        private VisualMaskFrame masks;
        private double lastTimestamp = double.NegativeInfinity;
        private float beautyIntensity;
        private CameraColorGrade colorGrade;
        private float gradeIntensity = 1;
        private LensQualityTier quality = LensQualityTier.Balanced;
        private int commandWidth, commandHeight;
        private static readonly int TemporaryFrame = Shader.PropertyToID("_CrushXBeautyFrame");
        private static readonly int SkinMask = Shader.PropertyToID("_SkinMask");
        private static readonly int EyeMask = Shader.PropertyToID("_EyeMask");
        private static readonly int LipMask = Shader.PropertyToID("_LipMask");
        private static readonly int CheekMask = Shader.PropertyToID("_CheekMask");
        private static readonly int HairMask = Shader.PropertyToID("_HairMask");
        private static readonly int PersonMask = Shader.PropertyToID("_PersonMask");
        private static readonly int SkinParams = Shader.PropertyToID("_SkinParams");
        private static readonly int DetailParams = Shader.PropertyToID("_DetailParams");
        private static readonly int BackgroundParams = Shader.PropertyToID("_BackgroundParams");
        private static readonly int ChromaParams = Shader.PropertyToID("_ChromaParams");
        private static readonly int TapCount = Shader.PropertyToID("_TapCount");
        private static readonly int SkinTone = Shader.PropertyToID("_SkinTone");
        private static readonly int LipColor = Shader.PropertyToID("_LipColor");
        private static readonly int BlushColor = Shader.PropertyToID("_BlushColor");
        private static readonly int HairColor = Shader.PropertyToID("_HairColor");
        private static readonly int BackgroundTexture = Shader.PropertyToID("_BackgroundTex");
        private static readonly int BackgroundColor = Shader.PropertyToID("_BackgroundColor");
        private static readonly int ChromaColor = Shader.PropertyToID("_ChromaColor");
        private static readonly int GradeParams = Shader.PropertyToID("_GradeParams");

        private bool MasksFresh => targetCamera != null && masks.CameraInstanceId == targetCamera.GetInstanceID() &&
            masks.ViewportWidth == targetCamera.pixelWidth && masks.ViewportHeight == targetCamera.pixelHeight &&
            VisualEffectPolicy.Fresh(masks.Timestamp, Time.realtimeSinceStartupAsDouble) && !double.IsNegativeInfinity(lastTimestamp);

        public static GpuBeautyPipeline GetOrCreate(Camera camera)
        {
            if (camera == null) throw new ArgumentNullException(nameof(camera));
            var pipeline = camera.GetComponent<GpuBeautyPipeline>() ?? camera.gameObject.AddComponent<GpuBeautyPipeline>();
            pipeline.enabled = true;
            return pipeline;
        }

        public void SetQuality(LensQualityTier value)
        {
            if ((int)value < 0 || (int)value > 2) throw new ArgumentOutOfRangeException(nameof(value));
            quality = value;
        }

        public bool SubmitMasks(VisualMaskFrame frame)
        {
            if (targetCamera == null) targetCamera = GetComponent<Camera>();
            if (!VisualEffectPolicy.ValidFrame(targetCamera.GetInstanceID(), targetCamera.pixelWidth, targetCamera.pixelHeight,
                frame.CameraInstanceId, frame.ViewportWidth, frame.ViewportHeight, frame.Timestamp,
                Time.realtimeSinceStartupAsDouble, lastTimestamp)) return false;
            masks = frame;
            lastTimestamp = frame.Timestamp;
            return true;
        }

        public void ClearMasks() { masks = default; lastTimestamp = double.NegativeInfinity; }

        private void OnEnable()
        {
            targetCamera = GetComponent<Camera>();
            compositeShader = Resources.Load<Shader>("CrushXLenses/GpuBeautyComposite");
            CheckSupport();
        }

        private bool CheckSupport()
        {
            Supported = GraphicsSettings.currentRenderPipeline == null && compositeShader != null && compositeShader.isSupported;
            if (!Supported)
                StatusMessage = GraphicsSettings.currentRenderPipeline != null
                    ? "Beauty needs a validated renderer feature for this SRP"
                    : "GPU beauty shader is unavailable or unsupported";
            return Supported;
        }

        private void Update()
        {
            if (Settings == null || !CheckSupport() || !targetCamera.isActiveAndEnabled || targetCamera.pixelWidth <= 0 || targetCamera.pixelHeight <= 0)
            { ReleasePass(); return; }
            bool fresh = MasksFresh;
            float beauty = (float)VisualEffectPolicy.Unit(beautyIntensity);
            float skin = fresh && masks.Skin != null ? beauty : 0;
            float eye = fresh && masks.Eyes != null ? beauty * Unit(Settings.EyeEnhancement) : 0;
            float lip = fresh && masks.Lips != null ? beauty * Unit(Settings.LipAmount) : 0;
            float blush = fresh && masks.Cheeks != null ? beauty * Unit(Settings.BlushAmount) : 0;
            float hair = fresh && masks.Hair != null ? Unit(Settings.HairAmount) : 0;
            float person = fresh && masks.Person != null ? 1 : 0;
            float blur = person * Unit(Settings.BackgroundBlur);
            float replace = person * Unit(Settings.BackgroundReplacement);
            float chroma = Unit(Settings.ChromaAmount);
            float grade = colorGrade != CameraColorGrade.None ? Unit(gradeIntensity) : 0;
            float smoothing = skin * (float)VisualEffectPolicy.SmoothingStrength(Settings.SkinSmoothing);
            float tone = skin * Unit(Settings.SkinToneAmount);
            StatusMessage = SkinMaskReady ? "Registered skin mask available" : "Beauty needs a fresh registered skin mask";
            if (smoothing + tone + eye + lip + blush + hair + blur + replace + chroma + grade <= 0)
            { ReleasePass(); return; }
            EnsurePass();
            material.SetTexture(SkinMask, fresh && masks.Skin != null ? masks.Skin : Texture2D.blackTexture);
            material.SetTexture(EyeMask, fresh && masks.Eyes != null ? masks.Eyes : Texture2D.blackTexture);
            material.SetTexture(LipMask, fresh && masks.Lips != null ? masks.Lips : Texture2D.blackTexture);
            material.SetTexture(CheekMask, fresh && masks.Cheeks != null ? masks.Cheeks : Texture2D.blackTexture);
            material.SetTexture(HairMask, fresh && masks.Hair != null ? masks.Hair : Texture2D.blackTexture);
            material.SetTexture(PersonMask, fresh && masks.Person != null ? masks.Person : Texture2D.whiteTexture);
            material.SetVector(SkinParams, new Vector4(smoothing, tone, eye * .25f, lip));
            material.SetVector(DetailParams, new Vector4(blush * .4f, hair, (float)VisualEffectPolicy.BlurRadius(blur), 0));
            material.SetVector(BackgroundParams, new Vector4(blur, replace, person, Settings.BackgroundTexture != null ? 1 : 0));
            material.SetVector(ChromaParams, new Vector4(chroma, Mathf.Clamp(Unit(Settings.ChromaThreshold), .01f, .8f),
                Mathf.Clamp(Unit(Settings.ChromaSoftness), .01f, .4f), 0));
            material.SetFloat(TapCount, VisualEffectPolicy.TapCount((int)quality));
            material.SetColor(SkinTone, FiniteColor(Settings.SkinTone));
            material.SetColor(LipColor, FiniteColor(Settings.LipColor));
            material.SetColor(BlushColor, FiniteColor(Settings.BlushColor));
            material.SetColor(HairColor, FiniteColor(Settings.HairColor));
            material.SetColor(BackgroundColor, FiniteColor(Settings.BackgroundColor));
            material.SetTexture(BackgroundTexture, Settings.BackgroundTexture != null ? Settings.BackgroundTexture : Texture2D.blackTexture);
            material.SetColor(ChromaColor, FiniteColor(Settings.ChromaColor));
            material.SetVector(GradeParams, new Vector4((int)colorGrade, grade, 0, 0));
        }

        private void EnsurePass()
        {
            if (material == null) material = new Material(compositeShader)
                { name = "CrushX GPU beauty", hideFlags = HideFlags.HideAndDontSave };
            int width = targetCamera.pixelWidth, height = targetCamera.pixelHeight;
            if (commands != null && width == commandWidth && height == commandHeight) return;
            ReleaseCommands();
            commands = new CommandBuffer { name = "CrushX masked beauty before media capture" };
            commands.GetTemporaryRT(TemporaryFrame, -1, -1, 0, FilterMode.Bilinear, RenderTextureFormat.Default);
            commands.Blit(BuiltinRenderTextureType.CameraTarget, TemporaryFrame);
            commands.Blit(TemporaryFrame, BuiltinRenderTextureType.CameraTarget, material, 0);
            commands.ReleaseTemporaryRT(TemporaryFrame);
            targetCamera.AddCommandBuffer(CameraEvent.AfterImageEffects, commands);
            commandWidth = width; commandHeight = height;
        }

        private static float Unit(float value) => (float)VisualEffectPolicy.Unit(value);
        private static Color FiniteColor(Color value) => new Color(Unit(value.r), Unit(value.g), Unit(value.b), 1);
        private void ReleaseCommands()
        {
            if (targetCamera != null && commands != null) targetCamera.RemoveCommandBuffer(CameraEvent.AfterImageEffects, commands);
            commands?.Release(); commands = null;
        }
        private void ReleasePass()
        {
            ReleaseCommands();
            if (material == null) return;
            if (Application.isPlaying) Destroy(material); else DestroyImmediate(material);
            material = null;
        }
        private void OnDisable() { ReleasePass(); ClearMasks(); }
        private void OnDestroy() { ReleasePass(); ClearMasks(); }
    }
}
