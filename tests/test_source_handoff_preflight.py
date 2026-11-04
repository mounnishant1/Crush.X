"""Synthetic, offline tests. They do not attest to an actual Crush.X v402 ZIP."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from source_handoff_preflight import inspect_archive, inspect_directory

EXPECTED = "20.402.0-v402"
FILES = {
    "CrushX-v220/frontend/package.json": json.dumps({"version": EXPECTED}),
    "CrushX-v220/frontend/android/app/build.gradle": "android {}",
    "CrushX-v220/frontend/android/app/src/main/AndroidManifest.xml": "<manifest/>",
    "CrushX-v220/frontend/src/lib/editor-export-boundary-v378.mjs": "export const test = 1",
    "CrushX-v220/tests/v378/editor-end-frame-v378.test.mjs": "export const test = 1",
}


def make_zip(path, files):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, body in files.items():
            z.writestr(name, body)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class HandoffTests(unittest.TestCase):
    def test_valid_source_markers_need_independent_sha(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source.zip"
            digest = make_zip(path, FILES)
            blocked = inspect_archive(path, EXPECTED, None)
            self.assertFalse(blocked["source_preflight_pass"])
            self.assertIn("TRUSTED_ARCHIVE_SHA256_NOT_PROVIDED", blocked["reasons"])
            acceptable = inspect_archive(path, EXPECTED, digest)
            self.assertTrue(acceptable["source_preflight_pass"])
            self.assertFalse(acceptable["production_release_ready"])
            self.assertFalse(acceptable["did_modify_source"])
            self.assertEqual(acceptable["source"]["candidate_roots"], ["CrushX-v220/"])

    def test_wrong_version_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "old.zip"
            files = dict(FILES)
            files["CrushX-v220/frontend/package.json"] = json.dumps({"version": "20.378.0-v378"})
            digest = make_zip(path, files)
            result = inspect_archive(path, EXPECTED, digest)
            self.assertIn("SOURCE_VERSION_MISMATCH", result["reasons"])

    def test_old_browser_sample_cannot_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "browser.zip"
            digest = make_zip(path, {"index.html": "<html/>", "app-improvements.js": "var a=1"})
            result = inspect_archive(path, EXPECTED, digest)
            self.assertIn("ANDROID_PROJECT_ROOT_COUNT_0", result["reasons"])

    def test_path_traversal_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "traversal.zip"
            digest = make_zip(path, {**FILES, "../../credentials.txt": "secret"})
            result = inspect_archive(path, EXPECTED, digest)
            self.assertIn("UNSAFE_ZIP_PATH", result["reasons"])

    def test_case_collision_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "collide.zip"
            digest = make_zip(path, {**FILES, "CRUSHX-v220/frontend/package.json": "{}"})
            result = inspect_archive(path, EXPECTED, digest)
            self.assertIn("DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH", result["reasons"])

    def test_incomplete_markers_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "missing.zip"
            files = dict(FILES)
            files.pop("CrushX-v220/tests/v378/editor-end-frame-v378.test.mjs")
            digest = make_zip(path, files)
            result = inspect_archive(path, EXPECTED, digest)
            self.assertIn("INHERITED_V378_EXPORT_MARKERS_MISSING", result["reasons"])

    def test_directory_remains_unverified_without_archive_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, content in FILES.items():
                file = root / name.removeprefix("CrushX-v220/")
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(content, encoding="utf-8")
            result = inspect_directory(root, EXPECTED)
            self.assertTrue(result["source"]["version_matches"])
            self.assertFalse(result["source_preflight_pass"])
            self.assertIn("EXTRACTED_DIRECTORY_NOT_AUTHENTICATED_BY_ARCHIVE_SHA256", result["reasons"])

    def test_report_cannot_overwrite_archive_or_write_into_source_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "source.zip"
            digest = make_zip(archive, FILES)
            script = Path(__file__).resolve().parents[1] / "tools/source_handoff_preflight.py"
            before = archive.read_bytes()
            conflict = subprocess.run([sys.executable, str(script), "--archive", str(archive),
                                      "--trusted-sha256", digest, "--output", str(archive)],
                                     capture_output=True, text=True)
            self.assertNotEqual(conflict.returncode, 0)
            self.assertEqual(archive.read_bytes(), before)
            forbidden = subprocess.run([sys.executable, str(script), "--root", tmp,
                                       "--output", str(Path(tmp) / "audit.json")],
                                      capture_output=True, text=True)
            self.assertNotEqual(forbidden.returncode, 0)
            self.assertFalse((Path(tmp) / "audit.json").exists())

    def test_strict_cli_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "source.zip"
            digest = make_zip(archive, FILES)
            script = Path(__file__).resolve().parents[1] / "tools/source_handoff_preflight.py"
            failed = subprocess.run([sys.executable, str(script), "--archive", str(archive), "--strict"],
                                    capture_output=True, text=True)
            self.assertEqual(failed.returncode, 2)
            passed = subprocess.run([sys.executable, str(script), "--archive", str(archive),
                                     "--trusted-sha256", digest, "--strict"],
                                    capture_output=True, text=True)
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertFalse(json.loads(passed.stdout)["production_release_ready"])


if __name__ == "__main__":
    unittest.main()
