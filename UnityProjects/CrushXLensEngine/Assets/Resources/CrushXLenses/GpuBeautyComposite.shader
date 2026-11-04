Shader "CrushX/GpuBeautyComposite"
{
    Properties { _MainTex ("Rendered camera", 2D) = "white" {} }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            sampler2D _MainTex, _SkinMask, _EyeMask, _LipMask, _CheekMask, _HairMask, _PersonMask, _BackgroundTex;
            float4 _MainTex_TexelSize;
            float4 _SkinParams, _DetailParams, _BackgroundParams, _ChromaParams;
            float4 _GradeParams;
            float4 _SkinTone, _LipColor, _BlushColor, _HairColor, _BackgroundColor, _ChromaColor;
            float _TapCount;

            float luminance(float3 rgb) { return dot(rgb, float3(.2126, .7152, .0722)); }

            void bilateralTap(float2 uv, float2 offset, float3 center, float spatial,
                inout float3 sum, inout float total)
            {
                float3 sampleColor = tex2D(_MainTex, uv + offset).rgb;
                float3 difference = sampleColor - center;
                // Range weights retain contrast/detail rather than averaging across strong edges.
                float weight = spatial * exp2(-dot(difference, difference) * 100.0);
                sum += sampleColor * weight;
                total += weight;
            }

            float3 smoothSkin(float2 uv, float3 center)
            {
                float2 d = abs(_MainTex_TexelSize.xy) * 1.5;
                float3 sum = center;
                float total = 1;
                bilateralTap(uv, float2(d.x, 0), center, .8, sum, total);
                bilateralTap(uv, float2(-d.x, 0), center, .8, sum, total);
                bilateralTap(uv, float2(0, d.y), center, .8, sum, total);
                bilateralTap(uv, float2(0, -d.y), center, .8, sum, total);
                if (_TapCount >= 9)
                {
                    bilateralTap(uv, d, center, .55, sum, total);
                    bilateralTap(uv, -d, center, .55, sum, total);
                    bilateralTap(uv, float2(d.x, -d.y), center, .55, sum, total);
                    bilateralTap(uv, float2(-d.x, d.y), center, .55, sum, total);
                }
                if (_TapCount >= 13)
                {
                    bilateralTap(uv, float2(d.x * 2, 0), center, .3, sum, total);
                    bilateralTap(uv, float2(-d.x * 2, 0), center, .3, sum, total);
                    bilateralTap(uv, float2(0, d.y * 2), center, .3, sum, total);
                    bilateralTap(uv, float2(0, -d.y * 2), center, .3, sum, total);
                }
                return sum / max(total, .001);
            }

            float3 blurBackground(float2 uv, float3 center)
            {
                float2 d = abs(_MainTex_TexelSize.xy) * _DetailParams.z;
                float3 sum = center * 4;
                sum += tex2D(_MainTex, uv + float2(d.x, 0)).rgb * 2;
                sum += tex2D(_MainTex, uv - float2(d.x, 0)).rgb * 2;
                sum += tex2D(_MainTex, uv + float2(0, d.y)).rgb * 2;
                sum += tex2D(_MainTex, uv - float2(0, d.y)).rgb * 2;
                sum += tex2D(_MainTex, uv + d).rgb;
                sum += tex2D(_MainTex, uv - d).rgb;
                sum += tex2D(_MainTex, uv + float2(d.x, -d.y)).rgb;
                sum += tex2D(_MainTex, uv + float2(-d.x, d.y)).rgb;
                return sum / 16;
            }

            float3 detailTint(float3 original, float3 tint)
            {
                return tint * (.2 + luminance(original) * 1.1);
            }

            half4 frag(v2f_img input) : SV_Target
            {
                float2 uv = input.uv;
                float4 source = tex2D(_MainTex, uv);
                float eye = saturate(tex2D(_EyeMask, uv).r);
                float lip = saturate(tex2D(_LipMask, uv).r);
                float skin = saturate(tex2D(_SkinMask, uv).r) * (1 - max(eye, lip));
                float3 color = source.rgb;
                if (_SkinParams.x > 0 && skin > .001)
                    color = lerp(color, smoothSkin(uv, source.rgb), skin * _SkinParams.x);
                // Tone changes are intentionally bounded; texture detail remains in the original luminance.
                color = lerp(color, color * lerp(float3(1, 1, 1), _SkinTone.rgb * 2, .2), skin * _SkinParams.y);
                if (_SkinParams.z > 0 && eye > .001)
                {
                    float2 d = abs(_MainTex_TexelSize.xy);
                    float3 average = (tex2D(_MainTex, uv + float2(d.x, 0)).rgb + tex2D(_MainTex, uv - float2(d.x, 0)).rgb +
                        tex2D(_MainTex, uv + float2(0, d.y)).rgb + tex2D(_MainTex, uv - float2(0, d.y)).rgb) * .25;
                    color += (source.rgb - average) * eye * _SkinParams.z;
                }
                color = lerp(color, detailTint(source.rgb, _LipColor.rgb), lip * _SkinParams.w);
                color = lerp(color, detailTint(source.rgb, _BlushColor.rgb), saturate(tex2D(_CheekMask, uv).r) * _DetailParams.x);
                color = lerp(color, detailTint(source.rgb, _HairColor.rgb), saturate(tex2D(_HairMask, uv).r) * _DetailParams.y);
                float3 backdrop = lerp(_BackgroundColor.rgb, tex2D(_BackgroundTex, uv).rgb, _BackgroundParams.w);
                if (_BackgroundParams.z > 0 && _BackgroundParams.x + _BackgroundParams.y > 0)
                {
                    float person = saturate(tex2D(_PersonMask, uv).r);
                    float3 background = source.rgb;
                    if (_BackgroundParams.x > 0) background = lerp(background, blurBackground(uv, source.rgb), _BackgroundParams.x);
                    background = lerp(background, backdrop, _BackgroundParams.y);
                    color = lerp(background, color, person);
                }
                if (_ChromaParams.x > 0)
                {
                    float distanceFromKey = length(source.rgb - _ChromaColor.rgb);
                    float foreground = smoothstep(_ChromaParams.y, _ChromaParams.y + _ChromaParams.z, distanceFromKey);
                    color = lerp(color, lerp(backdrop, color, foreground), _ChromaParams.x);
                }
                if (_GradeParams.y > 0)
                {
                    float light = luminance(color);
                    float3 graded = color;
                    float vignette = 0;
                    if (_GradeParams.x < 1.5)
                    {
                        graded = (lerp(light.xxx, color, .88) - .5) * 1.12 + .5;
                        graded *= float3(1.08, 1.015, .91);
                        vignette = .1;
                    }
                    else if (_GradeParams.x < 2.5)
                    {
                        float film = (light - .5) * 1.3 + .5;
                        graded = float3(film, film, film);
                        vignette = .42;
                    }
                    else
                    {
                        graded = lerp(float3(.015, .11, .34), float3(1, .12, .66), smoothstep(.05, .95, light));
                        vignette = .18;
                    }
                    float2 distanceFromCenter = uv - .5;
                    graded *= 1 - saturate(dot(distanceFromCenter, distanceFromCenter) * 2) * vignette;
                    color = lerp(color, graded, _GradeParams.y);
                }
                return half4(max(color, 0), source.a);
            }
            ENDCG
        }
    }
    Fallback Off
}
