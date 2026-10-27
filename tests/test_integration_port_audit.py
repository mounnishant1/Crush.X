"""Offline synthetic tests for Step 13. Never modify real Android source."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from integration_port_audit import audit

MANIFEST = ROOT / "docs/STEP13-PR17-28-PATH-INVENTORY.json"
SCRIPT = ROOT / "tools/integration_port_audit.py"
EXPECTED = "20.402.0-v402"
COLLISION = ("UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/"
             "CrushXCameraSwipe.cs")


def create_fake_target(root, version=EXPECTED, markers=True):
    files = {
        "frontend/package.json": json.dumps({"version": version}),
        "frontend/android/app/build.gradle": "android {}",
        "frontend/android/app/src/main/AndroidManifest.xml": "<manifest />",
        "frontend/src/lib/editor-export-boundary-v378.mjs": "export const boundary = true",
        "tests/v378/editor-end-frame-v378.test.mjs": "// synthetic tests",
    }
    if not markers:
        files.pop("tests/v378/editor-end-frame-v378.test.mjs")
    for name, data in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")


class PortAuditTests(unittest.TestCase):
    def test_real_manifest_snapshot_has_all_changed_paths(self):
        report = audit(MANIFEST)
        self.assertEqual(report["pr_count"], 12)
        self.assertEqual(report["changed_path_occurrences"], 55)
        self.assertEqual(report["unique_changed_paths"], 32)
        self.assertEqual(report["classification_counts"]["LEGACY_BROWSER_MANUAL_REIMPLEMENT"], 13)
        self.assertEqual(report["classification_counts"]["UNITY_NATIVE_MANUAL_REVIEW"], 3)
        self.assertEqual(report["android_source_state"], "BLOCKED_NO_ANDROID_SOURCE")
        self.assertFalse(report["automatic_merge_allowed"])

    def test_valid_synthetic_structure_is_not_attested_or_merged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            create_fake_target(root)
            report = audit(MANIFEST, root)
            self.assertEqual(report["android_source_state"], "SOURCE_STRUCTURE_PRESENT_UNATTESTED")
            self.assertEqual(report["observed_version"], EXPECTED)
            self.assertFalse(report["v402_archive_provenance_verified"])
            self.assertFalse(report["android_or_production_release_ready"])
            self.assertTrue(all(not x["automatic_copy_allowed"] for x in report["review_entries"]))

    def test_wrong_version_is_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            create_fake_target(root, "20.378.0-v378")
            report = audit(MANIFEST, root)
            self.assertEqual(report["android_source_state"], "BLOCKED_ANDROID_SOURCE_MISMATCH")
            self.assertFalse(report["version_matches"])

    def test_missing_export_marker_is_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            create_fake_target(root, markers=False)
            report = audit(MANIFEST, root)
            self.assertEqual(report["android_source_state"], "BLOCKED_ANDROID_SOURCE_MISMATCH")

    def test_native_same_path_collision_demands_manual_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            create_fake_target(root)
            path = root / COLLISION
            path.parent.mkdir(parents=True)
            path.write_text("// EXISTING ANDROID NATIVE FILE")
            report = audit(MANIFEST, root)
            rec = next(x for x in report["review_entries"] if x["path"] == COLLISION)
            self.assertTrue(rec["same_relative_path_in_target"])
            self.assertEqual(rec["collision_risk"], "REVIEW_REQUIRED")
            self.assertFalse(rec["automatic_copy_allowed"])
            self.assertEqual(path.read_text(), "// EXISTING ANDROID NATIVE FILE")

    def test_unsafe_manifest_path_is_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "evil.json"
            path.write_text(json.dumps({"prs": {"29": ["../../secrets.txt"]}}))
            with self.assertRaises(ValueError):
                audit(path)

    def test_cli_refuses_report_under_android_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "android"
            target.mkdir()
            create_fake_target(target)
            output = target / "result.json"
            proc = subprocess.run([sys.executable, str(SCRIPT), "--target-root", str(target),
                                   "--output", str(output)], capture_output=True, text=True)
            self.assertNotEqual(proc.returncode, 0)
            self.assertFalse(output.exists())

    def test_cli_strict_gate_never_claims_integration(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "android"
            target.mkdir()
            create_fake_target(target)
            proc = subprocess.run([sys.executable, str(SCRIPT), "--target-root", str(target),
                                   "--require-verified-integration"],
                                  capture_output=True, text=True)
            self.assertEqual(proc.returncode, 2)
            self.assertFalse(json.loads(proc.stdout)["automatic_merge_allowed"])

    def test_external_report_generated_without_source_mutations(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            target = parent / "source"
            target.mkdir()
            create_fake_target(target)
            before = (target / "frontend/package.json").read_bytes()
            out = parent / "report.json"
            proc = subprocess.run([sys.executable, str(SCRIPT), "--target-root", str(target),
                                   "--output", str(out)], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue(out.exists())
            self.assertFalse(json.loads(out.read_text())["automatic_merge_allowed"])
            self.assertEqual((target / "frontend/package.json").read_bytes(), before)
            second = subprocess.run([sys.executable, str(SCRIPT), "--target-root", str(target),
                                     "--output", str(out)], capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertTrue(out.exists())


if __name__ == "__main__":
    unittest.main()
