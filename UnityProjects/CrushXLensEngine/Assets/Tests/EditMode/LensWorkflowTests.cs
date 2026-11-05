using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class LensWorkflowTests
    {
        [TestCase("Apply Fox Mask 3D", "select", "fox-mask-3d")]
        [TestCase("Find my most-used effects.", "mostUsed", null)]
        [TestCase("Choose a good lens for this selfie.", "recommend", null)]
        public void SupportedPhrases_MapToExistingExplicitCommands(string text, string action, string lensId)
        {
            Assert.IsTrue(LensNaturalLanguage.TryParse(text, out LensCommand command, out _));
            Assert.AreEqual(action, command.action);
            Assert.AreEqual(lensId, command.lensId);
        }

        [Test]
        public void ReelRequest_PreparesDraftWithoutPublishing()
        {
            Assert.IsTrue(LensNaturalLanguage.TryParse("Create a reel draft with this effect.", out LensCommand command, out _));
            Assert.AreEqual("prepareDraft", command.action);
            Assert.AreEqual("Reel", command.destination);
        }

        [TestCase("Show trending animal lenses.")]
        [TestCase("Publish this photo")]
        [TestCase("Send this to my friends")]
        [TestCase("unrecognized instruction")]
        public void MissingSourcesAndPublishingRequests_AreRejected(string text)
        {
            Assert.IsFalse(LensNaturalLanguage.TryParse(text, out LensCommand command, out string error));
            Assert.IsNull(command);
            Assert.IsNotEmpty(error);
        }
    }
}
