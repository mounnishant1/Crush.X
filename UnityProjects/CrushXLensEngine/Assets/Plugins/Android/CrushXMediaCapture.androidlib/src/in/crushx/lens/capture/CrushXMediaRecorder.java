package in.crushx.lens.capture;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaRecorder;
import android.os.SystemClock;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Private local rendered-frame capture; never opens the camera or publishes files.
 * Bounded CPU RGBA -> AVC byte-buffer pipeline, at most 1280 pixels/side, 15fps, 30s.
 * Android codecs are probed, not assumed. Unsupported buffer formats fail explicitly.
 * All encoder/muxer/audio objects belong to one worker thread.
 */
public final class CrushXMediaRecorder {
    private static final String AVC = "video/avc";
    private static final String AAC = "audio/mp4a-latm";
    private static final int SAMPLE_RATE = 44100;
    private static final long MAX_NANOS = TimeUnit.SECONDS.toNanos(30);
    private static final int MAX_PENDING_BYTES = 2 * 1024 * 1024;
    private final ArrayBlockingQueue<Frame> frames = new ArrayBlockingQueue<>(1);
    private volatile String state = "idle", error = "";
    private volatile boolean stopping, discard, audioPresent;
    private volatile long startNs;
    private volatile double durationSeconds;
    private Thread worker;
    private String path;
    private int width, height, fps, colorFormat;
    private MediaCodec video, audio;
    private MediaMuxer muxer;
    private AudioRecord microphone;
    private int videoTrack = -1, audioTrack = -1, videoSamples, audioSamples, pendingBytes;
    private boolean muxerStarted, videoEos, audioEos;
    private long audioPcmFrames, lastVideoPts = -1;
    private byte[] yuv;
    private final ArrayList<Packet> pending = new ArrayList<>();

    private static final class Choice {
        final String name; final int format;
        Choice(String name, int format) { this.name = name; this.format = format; }
    }
    private static final class Frame {
        final byte[] rgba; final long timestamp;
        Frame(byte[] rgba, long timestamp) { this.rgba = rgba; this.timestamp = timestamp; }
    }
    private static final class Packet {
        final int track; final byte[] bytes; final long pts; final int flags;
        Packet(int track, byte[] bytes, long pts, int flags) { this.track = track; this.bytes = bytes; this.pts = pts; this.flags = flags; }
    }

    public static boolean isSupported() {
        try { return findEncoder(0, 0, 15) != null; }
        catch (RuntimeException unsupported) { return false; }
    }

    private static Choice findEncoder(int width, int height, int fps) {
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            for (String type : info.getSupportedTypes()) {
                if (!AVC.equalsIgnoreCase(type)) continue;
                MediaCodecInfo.CodecCapabilities caps = info.getCapabilitiesForType(type);
                if (width > 0 && !caps.getVideoCapabilities().areSizeAndRateSupported(width, height, fps)) continue;
                // Flexible YUV420 does not specify a byte-buffer layout. Require an explicit
                // planar/NV12 format instead of sending guessed YUV bytes to a surface codec.
                for (int format : caps.colorFormats)
                    if (format == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
                        || format == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar)
                        return new Choice(info.getName(), format);
            }
        }
        return null;
    }

    public synchronized void start(String outputPath, int frameWidth, int frameHeight, int framesPerSecond, boolean withAudio) {
        if (worker != null) throw new IllegalStateException("Recorder instances cannot be reused");
        if (frameWidth < 2 || frameHeight < 2 || (frameWidth & 1) != 0 || (frameHeight & 1) != 0
            || frameWidth > 1280 || frameHeight > 1280 || framesPerSecond < 1 || framesPerSecond > 15)
            throw new IllegalArgumentException("Expected even dimensions <=1280 and 1..15fps");
        File output = new File(outputPath);
        if (!output.isAbsolute() || output.exists() || !outputPath.endsWith(".mp4"))
            throw new IllegalArgumentException("Expected a new absolute private MP4 path");
        path = outputPath; width = frameWidth; height = frameHeight; fps = framesPerSecond;
        audioPresent = withAudio; state = "preparing";
        worker = new Thread(this::encode, "CrushXMediaEncoder");
        worker.start();
    }

    public boolean canAcceptFrame() { return "recording".equals(state) && !stopping && frames.remainingCapacity() > 0; }

    public boolean offerFrame(byte[] rgba) {
        if (!canAcceptFrame()) return false;
        if (rgba == null || rgba.length != width * height * 4) throw new IllegalArgumentException("Incorrect RGBA frame size");
        // JNI owns a fresh byte[] copy. Capacity one bounds backpressure/memory.
        return frames.offer(new Frame(rgba, Math.max(0, (System.nanoTime() - startNs) / 1000)));
    }

    public void stop(boolean deleteOutput) {
        discard |= deleteOutput;
        stopping = true;
        if (worker == null && deleteOutput && path != null) new File(path).delete();
        // No worker join on Unity's UI thread: completion/error is explicitly polled.
    }
    public String getState() { return state; }
    public String getError() { return error; }
    public boolean hasAudio() { return audioPresent; }
    public double getDurationSeconds() { return durationSeconds; }

    private void encode() {
        boolean success = false;
        try {
            Choice choice = findEncoder(width, height, fps);
            if (choice == null) throw new IllegalStateException("No advertised planar/NV12 AVC encoder supports these dimensions");
            colorFormat = choice.format;
            MediaFormat format = MediaFormat.createVideoFormat(AVC, width, height);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat);
            format.setInteger(MediaFormat.KEY_BIT_RATE, Math.max(750000, width * height * 5));
            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
            video = MediaCodec.createByCodecName(choice.name);
            video.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            video.start();
            yuv = new byte[width * height * 3 / 2];
            muxer = new MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            // Pixels already have the frozen preview orientation. Do not also rotate MP4 metadata.
            if (audioPresent) prepareAudio();
            if (discard) throw new IllegalStateException("Recording cancelled");
            startNs = System.nanoTime();
            if (microphone != null) {
                microphone.startRecording();
                if (microphone.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING)
                    throw new IllegalStateException("Microphone did not enter the recording state");
            }
            state = "recording";
            while ((!stopping || !frames.isEmpty()) && !discard) {
                if (System.nanoTime() - startNs >= MAX_NANOS) stopping = true;
                Frame frame = frames.poll(5, TimeUnit.MILLISECONDS);
                if (frame != null) queueVideo(frame);
                queueAudio(false);
                drain(video, true);
                if (audio != null) drain(audio, false);
            }
            if (discard) throw new IllegalStateException("Recording cancelled");
            state = "finalizing";
            if (microphone != null) microphone.stop();
            queueEndOfStream(video, Math.max(lastVideoPts + 1000000L / fps, (System.nanoTime() - startNs) / 1000));
            if (audio != null) queueEndOfStream(audio, audioPcmFrames * 1000000L / SAMPLE_RATE);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            while ((!videoEos || (audio != null && !audioEos)) && System.nanoTime() < deadline) {
                drain(video, true);
                if (audio != null) drain(audio, false);
                SystemClock.sleep(2);
            }
            if (!videoEos || (audio != null && !audioEos)) throw new IllegalStateException("Encoder did not finish within the bounded timeout");
            if (videoSamples == 0 || lastVideoPts < 100000) throw new IllegalStateException("Recording too short or contains no video samples");
            if (audioPresent && audioSamples == 0) throw new IllegalStateException("Microphone produced no encoded audio");
            if (!muxerStarted) throw new IllegalStateException("MP4 tracks were not initialized");
            muxer.stop(); muxerStarted = false;
            muxer.release(); muxer = null;
            inspectOutput();
            success = true;
        } catch (Exception failure) {
            error = failure.getClass().getSimpleName() + ": " + failure.getMessage();
        } finally {
            cleanup();
            frames.clear(); pending.clear();
            if (!success || discard) {
                if (path != null) new File(path).delete();
                if (error.isEmpty()) error = "Recording cancelled";
                state = "error";
            } else state = "ready";
        }
    }

    private void prepareAudio() throws Exception {
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IllegalStateException("Microphone PCM format unsupported");
        microphone = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum * 2, 8192));
        if (microphone.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Microphone initialization failed");
        MediaFormat format = MediaFormat.createAudioFormat(AAC, SAMPLE_RATE, 1);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        format.setInteger(MediaFormat.KEY_BIT_RATE, 96000);
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 8192);
        audio = MediaCodec.createEncoderByType(AAC);
        audio.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        audio.start();
    }

    private void queueVideo(Frame frame) throws Exception {
        int index = video.dequeueInputBuffer(5000);
        if (index < 0) return; // bounded frame drop; timestamps preserve actual wall-clock timing
        ByteBuffer input = video.getInputBuffer(index);
        if (input == null || input.capacity() < yuv.length) throw new IllegalStateException("AVC input buffer is smaller than a frame");
        rgbaToYuv(frame.rgba, yuv, width, height, colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar);
        input.clear(); input.put(yuv);
        long pts = Math.max(lastVideoPts + 1, frame.timestamp);
        video.queueInputBuffer(index, 0, yuv.length, pts, 0);
        lastVideoPts = pts;
    }

    private void queueAudio(boolean end) {
        if (audio == null || microphone == null || end) return;
        int index = audio.dequeueInputBuffer(0);
        if (index < 0) return;
        ByteBuffer input = audio.getInputBuffer(index);
        if (input == null) throw new IllegalStateException("AAC input buffer unavailable");
        input.clear();
        int count = microphone.read(input, Math.min(input.capacity(), 8192), AudioRecord.READ_NON_BLOCKING);
        if (count < 0) throw new IllegalStateException("Microphone read failed with code " + count);
        count &= ~1; // mono PCM16 frames
        long pts = audioPcmFrames * 1000000L / SAMPLE_RATE;
        audioPcmFrames += count / 2;
        audio.queueInputBuffer(index, 0, count, pts, 0);
    }

    private void queueEndOfStream(MediaCodec codec, long pts) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        while (System.nanoTime() < deadline) {
            int index = codec.dequeueInputBuffer(5000);
            if (index >= 0) {
                codec.queueInputBuffer(index, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                return;
            }
            drain(codec, codec == video);
        }
        throw new IllegalStateException("Encoder input did not accept end-of-stream");
    }

    private void drain(MediaCodec codec, boolean isVideo) throws Exception {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (true) {
            int index = codec.dequeueOutputBuffer(info, 0);
            if (index == MediaCodec.INFO_TRY_AGAIN_LATER) return;
            if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (isVideo) {
                    if (videoTrack >= 0) throw new IllegalStateException("Video format changed after initialization");
                    videoTrack = muxer.addTrack(codec.getOutputFormat());
                } else {
                    if (audioTrack >= 0) throw new IllegalStateException("Audio format changed after initialization");
                    audioTrack = muxer.addTrack(codec.getOutputFormat());
                }
                startMuxerWhenReady();
                continue;
            }
            if (index < 0) continue;
            try {
                if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 && info.size > 0) {
                    ByteBuffer output = codec.getOutputBuffer(index);
                    if (output == null) throw new IllegalStateException("Encoded buffer unavailable");
                    output.position(info.offset); output.limit(info.offset + info.size);
                    int track = isVideo ? videoTrack : audioTrack;
                    if (track < 0) throw new IllegalStateException("Encoded sample arrived before track metadata");
                    if (muxerStarted) {
                        muxer.writeSampleData(track, output, info);
                    } else {
                        pendingBytes += info.size;
                        if (pendingBytes > MAX_PENDING_BYTES) throw new IllegalStateException("Encoder initialization exceeded pending buffer limit");
                        byte[] bytes = new byte[info.size]; output.get(bytes);
                        pending.add(new Packet(track, bytes, info.presentationTimeUs, info.flags));
                    }
                    if (isVideo) videoSamples++; else audioSamples++;
                }
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    if (isVideo) videoEos = true; else audioEos = true;
                }
            } finally { codec.releaseOutputBuffer(index, false); }
        }
    }

    private void startMuxerWhenReady() {
        if (muxerStarted || videoTrack < 0 || (audioPresent && audioTrack < 0)) return;
        muxer.start(); muxerStarted = true;
        for (Packet packet : pending) {
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            info.set(0, packet.bytes.length, packet.pts, packet.flags);
            muxer.writeSampleData(packet.track, ByteBuffer.wrap(packet.bytes), info);
        }
        pending.clear(); pendingBytes = 0;
    }

    private void inspectOutput() throws Exception {
        File output = new File(path);
        if (!output.isFile() || output.length() < 128) throw new IllegalStateException("MP4 is missing or empty");
        MediaExtractor extractor = new MediaExtractor();
        boolean foundVideo = false, foundAudio = false;
        double audioDuration = 0;
        try {
            extractor.setDataSource(path);
            for (int track = 0; track < extractor.getTrackCount(); track++) {
                MediaFormat format = extractor.getTrackFormat(track);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (AVC.equals(mime)) {
                    if (format.getInteger(MediaFormat.KEY_WIDTH) != width || format.getInteger(MediaFormat.KEY_HEIGHT) != height)
                        throw new IllegalStateException("Encoded dimensions do not match captured frames");
                    long duration = format.containsKey(MediaFormat.KEY_DURATION) ? format.getLong(MediaFormat.KEY_DURATION) : 0;
                    if (duration <= 0) throw new IllegalStateException("MP4 video duration is invalid");
                    durationSeconds = duration / 1000000.0;
                    extractor.selectTrack(track);
                    if (extractor.readSampleData(ByteBuffer.allocate(4 * 1024 * 1024), 0) <= 0)
                        throw new IllegalStateException("MP4 contains no readable video sample");
                    extractor.unselectTrack(track);
                    foundVideo = true;
                } else if (AAC.equals(mime)) {
                    long duration = format.containsKey(MediaFormat.KEY_DURATION) ? format.getLong(MediaFormat.KEY_DURATION) : 0;
                    if (duration <= 0) throw new IllegalStateException("MP4 audio duration is invalid");
                    audioDuration = duration / 1000000.0;
                    extractor.selectTrack(track);
                    if (extractor.readSampleData(ByteBuffer.allocate(65536), 0) <= 0)
                        throw new IllegalStateException("MP4 contains no readable audio sample");
                    extractor.unselectTrack(track);
                    foundAudio = true;
                }
            }
        } finally { extractor.release(); }
        if (!foundVideo || (audioPresent && !foundAudio)) throw new IllegalStateException("MP4 is missing a requested media track");
        if (audioPresent && Math.abs(durationSeconds - audioDuration) > 0.5)
            throw new IllegalStateException("Audio/video durations differ by more than 500ms; clip discarded");
    }

    private void cleanup() {
        if (microphone != null) {
            try { if (microphone.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) microphone.stop(); } catch (RuntimeException ignored) { }
            try { microphone.release(); } catch (RuntimeException ignored) { } microphone = null;
        }
        if (video != null) {
            try { video.stop(); } catch (RuntimeException ignored) { }
            try { video.release(); } catch (RuntimeException ignored) { } video = null;
        }
        if (audio != null) {
            try { audio.stop(); } catch (RuntimeException ignored) { }
            try { audio.release(); } catch (RuntimeException ignored) { } audio = null;
        }
        if (muxer != null) {
            try { if (muxerStarted) muxer.stop(); } catch (RuntimeException ignored) { }
            try { muxer.release(); } catch (RuntimeException ignored) { } muxer = null;
        }
        yuv = null;
    }

    private static int clamp(int value) { return Math.max(0, Math.min(255, value)); }

    /** RGBA from Unity ReadPixels is bottom-up. MP4 rows are top-down, BT.601 limited range. */
    static void rgbaToYuv(byte[] rgba, byte[] output, int width, int height, boolean nv12) {
        int plane = width * height;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel = ((height - 1 - y) * width + x) * 4;
                int r = rgba[pixel] & 255, g = rgba[pixel + 1] & 255, b = rgba[pixel + 2] & 255;
                output[y * width + x] = (byte) clamp(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
                if ((y & 1) == 0 && (x & 1) == 0) {
                    // Average chroma over the actual 2x2 block instead of sampling one corner.
                    int sumR = 0, sumG = 0, sumB = 0;
                    for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
                        int p = ((height - 1 - y - dy) * width + x + dx) * 4;
                        sumR += rgba[p] & 255; sumG += rgba[p + 1] & 255; sumB += rgba[p + 2] & 255;
                    }
                    int u = clamp(((-38 * (sumR / 4) - 74 * (sumG / 4) + 112 * (sumB / 4) + 128) >> 8) + 128);
                    int v = clamp(((112 * (sumR / 4) - 94 * (sumG / 4) - 18 * (sumB / 4) + 128) >> 8) + 128);
                    int chroma = (y / 2) * (width / 2) + x / 2;
                    if (nv12) { output[plane + chroma * 2] = (byte) u; output[plane + chroma * 2 + 1] = (byte) v; }
                    else { output[plane + chroma] = (byte) u; output[plane + plane / 4 + chroma] = (byte) v; }
                }
            }
        }
    }
}
