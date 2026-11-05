using NUnit.Framework;
using UnityEngine;

namespace CrushX.LensEngine.Tests
{
    public sealed class CompatibleLensMaterialsTests
    {
        [Test]
        public void PipelineConversion_PreservesTextureTintAndSharesCopiesUntilDisposal()
        {
            Shader sourceShader = Shader.Find("Universal Render Pipeline/Lit");
            Shader targetShader = Shader.Find("Standard");
            Assert.IsNotNull(sourceShader, "URP package shader must import");
            Assert.IsNotNull(targetShader, "Built-in fallback shader must exist");
            var source = new Material(sourceShader);
            var texture = new Texture2D(2, 2);
            var color = new Color(.2f, .4f, .6f, 1);
            source.SetTexture("_BaseMap", texture);
            source.SetColor("_BaseColor", color);
            int destroyed = 0;
            var cache = new CompatibleLensMaterials(material => { destroyed++; Object.DestroyImmediate(material); });
            try
            {
                Material converted = cache.Get(source, targetShader);
                Assert.AreNotSame(source, converted);
                Assert.AreSame(texture, converted.mainTexture);
                Assert.AreEqual(color, converted.color);
                Assert.AreSame(converted, cache.Get(source, targetShader));
                Assert.AreEqual(1, cache.Count);
                Assert.AreSame(source, cache.Get(source, sourceShader));
                cache.Dispose();
                Assert.AreEqual(1, destroyed);
                Assert.AreEqual(0, cache.Count);
                Assert.IsTrue(source != null, "Caller owns the imported source material");
                Assert.IsTrue(texture != null, "Caller owns the shared texture");
                cache.Dispose();
                Assert.AreEqual(1, destroyed);
            }
            finally
            {
                cache.Dispose();
                Object.DestroyImmediate(source);
                Object.DestroyImmediate(texture);
            }
        }
    }
}
