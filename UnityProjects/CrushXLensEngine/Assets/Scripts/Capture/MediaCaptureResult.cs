using System;
using System.IO;

namespace CrushX.LensEngine
{
    public enum MediaCaptureState { Idle, Preparing, CapturingPhoto, Recording, Finalizing, Preview, Error }

    [Serializable]
    public sealed class MediaCaptureResult
    {
        public string CaptureId;
        public string MediaKind;
        public string MimeType;
        public string Path;
        public string LensId;
        public string CreatedUtc;
        public string Orientation;
        public string Mirroring = "MatchesRenderedPreview; device verification required";
        public int Width;
        public int Height;
        public double DurationSeconds;
        public bool HasAudio;
        public long SizeBytes;
    }

    /// <summary>File checks, not a claim of codec playback or correct visual alignment.</summary>
    public static class CaptureFileValidation
    {
        public static bool IsControlledPath(string path, string directory)
        {
            if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(directory)) return false;
            string root = System.IO.Path.GetFullPath(directory).TrimEnd(System.IO.Path.DirectorySeparatorChar)
                + System.IO.Path.DirectorySeparatorChar;
            return System.IO.Path.GetFullPath(path).StartsWith(root, StringComparison.Ordinal);
        }

        public static bool IsPng(string path, int expectedWidth, int expectedHeight)
        {
            if (!File.Exists(path) || new FileInfo(path).Length < 33) return false;
            using (var stream = File.OpenRead(path))
            {
                var header = new byte[24];
                if (stream.Read(header, 0, header.Length) != header.Length) return false;
                byte[] signature = { 137, 80, 78, 71, 13, 10, 26, 10 };
                for (int i = 0; i < signature.Length; i++) if (header[i] != signature[i]) return false;
                if (header[12] != 'I' || header[13] != 'H' || header[14] != 'D' || header[15] != 'R') return false;
                return ReadBigEndian(header, 16) == expectedWidth && ReadBigEndian(header, 20) == expectedHeight;
            }
        }

        private static int ReadBigEndian(byte[] data, int offset) =>
            (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    }
}
