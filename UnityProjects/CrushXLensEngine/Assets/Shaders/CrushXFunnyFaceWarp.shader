Shader "Hidden/CrushX/FunnyFaceWarp"
{
    Properties
    {
        _BlitTexture("Camera Image", 2D) = "white" {}
    }

    HLSLINCLUDE
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
    #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

    float4 _CrushLeftEye;     // x,y=center in bottom-left UV; z,w=radii
    float4 _CrushRightEye;
    float4 _CrushMouth;
    float _CrushEyeStrength;  // 0 disables
    float _CrushMouthStrength;

    float2 WarpRegion(float2 uv, float4 region, float intensity)
    {
        if (intensity <= 0.0001) return uv;

        float2 normalized = (uv - region.xy) / max(region.zw, float2(.001, .001));
        float distSquared = dot(normalized, normalized);
        float inRegion = saturate(1.0 - distSquared);
        // Quadratic falloff guarantees zero discontinuity at the boundary.
        float weighted = intensity * inRegion * inRegion;
        return lerp(uv, region.xy, weighted);
    }

    float4 WarpFragment(Varyings input) : SV_Target
    {
        UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
        float2 uv = input.texcoord;

        // Warp only one type per selected funny lens; zeros are no-ops.
        // Both eyes can warp independently on the same camera image.
        uv = WarpRegion(uv, _CrushLeftEye, _CrushEyeStrength);
        uv = WarpRegion(uv, _CrushRightEye, _CrushEyeStrength);
        uv = WarpRegion(uv, _CrushMouth, _CrushMouthStrength);
        uv = saturate(uv);
        return SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv);
    }

    float4 CopyFragment(Varyings input) : SV_Target
    {
        UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
        return SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, input.texcoord);
    }
    ENDHLSL

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZTest Always ZWrite Off Cull Off

        Pass
        {
            Name "FunnyWarp"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment WarpFragment
            ENDHLSL
        }
        Pass
        {
            Name "CopyBack"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment CopyFragment
            ENDHLSL
        }
    }
    Fallback Off
}
