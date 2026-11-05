package in.crushx.lens.capture;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

/**
 * Explicit user-requested copy of a completed private capture to MediaStore on Android 10+.
 * No camera, network, broad storage permission, arbitrary-path import or publishing API.
 * A pending row is published only after a bounded successful copy; failures remove it.
 */
public final class CrushXGalleryExporter {
    static final long MAX_BYTES = 128L * 1024L * 1024L;
    private volatile String state = "idle", error = "", resultUri = "";
    private volatile boolean cancelled;
    private Thread worker;

    interface CancelFlag { boolean cancelled(); }
    private static final class ValidationException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        ValidationException(String message) { super(message); }
    }

    public static boolean isSupported() { return Build.VERSION.SDK_INT >= 29; }
    public String getState() { return state; }
    public String getError() { return error; }
    public String getUri() { return "ready".equals(state) ? resultUri : ""; }

    /** One exporter per request. Unity polls completion instead of blocking its render thread. */
    public synchronized void export(Context context, String savedPath, String savedRoot, String mime) {
        if (worker != null) throw new IllegalStateException("Gallery exporter instances cannot be reused");
        if (context == null) throw new ValidationException("Application context is required");
        final Context application = context.getApplicationContext();
        if (application == null) throw new ValidationException("Application context is unavailable");
        state = "exporting";
        worker = new Thread(() -> copyToGallery(application, savedPath, savedRoot, mime), "CrushXGalleryExport");
        worker.start();
    }

    public synchronized void cancel() {
        if (!"ready".equals(state) && !"error".equals(state)) cancelled = true;
    }

    private void copyToGallery(Context context, String savedPath, String savedRoot, String mime) {
        ContentResolver resolver = null;
        Uri row = null;
        boolean committed = false;
        try {
            if (!isSupported()) throw new ValidationException("Gallery export requires Android 10 or newer");
            File source = validateSource(savedPath, savedRoot, mime, context.getFilesDir(), context.getExternalFilesDir(null));
            long expectedBytes = source.length();
            if (cancelled) throw new IOException("Cancelled");
            boolean photo = "image/png".equals(mime);
            resolver = context.getContentResolver();
            if (resolver == null) throw new IOException("MediaStore is unavailable");
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, "CrushX_" + UUID.randomUUID().toString() + (photo ? ".png" : ".mp4"));
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                (photo ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_MOVIES) + "/Crush.X");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri collection = photo
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            row = resolver.insert(collection, values);
            if (row == null) throw new IOException("MediaStore could not create an item");
            try (InputStream input = new FileInputStream(source); OutputStream output = resolver.openOutputStream(row, "w")) {
                if (output == null) throw new IOException("MediaStore output is unavailable");
                copyBounded(input, output, expectedBytes, () -> cancelled);
                output.flush();
            }
            if (cancelled) throw new IOException("Cancelled");
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(row, publish, null, null) != 1) throw new IOException("MediaStore could not finalize the item");
            synchronized (this) {
                if (cancelled) throw new IOException("Cancelled");
                resultUri = row.toString();
                committed = true;
                state = "ready";
            }
        } catch (Exception failure) {
            // Platform exception messages may include private file paths. Report only our safe
            // argument-validation messages or a bounded category; never leak those paths to UI.
            error = cancelled ? "Gallery export cancelled"
                : failure instanceof ValidationException ? failure.getMessage()
                : "Gallery export failed (" + failure.getClass().getSimpleName() + ")";
        } finally {
            if (!committed) {
                if (resolver != null && row != null) {
                    try { resolver.delete(row, null, null); }
                    catch (RuntimeException cleanupFailure) { error = "Gallery export failed; MediaStore item cleanup also failed"; }
                }
                if (error == null || error.isEmpty()) error = "Gallery export failed";
                state = "error";
            }
        }
    }

    /** Pure path/header validation, shared by the exporter and host-JVM regression cases. */
    static File validateSource(String savedPath, String savedRoot, String mime, File internalFiles, File externalFiles) throws IOException {
        if (savedPath == null || savedRoot == null || savedPath.isEmpty() || savedRoot.isEmpty())
            throw new ValidationException("A completed private capture is required");
        if (!"image/png".equals(mime) && !"video/mp4".equals(mime))
            throw new ValidationException("Only PNG photos and MP4 videos can be exported");
        File rootInput = new File(savedRoot), sourceInput = new File(savedPath);
        if (!rootInput.isAbsolute() || !sourceInput.isAbsolute())
            throw new ValidationException("Capture paths must be private absolute paths");
        File root = rootInput.getCanonicalFile();
        if (!isExpectedRoot(root, internalFiles) && !isExpectedRoot(root, externalFiles))
            throw new ValidationException("Gallery export accepts only this app's private saved captures");
        File source = sourceInput.getCanonicalFile();
        if (!root.equals(source.getParentFile()) || !source.isFile())
            throw new ValidationException("Saved capture is unavailable or outside the private saved directory");
        boolean photo = "image/png".equals(mime);
        if (!source.getName().endsWith(photo ? ".png" : ".mp4"))
            throw new ValidationException("Saved capture extension does not match its media type");
        long size = source.length();
        if (size < (photo ? 33 : 128) || size > MAX_BYTES)
            throw new ValidationException("Saved capture size is outside the export limit");
        byte[] header = new byte[24];
        try (InputStream input = new FileInputStream(source)) {
            int total = 0;
            while (total < header.length) {
                int count = input.read(header, total, header.length - total);
                if (count < 0) throw new ValidationException("Saved capture header is truncated");
                total += count;
            }
        }
        if (photo) {
            byte[] signature = {(byte)137,80,78,71,13,10,26,10};
            for (int index = 0; index < signature.length; index++)
                if (header[index] != signature[index]) throw new ValidationException("Saved capture is not a PNG photo");
            if (header[12] != 'I' || header[13] != 'H' || header[14] != 'D' || header[15] != 'R')
                throw new ValidationException("Saved capture has no PNG image header");
            int width = readInt(header, 16), height = readInt(header, 20);
            if (width < 1 || height < 1 || width > 2048 || height > 2048)
                throw new ValidationException("Saved photo dimensions are outside the capture limit");
        } else if (header[4] != 'f' || header[5] != 't' || header[6] != 'y' || header[7] != 'p')
            throw new ValidationException("Saved capture is not an MP4 file");
        return source;
    }

    private static boolean isExpectedRoot(File root, File files) throws IOException {
        if (files == null) return false;
        // Resolve the trusted app root once, then require this exact child path. A symlink in
        // CrushXLensCaptures/saved cannot redirect the accepted directory outside that path.
        File expected = new File(files.getCanonicalFile(), "CrushXLensCaptures/saved");
        return root.equals(expected.getAbsoluteFile());
    }

    private static int readInt(byte[] data, int index) {
        return ((data[index] & 255) << 24) | ((data[index + 1] & 255) << 16)
            | ((data[index + 2] & 255) << 8) | (data[index + 3] & 255);
    }

    /** At most one 64KiB copy buffer. Detects source changes and cancellation before publication. */
    static long copyBounded(InputStream input, OutputStream output, long expectedBytes, CancelFlag cancellation) throws IOException {
        if (expectedBytes < 1 || expectedBytes > MAX_BYTES) throw new ValidationException("Invalid capture size");
        byte[] buffer = new byte[64 * 1024];
        long copied = 0;
        while (true) {
            if (cancellation != null && cancellation.cancelled()) throw new IOException("Cancelled");
            int count = input.read(buffer);
            if (count < 0) break;
            if (count == 0) throw new IOException("Source made no progress");
            copied += count;
            if (copied > expectedBytes || copied > MAX_BYTES) throw new IOException("Capture changed during export");
            output.write(buffer, 0, count);
        }
        if (copied != expectedBytes) throw new IOException("Capture changed during export");
        if (cancellation != null && cancellation.cancelled()) throw new IOException("Cancelled");
        return copied;
    }
}
