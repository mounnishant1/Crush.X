Shader "Hidden/CrushX/OriginalBeauty"
{
    Properties { _BlitTexture("Camera Image", 2D) = "white" {} }
    HLSLINCLUDE
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
    #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

    float4 _CrushBeautyFace;      // center.xy + radius.zw in aligned viewport UV
    float4 _CrushBeautyEyeL;
    float4 _CrushBeautyEyeR;
    float4 _CrushBeautyMouth;
    float _CrushBeautyIntensity;  // 0..1
    float _CrushBeautyMode;       // 1 glow, 2 blush

    float EllipseMask(float2 uv, float4 region, float feather)
    {
        float2 p = (uv - region.xy) / max(region.zw, float2(.001, .001));
        float d = length(p);
        return 1.0 - smoothstep(1.0 - feather, 1.0, d);
    }

    float3 SampleRgb(float2 uv)
    {
        return SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, saturate(uv)).rgb;
    }

    float4 BeautyFragment(Varyings input) : SV_Target
    {
        UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
        float2 uv = input.texcoord;
        float4 original = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv);
        float amount = saturate(_CrushBeautyIntensity);
        if (amount <= .0001 || _CrushBeautyMode < .5)
            return original;

        // Feathered face ellipse. Avoid smoothing eyes and lips. These are
        // normalized face-landmark regions, not segmentation: hair/background
        // exclusion is only approximate until a real mask is wired in.
        float faceMask = EllipseMask(uv, _CrushBeautyFace, .20);
        float eyeMask = max(
            EllipseMask(uv, _CrushBeautyEyeL, .28),
            EllipseMask(uv, _CrushBeautyEyeR, .28));
        float mouthMask = EllipseMask(uv, _CrushBeautyMouth, .23);
        float skinMask = faceMask * (1.0 - saturate(eyeMask + mouthMask));

        float2 texel = _BlitTexture_TexelSize.xy;
        // Five-tap shallow blur with luminance edge rejection. Intensity
        // stays moderate to preserve texture and reduce halo artifacts.
        float3 a = SampleRgb(uv + texel * float2( 2.0,  0.0));
        float3 b = SampleRgb(uv + texel * float2(-2.0,  0.0));
        float3 c = SampleRgb(uv + texel * float2( 0.0,  2.0));
        float3 d = SampleRgb(uv + texel * float2( 0.0, -2.0));
        float3 mean = (original.rgb * 2.0 + a + b + c + d) / 6.0;
        float lumaDiff = abs(dot(mean - original.rgb, float3(.2126,.7152,.0722)));
        float edgeWeight = 1.0 - smoothstep(.055, .17, lumaDiff);
        float smoothStrength = _CrushBeautyMode < 1.5 ? .40 : .17;
        float3 color = lerp(original.rgb, mean,
            skinMask * amount * smoothStrength * edgeWeight);

        if (_CrushBeautyMode < 1.5)
        {
            // Subtle warm highlights. No third-party LUT/beauty SDK required.
            float3 warmed = saturate(color * float3(1.025, 1.015, 1.008));
            color = lerp(color, warmed, skinMask * amount * .45);
        }
        else
        {
            // Blush is limited to cheek ellipses below the eyes.
            float2 leftCheek = _CrushBeautyEyeL.xy +
                float2(-_CrushBeautyFace.z * .10, -_CrushBeautyFace.w * .32);
            float2 rightCheek = _CrushBeautyEyeR.xy +
                float2(_CrushBeautyFace.z * .10, -_CrushBeautyFace.w * .32);
            float2 cheekRadius = _CrushBeautyFace.zw * float2(.31, .24);
            float leftBlush = EllipseMask(uv,
                float4(leftCheek.x, leftCheek.y, cheekRadius.x, cheekRadius.y), .75);
            float rightBlush = EllipseMask(uv,
                float4(rightCheek.x, rightCheek.y, cheekRadius.x, cheekRadius.y), .75);
            float blush = max(leftBlush, rightBlush) * skinMask * amount * .21;
            color = lerp(color, saturate(color * float3(1.12, .86, .88)), blush);
        }
        return float4(saturate(color), original.a);
    }

    float4 CopyFragment(Varyings input) : SV_Target
    {
        UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
        return SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, input.texcoord);
    }
    ENDHLSL

    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        ZTest Always ZWrite Off Cull Off
        Pass
        {
            Name "BeautyComposite"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment BeautyFragment
            ENDHLSL
        }
        Pass
        {
            Name "Copy"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment CopyFragment
            ENDHLSL
        }
    }
    Fallback Off
}
