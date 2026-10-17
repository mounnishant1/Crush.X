using System;
using System.Linq;
using System.Text;
using NUnit.Framework;

namespace CrushX.LensEngine.Tests
{
    public sealed class ARDiagnosticLogProtocolTests
    {
        [Test]
        public void LongUnicodeAndMultilinePayload_RoundTripsWithinAndroidLineBudget()
        {
            string payload = "{\n\"renderer\":\"" + string.Concat(Enumerable.Repeat("面罩🦊 material=毛皮\\shader\n", 300)) + "\"\n}";
            string[] lines = ARDiagnosticLogProtocol.Packets(new string('a', 64), new string('b', 32), payload).ToArray();
            Assert.Greater(lines.Length, 1);
            foreach (string line in lines)
            {
                Assert.LessOrEqual(Encoding.UTF8.GetByteCount(line), 800);
                Assert.False(line.Contains("\n"));
                Assert.False(line.Contains("\r"));
            }
            string encoded = string.Concat(lines.Select(line => line.Substring(line.IndexOf(" data=", StringComparison.Ordinal) + 6)));
            Assert.AreEqual(payload, Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
            Assert.That(lines[0], Does.Contain("part=1/" + lines.Length));
            Assert.That(lines[0], Does.Contain("bytes=" + Encoding.UTF8.GetByteCount(payload)));
        }

        [Test]
        public void EmptyPayload_StillHasOneCompletePacket()
        {
            string[] lines = ARDiagnosticLogProtocol.Packets("session-1", "build", string.Empty).ToArray();
            Assert.AreEqual(1, lines.Length);
            Assert.That(lines[0], Does.EndWith("part=1/1 bytes=0 data="));
        }

        [Test]
        public void InvalidHeaderTokensAndOversizedOrMultilineCore_AreRejected()
        {
            Assert.Throws<ArgumentException>(() => ARDiagnosticLogProtocol.Packets("bad\nrecord", "build", "{}").ToArray());
            Assert.Throws<ArgumentException>(() => ARDiagnosticLogProtocol.Packets("record", new string('a', 33), "{}").ToArray());
            Assert.Throws<ArgumentException>(() => ARDiagnosticLogProtocol.Core("record", "{\n}"));
            Assert.Throws<ArgumentException>(() => ARDiagnosticLogProtocol.Core("record", new string('a', 800)));
        }

        [Test]
        public void ReadableSummary_BoundsUntrustedLensNamesWithoutChangingFullPayload()
        {
            string value = "面罩🦊\"\\\n" + new string('x', 500);
            string summary = ARDiagnosticLogProtocol.SummaryValue(value);
            Assert.LessOrEqual(summary.Length, 51);
            Assert.True(summary.All(character => character >= ' ' && character <= '~' && character != '\\' && character != '"'));
            Assert.That(summary, Does.EndWith("..."));
            string core = ARDiagnosticLogProtocol.Core("record", "{\"selectedLens\":\"" + summary + "\"}");
            Assert.LessOrEqual(Encoding.UTF8.GetByteCount(core), 800);
        }
    }
}
