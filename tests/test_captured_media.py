"""Synthetic ffmpeg clips test the validator, never a phone or camera pipeline."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().with_name('validate_captured_media.py')
if not TOOL.exists():
    TOOL = Path(__file__).resolve().parents[1] / 'tools/validate_captured_media.py'
SPEC = importlib.util.spec_from_file_location('captured_media_validator', TOOL)
MEDIA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEDIA)


class TimelineTests(unittest.TestCase):
    def test_reordered_video_presentation_is_valid_but_decode_order_must_advance(self):
        streams = [{'index': 0, 'codec_type': 'video'}]
        packets = [{'stream_index': 0, 'pts_time': pts, 'dts_time': dts, 'duration_time': .1}
                   for pts, dts in [(0, -.2), (.2, -.1), (.1, 0)]]
        self.assertEqual([], MEDIA.check_timeline(streams, packets, .15)[1])
        packets[-1]['dts_time'] = -.1
        self.assertIn('nonmonotonic', MEDIA.check_timeline(streams, packets, .15)[1][0])

    def test_duplicate_pts_and_audio_video_timeline_skew_are_rejected(self):
        streams = [{'index': 0, 'codec_type': 'video'}, {'index': 1, 'codec_type': 'audio'}]
        packets = [{'stream_index': 0, 'pts_time': 0, 'dts_time': 0, 'duration_time': .1},
                   {'stream_index': 0, 'pts_time': 0, 'dts_time': .1, 'duration_time': .1},
                   {'stream_index': 1, 'pts_time': .5, 'dts_time': .5, 'duration_time': .1}]
        failures = MEDIA.check_timeline(streams, packets, .15)[1]
        self.assertTrue(any('duplicate' in f for f in failures))
        self.assertTrue(any('timestamp skew' in f for f in failures))


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Requires local ffmpeg and ffprobe; no camera is tested.')
class SyntheticMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory(prefix='crushx-synthetic-media-')
        cls.folder = Path(cls.scratch.name)
        cls.clip = cls.folder / 'synthetic-portrait-av.mp4'
        cls.silent = cls.folder / 'synthetic-portrait-silent.mp4'
        cls.rotated = cls.folder / 'synthetic-display-rotation.mp4'
        cls.offset_audio = cls.folder / 'synthetic-offset-audio.mp4'
        command = ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x96:rate=10:duration=1.2',
                   '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.2',
                   '-c:v', 'libx264', '-bf', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(cls.clip)]
        subprocess.run(command, capture_output=True, check=True, timeout=30)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(cls.clip), '-c:v', 'copy', '-an', str(cls.silent)],
                       capture_output=True, check=True, timeout=30)
        # Older FFmpeg accepts a rotate tag when remuxing. Recent FFmpeg uses
        # display_rotation instead. Verify the actual generated display matrix.
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(cls.clip), '-c', 'copy', '-metadata:s:v:0', 'rotate=90', str(cls.rotated)],
                       capture_output=True, check=True, timeout=30)
        rotation_probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                         'stream_side_data=rotation', '-of', 'json', str(cls.rotated)],
                                        capture_output=True, text=True, check=True, timeout=10)
        if not any('rotation' in item for stream in json.loads(rotation_probe.stdout).get('streams', [])
                   for item in stream.get('side_data_list', [])):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-display_rotation:v:0', '90', '-i', str(cls.clip), '-c', 'copy', str(cls.rotated)],
                           capture_output=True, check=True, timeout=30)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(cls.clip), '-itsoffset', '0.3', '-i', str(cls.clip),
                        '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', str(cls.offset_audio)],
                       capture_output=True, check=True, timeout=30)

    @classmethod
    def tearDownClass(cls):
        cls.scratch.cleanup()

    def test_real_synthetic_av_clip_is_decodable_and_meets_metadata_expectations(self):
        report = MEDIA.validate_video(self.clip, expected_width=64, expected_height=96, orientation='portrait',
                                      expected_duration=1.2, duration_tolerance=.05, require_audio=True)
        self.assertEqual('PASS', report['status'], report)
        self.assertTrue(report['decodePassed'])
        self.assertTrue(report['hasAudio'])
        self.assertEqual(64, len(report['sha256']))
        self.assertIn('No perceptual lip-sync', ' '.join(report['limitations']))

    def test_dummy_mp4_and_truncated_real_output_are_rejected(self):
        dummy = self.folder / 'dummy.mp4'
        dummy.write_bytes(b'\0\0\0\x18ftypisom' + b'\0' * 200)
        self.assertEqual('FAIL', MEDIA.validate_video(dummy)['status'])
        truncated = self.folder / 'truncated.mp4'
        content = self.clip.read_bytes()
        truncated.write_bytes(content[:len(content) // 2])
        self.assertEqual('FAIL', MEDIA.validate_video(truncated)['status'])

    def test_wrong_orientation_and_dimensions_fail(self):
        report = MEDIA.validate_video(self.clip, expected_width=96, expected_height=64, orientation='landscape')
        self.assertEqual('FAIL', report['status'])
        self.assertIn('Expected landscape display orientation', report['failures'])

    def test_missing_audio_and_wrong_duration_fail(self):
        missing = MEDIA.validate_video(self.silent, require_audio=True)
        self.assertEqual('FAIL', missing['status'])
        self.assertIn('Required microphone audio stream is missing', missing['failures'])
        self.assertEqual('FAIL', MEDIA.validate_video(self.clip, expected_duration=5, duration_tolerance=.1)['status'])

    def test_actual_display_rotation_metadata_changes_effective_dimensions(self):
        report = MEDIA.validate_video(self.rotated, expected_width=96, expected_height=64, orientation='landscape')
        self.assertEqual('PASS', report['status'], report)
        self.assertIn(report['rotationDegrees'], (90, 270))
        self.assertEqual('FAIL', MEDIA.validate_video(self.rotated, orientation='portrait')['status'])

    def test_actual_muxed_audio_timestamp_offset_is_rejected(self):
        report = MEDIA.validate_video(self.offset_audio, require_audio=True, max_av_skew=.15)
        self.assertEqual('FAIL', report['status'])
        self.assertTrue(any('timestamp skew' in failure for failure in report['failures']), report)

    def test_cli_reports_actual_evidence_and_never_overwrites_media(self):
        evidence = self.folder / 'evidence.json'
        result = subprocess.run([sys.executable, str(TOOL), '--input', str(self.clip), '--require-audio', '--output', str(evidence)],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual('PASS', json.loads(evidence.read_text())['status'])
        original = self.clip.read_bytes()
        result = subprocess.run([sys.executable, str(TOOL), '--input', str(self.clip), '--output', str(self.clip)],
                                capture_output=True, text=True, timeout=10)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(original, self.clip.read_bytes())
        for alias in (self.folder / 'media-alias.json', self.folder / 'media-hardlink.json'):
            if 'hardlink' in alias.name:
                alias.hardlink_to(self.clip)
            else:
                alias.symlink_to(self.clip)
            result = subprocess.run([sys.executable, str(TOOL), '--input', str(self.clip), '--output', str(alias)],
                                    capture_output=True, text=True, timeout=10)
            self.assertNotEqual(0, result.returncode)
            self.assertEqual(original, self.clip.read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
