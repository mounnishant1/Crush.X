package in.crushx.lens.capture;

import java.util.Arrays;

/** Pure JVM conversion tests. Does not exercise Android codecs, microphone, or a real camera. */
public final class CrushXMediaRecorderTests {
    private static int tests;

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
        System.out.println("PASS: " + tests + " pure RGBA/YUV conversion cases; Android runtime NOT TESTED");
    }
}
