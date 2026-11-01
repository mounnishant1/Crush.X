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
        public string CompletedUtc;
        public string Orientation;
        public string Mirroring = "MatchesRenderedPreview; device verification required";
        public bool MirroredRelativeToPreview;
        public double FirstFrameOffsetSeconds;
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
            try
            {
                string root = System.IO.Path.GetFullPath(directory).TrimEnd(System.IO.Path.DirectorySeparatorChar)
                    + System.IO.Path.DirectorySeparatorChar;
                return System.IO.Path.IsPathRooted(path) && System.IO.Path.GetFullPath(path).StartsWith(root, StringComparison.Ordinal);
            }
            catch (Exception error) when (error is ArgumentException || error is NotSupportedException || error is System.Security.SecurityException || error is IOException)
            { return false; }
        }

        public static bool IsPng(string path, int expectedWidth, int expectedHeight)
        {
            if (expectedWidth < 1 || expectedHeight < 1 || !File.Exists(path) || new FileInfo(path).Length < 45) return false;
            using (var stream = File.OpenRead(path))
            {
                var header = new byte[33];
                if (stream.Read(header, 0, header.Length) != header.Length) return false;
                byte[] signature = { 137, 80, 78, 71, 13, 10, 26, 10 };
                for (int i = 0; i < signature.Length; i++) if (header[i] != signature[i]) return false;
                if (ReadBigEndian(header, 8) != 13 || header[12] != 'I' || header[13] != 'H' || header[14] != 'D' || header[15] != 'R') return false;
                if (ReadBigEndian(header, 16) != expectedWidth || ReadBigEndian(header, 20) != expectedHeight) return false;
                // Verify chunk boundaries and a complete terminal IEND. This is a structural
                // check; actual image decoding is performed by Unity's preview decoder.
                bool imageData = false;
                var chunk = new byte[8];
                int count = 0;
                while (stream.Position < stream.Length && ++count <= 4096)
                {
                    if (stream.Read(chunk, 0, 8) != 8) return false;
                    uint length = unchecked((uint)ReadBigEndian(chunk, 0));
                    if (length > int.MaxValue || length + 4L > stream.Length - stream.Position) return false;
                    bool end = chunk[4] == 'I' && chunk[5] == 'E' && chunk[6] == 'N' && chunk[7] == 'D';
                    if (chunk[4] == 'I' && chunk[5] == 'D' && chunk[6] == 'A' && chunk[7] == 'T' && length > 0) imageData = true;
                    stream.Seek(length + 4L, SeekOrigin.Current);
                    if (end) return length == 0 && imageData && stream.Position == stream.Length;
                }
                return false;
            }
        }

        public static bool IsMp4(string path)
        {
            if (!File.Exists(path)) return false;
            using (var stream = File.OpenRead(path))
            {
                if (stream.Length < 128 || stream.Length > 128L * 1024L * 1024L) return false;
                bool fileType = false, movie = false, media = false;
                var header = new byte[16];
                int count = 0;
                while (stream.Position < stream.Length && ++count <= 4096)
                {
                    long start = stream.Position;
                    if (stream.Read(header, 0, 8) != 8) return false;
                    ulong size = unchecked((uint)ReadBigEndian(header, 0));
                    int headerSize = 8;
                    if (size == 1)
                    {
                        if (stream.Read(header, 8, 8) != 8) return false;
                        size = ((ulong)unchecked((uint)ReadBigEndian(header, 8)) << 32) | unchecked((uint)ReadBigEndian(header, 12));
                        headerSize = 16;
                    }
                    else if (size == 0) size = (ulong)(stream.Length - start);
                    if (size < (ulong)headerSize || size > (ulong)(stream.Length - start)) return false;
                    bool type = header[4] == 'f' && header[5] == 't' && header[6] == 'y' && header[7] == 'p';
                    if (start == 0 && (!type || size < 16)) return false;
                    fileType |= type;
                    movie |= header[4] == 'm' && header[5] == 'o' && header[6] == 'o' && header[7] == 'v' && size > (ulong)headerSize;
                    media |= header[4] == 'm' && header[5] == 'd' && header[6] == 'a' && header[7] == 't' && size > (ulong)headerSize;
                    stream.Position = start + (long)size;
                }
                return fileType && movie && media && stream.Position == stream.Length;
            }
        }

        private static int ReadBigEndian(byte[] data, int offset) =>
            (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    }
}
