package in.crushx.lens.capture;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioTimestamp;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaRecorder;
import android.os.SystemClock;
import android.os.Build;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Private local rendered-frame capture; never opens the camera or publishes files.
 * Bounded CPU RGBA -> AVC byte-buffer pipeline, at most 1280 pixels/side, 30fps, 30s.
 * Configured frame rate is a target, not a measured sustained device result.
 * Android codecs are probed, not assumed. Unsupported buffer formats fail explicitly.
 * All encoder/muxer/audio objects belong to one worker thread.
 */
public final class CrushXMediaRecorder {
    private static final String AVC = "video/avc";
    private static final String AAC = "audio/mp4a-latm";
    private static final int SAMPLE_RATE = 44100;
    private static final long MAX_NANOS = TimeUnit.SECONDS.toNanos(30);
    private static final long INPUT_DRAIN_GRACE_NANOS = TimeUnit.SECONDS.toNanos(3);
    private static final long FRAME_TIMEOUT_NANOS = TimeUnit.SECONDS.toNanos(3);
    private static final int MAX_PENDING_BYTES = 2 * 1024 * 1024;
    private final ArrayBlockingQueue<Frame> frames = new ArrayBlockingQueue<>(1);
    private final FramePool framePool = new FramePool(2);
    private volatile String state = "idle", error = "";
    private volatile boolean stopping, discard, audioPresent;
    private volatile long startNs;
    private volatile double durationSeconds;
    private volatile long startedUnixMillis, firstVideoPts = -1, encodedVideoFrames;
    private volatile long acceptedFrames, rejectedFrames, encoderDroppedFrames, queuedFrames;
    private volatile long captureStoppedNs;
    private volatile long captureStopMicroseconds = -1;
    private volatile long firstEncodedPresentationMicroseconds = -1, lastEncodedPresentationMicroseconds = -1;
    private volatile String selectedEncoderName = "";
    private volatile boolean encoderHardwareKnown, encoderHardwareAccelerated;
    private long lastEncodedNs;
    private Thread worker;
    private String path;
    private int width, height, fps, colorFormat;
    private boolean inputRowsBottomUp = true;
    private MediaCodec video, audio;
    private MediaMuxer muxer;
    private AudioRecord microphone;
    private int videoTrack = -1, audioTrack = -1, videoSamples, audioSamples, pendingBytes;
    private boolean muxerStarted, videoEos, audioEos;
    private long audioPcmFrames;
    private volatile long lastVideoPts = -1;
    private AudioTimestamp audioTimestamp;
    private boolean audioClockAnchored;
    private boolean microphoneStopped;
    private volatile String audioClockSource = "no-audio";
    private volatile long audioStartOffsetMicroseconds;
    private byte[] yuv;
    private MediaCodec.BufferInfo videoOutputInfo, audioOutputInfo, pendingOutputInfo;
    private final ArrayList<Packet> pending = new ArrayList<>();

    private static final class Choice {
        final String name; final int format; final boolean hardwareKnown, hardwareAccelerated;
        Choice(String name, int format, boolean hardwareKnown, boolean hardwareAccelerated) {
            this.name = name; this.format = format;
            this.hardwareKnown = hardwareKnown; this.hardwareAccelerated = hardwareAccelerated;
        }
    }
    static final class Frame {
        byte[] rgba; long timestamp;
        private final FramePool owner;
        private boolean leased;
        private Frame(FramePool owner) { this.owner = owner; }
    }

    /** Pools descriptors, not image copies. JNI supplies an owned byte[]; release drops its
     * reference as soon as conversion completes. One encoding and one pending frame are bounded. */
    static final class FramePool {
        private final ArrayBlockingQueue<Frame> available;
        FramePool(int capacity) {
            if (capacity < 1 || capacity > 3) throw new IllegalArgumentException("Frame pool capacity must be 1..3");
            available = new ArrayBlockingQueue<>(capacity);
            for (int i = 0; i < capacity; i++) available.add(new Frame(this));
        }
        synchronized Frame acquire(byte[] rgba, long timestamp) {
            Frame frame = available.poll();
            if (frame == null) return null;
            frame.rgba = rgba; frame.timestamp = timestamp; frame.leased = true;
            return frame;
        }
        synchronized void release(Frame frame) {
            if (frame == null || frame.owner != this || !frame.leased)
                throw new IllegalArgumentException("Frame lease does not belong to this pool");
            frame.rgba = null; frame.timestamp = 0; frame.leased = false;
            if (!available.offer(frame)) throw new IllegalStateException("Frame pool over-release");
        }
        int availableCount() { return available.size(); }
    }
    private static final class Packet {
        final int track; final byte[] bytes; final long pts; final int flags;
        Packet(int track, byte[] bytes, long pts, int flags) { this.track = track; this.bytes = bytes; this.pts = pts; this.flags = flags; }
    }

    public static boolean isSupported() {
        try { return findEncoder(0, 0, 30) != null; }
        catch (RuntimeException unsupported) { return false; }
    }

    public static boolean isSupportedSize(int width, int height, int fps) {
        try { validateDimensions(width, height, fps); return findEncoder(width, height, fps) != null; }
        catch (RuntimeException unsupported) { return false; }
    }

    private static Choice findEncoder(int width, int height, int fps) {
        Choice compatibleFallback = null;
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            for (String type : info.getSupportedTypes()) {
                if (!AVC.equalsIgnoreCase(type)) continue;
                MediaCodecInfo.CodecCapabilities caps;
                try { caps = info.getCapabilitiesForType(type); }
                catch (RuntimeException invalidCodec) { continue; }
                if (width > 0 && !caps.getVideoCapabilities().areSizeAndRateSupported(width, height, fps)) continue;
                // Flexible YUV420 does not specify a byte-buffer layout. Require an explicit
                // planar/NV12 format instead of sending guessed YUV bytes to a surface codec.
                for (int format : caps.colorFormats)
                    if (format == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
                        || format == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar) {
                        boolean known = Build.VERSION.SDK_INT >= 29;
                        boolean hardware = known && info.isHardwareAccelerated();
                        Choice choice = new Choice(info.getName(), format, known, hardware);
                        if (hardware) return choice;
                        if (compatibleFallback == null) compatibleFallback = choice;
                        break;
                    }
            }
        }
        // Older Android cannot report hardware acceleration reliably. Retain compatibility,
        // while exposing that unknown/software state rather than claiming measured throughput.
        return compatibleFallback;
    }

    public synchronized void start(String outputPath, int frameWidth, int frameHeight, int framesPerSecond, boolean withAudio) {
        if (worker != null) throw new IllegalStateException("Recorder instances cannot be reused");
        validateDimensions(frameWidth, frameHeight, framesPerSecond);
        if (outputPath == null || outputPath.isEmpty()) throw new IllegalArgumentException("Output path is required");
        File output = new File(outputPath);
        if (!output.isAbsolute() || output.exists() || !outputPath.endsWith(".mp4"))
            throw new IllegalArgumentException("Expected a new absolute private MP4 path");
        path = outputPath; width = frameWidth; height = frameHeight; fps = framesPerSecond;
        audioPresent = withAudio; state = "preparing";
        worker = new Thread(this::encode, "CrushXMediaEncoder");
        worker.start();
    }

    public synchronized void setInputRowsBottomUp(boolean bottomUp) {
        if (worker != null) throw new IllegalStateException("Input row orientation is frozen once recording starts");
        inputRowsBottomUp = bottomUp;
    }
    public boolean getInputRowsBottomUp() { return inputRowsBottomUp; }

    public boolean canAcceptFrame() {
        return "recording".equals(state) && !stopping && frames.remainingCapacity() > 0 && framePool.availableCount() > 0;
    }

    public boolean offerFrame(byte[] rgba) {
        return offerFrame(rgba, 0L);
    }

    /** Age measured by Unity's monotonic clock accounts for readback time without mixing clock epochs. */
    public synchronized boolean offerFrame(byte[] rgba, long ageMicroseconds) {
        if (!canAcceptFrame()) { rejectedFrames++; return false; }
        if (rgba == null || rgba.length != width * height * 4) throw new IllegalArgumentException("Incorrect RGBA frame size");
        if (ageMicroseconds < 0 || ageMicroseconds > 3000000L) throw new IllegalArgumentException("Captured frame is stale");
        long pts = presentationTime((System.nanoTime() - startNs) / 1000, ageMicroseconds);
        if (!videoTimestampWithinBoundary(pts, captureStopMicroseconds)) { rejectedFrames++; return false; }
        Frame frame = framePool.acquire(rgba, pts);
        if (frame == null) { rejectedFrames++; return false; }
        if (!frames.offer(frame)) { framePool.release(frame); rejectedFrames++; return false; }
        acceptedFrames++;
        return true;
    }

    public synchronized void stop(boolean deleteOutput) {
        markCaptureStopped();
        discard |= deleteOutput;
        stopping = true;
        if (worker == null && deleteOutput && path != null) new File(path).delete();
        // No worker join on Unity's UI thread: completion/error is explicitly polled.
    }
    public String getState() { return state; }
    public String getError() { return error; }
    public boolean hasAudio() { return audioPresent; }
    public double getDurationSeconds() { return durationSeconds; }
    public long getStartedUnixMillis() { return startedUnixMillis; }
    public long getEncodedFrameCount() { return encodedVideoFrames; }
    public long getFirstEncodedPresentationMicroseconds() { return firstEncodedPresentationMicroseconds; }
    public long getLastEncodedPresentationMicroseconds() { return lastEncodedPresentationMicroseconds; }
    public long getAcceptedFrameCount() { return acceptedFrames; }
    public long getRejectedFrameCount() { return rejectedFrames; }
    public long getEncoderDroppedFrameCount() { return encoderDroppedFrames; }
    public long getQueuedFrameCount() { return queuedFrames; }
    public int getRequestedFrameRate() { return fps; }
    public long getLastVideoPresentationMicroseconds() { return lastVideoPts; }
    public String getEncoderName() { return selectedEncoderName; }
    public boolean isEncoderHardwareKnown() { return encoderHardwareKnown; }
    public boolean isEncoderHardwareAccelerated() { return encoderHardwareAccelerated; }
    public String getAudioClockSource() { return audioClockSource; }
    public double getAudioStartOffsetSeconds() { return audioStartOffsetMicroseconds / 1000000.0; }
    public double getCaptureElapsedSeconds() {
        if (startNs == 0) return 0;
        return Math.min(30d, Math.max(0, (captureStoppedNs == 0 ? System.nanoTime() : captureStoppedNs) - startNs) / 1000000000.0);
    }
    /** Freeze media time now, but keep accepting already captured GPU frames until stop(false).
     * The encoder worker owns AudioRecord; no microphone operation runs on Unity's UI thread. */
    public synchronized void markCaptureStopped() {
        if (startNs == 0 || captureStopMicroseconds >= 0) return;
        captureStopMicroseconds = Math.min(MAX_NANOS / 1000, Math.max(0, (System.nanoTime() - startNs) / 1000));
        captureStoppedNs = startNs + captureStopMicroseconds * 1000;
    }
    public double getFirstFrameOffsetSeconds() { return Math.max(0, firstVideoPts) / 1000000.0; }

    static void validateDimensions(int width, int height, int fps) {
        if (width < 2 || height < 2 || (width & 1) != 0 || (height & 1) != 0
            || width > 1280 || height > 1280 || fps < 1 || fps > 30)
            throw new IllegalArgumentException("Expected even dimensions <=1280 and 1..30fps");
    }

    static long presentationTime(long elapsedMicroseconds, long ageMicroseconds) {
        if (elapsedMicroseconds < 0 || ageMicroseconds < 0) throw new IllegalArgumentException("Negative frame time");
        return Math.max(0L, elapsedMicroseconds - ageMicroseconds);
    }

    static boolean frameProgressTimedOut(long nowNs, long lastOutputNs) {
        return nowNs >= lastOutputNs && nowNs - lastOutputNs >= FRAME_TIMEOUT_NANOS;
    }

    static boolean videoTimestampWithinBoundary(long pts, long boundaryUs) {
        long limit = boundaryUs < 0 ? MAX_NANOS / 1000 : Math.min(MAX_NANOS / 1000, boundaryUs);
        return pts >= 0 && pts < limit;
    }

    static long remainingAudioFrames(long boundaryUs, long offsetUs, long consumed, int sampleRate) {
        if (offsetUs < 0 || consumed < 0 || sampleRate <= 0) throw new IllegalArgumentException("Invalid PCM clock boundary");
        long limit = boundaryUs < 0 ? MAX_NANOS / 1000 : Math.min(MAX_NANOS / 1000, boundaryUs);
        long total = Math.max(0, limit - offsetUs) * sampleRate / 1000000L;
        return Math.max(0, total - consumed);
    }

    static boolean inputDrainTimedOut(long elapsedNs, long boundaryUs) {
        return boundaryUs >= 0 && elapsedNs >= Math.min(MAX_NANOS / 1000, boundaryUs) * 1000 + INPUT_DRAIN_GRACE_NANOS;
    }

    /** A real AudioTimestamp identifies the capture time of a hardware PCM frame.
     * Project its frame position back to the first sample and the video monotonic epoch. */
    static long audioClockOffsetMicroseconds(long videoStartNs, long timestampNs, long framePosition, int sampleRate) {
        if (videoStartNs < 0 || timestampNs < videoStartNs || framePosition < 0 || sampleRate <= 0
            || timestampNs - videoStartNs > TimeUnit.SECONDS.toNanos(35)
            || framePosition > 35L * sampleRate)
            throw new IllegalArgumentException("Audio capture timestamp is outside the recording interval");
        long offset = (timestampNs - videoStartNs) / 1000L - framePosition * 1000000L / sampleRate;
        if (offset < -100000L || offset > 1000000L)
            throw new IllegalArgumentException("Audio capture clock cannot be associated with the video epoch");
        return Math.max(0, offset);
    }

    private void encode() {
        boolean success = false;
        try {
            Choice choice = findEncoder(width, height, fps);
            if (choice == null) throw new IllegalStateException("No advertised planar/NV12 AVC encoder supports these dimensions");
            colorFormat = choice.format;
            selectedEncoderName = choice.name;
            encoderHardwareKnown = choice.hardwareKnown;
            encoderHardwareAccelerated = choice.hardwareAccelerated;
            MediaFormat format = MediaFormat.createVideoFormat(AVC, width, height);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat);
            format.setInteger(MediaFormat.KEY_BIT_RATE, Math.max(750000, width * height * 5));
            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
            video = MediaCodec.createByCodecName(choice.name);
            video.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            video.start();
            videoOutputInfo = new MediaCodec.BufferInfo();
            audioOutputInfo = new MediaCodec.BufferInfo();
            pendingOutputInfo = new MediaCodec.BufferInfo();
            yuv = new byte[width * height * 3 / 2];
            muxer = new MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            // Pixels already have the frozen preview orientation. Do not also rotate MP4 metadata.
            if (audioPresent) prepareAudio();
            if (discard) throw new IllegalStateException("Recording cancelled");
            startNs = System.nanoTime();
            startedUnixMillis = System.currentTimeMillis();
            lastEncodedNs = startNs;
            if (microphone != null) {
                microphone.startRecording();
                if (microphone.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING)
                    throw new IllegalStateException("Microphone did not enter the recording state");
            }
            state = "recording";
            while ((!stopping || !frames.isEmpty()) && !discard) {
                if (System.nanoTime() - startNs >= MAX_NANOS) {
                    markCaptureStopped();
                }
                if (inputDrainTimedOut(System.nanoTime() - startNs, captureStopMicroseconds))
                    synchronized (this) { stopping = true; }
                Frame frame = frames.poll(5, TimeUnit.MILLISECONDS);
                if (frame != null) {
                    try { queueVideo(frame); }
                    finally { framePool.release(frame); }
                }
                queueAudio(false);
                drain(video, true);
                if (audio != null) drain(audio, false);
                if (!stopping && captureStopMicroseconds < 0 && frameProgressTimedOut(System.nanoTime(), lastEncodedNs))
                    throw new IllegalStateException("Video encoder produced no frame for 3 seconds; capture discarded");
            }
            if (discard) throw new IllegalStateException("Recording cancelled");
            synchronized (this) {
                stopping = true;
                state = "finalizing";
                markCaptureStopped();
            }
            stopMicrophoneCapture();
            queueEndOfStream(video, captureStopMicroseconds);
            if (audio != null) queueEndOfStream(audio, audioStartOffsetMicroseconds + audioPcmFrames * 1000000L / SAMPLE_RATE);
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
            // Close submissions under the same lock as offerFrame before draining/releasing
            // resources, including exceptional exits. No late JNI payload can outlive cleanup.
            synchronized (this) { stopping = true; }
            cleanup();
            Frame remaining;
            while ((remaining = frames.poll()) != null) framePool.release(remaining);
            pending.clear();
            if (captureStoppedNs == 0 && startNs != 0) captureStoppedNs = System.nanoTime();
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
        audioTimestamp = new AudioTimestamp();
        audioClockSource = "awaiting-first-pcm";
    }

    private void queueVideo(Frame frame) throws Exception {
        int index = video.dequeueInputBuffer(5000);
        if (index < 0) { encoderDroppedFrames++; return; } // Timestamps preserve actual wall-clock timing.
        ByteBuffer input = video.getInputBuffer(index);
        if (input == null || input.capacity() < yuv.length) throw new IllegalStateException("AVC input buffer is smaller than a frame");
        rgbaToYuv(frame.rgba, yuv, width, height,
            colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar, inputRowsBottomUp);
        input.clear(); input.put(yuv);
        long pts = Math.max(lastVideoPts + 1, frame.timestamp);
        video.queueInputBuffer(index, 0, yuv.length, pts, 0);
        queuedFrames++;
        if (firstVideoPts < 0) firstVideoPts = pts;
        lastVideoPts = pts;
    }

    private void queueAudio(boolean end) {
        if (audio == null || microphone == null || end) return;
        long remaining = remainingAudioFrames(captureStopMicroseconds, audioStartOffsetMicroseconds, audioPcmFrames, SAMPLE_RATE);
        if (remaining == 0) { stopMicrophoneCapture(); return; }
        int index = audio.dequeueInputBuffer(0);
        if (index < 0) return;
        ByteBuffer input = audio.getInputBuffer(index);
        if (input == null) throw new IllegalStateException("AAC input buffer unavailable");
        input.clear();
        int maximumBytes = (int)Math.min(remaining * 2, Math.min(input.capacity(), 8192));
        int count = microphone.read(input, maximumBytes, AudioRecord.READ_NON_BLOCKING);
        if (count < 0) throw new IllegalStateException("Microphone read failed with code " + count);
        count &= ~1; // mono PCM16 frames
        if (count > 0 && !audioClockAnchored) {
            // The timestamp is queried once: changing epochs after samples have been queued
            // would create discontinuities. Unsupported timestamps remain explicitly labeled.
            audioClockSource = "pcm-count-fallback";
            try {
                if (microphone.getTimestamp(audioTimestamp, AudioTimestamp.TIMEBASE_MONOTONIC) == AudioRecord.SUCCESS) {
                    audioStartOffsetMicroseconds = audioClockOffsetMicroseconds(startNs, audioTimestamp.nanoTime,
                        audioTimestamp.framePosition, SAMPLE_RATE);
                    audioClockSource = "AudioTimestamp.MONOTONIC";
                }
            } catch (RuntimeException unavailableTimestamp) { audioStartOffsetMicroseconds = 0; }
            audioClockAnchored = true;
        }
        boolean reachedBoundary;
        synchronized (this) {
            // The UI stop boundary and the final PCM trim/queue operation must be atomic.
            // AudioRecord.read stays outside this lock; a concurrent stop can shorten its result.
            count = (int)Math.min(count, remainingAudioFrames(captureStopMicroseconds, audioStartOffsetMicroseconds, audioPcmFrames, SAMPLE_RATE) * 2);
            long pts = audioStartOffsetMicroseconds + audioPcmFrames * 1000000L / SAMPLE_RATE;
            audioPcmFrames += count / 2;
            audio.queueInputBuffer(index, 0, count, pts, 0);
            reachedBoundary = remainingAudioFrames(captureStopMicroseconds, audioStartOffsetMicroseconds, audioPcmFrames, SAMPLE_RATE) == 0;
        }
        if (reachedBoundary) stopMicrophoneCapture();
    }

    private void stopMicrophoneCapture() {
        if (microphone == null || microphoneStopped) return;
        microphone.stop(); microphoneStopped = true;
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
        MediaCodec.BufferInfo info = isVideo ? videoOutputInfo : audioOutputInfo;
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
                    if (isVideo) {
                        videoSamples++; encodedVideoFrames++; lastEncodedNs = System.nanoTime();
                        if (firstEncodedPresentationMicroseconds < 0 || info.presentationTimeUs < firstEncodedPresentationMicroseconds)
                            firstEncodedPresentationMicroseconds = info.presentationTimeUs;
                        lastEncodedPresentationMicroseconds = Math.max(lastEncodedPresentationMicroseconds, info.presentationTimeUs);
                    }
                    else audioSamples++;
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
            MediaCodec.BufferInfo info = pendingOutputInfo;
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
        rgbaToYuv(rgba, output, width, height, nv12, true);
    }

    /** Async GPU readback may use a different backend row origin; its real calibration freezes this flag. */
    static void rgbaToYuv(byte[] rgba, byte[] output, int width, int height, boolean nv12, boolean bottomUp) {
        validateDimensions(width, height, 1);
        int plane = width * height;
        if (rgba == null || output == null || rgba.length != plane * 4 || output.length != plane * 3 / 2)
            throw new IllegalArgumentException("RGBA/YUV buffer lengths do not match dimensions");
        // Process each 2x2 block once. The previous loop read the same RGB block
        // twice for luma/chroma; this keeps identical BT.601 integer rounding.
        for (int y = 0; y < height; y += 2) {
            for (int x = 0; x < width; x += 2) {
                int sumR = 0, sumG = 0, sumB = 0;
                for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
                    int row = bottomUp ? height - 1 - y - dy : y + dy;
                    int pixel = (row * width + x + dx) * 4;
                    int r = rgba[pixel] & 255, g = rgba[pixel + 1] & 255, b = rgba[pixel + 2] & 255;
                    output[(y + dy) * width + x + dx] = (byte) clamp(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
                    sumR += r; sumG += g; sumB += b;
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
