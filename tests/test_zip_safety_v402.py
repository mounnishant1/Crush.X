"""Offline adversarial ZIP fixtures for Crush.X v402 handoff. No app source touched."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from source_handoff_preflight import inspect_archive

EXPECTED = "20.402.0-v402"
FILES = {
    "CrushX-v220/frontend/package.json": '{"version":"20.402.0-v402"}',
    "CrushX-v220/frontend/android/app/build.gradle": "android {}",
    "CrushX-v220/frontend/android/app/src/main/AndroidManifest.xml": "<manifest/>",
    "CrushX-v220/frontend/src/lib/editor-export-boundary-v378.mjs": "export const ok=true",
    "CrushX-v220/tests/v378/editor-end-frame-v378.test.mjs": "export const ok=true",
}


def make_zip(path, files):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class AdversarialZipTests(unittest.TestCase):
    def test_windows_reserved_names_illegal_punctuation_and_trailing_dot(self):
        names = ("con.txt", "AUX", "COM1.jpg", "NUL", "file.", "file ",
                 "a<b.txt", "question?.txt", "pipe|name", "bad:name")
        for name in names:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "bad.zip"
                digest = make_zip(path, {**FILES, "CrushX-v220/" + name: "text"})
                self.assertIn("UNSAFE_ZIP_PATH", inspect_archive(path, EXPECTED, digest)["reasons"])

    def test_implicit_parent_case_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.zip"
            digest = make_zip(path, {**FILES, "crushx-v220/Other/File.js": "ok"})
            self.assertIn("DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH",
                          inspect_archive(path, EXPECTED, digest)["reasons"])

    def test_file_vs_folder_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.zip"
            digest = make_zip(path, {**FILES, "CrushX-v220/frontend": "file"})
            self.assertIn("DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH",
                          inspect_archive(path, EXPECTED, digest)["reasons"])

    def test_unicode_normalization_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.zip"
            digest = make_zip(path, {**FILES, "CrushX-v220/assets/caf\u00e9.txt": "a",
                                     "CrushX-v220/assets/cafe\u0301.txt": "b"})
            self.assertIn("DUPLICATE_OR_CASE_COLLIDING_ZIP_PATH",
                          inspect_archive(path, EXPECTED, digest)["reasons"])

    def test_high_ratio_zip_rejected_before_decompression(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bomb.zip"
            digest = make_zip(path, {**FILES, "CrushX-v220/filler.bin": b"\x00" * (9 * 1024 * 1024)})
            with patch.object(zipfile.ZipFile, "testzip", side_effect=AssertionError("must not decompress")):
                self.assertIn("ZIP_COMPRESSION_RATIO_LIMIT",
                              inspect_archive(path, EXPECTED, digest)["reasons"])

    def test_invalid_or_missing_hash_never_opens_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "untrusted.zip"
            make_zip(path, FILES)
            with patch("source_handoff_preflight.zipfile.ZipFile",
                       side_effect=AssertionError("untrusted ZIP opened")):
                for provided in (None, "123", "0" * 64):
                    with self.subTest(provided=provided):
                        self.assertFalse(inspect_archive(path, EXPECTED, provided)["source_preflight_pass"])

    def test_existing_report_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "valid.zip"
            digest = make_zip(path, FILES)
            output = Path(tmp) / "report.json"
            output.write_text("never overwrite", encoding="utf-8")
            script = Path(__file__).resolve().parents[1] / "tools/source_handoff_preflight.py"
            command = [sys.executable, str(script), "--archive", str(path),
                       "--trusted-sha256", digest, "--output", str(output)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "never overwrite")

    def test_symlink_report_path_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "valid.zip"
            digest = make_zip(path, FILES)
            outside = Path(tmp) / "outside.json"
            output = Path(tmp) / "report.json"
            try:
                output.symlink_to(outside)
            except (OSError, NotImplementedError):
                self.skipTest("Symlink creation unavailable")
            script = Path(__file__).resolve().parents[1] / "tools/source_handoff_preflight.py"
            command = [sys.executable, str(script), "--archive", str(path),
                       "--trusted-sha256", digest, "--output", str(output)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse(outside.exists())


if __name__ == "__main__":
    unittest.main()
