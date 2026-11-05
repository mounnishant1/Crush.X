# Recording target 30 FPS — source candidate, device measurement outstanding

This continues the preserved `feature/crushx-advanced-ar-lens-engine` source after
`d184328`. It does **not** establish a measured 30 FPS recording on OnePlus 9 Pro.
No Unity graphics/readback, Android MediaCodec/AudioRecord or actual camera clip
was executable in this environment.

## Imposed limits and bottlenecks repaired

The previous C# constant and Java validator both capped recording at 15 FPS.
Every video frame also synchronously called `ReadPixels`/`Apply` on the Unity
thread, copied an RGBA image and marshalled it through JNI; `next = now + interval`
accumulated scheduling delay. Java allocated frame descriptors and codec
`BufferInfo` during capture and did redundant RGB reads in YUV conversion.

The new default target is 30 FPS, configurable from 1–30 before capture. A
separate explicit compatibility setting permits at most 15 FPS when asynchronous
GPU readback is unavailable. The selected rate/path/reason are reported; a
compatibility clip is not labelled 30 FPS. Unsupported dimensions/rate/format or
failed GPU calibration reject capture rather than silently manufacturing output.

The normal video path uses three persistent `NativeArray<byte>` slots and
`AsyncGPUReadback.RequestIntoNativeArray` (API verified against Unity 6000.0
reference source). Completed reads are consumed FIFO; a late completion cannot
overtake an earlier image. Busy slots drop a scheduling opportunity rather than
grow a queue. The monotonic deadline pacer stays on its original grid, rejects
repeated source image sequences and skips missed deadlines without burst frames.
Video no longer calls synchronous `ReadPixels`/`Apply` on this path. Photos and
the explicitly labelled compatibility path retain their existing readback.

An asymmetric 2×2 GPU calibration checks actual RGBA channel and byte-row order
before recording. This calibration is never included in media. The native YUV
converter receives the verified bottom-up/top-down layout, preserving the
already-composited camera/effect/export-mirror pixels without an extra rotation.
Camera/session generation, orientation and dimensions remain frozen per clip.
The Built-in render copy still runs after visual effects and before camera UI.
URP capture remains unsupported until its real renderer bridge is implemented.

Cancellation retires only the owned requests. Persistent arrays and the capture
RenderTexture are released after their own callbacks finish; there is no global
`WaitAllRequests` or per-frame GPU wait. A new async recording is blocked while
the prior retirement remains pending, bounding GPU/native-array retention. Normal
Stop drains already-captured FIFO frames before native end-of-stream. Two real
GPU PlayMode tests cover calibration, bounded/FIFO reads and cancellation; they
are authored but **not executed** here and require an actual graphics device.

Java reuses two frame descriptors, codec output metadata and YUV storage, and
converts each 2×2 chroma block without rereading its RGB values. The current JNI
`byte[]` bridge still allocates/copies its argument, and the native encoder still
uses a CPU YUV byte-buffer path. This is **not** a zero-copy Surface/EGL/Vulkan
encoder and has no claimed device thermal or throughput result. Hardware codec
descriptors are preferred when Android reports them; the actual selected name and
hardware-known state are recorded, never equated with measured frame rate.

## Audio and stopping

Audio remains explicit opt-in after microphone permission. A valid real
`AudioTimestamp.TIMEBASE_MONOTONIC` observation anchors PCM sample time to the
video start epoch when available; otherwise metadata labels the PCM-count
fallback. No absent timestamp is replaced with a claimed hardware clock.

User Stop freezes the capture clock and audio boundary immediately while allowing
already-captured video readbacks to drain. PCM is trimmed to that boundary; native
EOS follows FIFO draining. The maximum encoded timeline remains 30 seconds, with
a bounded native drain grace that does not authorize another three seconds of
media. Existing track/dimension/duration/readable-sample and A/V-duration checks
remain; they were not loosened to disguise synchronization errors. Physical lip
sync, microphone startup/clock behavior and codec output remain device gates.
The boundary is a software timestamp/sample-count limit. Microphone stopping is
owned by the encoder worker; immediate hardware cutoff, stop latency and behavior
after a real AudioRecord overrun are not established by these host tests. The
initial timestamp anchor alone cannot prove that every later sample stayed aligned.

Video preview waits for actual VideoPlayer decoding of the completed file. It
does not reuse mutable readback buffers as a supposed encoded poster frame.

## Measured runtime evidence fields

Completed media contains `RecordingMetrics`: requested/selected FPS, path/reason,
calibrated row layout, device/graphics/Unity and actual encoder identification;
rendered/readback/submitted/encoded counts; readback/native/codec drop counters;
skipped deadlines; readback latency; capture-stop elapsed time; actual encoded
presentation endpoints; and the audio clock source/offset. Capture-stop UTC is
separate from completion UTC. These fields also reach local workflow metadata.

`NativeMeasurementsAvailable` becomes true only after counters/endpoints are read
from a completed real native capture. Encoded presentation FPS is derived from
the emitted sample count and actual presentation span, not from the requested
constant. It is an average, not proof of stable cadence; validate packet gaps and
the full media file independently using `tools/validate_captured_media.py` with
`--expected-fps 30` and the documented OnePlus acceptance thresholds.

The pure scheduling/rate/metrics tests execute actual shared source on .NET. Java
host cases validate rate bounds, buffer ownership, row conversion, clock/stop
arithmetic and public JNI method signatures. Such tests do not execute a camera,
GPU readback, Android codec or microphone. Exact current host results are recorded
in the final next-phase verification report; historical phase counts are not
device benchmark results.

## Remaining recording gates

Run interactive graphics PlayMode tests and a genuine Unity Android build, then
record silent/audio clips with real 3D and GPU effects on the actual OnePlus.
Inspect counters and decoded MP4 packet cadence; test all rotations, mirror modes,
safe areas, stop/cancel/max-duration, background/recovery, gallery save and actual
Story/Reel host import. Measure 30 FPS delivery, latency, memory and thermals over
sustained sessions. The missing complete v402 Android host prevents its real
editor integration; source changes alone do not resolve that blocker.
