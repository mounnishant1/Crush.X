using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CrushX.LensEngine
{
    // Pure transport formatting: Android Unity messages have been observed cut at 1,023 bytes.
    // Base64 keeps packets ASCII and preserves multiline JSON and split UTF-8 characters exactly.
    public static class ARDiagnosticLogProtocol
    {
        public const int MaximumLineBytes = 800;
        private const int DataCharacters = 600; // multiple of four; bounded even with the longest header
        private const string Prefix = "[CrushX AR] ";

        public static IEnumerable<string> Packets(string recordId, string kind, string payload)
        {
            ValidateToken(recordId, 64, nameof(recordId));
            ValidateToken(kind, 32, nameof(kind));
            byte[] bytes = Encoding.UTF8.GetBytes(payload ?? string.Empty);
            string encoded = Convert.ToBase64String(bytes);
            int count = Math.Max(1, (encoded.Length + DataCharacters - 1) / DataCharacters);
            for (int index = 0; index < count; index++)
            {
                int offset = index * DataCharacters;
                string data = encoded.Substring(offset, Math.Min(DataCharacters, encoded.Length - offset));
                string line = Prefix + "packet v=1 record=" + recordId + " kind=" + kind +
                    " part=" + (index + 1).ToString(CultureInfo.InvariantCulture) + "/" + count.ToString(CultureInfo.InvariantCulture) +
                    " bytes=" + bytes.Length.ToString(CultureInfo.InvariantCulture) + " data=" + data;
                if (Encoding.UTF8.GetByteCount(line) > MaximumLineBytes)
                    throw new InvalidOperationException("Diagnostic packet exceeds transport limit");
                yield return line;
            }
        }

        public static string Core(string recordId, string json)
        {
            ValidateToken(recordId, 64, nameof(recordId));
            string line = Prefix + "core record=" + recordId + " data=" + json;
            if (json == null || json.IndexOfAny(new[] { '\r', '\n' }) >= 0 || Encoding.UTF8.GetByteCount(line) > MaximumLineBytes)
                throw new ArgumentException("Core diagnostic must be one bounded JSON line", nameof(json));
            return line;
        }

        // Only the readable summary is shortened. The packet payload always retains the full value.
        public static string SummaryValue(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            var result = new StringBuilder();
            int bytes = 0;
            foreach (char character in value)
            {
                // ASCII also bounds JSON escaping (quotes, backslashes and controls cost up to six bytes).
                string next = character >= ' ' && character <= '~' && character != '"' && character != '\\' ? character.ToString() : "?";
                if (bytes + next.Length > 48) { result.Append("..."); break; }
                result.Append(next);
                bytes += next.Length;
            }
            return result.ToString();
        }

        private static void ValidateToken(string value, int maximumLength, string name)
        {
            if (string.IsNullOrEmpty(value) || value.Length > maximumLength)
                throw new ArgumentException("Invalid diagnostic token", name);
            foreach (char character in value)
                if (!((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') ||
                    (character >= '0' && character <= '9') || character == '-' || character == '_'))
                    throw new ArgumentException("Invalid diagnostic token", name);
        }
    }
}
