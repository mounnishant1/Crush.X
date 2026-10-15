"""Host-side collector safety and evidence parsing; no Android or Unity behavior claims."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("android_evidence", ROOT / "tools/collect_android_evidence.py")
evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence)


class EvidenceParsingTests(unittest.TestCase):
    def test_runtime_diagnostic_tag_with_spaces_is_recognized(self):
        line = '[CrushX AR] {"outcome":"SubsystemStopped","currentFacingDirection":"World"}'
        fox = "[CrushX FoxMask] LensRendererUnavailable"
        result = evidence.parse_logcat(line + "\n" + fox)
        self.assertEqual(result["diagnosticLines"], [line, fox])
        self.assertEqual(result["observedOutcomeCounts"], {"SubsystemStopped": 1, "LensRendererUnavailable": 1})

    def test_retains_exact_native_error_and_diagnostic_observations(self):
        native = "10-15 10:00:00.001 E native 123: AR_ERROR_CAMERA_NOT_AVAILABLE: camera in use"
        diagnostic = '[CrushXAR] {"outcome":"CameraMismatch","requested":"User","current":"World"}'
        result = evidence.parse_logcat(native + "\n" + diagnostic)
        self.assertIn(native, result["nativeErrorObservations"])
        self.assertEqual(result["diagnosticLines"], [diagnostic])
        self.assertEqual(result["observedOutcomeCounts"], {"CameraMismatch": 1})
        self.assertIn("NOT ESTABLISHED", result["rootCause"])

    def test_unsupported_reason_is_not_device_incompatibility_or_tracking(self):
        result = evidence.parse_logcat('[CrushXAR] outcome=FacesNotTracking sessionReason=Unsupported')
        self.assertEqual(result["observedOutcomeCounts"], {"FacesNotTracking": 1})
        self.assertEqual(result["nativeErrorObservations"], [])
        self.assertIn("NOT ESTABLISHED", result["rootCause"])
        self.assertIn("NOT TESTED", result["physicalAcceptance"])

    def test_tracking_log_does_not_imply_visible_mask_acceptance(self):
        result = evidence.parse_logcat("[CrushXAR] outcome=Tracking faces=1\n[CrushXAR] outcome=NoFacesDetected")
        self.assertEqual(result["observedOutcomeCounts"], {"Tracking": 1, "NoFacesDetected": 1})
        self.assertIn("NOT TESTED", result["physicalAcceptance"])

    def test_native_context_errors_without_symbolic_enum_are_retained(self):
        line = "10-15 E ARCore: Session configuration failed: unsupported front camera config"
        self.assertEqual(evidence.parse_logcat(line)["nativeErrorObservations"], [line])


class TargetGuardTests(unittest.TestCase):
    def setUp(self):
        self.target = dict(serial="test-serial", selected_serial="test-serial", expected_model="LE2123",
                           actual_model="LE2123", package="in.crushx.lens.pr3test",
                           manifest_package="in.crushx.lens.pr3test",
                           info={"commitSha": "a" * 40, "buildId": "local-001",
                                 "developmentBuild": True, "packageId": "in.crushx.lens.pr3test"})

    def test_explicit_matching_development_test_target_is_allowed(self):
        evidence.validate_install_target(**self.target)

    def test_automatic_device_selection_cannot_authorize_install(self):
        self.target["serial"] = None
        with self.assertRaisesRegex(ValueError, "explicit --serial"):
            evidence.validate_install_target(**self.target)

    def test_mismatched_model_is_blocked(self):
        self.target["actual_model"] = "Other device"
        with self.assertRaisesRegex(ValueError, "exact --expected-model"):
            evidence.validate_install_target(**self.target)

    def test_production_or_prefix_only_packages_are_blocked(self):
        for package in ("in.crushx", "in.crushx.lens", "in.crushx.lens.pr3testevil", "in.crushx.lens.pr3test;id"):
            with self.subTest(package=package):
                self.target["package"] = package
                self.target["manifest_package"] = package
                self.target["info"]["packageId"] = package
                with self.assertRaisesRegex(ValueError, "test package"):
                    evidence.validate_install_target(**self.target)

    def test_manifest_sidecar_or_commit_mismatch_is_blocked(self):
        for replacement in ({"manifest_package": "in.crushx.lens.devtest"},
                            {"apk_commit": "b" * 40}, {"info": {"developmentBuild": False}}):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                evidence.validate_install_target(**(self.target | replacement))

    def test_no_offline_unauthorized_or_ambiguous_target_is_selected(self):
        devices = "List of devices attached\na device product:test\nb unauthorized\nc offline\n"
        self.assertEqual(evidence.select_device(devices, None), "a")
        self.assertEqual(evidence.select_device(devices, "a"), "a")
        for serial in ("b", "c", "absent"):
            with self.assertRaises(ValueError):
                evidence.select_device(devices, serial)
        with self.assertRaises(ValueError):
            evidence.select_device(devices + "d device\n", None)


class ArtifactAndTimeoutTests(unittest.TestCase):
    def test_default_collection_has_no_device_write_commands_or_acceptance_claim(self):
        commands = []

        def fake_run(command, timeout=20):
            commands.append(command)
            stdout = ""
            if "devices" in command:
                stdout = "List of devices attached\ntest-serial device\n"
            elif "ro.product.model" in command:
                stdout = "LE2123\n"
            return {"exitCode": 0, "stdout": stdout, "stderr": ""}

        def fake_capture(command, path, seconds):
            commands.append(command)
            path.write_text("[CrushXAR] outcome=Tracking faces=1")
            return {"exitCode": 0, "requestedSeconds": seconds}

        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(adb="adb", install=False, apk=None, build_info=None, serial="test-serial",
                                   expected_model=None, package="in.crushx.lens.pr3test", manifest_tool=None,
                                   output=Path(directory) / "capture", seconds=1)
            with mock.patch.object(evidence.shutil, "which", return_value="adb"), \
                    mock.patch.object(evidence, "run", side_effect=fake_run), \
                    mock.patch.object(evidence, "capture_logcat", side_effect=fake_capture), \
                    mock.patch.object(evidence.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                output = evidence.collect(args)
            result = json.loads((output / "evidence.json").read_text())
            parsed = json.loads((output / "logcat-analysis.json").read_text())
        self.assertTrue(result["readOnly"])
        self.assertEqual(result["acceptance"], "NOT TESTED")
        self.assertIn("NOT TESTED", parsed["physicalAcceptance"])
        for command in commands:
            self.assertFalse(set(command) & {"install", "uninstall", "clear", "grant", "force-stop", "reset"}, command)
            if "logcat" in command:
                self.assertNotIn("-c", command)
        self.assertTrue(any("resolve-activity" in command for command in commands))

    def test_build_identity_must_be_in_the_apk_not_merely_a_sidecar(self):
        info = {"commitSha": "a" * 40, "buildId": "build-identity-001"}
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / "test.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                # Cross the 64 KiB scan boundary to exercise overlap handling.
                archive.writestr("assets/bin/Data/resources.assets", b"x" * 65530 + json.dumps(info).encode())
            self.assertTrue(evidence.apk_contains_build_identity(apk, info))
            self.assertFalse(evidence.apk_contains_build_identity(apk, info | {"buildId": "other"}))
            self.assertFalse(evidence.apk_contains_build_identity(apk, {"commitSha": "", "buildId": ""}))

    def test_raw_streaming_build_metadata_is_verified_even_with_compressed_unity_data(self):
        info = {"commitSha": "a" * 40, "buildId": "verified-build", "developmentBuild": True}
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / "test.apk"
            with zipfile.ZipFile(apk, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("assets/CrushXBuildInfo.json", json.dumps(info))
                archive.writestr("assets/bin/Data/data.unity3d", b"opaque compressed Unity data")
            self.assertTrue(evidence.apk_contains_build_identity(apk, info))
            self.assertFalse(evidence.apk_contains_build_identity(apk, info | {"developmentBuild": False}))

    def test_command_timeout_retains_partial_native_output(self):
        with mock.patch.object(evidence.subprocess, "run", side_effect=subprocess.TimeoutExpired(
                ["adb"], 1, output=b"AR_ERROR_FATAL", stderr=b"timeout")):
            result = evidence.run(["adb"], timeout=1)
        self.assertTrue(result["timedOut"])
        self.assertEqual(result["stdout"], "AR_ERROR_FATAL")

    def test_logcat_has_finite_deadline_and_terminates_only_its_adb_client(self):
        process = mock.Mock()
        process.wait.side_effect = [subprocess.TimeoutExpired(["adb"], 3), -15]
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(evidence.subprocess, "Popen", return_value=process):
            result = evidence.capture_logcat(["adb", "logcat", "-b", "all"], Path(directory) / "logcat.txt", 3)
        process.terminate.assert_called_once()
        process.kill.assert_not_called()
        self.assertEqual(process.wait.call_args_list, [mock.call(timeout=3), mock.call(timeout=5)])
        self.assertEqual(result["requestedSeconds"], 3)

    def test_aapt2_inspection_preserves_badging_and_full_manifest_tree(self):
        with mock.patch.object(evidence, "run", side_effect=[
            {"exitCode": 0, "stdout": "package: name='in.crushx.lens.pr3test' versionCode='1'", "stderr": ""},
            {"exitCode": 0, "stdout": "android.permission.CAMERA\nUnityPlayerGameActivity", "stderr": ""},
        ]) as run:
            package, result = evidence.inspect_apk(Path("test.apk"), "aapt2")
        self.assertEqual(package, "in.crushx.lens.pr3test")
        self.assertEqual(run.call_args_list[1].args[0], ["aapt2", "dump", "xmltree", "test.apk", "--file", "AndroidManifest.xml"])
        self.assertIn("UnityPlayerGameActivity", evidence.manifest_text(result))


if __name__ == "__main__":
    unittest.main(verbosity=2)
