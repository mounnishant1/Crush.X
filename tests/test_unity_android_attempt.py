"""Build-tool orchestration tests use mocked process results, never a Unity build."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

TOOL = Path(__file__).resolve().parents[1] / 'tools/attempt_unity_android_build.py'
SPEC = importlib.util.spec_from_file_location('unity_android_attempt', TOOL)
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class BuildAttemptToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='crushx-build-tool-tests-')
        self.repository = Path(self.temp.name) / 'source'
        settings = self.repository / 'UnityProjects/CrushXLensEngine/ProjectSettings'
        settings.mkdir(parents=True)
        (settings / 'ProjectVersion.txt').write_text('m_EditorVersion: 6000.0.30f1\n')
        self.output = Path(self.temp.name) / 'evidence'
        self.git = mock.patch.object(BUILD, 'git_value', side_effect=lambda _repo, *args:
            'a' * 40 if args[0] == 'rev-parse' else 'feature/test' if args[0] == 'branch' else '')
        self.git.start()

    def tearDown(self):
        self.git.stop()
        self.temp.cleanup()

    def test_missing_editor_records_exact_block_before_compilation(self):
        runner = mock.Mock(side_effect=FileNotFoundError(2, 'No such file or directory', 'Unity'))
        report = BUILD.attempt(self.repository, self.output, execute=True, runner=runner)
        self.assertEqual('BLOCKED', report['status'])
        self.assertFalse(report['processStarted'])
        self.assertIsNone(report['apk'])
        self.assertEqual('FileNotFoundError', report['errorType'])
        self.assertFalse(report['deviceInstalled'])
        self.assertIn('DevelopmentApk', ' '.join(report['command']))
        self.assertEqual(report, json.loads((self.output / 'build-attempt.json').read_text()))

    def test_zero_process_exit_cannot_fake_a_successful_missing_apk(self):
        report = BUILD.attempt(self.repository, self.output, execute=True,
            runner=mock.Mock(return_value=subprocess.CompletedProcess([], 0, '', '')))
        self.assertEqual('FAIL', report['status'])
        self.assertTrue(report['processStarted'])
        self.assertIsNone(report['apk'])
        self.assertIn('nonempty', report['error'])

    def test_nonzero_exit_and_timeout_are_never_success(self):
        runner = mock.Mock(return_value=subprocess.CompletedProcess([], 1, 'test output', 'compiler failure'))
        report = BUILD.attempt(self.repository, self.output, execute=True, runner=runner)
        self.assertEqual('FAIL', report['status'])
        self.assertEqual('compiler failure', (self.output / 'unity-stderr.log').read_text())
        other = Path(self.temp.name) / 'timeout'
        report = BUILD.attempt(self.repository, other, execute=True,
            runner=mock.Mock(side_effect=subprocess.TimeoutExpired('Unity', 30)))
        self.assertEqual('FAIL', report['status'])
        self.assertEqual('TimeoutExpired', report['errorType'])
        self.assertIsNone(report['apk'])

    def test_evidence_and_unity_source_cannot_be_overwritten(self):
        self.output.mkdir()
        existing = self.output / 'keep.txt'
        existing.write_text('previous evidence')
        with self.assertRaisesRegex(ValueError, 'existing results'):
            BUILD.attempt(self.repository, self.output)
        self.assertEqual('previous evidence', existing.read_text())
        with self.assertRaisesRegex(ValueError, 'outside the Unity project'):
            BUILD.attempt(self.repository, self.repository / 'UnityProjects/CrushXLensEngine/Builds')

    def test_production_package_and_unbounded_timeout_are_refused(self):
        for package in ('in.crushx.app', 'in.crushx.lens.devtest\n', 'in.crushx.lens.devtest/other'):
            with self.assertRaisesRegex(ValueError, 'isolated'):
                BUILD.attempt(self.repository, self.output, package=package)
        for timeout in (0, 29, 10801):
            with self.assertRaisesRegex(ValueError, 'timeout'):
                BUILD.attempt(self.repository, self.output, timeout=timeout)

    def test_preflight_does_not_invoke_the_build_runner(self):
        runner = mock.Mock()
        report = BUILD.attempt(self.repository, self.output, execute=False, runner=runner)
        runner.assert_not_called()
        self.assertFalse(report['processStarted'])
        self.assertIsNone(report['apk'])

    def test_mismatched_metadata_and_non_apk_files_are_rejected(self):
        apk = Path(self.temp.name) / 'synthetic-structure-only.apk'
        apk.write_text('This is not an APK')
        Path(str(apk) + '.build-summary.json').write_text(json.dumps({'result': 'Succeeded', 'errors': 0}))
        identity = Path(str(apk) + '.build-info.json')
        identity.write_text(json.dumps({'commitSha': 'b' * 40, 'packageId': 'in.crushx.lens.devtest.advanced', 'developmentBuild': True, 'unityVersion': '6000.0.30f1'}))
        with self.assertRaisesRegex(ValueError, 'identity'):
            BUILD.inspect_apk(apk, 'a' * 40, 'in.crushx.lens.devtest.advanced')
        identity.write_text(json.dumps({'commitSha': 'a' * 40, 'packageId': 'in.crushx.lens.devtest.advanced', 'developmentBuild': True, 'unityVersion': '6000.0.30f1'}))
        with self.assertRaises(zipfile.BadZipFile):
            BUILD.inspect_apk(apk, 'a' * 40, 'in.crushx.lens.devtest.advanced')
        with zipfile.ZipFile(apk, 'w') as archive:
            archive.writestr('AndroidManifest.xml', b'synthetic structural test only')
            archive.writestr('classes.dex', b'synthetic structural test only')
        with self.assertRaisesRegex(ValueError, 'ARM64'):
            BUILD.inspect_apk(apk, 'a' * 40, 'in.crushx.lens.devtest.advanced')

    def test_wrong_editor_identity_is_rejected_even_with_matching_commit_and_package(self):
        # Structural tool fixture only: it is not an Android-build or device artifact.
        apk = Path(self.temp.name) / 'synthetic-editor-identity.apk'
        with zipfile.ZipFile(apk, 'w') as archive:
            for name in ('AndroidManifest.xml', 'classes.dex', 'lib/arm64-v8a/libil2cpp.so'):
                archive.writestr(name, b'Synthetic structural test fixture, not a built application')
        Path(str(apk) + '.build-summary.json').write_text(json.dumps({'result': 'Succeeded', 'errors': 0}))
        Path(str(apk) + '.build-info.json').write_text(json.dumps({
            'commitSha': 'a' * 40, 'packageId': 'in.crushx.lens.devtest.advanced',
            'developmentBuild': True, 'unityVersion': '6000.0.31f1'}))
        with self.assertRaisesRegex(ValueError, 'pinned Unity 6000.0.30f1'):
            BUILD.inspect_apk(apk, 'a' * 40, 'in.crushx.lens.devtest.advanced')


if __name__ == '__main__':
    unittest.main(verbosity=2)
