Shader "CrushX/CameraColorGrade"
{
    Properties
    {
        _MainTex ("Camera image", 2D) = "white" {}
        _Mode ("Grade mode", Float) = 0
        _Warmth ("Warmth", Range(0, 1)) = 0
        _Contrast ("Contrast", Range(0, 2)) = 1
        _Saturation ("Saturation", Range(0, 2)) = 1
        _Vignette ("Vignette", Range(0, 1)) = 0
        _ShadowColor ("Duotone shadows", Color) = (0.015, 0.11, 0.34, 1)
        _HighlightColor ("Duotone highlights", Color) = (1, 0.12, 0.66, 1)
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma target 2.0
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            half _Mode, _Warmth, _Contrast, _Saturation, _Vignette;
            half4 _ShadowColor, _HighlightColor;

            half4 frag(v2f_img input) : SV_Target
            {
                half4 source = tex2D(_MainTex, input.uv);
                half3 color = source.rgb;
                // Grade in a perceptual space consistently in Gamma and Linear projects.
                #ifndef UNITY_COLORSPACE_GAMMA
                    color = LinearToGammaSpace(color);
                #endif
                half luminance = dot(color, half3(.2126h, .7152h, .0722h));
                if (_Mode < .5h)
                {
                    color *= half3(1 + .18h * _Warmth, 1 + .025h * _Warmth, 1 - .16h * _Warmth);
                    luminance = dot(color, half3(.2126h, .7152h, .0722h));
                    color = lerp(luminance.xxx, color, _Saturation);
                    color = (color - .5h) * _Contrast + .5h;
                }
                else if (_Mode < 1.5h)
                {
                    half monochrome = saturate((luminance - .5h) * _Contrast + .5h);
                    color = monochrome.xxx;
                }
                else
                {
                    half tone = saturate((luminance - .5h) * _Contrast + .5h);
                    color = lerp(_ShadowColor.rgb, _HighlightColor.rgb, smoothstep(.05h, .95h, tone));
                }
                float2 centered = input.uv - .5;
                centered.x *= abs(_MainTex_TexelSize.z / max(_MainTex_TexelSize.w, 1.0));
                half vignette = 1 - _Vignette * smoothstep(.10, .65, dot(centered, centered));
                color = saturate(color * vignette);
                #ifndef UNITY_COLORSPACE_GAMMA
                    color = GammaToLinearSpace(color);
                #endif
                return half4(color, source.a);
            }
            ENDCG
        }
    }
    Fallback Off
}
