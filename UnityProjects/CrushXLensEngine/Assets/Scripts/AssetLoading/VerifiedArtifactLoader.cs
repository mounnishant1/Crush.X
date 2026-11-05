using System;
using System.IO;
using System.Security.Cryptography;

namespace CrushX.LensEngine.AssetLoading
{
    public enum ModelLoadStatus { Unavailable, InvalidManifest, Unapproved, IncompatibleRuntime, MissingFile, RejectedFile, Verified }

    /// <summary>Verified model byte lifetime. The runtime must stop before the owner disposes this lease.</summary>
    public sealed class VerifiedModelArtifact : IDisposable
    {
        private byte[] bytes;
        private readonly LocalModelManifest manifest;
        internal VerifiedModelArtifact(LocalModelManifest metadata, byte[] verifiedBytes)
        { manifest = metadata.Copy(); bytes = verifiedBytes; }
        public LocalModelManifest Manifest => manifest.Copy();
        public ReadOnlyMemory<byte> Bytes => bytes != null ? new ReadOnlyMemory<byte>(bytes) : throw new ObjectDisposedException(nameof(VerifiedModelArtifact));
        public void Dispose()
        {
            if (bytes == null) return;
            Array.Clear(bytes, 0, bytes.Length); bytes = null;
        }
    }

    public static class VerifiedArtifactLoader
    {
        public static string Sha256(byte[] bytes)
        {
            using (SHA256 digest = SHA256.Create()) return BitConverter.ToString(digest.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }

        public static bool TryLoad(string artifactRoot, LocalModelManifest source, IModelApprovalRegistry registry,
            ModelRuntimeRegistration runtime, out VerifiedModelArtifact artifact, out ModelLoadStatus status, out string error)
        {
            artifact = null; status = ModelLoadStatus.InvalidManifest;
            LocalModelManifest model = source?.Copy();
            if (!ArtifactPolicy.Validate(model, out error)) return false;
            ModelApproval approval = null;
            status = ModelLoadStatus.Unapproved;
            bool approved;
            try { approved = registry != null && registry.TryGet(model.Id, model.Version, out approval); }
            catch (Exception) { error = "The independent model approval registry failed"; return false; }
            if (!approved || approval == null ||
                approval.Id != model.Id || approval.Version != model.Version || approval.FileBytes != model.FileBytes || approval.Purpose != model.Purpose ||
                !string.Equals(approval.Sha256, model.Sha256, StringComparison.OrdinalIgnoreCase) || approval.LicenseId != model.LicenseId ||
                !ArtifactPolicy.ValidText(approval.ReviewReceipt, 500))
            { error = "This exact model hash, purpose and licence have no independent host approval"; return false; }
            status = ModelLoadStatus.IncompatibleRuntime;
            if (runtime == null || !runtime.Accepts(model)) { error = "No installed runtime matches the model format, version and input/output contract"; return false; }
            byte[] bytes = null;
            try
            {
                if (string.IsNullOrEmpty(artifactRoot) || !Path.IsPathRooted(artifactRoot)) throw new InvalidDataException();
                string root = Path.GetFullPath(artifactRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                string file = Path.GetFullPath(Path.Combine(root, model.RelativePath.Replace('/', Path.DirectorySeparatorChar)));
                if (!file.StartsWith(root, StringComparison.Ordinal)) throw new InvalidDataException();
                RejectLinks(root.TrimEnd(Path.DirectorySeparatorChar)); RejectLinks(file);
                if (!File.Exists(file)) { status = ModelLoadStatus.MissingFile; error = "The reviewed model file is not installed"; return false; }
                FileInfo before = new FileInfo(file);
                long beforeLength = before.Length; DateTime beforeWrite = before.LastWriteTimeUtc;
                if (beforeLength != approval.FileBytes) throw new InvalidDataException();
                using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (stream.Length != approval.FileBytes) throw new InvalidDataException();
                    bytes = new byte[(int)stream.Length];
                    int offset = 0;
                    while (offset < bytes.Length)
                    {
                        int count = stream.Read(bytes, offset, bytes.Length - offset);
                        if (count == 0) throw new EndOfStreamException();
                        offset += count;
                    }
                    if (stream.ReadByte() != -1) throw new InvalidDataException();
                }
                RejectLinks(file);
                FileInfo after = new FileInfo(file);
                if (after.Length != beforeLength || after.LastWriteTimeUtc != beforeWrite ||
                    !string.Equals(Sha256(bytes), approval.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
                // TFLite has a fixed FlatBuffer identifier. Other graph/container parsing belongs
                // to the exact installed runtime; a checksum/extension does not prove model validity.
                if (model.Format == ModelFileFormat.TensorFlowLite && (bytes[4] != 'T' || bytes[5] != 'F' || bytes[6] != 'L' || bytes[7] != '3'))
                    throw new InvalidDataException();
                artifact = new VerifiedModelArtifact(model, bytes); bytes = null;
                status = ModelLoadStatus.Verified; error = ""; return true;
            }
            catch (Exception exception) when (exception is InvalidDataException || exception is IOException || exception is ArgumentException || exception is UnauthorizedAccessException || exception is NotSupportedException || exception is System.Security.SecurityException)
            { status = ModelLoadStatus.RejectedFile; error = "Model file failed bounded local path, content or hash validation"; return false; }
            finally { if (bytes != null) Array.Clear(bytes, 0, bytes.Length); }
        }

        private static void RejectLinks(string path)
        {
            for (string current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
                if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException();
        }
    }
}
