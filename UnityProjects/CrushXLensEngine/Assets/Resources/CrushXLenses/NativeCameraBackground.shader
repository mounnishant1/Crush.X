Shader "CrushX/NativeCameraBackground"
{
    Properties { _MainTex ("Camera", 2D) = "black" {} }
    SubShader
    {
        Tags { "Queue"="Background" }
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float4 _UvRow0, _UvRow1;
            fixed4 frag(v2f_img input) : SV_Target
            {
                float3 uv = float3(input.uv, 1);
                return tex2D(_MainTex, float2(dot(_UvRow0.xyz, uv), dot(_UvRow1.xyz, uv)));
            }
            ENDCG
        }
    }
    Fallback Off
}
