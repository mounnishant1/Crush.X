#!/usr/bin/env python3
"""Validate a local captured video with ffprobe and a full ffmpeg decode.

No footage leaves this machine. Container/timestamp/decoder evidence does not
establish correct selfie mirroring, visible lens alignment, or perceptual lip sync.
The companion tests generate synthetic clips; they do not test a phone camera.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError, OverflowError):
        return None


def check_timeline(streams, packets, max_av_skew):
    """Check mux decode order; video presentation order may reorder for valid B frames."""
    failures, tracks = [], []
    for stream in streams:
        kind = stream.get('codec_type')
        if kind not in ('video', 'audio'):
            continue
        index = stream.get('index')
        selected = [p for p in packets if p.get('stream_index') == index]
        previous_dts, seen_pts, starts, ends = None, set(), [], []
        if not selected:
            failures.append(f'{kind} stream {index} has no readable packets')
        for packet in selected:
            pts, dts, duration = (number(packet.get(k)) for k in ('pts_time', 'dts_time', 'duration_time'))
            if pts is None or dts is None or duration is None or duration <= 0:
                failures.append(f'{kind} stream {index} has missing or invalid packet timestamps')
                break
            if previous_dts is not None and dts <= previous_dts:
                failures.append(f'{kind} stream {index} has nonmonotonic decode timestamps')
                break
            if pts in seen_pts:
                failures.append(f'{kind} stream {index} has duplicate presentation timestamps')
                break
            previous_dts = dts
            seen_pts.add(pts)
            starts.append(pts)
            ends.append(pts + duration)
        if starts:
            # AAC priming packets may legitimately precede time zero.
            tracks.append({'index': index, 'kind': kind, 'packets': len(starts),
                           'startSeconds': max(0, min(starts)), 'endSeconds': max(ends)})
    video = next((t for t in tracks if t['kind'] == 'video'), None)
    audio = next((t for t in tracks if t['kind'] == 'audio'), None)
    skew = None
    if video and audio:
        skew = {'startSeconds': abs(video['startSeconds'] - audio['startSeconds']),
                'endSeconds': abs(video['endSeconds'] - audio['endSeconds'])}
        if skew['startSeconds'] > max_av_skew or skew['endSeconds'] > max_av_skew:
            failures.append('Audio/video packet timelines exceed the permitted timestamp skew')
    return {'tracks': tracks, 'avTimestampSkew': skew}, failures


def validate_video(path, *, expected_width=None, expected_height=None, orientation='any',
                   expected_duration=None, duration_tolerance=.25, require_audio=False,
                   max_av_skew=.15, ffprobe='ffprobe', ffmpeg='ffmpeg', timeout=60):
    path = Path(path).resolve()
    report = {'input': str(path), 'status': 'FAIL', 'failures': [], 'decodePassed': False,
              'limitations': ['No visual orientation or selfie mirror proof',
                              'No perceptual lip-sync or physical-device certification']}
    for name, value in [('durationTolerance', duration_tolerance), ('maxAvSkew', max_av_skew), ('timeout', timeout)]:
        if number(value) is None or value <= 0:
            report['failures'].append(f'Invalid {name}')
    if orientation not in ('any', 'portrait', 'landscape'):
        report['failures'].append('Invalid expected orientation')
    if expected_duration is not None and (number(expected_duration) is None or expected_duration <= 0):
        report['failures'].append('Invalid expected duration')
    for dimension in (expected_width, expected_height):
        if dimension is not None and (not isinstance(dimension, int) or dimension <= 0):
            report['failures'].append('Invalid expected dimensions')
    if report['failures']:
        return report
    if not path.is_file() or not 0 < path.stat().st_size <= 128 * 1024 * 1024:
        report['failures'].append('Input must be a nonempty local file of at most 128 MiB')
        return report
    report['sizeBytes'] = path.stat().st_size
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    report['sha256'] = digest.hexdigest()
    probe_command = [ffprobe, '-v', 'error', '-show_streams', '-show_format', '-show_packets',
                     '-show_entries', 'stream=index,codec_name,codec_type,width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=format_name,duration:packet=stream_index,pts_time,dts_time,duration_time',
                     '-of', 'json', str(path)]
    try:
        probe = subprocess.run(probe_command, capture_output=True, text=True, timeout=timeout, check=False)
        if probe.returncode:
            report['failures'].append('ffprobe could not read the input: ' + probe.stderr[-2000:].strip())
            return report
        metadata = json.loads(probe.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError) as error:
        report['failures'].append('ffprobe failed: ' + type(error).__name__)
        return report
    streams, packets = metadata.get('streams', []), metadata.get('packets', [])
    videos = [s for s in streams if s.get('codec_type') == 'video']
    audios = [s for s in streams if s.get('codec_type') == 'audio']
    report['streams'] = [{'index': s.get('index'), 'type': s.get('codec_type'), 'codec': s.get('codec_name')} for s in streams]
    report['hasAudio'] = bool(audios)
    if len(videos) != 1:
        report['failures'].append('Expected exactly one video stream')
        return report
    video = videos[0]
    width, height = video.get('width', 0), video.get('height', 0)
    rotation = number(next((item['rotation'] for item in video.get('side_data_list', []) if 'rotation' in item),
                           video.get('tags', {}).get('rotate', 0)))
    if rotation is None or rotation % 90 != 0:
        report['failures'].append('Video has unsupported display rotation metadata')
        return report
    rotation = int(rotation) % 360
    if rotation in (90, 270):
        width, height = height, width
    report['displayWidth'], report['displayHeight'], report['rotationDegrees'] = width, height, rotation
    if width <= 0 or height <= 0:
        report['failures'].append('Video has invalid display dimensions')
    if expected_width is not None and width != expected_width:
        report['failures'].append('Display width does not match expected width')
    if expected_height is not None and height != expected_height:
        report['failures'].append('Display height does not match expected height')
    if orientation == 'portrait' and height <= width:
        report['failures'].append('Expected portrait display orientation')
    if orientation == 'landscape' and width <= height:
        report['failures'].append('Expected landscape display orientation')
    if require_audio and not audios:
        report['failures'].append('Required microphone audio stream is missing')
    duration = number(metadata.get('format', {}).get('duration'))
    report['durationSeconds'] = duration
    if duration is None or duration <= 0:
        report['failures'].append('Video duration must be positive and finite')
    elif expected_duration is not None and abs(duration - expected_duration) > duration_tolerance:
        report['failures'].append('Video duration is outside expected tolerance')
    timeline, failures = check_timeline(streams, packets, max_av_skew)
    report['timeline'] = timeline
    report['failures'].extend(failures)
    for track in timeline['tracks']:
        if duration is not None and abs(track['endSeconds'] - duration) > max(duration_tolerance, max_av_skew):
            report['failures'].append(f"{track['kind']} packet timeline does not reach the declared duration")
    decode_command = [ffmpeg, '-v', 'error', '-xerror', '-err_detect', 'explode', '-i', str(path),
                      '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-']
    try:
        decode = subprocess.run(decode_command, capture_output=True, text=True, timeout=timeout, check=False)
        report['decodePassed'] = decode.returncode == 0
        if decode.returncode:
            report['failures'].append('ffmpeg could not fully decode the input: ' + decode.stderr[-2000:].strip())
    except (OSError, subprocess.TimeoutExpired) as error:
        report['failures'].append('ffmpeg decode failed: ' + type(error).__name__)
    report['status'] = 'PASS' if not report['failures'] else 'FAIL'
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--expected-width', type=int)
    parser.add_argument('--expected-height', type=int)
    parser.add_argument('--expected-orientation', choices=['any', 'portrait', 'landscape'], default='any')
    parser.add_argument('--expected-duration', type=float)
    parser.add_argument('--duration-tolerance', type=float, default=.25)
    parser.add_argument('--require-audio', action='store_true')
    parser.add_argument('--max-av-skew', type=float, default=.15)
    parser.add_argument('--timeout', type=float, default=60)
    parser.add_argument('--ffprobe', default='ffprobe')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    if args.output:
        same_file = args.output.resolve() == args.input.resolve()
        if args.output.exists() and args.input.exists():
            same_file = same_file or args.output.samefile(args.input)
        if same_file:
            parser.error('Evidence output must not overwrite the input media, including file aliases.')
    report = validate_video(args.input, expected_width=args.expected_width, expected_height=args.expected_height,
                            orientation=args.expected_orientation, expected_duration=args.expected_duration,
                            duration_tolerance=args.duration_tolerance, require_audio=args.require_audio,
                            max_av_skew=args.max_av_skew, timeout=args.timeout, ffprobe=args.ffprobe, ffmpeg=args.ffmpeg)
    encoded = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end='')
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
