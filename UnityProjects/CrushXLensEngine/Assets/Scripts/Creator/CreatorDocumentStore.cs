using System;
using System.IO;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace CrushX.LensEngine.Creator
{
    public static class CreatorDocumentStore
    {
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        public static bool IsSha256(string value)
        {
            if (value == null || value.Length != 64) return false;
            foreach (char c in value) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
            return true;
        }

        public static string Sha256(byte[] bytes)
        {
            using (SHA256 sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }

        /// <summary>Check bytes before decoding. expectedSha256 must come from the caller's reviewed trust record.</summary>
        public static bool TryLoadReviewed(string path, string expectedSha256, Func<string, CreatorLensDocument> decode,
            Func<string, bool> installedLens, Func<string, bool> installedAsset, out CreatorLensDocument document, out string error)
        {
            document = null;
            error = "A reviewed SHA-256 is required before loading a local package";
            if (!IsSha256(expectedSha256) || decode == null) return false;
            try
            {
                string full = Path.GetFullPath(path);
                RejectLinks(full);
                byte[] bytes;
                using (var input = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (input.Length < 2 || input.Length > CreatorLensValidation.MaximumDocumentBytes) throw new InvalidDataException("Lens package exceeds its size limit");
                    bytes = new byte[(int)input.Length];
                    int offset = 0;
                    while (offset < bytes.Length)
                    {
                        int count = input.Read(bytes, offset, bytes.Length - offset);
                        if (count == 0) throw new EndOfStreamException();
                        offset += count;
                    }
                    if (input.ReadByte() != -1) throw new InvalidDataException("Lens package changed during loading");
                }
                if (!string.Equals(Sha256(bytes), expectedSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Lens package SHA-256 does not match the reviewed file");
                CreatorLensDocument candidate = decode(Utf8.GetString(bytes));
                CreatorValidationResult validation = CreatorLensValidation.Validate(candidate, installedLens, installedAsset);
                if (!validation.IsValid) throw new InvalidDataException(string.Join("; ", validation.Errors));
                document = candidate; error = ""; return true;
            }
            catch (Exception exception) { error = "Lens package rejected: " + exception.Message; return false; }
        }

        /// <summary>Write a new immutable revision atomically; an existing revision is never overwritten.</summary>
        public static bool TrySaveRevision(string directory, CreatorLensDocument document, Func<CreatorLensDocument, string> encode,
            Func<string, bool> installedLens, Func<string, bool> installedAsset, out string path, out string sha256, out string error)
        {
            path = sha256 = "";
            string temporary = null;
            CreatorValidationResult validation = CreatorLensValidation.Validate(document, installedLens, installedAsset);
            error = string.Join("; ", validation.Errors);
            if (!validation.IsValid || encode == null) return false;
            try
            {
                string root = Path.GetFullPath(directory);
                RejectLinks(root);
                Directory.CreateDirectory(root);
                string target = Path.Combine(root, document.Id + ".r" + document.Revision.ToString(CultureInfo.InvariantCulture) + ".lens.json");
                if (File.Exists(target)) throw new IOException("This lens revision already exists; increment Revision before saving");
                byte[] bytes = Utf8.GetBytes(encode(document));
                if (bytes.Length < 2 || bytes.Length > CreatorLensValidation.MaximumDocumentBytes) throw new InvalidDataException("Lens package exceeds its size limit");
                string digest = Sha256(bytes);
                temporary = Path.Combine(root, ".creator-" + Guid.NewGuid().ToString("N") + ".tmp");
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { output.Write(bytes, 0, bytes.Length); output.Flush(); }
                File.Move(temporary, target);
                temporary = null;
                path = target; sha256 = digest; error = ""; return true;
            }
            catch (Exception exception) { error = "Unable to save lens revision: " + exception.Message; return false; }
            finally { if (temporary != null) { try { File.Delete(temporary); } catch { } } }
        }

        private static void RejectLinks(string path)
        {
            string current = path;
            while (!string.IsNullOrEmpty(current))
            {
                if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Symbolic links are not allowed for local lens packages");
                current = Path.GetDirectoryName(current);
            }
        }
    }
}
