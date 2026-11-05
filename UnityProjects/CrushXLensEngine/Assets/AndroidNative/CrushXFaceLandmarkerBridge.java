package com.crushx.lens;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.os.SystemClock;
import android.util.Log;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.components.containers.Category;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Unity -> Android MediaPipe single-face VIDEO inference.
 * Inference NEVER runs on Unity's render thread. It consumes frames from
 * ARFoundation's existing camera, not a second camera permission/open.
 * No frames/landmarks leave the device; no raw data is logged or persisted.
 */
public final class CrushXFaceLandmarkerBridge {
    private static final String TAG = "CrushXFaceAI";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final AtomicReference<String> latest = new AtomicReference<>();
    private volatile boolean ready = false;
    private volatile boolean closed = false;
    private FaceLandmarker landmarker; // owned by the single worker thread
    private int nextSequence = 0;
    private long lastTimestampMs = 0;

    public boolean initialize(Activity activity, String assetName) {
        if (closed || activity == null || assetName == null ||
                !"face_landmarker.task".equals(assetName)) return false;
        try (InputStream ignored = activity.getAssets().open(assetName)) {
            // Model file was packaged and exists, not merely an expected path.
        } catch (Exception missingModel) {
            Log.w(TAG, "Face Landmarker model unavailable; safe fallback enabled.");
            return false;
        }
        worker.execute(() -> {
            try {
                BaseOptions base = BaseOptions.builder()
                        .setModelAssetPath(assetName).build();
                FaceLandmarker.FaceLandmarkerOptions options =
                        FaceLandmarker.FaceLandmarkerOptions.builder()
                        .setBaseOptions(base)
                        .setRunningMode(RunningMode.VIDEO)
                        .setNumFaces(1)
                        .setMinFaceDetectionConfidence(0.6f)
                        .setMinFacePresenceConfidence(0.6f)
                        .setMinTrackingConfidence(0.6f)
                        .setOutputFaceBlendshapes(true)
                        .build();
                if (!closed) {
                    landmarker = FaceLandmarker.createFromOptions(
                            activity.getApplicationContext(), options);
                    ready = true;
                }
            } catch (Exception initError) {
                Log.w(TAG, "Face Landmarker failed to initialize (" +
                        initError.getClass().getSimpleName() + ")");
                ready = false;
            }
        });
        return true;
    }

    public boolean isReady() { return ready && !closed; }

    // RGBA32 from Unity AR camera CPU image. Orientation and mirror values
    // MUST be calibrated to the same viewport pixels as the Unity camera.
    public boolean submitFrame(byte[] rgba, int width, int height,
                               int rotationDegrees, boolean mirrorPreview) {
        if (!isReady() || rgba == null || width <= 0 || height <= 0 ||
                width > 1024 || height > 1024 ||
                rgba.length != width * height * 4 ||
                (rotationDegrees != 0 && rotationDegrees != 90 &&
                 rotationDegrees != 180 && rotationDegrees != 270) ||
                !busy.compareAndSet(false, true)) return false;

        final long receivedAt = SystemClock.uptimeMillis();
        try {
            worker.execute(() -> {
                try {
                    if (closed || landmarker == null) return;
                    int[] argb = new int[width * height];
                    for (int i = 0, j = 0; i < argb.length; i++, j += 4) {
                        argb[i] = 0xff000000 |
                                ((rgba[j] & 0xff) << 16) |
                                ((rgba[j + 1] & 0xff) << 8) |
                                (rgba[j + 2] & 0xff);
                    }
                    Bitmap source = Bitmap.createBitmap(
                            argb, width, height, Bitmap.Config.ARGB_8888);
                    Bitmap oriented = source;
                    if (rotationDegrees != 0 || mirrorPreview) {
                        Matrix transform = new Matrix();
                        transform.postRotate(rotationDegrees);
                        if (mirrorPreview) transform.postScale(-1f, 1f);
                        oriented = Bitmap.createBitmap(source, 0, 0,
                                width, height, transform, false);
                    }
                    try {
                        long now = SystemClock.uptimeMillis();
                        long timestamp = Math.max(now, lastTimestampMs + 1);
                        lastTimestampMs = timestamp;
                        MPImage image = new BitmapImageBuilder(oriented).build();
                        FaceLandmarkerResult result =
                                landmarker.detectForVideo(image, timestamp);
                        String packet = makePacket(result, ++nextSequence,
                                SystemClock.uptimeMillis() - receivedAt);
                        latest.set(packet);
                    } finally {
                        if (oriented != source) oriented.recycle();
                        source.recycle();
                    }
                } catch (Exception inferenceError) {
                    latest.set(noFace(++nextSequence));
                    Log.w(TAG, "Face inference stopped for this frame: " +
                            inferenceError.getClass().getSimpleName());
                } finally {
                    busy.set(false);
                }
            });
            return true;
        } catch (RuntimeException rejected) {
            busy.set(false);
            return false;
        }
    }

    // Poll is non-blocking. JSON is a short packet, with no image/video content.
    public String pollLatest() { return latest.getAndSet(null); }

    private static String noFace(int sequence) {
        return "{\"sequence\":" + sequence + ",\"hasFace\":false}";
    }

    private static float clamp(float x, float min, float max) {
        return Math.max(min, Math.min(max, x));
    }

    private static float horizontal(List<NormalizedLandmark> v, int a, int b) {
        return Math.abs(v.get(a).x() - v.get(b).x());
    }

    private static JSONObject uv(float x, float y) throws Exception {
        JSONObject point = new JSONObject();
        point.put("x", clamp(x, .011f, .989f));
        point.put("y", clamp(1f - y, .011f, .989f)); // native top-left -> Unity bottom-left
        return point;
    }

    private static JSONObject radius(float x, float y) throws Exception {
        JSONObject value = new JSONObject();
        value.put("x", clamp(x, .015f, .35f));
        value.put("y", clamp(y, .015f, .35f));
        return value;
    }

    private static float score(List<Category> categories, String key) {
        for (Category cat : categories) {
            if (key.equals(cat.categoryName()))
                return clamp(cat.score(), 0f, 1f);
        }
        return 0f;
    }

    private static String makePacket(FaceLandmarkerResult result,
                                     int sequence, long frameAgeMs) throws Exception {
        if (result.faceLandmarks().isEmpty()) return noFace(sequence);
        List<NormalizedLandmark> p = result.faceLandmarks().get(0);
        if (p.size() < 468) return noFace(sequence);

        float lX = (p.get(33).x() + p.get(133).x()) * .5f;
        float lY = (p.get(33).y() + p.get(133).y()) * .5f;
        float rX = (p.get(362).x() + p.get(263).x()) * .5f;
        float rY = (p.get(362).y() + p.get(263).y()) * .5f;
        float mouthX = (p.get(61).x() + p.get(291).x()) * .5f;
        float mouthY = (p.get(13).y() + p.get(14).y()) * .5f;
        float eyeWidth = (horizontal(p, 33, 133) + horizontal(p, 362, 263)) * .5f;
        float mouthWidth = horizontal(p, 61, 291);
        if (!Float.isFinite(lX) || !Float.isFinite(lY) ||
            !Float.isFinite(rX) || !Float.isFinite(rY) ||
            !Float.isFinite(mouthX) || !Float.isFinite(mouthY) ||
            eyeWidth < .012f || mouthWidth < .015f ||
            Math.abs(lX - rX) < .03f) return noFace(sequence);

        JSONObject data = new JSONObject();
        data.put("sequence", sequence);
        data.put("hasFace", true);
        // FaceLandmarkerResult does not expose a calibrated face-confidence
        // scalar. The 0.8 value is a *valid-result sentinel*, not an ML score.
        data.put("confidence", .8);
        data.put("ageMilliseconds", Math.max(0, frameAgeMs));
        data.put("leftEye", uv(lX, lY));
        data.put("rightEye", uv(rX, rY));
        data.put("mouth", uv(mouthX, mouthY));
        data.put("eyeRadius", radius(eyeWidth * .80f, eyeWidth * .62f));
        data.put("mouthRadius", radius(mouthWidth * .70f, mouthWidth * .42f));
        List<Category> categories = result.faceBlendshapes().isPresent() &&
                !result.faceBlendshapes().get().isEmpty()
                ? result.faceBlendshapes().get().get(0) : java.util.Collections.emptyList();
        data.put("jawOpen", score(categories, "jawOpen"));
        data.put("eyeBlinkLeft", score(categories, "eyeBlinkLeft"));
        data.put("eyeBlinkRight", score(categories, "eyeBlinkRight"));
        data.put("mouthSmileLeft", score(categories, "mouthSmileLeft"));
        data.put("mouthSmileRight", score(categories, "mouthSmileRight"));
        data.put("browInnerUp", score(categories, "browInnerUp"));
        return data.toString();
    }

    public void close() {
        ready = false;
        closed = true;
        latest.set(null);
        worker.execute(() -> {
            if (landmarker != null) {
                landmarker.close();
                landmarker = null;
            }
        });
        worker.shutdown();
    }
}
