package in.crushx.lens.capture;

import java.util.Arrays;

/** Pure JVM conversion tests. Does not exercise Android codecs, microphone, or a real camera. */
public final class CrushXMediaRecorderTests {
    private static int tests;

    private static void truth(boolean condition, String message) {
        if (!condition) throw new AssertionError(message); tests++;
    }

    private static void invalid(Runnable action) {
        try { action.run(); } catch (IllegalArgumentException expected) { tests++; return; }
        throw new AssertionError("Expected invalid capture arguments to be rejected before starting a worker");
    }

    private static void valid(Runnable action) { action.run(); tests++; }

    private static byte[] rgba(int... rgb) {
        byte[] data = new byte[rgb.length / 3 * 4];
        for (int i = 0; i < rgb.length / 3; i++) {
            data[i * 4] = (byte) rgb[i * 3]; data[i * 4 + 1] = (byte) rgb[i * 3 + 1];
            data[i * 4 + 2] = (byte) rgb[i * 3 + 2]; data[i * 4 + 3] = (byte) 255;
        }
        return data;
    }

    private static void check(byte[] input, int width, int height, boolean nv12, int... expected) {
        byte[] actual = new byte[width * height * 3 / 2];
        CrushXMediaRecorder.rgbaToYuv(input, actual, width, height, nv12);
        int[] unsigned = new int[actual.length];
        for (int i = 0; i < actual.length; i++) unsigned[i] = actual[i] & 255;
        if (!Arrays.equals(expected, unsigned)) throw new AssertionError("Expected " + Arrays.toString(expected) + ", received " + Arrays.toString(unsigned));
        tests++;
    }

    public static void main(String[] args) {
        check(new byte[16], 2, 2, false, 16, 16, 16, 16, 128, 128);
        check(rgba(255,255,255, 255,255,255, 255,255,255, 255,255,255), 2,2,false, 235,235,235,235,128,128);
        check(rgba(255,0,0, 255,0,0, 255,0,0, 255,0,0), 2,2,false, 82,82,82,82,90,240);
        check(rgba(0,0,255, 0,0,255, 0,0,255, 0,0,255), 2,2,false, 41,41,41,41,240,110);
        // Input rows bottom-up; output must put the original white top row first.
        check(rgba(0,0,0, 0,0,0, 255,255,255, 255,255,255), 2,2,false, 235,235,16,16,128,128);
        byte[] twoBlocks = rgba(0,255,0,0,255,0,255,0,0,255,0,0, 0,255,0,0,255,0,255,0,0,255,0,0);
        check(twoBlocks,4,2,false,144,144,82,82,144,144,82,82,54,90,34,240);
        check(twoBlocks,4,2,true,144,144,82,82,144,144,82,82,54,34,90,240);
        // Chroma must average the 2x2 block rather than taking only its top-left pixel.
        check(rgba(255,0,0,255,0,0,0,0,255,0,0,255),2,2,false,41,41,82,82,165,175);
        invalid(() -> CrushXMediaRecorder.rgbaToYuv(null, new byte[6], 2, 2, false));
        invalid(() -> CrushXMediaRecorder.rgbaToYuv(new byte[15], new byte[6], 2, 2, false));
        invalid(() -> CrushXMediaRecorder.rgbaToYuv(new byte[16], new byte[7], 2, 2, false));
        invalid(() -> CrushXMediaRecorder.rgbaToYuv(new byte[16], new byte[6], 3, 2, false));
        invalid(() -> CrushXMediaRecorder.validateDimensions(2, 0, 15));
        invalid(() -> CrushXMediaRecorder.validateDimensions(1282, 720, 15));
        invalid(() -> CrushXMediaRecorder.validateDimensions(720, 1280, 60));
        invalid(() -> new CrushXMediaRecorder().start(null, 2, 2, 15, false));
        invalid(() -> new CrushXMediaRecorder().start("relative.mp4", 2, 2, 15, false));
        truth(!new CrushXMediaRecorder().offerFrame(null), "Idle recorder accepted a frame");
        truth(CrushXMediaRecorder.presentationTime(5000, 1000) == 4000, "Readback age was not removed");
        truth(CrushXMediaRecorder.presentationTime(5000, 6000) == 0, "Initial frame PTS became negative");
        invalid(() -> CrushXMediaRecorder.presentationTime(-1, 0));
        invalid(() -> CrushXMediaRecorder.presentationTime(1, -1));
        truth(!CrushXMediaRecorder.frameProgressTimedOut(2999999999L, 0), "Watchdog fired before deadline");
        truth(CrushXMediaRecorder.frameProgressTimedOut(3000000000L, 0), "Watchdog did not fire on deadline");
        truth(!CrushXMediaRecorder.frameProgressTimedOut(4000000000L, 2000000000L), "Genuine output progress did not refresh watchdog");
        truth(!CrushXMediaRecorder.frameProgressTimedOut(1, 2), "Regressing monotonic clock caused invalid subtraction");
        valid(() -> CrushXMediaRecorder.validateDimensions(720, 1280, 30));
        valid(() -> CrushXMediaRecorder.validateDimensions(1280, 720, 30));
        valid(() -> CrushXMediaRecorder.validateDimensions(2, 2, 1));
        invalid(() -> CrushXMediaRecorder.validateDimensions(720, 1280, 31));
        invalid(() -> CrushXMediaRecorder.validateDimensions(720, 1280, 0));
        invalid(() -> new CrushXMediaRecorder.FramePool(0));
        invalid(() -> new CrushXMediaRecorder.FramePool(4));
        CrushXMediaRecorder.FramePool pool = new CrushXMediaRecorder.FramePool(2);
        byte[] firstPixels = new byte[16], secondPixels = new byte[16];
        CrushXMediaRecorder.Frame first = pool.acquire(firstPixels, 1000);
        CrushXMediaRecorder.Frame second = pool.acquire(secondPixels, 2000);
        truth(pool.availableCount() == 0 && pool.acquire(new byte[16], 3000) == null,
            "Bounded frame leases unexpectedly grew or accepted a third in-flight frame");
        truth(first.rgba == firstPixels && second.rgba == secondPixels && first.timestamp == 1000,
            "Frame descriptor did not preserve the JNI-owned payload and timestamp");
        pool.release(first);
        truth(first.rgba == null && first.timestamp == 0 && pool.availableCount() == 1,
            "Released descriptor retained camera pixels");
        invalid(() -> pool.release(first));
        CrushXMediaRecorder.Frame reused = pool.acquire(firstPixels, 4000);
        truth(reused == first && reused.rgba == firstPixels && reused.timestamp == 4000,
            "Descriptor was allocated again rather than reused");
        CrushXMediaRecorder.FramePool foreignPool = new CrushXMediaRecorder.FramePool(1);
        invalid(() -> foreignPool.release(reused));
        pool.release(reused); pool.release(second);
        truth(pool.availableCount() == 2, "Frame leases were not returned after encoding");
        CrushXMediaRecorder idle = new CrushXMediaRecorder();
        truth(idle.getAcceptedFrameCount() == 0 && idle.getEncodedFrameCount() == 0 && idle.getCaptureElapsedSeconds() == 0,
            "An unused recorder reported fabricated capture progress");
        truth(!idle.offerFrame(firstPixels) && idle.getRejectedFrameCount() == 1,
            "Rejected frame submissions were not measured");
        truth("no-audio".equals(idle.getAudioClockSource()), "An unused recorder reported an audio timestamp");
        truth(CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1105000000L, 4410, 44100) == 5000,
            "Audio frame position was not associated with the video monotonic epoch");
        truth(CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1100000000L, 4410, 44100) == 0,
            "Aligned hardware clocks produced a nonzero offset");
        truth(CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1050000000L, 4410, 44100) == 0,
            "Small pre-epoch timestamp uncertainty was not clamped safely");
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 999999999L, 0, 44100));
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1100000000L, -1, 44100));
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1100000000L, 1, 0));
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 40000000000L, 0, 44100));
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 1000000000L, 44100L * 36, 44100));
        invalid(() -> CrushXMediaRecorder.audioClockOffsetMicroseconds(1000000000L, 3000000000L, 0, 44100));
        // Four 2x2 blocks (input bottom-up): bottom black/white, top red/blue.
        byte[] fourBlocks = rgba(0,0,0,0,0,0,255,255,255,255,255,255,
            0,0,0,0,0,0,255,255,255,255,255,255,
            255,0,0,255,0,0,0,0,255,0,0,255,
            255,0,0,255,0,0,0,0,255,0,0,255);
        check(fourBlocks,4,4,false,82,82,41,41,82,82,41,41,16,16,235,235,16,16,235,235,90,240,128,128,240,110,128,128);
        check(fourBlocks,4,4,true,82,82,41,41,82,82,41,41,16,16,235,235,16,16,235,235,90,240,240,110,128,128,128,128);
        byte[] topDownYuv = new byte[24];
        CrushXMediaRecorder.rgbaToYuv(fourBlocks, topDownYuv, 4, 4, false, false);
        truth(Arrays.equals(topDownYuv, new byte[] {16,16,(byte)235,(byte)235,16,16,(byte)235,(byte)235,
                82,82,41,41,82,82,41,41,(byte)128,(byte)128,90,(byte)240,(byte)128,(byte)128,(byte)240,110}),
            "Top-down async input was vertically flipped a second time");
        byte[] topDownNv12 = new byte[24];
        CrushXMediaRecorder.rgbaToYuv(fourBlocks, topDownNv12, 4, 4, true, false);
        truth(Arrays.equals(topDownNv12, new byte[] {16,16,(byte)235,(byte)235,16,16,(byte)235,(byte)235,
                82,82,41,41,82,82,41,41,(byte)128,(byte)128,(byte)128,(byte)128,90,(byte)240,(byte)240,110}),
            "Top-down NV12 input lost chroma layout or row orientation");
        CrushXMediaRecorder rowConfigured = new CrushXMediaRecorder();
        truth(rowConfigured.getInputRowsBottomUp(), "Legacy input no longer defaults to bottom-up");
        rowConfigured.setInputRowsBottomUp(false);
        truth(!rowConfigured.getInputRowsBottomUp(), "Calibrated async row origin could not be configured");
        truth(CrushXMediaRecorder.videoTimestampWithinBoundary(29999999L, -1), "Last pre-limit video frame was rejected");
        truth(!CrushXMediaRecorder.videoTimestampWithinBoundary(30000000L, -1), "Video exceeded30second media boundary");
        truth(CrushXMediaRecorder.videoTimestampWithinBoundary(1999999L, 2000000L), "Pre-stop async frame could not drain");
        truth(!CrushXMediaRecorder.videoTimestampWithinBoundary(2000000L, 2000000L), "Post-stop frame was accepted");
        truth(CrushXMediaRecorder.remainingAudioFrames(2000000L, 10000L, 0, 44100) == 87759L, "Audio clock offset not subtracted from stop budget");
        truth(CrushXMediaRecorder.remainingAudioFrames(2000000L, 10000L, 87759L, 44100) == 0, "Audio exceeded frozen stop boundary");
        truth(CrushXMediaRecorder.remainingAudioFrames(-1, 0, 44100L * 30, 44100) == 0, "Audio exceeded30second ceiling");
        truth(CrushXMediaRecorder.remainingAudioFrames(5000, 10000, 0, 44100) == 0, "Audio started after a short capture ended");
        truth(!CrushXMediaRecorder.inputDrainTimedOut(4999999999L, 2000000L), "Drain ended before its3second grace");
        truth(CrushXMediaRecorder.inputDrainTimedOut(5000000000L, 2000000L), "Drain did not end after its bounded grace");
        truth(!CrushXMediaRecorder.inputDrainTimedOut(5000000000L, -1), "Active capture incorrectly entered drain timeout");
        invalid(() -> CrushXMediaRecorder.remainingAudioFrames(1000, -1, 0, 44100));
        invalid(() -> CrushXMediaRecorder.remainingAudioFrames(1000, 0, -1, 44100));
        verifyBridgeContracts();
        System.out.println("PASS: " + tests + " pure RGBA/YUV, frame-pool, argument, audio-clock, timestamp and watchdog cases; Android codecs/runtime NOT TESTED");
        if (args.length > 0 && "--benchmark".equals(args[0])) benchmarkConversion();
    }

    private static void bridge(String name, Class<?> result, Class<?>... arguments) {
        try {
            java.lang.reflect.Method method = CrushXMediaRecorder.class.getMethod(name, arguments);
            truth(method.getReturnType() == result, "Wrong JNI return type for " + name);
        } catch (ReflectiveOperationException missing) { throw new AssertionError("Missing JNI contract " + name, missing); }
    }

    private static void verifyBridgeContracts() {
        bridge("start", void.class, String.class, int.class, int.class, int.class, boolean.class);
        bridge("offerFrame", boolean.class, byte[].class, long.class);
        bridge("offerFrame", boolean.class, byte[].class);
        bridge("setInputRowsBottomUp", void.class, boolean.class);
        bridge("getInputRowsBottomUp", boolean.class);
        bridge("markCaptureStopped", void.class);
        bridge("stop", void.class, boolean.class);
        bridge("canAcceptFrame", boolean.class);
        bridge("isSupported", boolean.class);
        bridge("isSupportedSize", boolean.class, int.class, int.class, int.class);
        for (String name : new String[] { "getEncodedFrameCount", "getAcceptedFrameCount", "getRejectedFrameCount",
            "getEncoderDroppedFrameCount", "getQueuedFrameCount", "getFirstEncodedPresentationMicroseconds",
            "getLastEncodedPresentationMicroseconds", "getLastVideoPresentationMicroseconds", "getStartedUnixMillis" })
            bridge(name, long.class);
        for (String name : new String[] { "getCaptureElapsedSeconds", "getDurationSeconds", "getFirstFrameOffsetSeconds", "getAudioStartOffsetSeconds" })
            bridge(name, double.class);
        for (String name : new String[] { "getState", "getError", "getEncoderName", "getAudioClockSource" }) bridge(name, String.class);
        for (String name : new String[] { "hasAudio", "isEncoderHardwareKnown", "isEncoderHardwareAccelerated" }) bridge(name, boolean.class);
        bridge("getRequestedFrameRate", int.class);
    }

    private static void benchmarkConversion() {
        int width = 1280, height = 720, frames = 90;
        byte[] input = new byte[width * height * 4], output = new byte[width * height * 3 / 2];
        for (int i = 0; i < input.length; i++) input[i] = (byte)(i * 31);
        for (int i = 0; i < 30; i++) CrushXMediaRecorder.rgbaToYuv(input, output, width, height, false);
        long started = System.nanoTime();
        for (int i = 0; i < frames; i++) CrushXMediaRecorder.rgbaToYuv(input, output, width, height, false);
        double seconds = (System.nanoTime() - started) / 1000000000.0;
        System.out.printf(java.util.Locale.ROOT,
            "HOST CONVERSION ONLY: %dx%d, %d frames, %.6fs, %.2f conversions/s. Not Android, camera, GPU, encoding or recording FPS.%n",
            width, height, frames, seconds, frames / seconds);
    }
}
