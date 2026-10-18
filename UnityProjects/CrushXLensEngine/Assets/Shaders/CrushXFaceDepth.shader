Shader "CrushX/ARFaceDepthOnly"
{
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Geometry-5" "RenderType"="Opaque" }
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="SRPDefaultUnlit" }
            // The provider's face mesh winding can differ between front camera backends.
            // Depth-only occlusion must survive either winding when the head turns.
            Cull Off
            ZWrite On
            ZTest LEqual
            ColorMask 0
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes i) { Varyings o; o.positionCS = TransformObjectToHClip(i.positionOS.xyz); return o; }
            half4 frag(Varyings i) : SV_Target { return half4(0,0,0,0); }
            ENDHLSL
        }
    }
    // Built-in rendering fallback. The Unity project also supports the URP renderer.
    SubShader
    {
        Tags { "Queue"="Geometry-5" "RenderType"="Opaque" }
        Pass
        {
            Cull Off
            ZWrite On
            ZTest LEqual
            ColorMask 0
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 vertex : SV_POSITION; };
            v2f vert(appdata v) { v2f o; o.vertex=UnityObjectToClipPos(v.vertex); return o; }
            fixed4 frag(v2f i) : SV_Target { return fixed4(0,0,0,0); }
            ENDCG
        }
    }
}
