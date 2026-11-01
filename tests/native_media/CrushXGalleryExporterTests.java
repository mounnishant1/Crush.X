package in.crushx.lens.capture;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** Host JVM checks for actual gallery path/header/copy helpers. MediaStore is NOT exercised. */
public final class CrushXGalleryExporterTests {
    private static int tests;
    interface Check { void run() throws Exception; }

    private static void expectFailure(Check check) throws Exception {
        try { check.run(); } catch (IllegalArgumentException | IOException expected) { tests++; return; }
        throw new AssertionError("Expected validation or bounded-copy failure");
    }

    private static byte[] png() {
        byte[] data = new byte[64];
        byte[] signature = {(byte)137,80,78,71,13,10,26,10};
        System.arraycopy(signature, 0, data, 0, signature.length);
        data[11] = 13; data[12] = 'I'; data[13] = 'H'; data[14] = 'D'; data[15] = 'R';
        data[19] = 2; data[23] = 4;
        return data;
    }

    private static File write(File directory, String name, byte[] data) throws Exception {
        directory.mkdirs();
        File file = new File(directory, name);
        Files.write(file.toPath(), data);
        return file;
    }

    private static void valid(File file, File root, String mime, File internal, File external) throws Exception {
        if (!file.getCanonicalFile().equals(CrushXGalleryExporter.validateSource(file.getAbsolutePath(), root.getAbsolutePath(), mime, internal, external)))
            throw new AssertionError("Wrong validated source");
        tests++;
    }

    public static void main(String[] args) throws Exception {
        Path temporary = Files.createTempDirectory("crushx-gallery-");
        try {
            File internal = temporary.resolve("internal/files").toFile();
            File external = temporary.resolve("external/files").toFile();
            File saved = new File(internal, "CrushXLensCaptures/saved");
            File externalSaved = new File(external, "CrushXLensCaptures/saved");
            File photo = write(saved, "photo.png", png());
            byte[] mp4 = new byte[128]; mp4[3] = 24; mp4[4] = 'f'; mp4[5] = 't'; mp4[6] = 'y'; mp4[7] = 'p';
            File video = write(saved, "clip.mp4", mp4);
            valid(photo, saved, "image/png", internal, external);
            valid(video, saved, "video/mp4", internal, external);
            valid(write(externalSaved, "external.png", png()), externalSaved, "image/png", internal, external);
            expectFailure(() -> CrushXGalleryExporter.validateSource(null, saved.getAbsolutePath(), "image/png", internal, external));
            expectFailure(() -> CrushXGalleryExporter.validateSource(photo.getAbsolutePath(), null, "image/png", internal, external));
            expectFailure(() -> CrushXGalleryExporter.validateSource("photo.png", saved.getAbsolutePath(), "image/png", internal, external));
            expectFailure(() -> CrushXGalleryExporter.validateSource(photo.getAbsolutePath(), saved.getAbsolutePath(), "application/octet-stream", internal, external));
            expectFailure(() -> CrushXGalleryExporter.validateSource(photo.getAbsolutePath(), saved.getAbsolutePath(), "video/mp4", internal, external));
            expectFailure(() -> CrushXGalleryExporter.validateSource(new File(saved, "missing.png").getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File outside = write(new File(internal, "other"), "outside.png", png());
            expectFailure(() -> CrushXGalleryExporter.validateSource(outside.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File nested = write(new File(saved, "nested"), "nested.png", png());
            expectFailure(() -> CrushXGalleryExporter.validateSource(nested.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File spoofRoot = new File(temporary.toFile(), "untrusted/CrushXLensCaptures/saved");
            File spoof = write(spoofRoot, "spoof.png", png());
            expectFailure(() -> CrushXGalleryExporter.validateSource(spoof.getAbsolutePath(), spoofRoot.getAbsolutePath(), "image/png", internal, external));
            File malformed = write(saved, "malformed.png", new byte[64]);
            expectFailure(() -> CrushXGalleryExporter.validateSource(malformed.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File tiny = write(saved, "tiny.mp4", new byte[8]);
            expectFailure(() -> CrushXGalleryExporter.validateSource(tiny.getAbsolutePath(), saved.getAbsolutePath(), "video/mp4", internal, external));
            byte[] hugeDimensions = png(); hugeDimensions[16] = 1;
            File bomb = write(saved, "huge.png", hugeDimensions);
            expectFailure(() -> CrushXGalleryExporter.validateSource(bomb.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File oversize = new File(saved, "oversize.png");
            try (RandomAccessFile large = new RandomAccessFile(oversize, "rw")) { large.setLength(CrushXGalleryExporter.MAX_BYTES + 1); }
            expectFailure(() -> CrushXGalleryExporter.validateSource(oversize.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File wrongMp4 = write(saved, "wrong.mp4", new byte[128]);
            expectFailure(() -> CrushXGalleryExporter.validateSource(wrongMp4.getAbsolutePath(), saved.getAbsolutePath(), "video/mp4", internal, external));
            // The host test filesystem supports symlinks. An indirect external file or saved root is rejected.
            File linked = new File(saved, "linked.png");
            Files.createSymbolicLink(linked.toPath(), outside.toPath());
            expectFailure(() -> CrushXGalleryExporter.validateSource(linked.getAbsolutePath(), saved.getAbsolutePath(), "image/png", internal, external));
            File linkedBase = temporary.resolve("linked-base").toFile(); linkedBase.mkdirs();
            File lensDirectory = new File(linkedBase, "CrushXLensCaptures"); lensDirectory.mkdirs();
            Files.createSymbolicLink(new File(lensDirectory, "saved").toPath(), saved.toPath());
            expectFailure(() -> CrushXGalleryExporter.validateSource(photo.getAbsolutePath(), new File(lensDirectory, "saved").getAbsolutePath(), "image/png", linkedBase, null));

            byte[] bytes = new byte[140000]; for (int index = 0; index < bytes.length; index++) bytes[index] = (byte) index;
            ByteArrayOutputStream copied = new ByteArrayOutputStream();
            long length = CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), copied, bytes.length, () -> false);
            if (length != bytes.length || !Arrays.equals(bytes, copied.toByteArray())) throw new AssertionError("Copy changed bytes"); tests++;
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), bytes.length - 1, () -> false));
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), bytes.length + 1, () -> false));
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), bytes.length, () -> true));
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), CrushXGalleryExporter.MAX_BYTES + 1, () -> false));
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), 0, () -> false));
            expectFailure(() -> CrushXGalleryExporter.copyBounded(new InputStream() {
                public int read() { return 0; }
                public int read(byte[] buffer) { return 0; }
            }, new ByteArrayOutputStream(), 1, () -> false));
            System.out.println("PASS: " + tests + " gallery source-validation/bounded-copy cases; Android MediaStore runtime NOT TESTED");
        } finally {
            try (java.util.stream.Stream<Path> paths = Files.walk(temporary)) {
                paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> { try { Files.delete(path); } catch (IOException failure) { throw new RuntimeException(failure); } });
            }
        }
    }
}
