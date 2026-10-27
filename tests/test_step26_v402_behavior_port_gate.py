"""Source-only tests for Step 26 v402 behavior port gate. No actual v402 app."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import step26_v402_behavior_port_gate as gate


class BehaviorPortGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.good = json.loads((Path(__file__).resolve().parents[1] /
            "docs/STEP26-PR34-45-BEHAVIOR-PORT-CONTRACTS.json").read_text())
        self.manifest = self.root / "manifest.json"
        self.write_manifest()

    def write_manifest(self):
        self.manifest.write_text(json.dumps(self.good), encoding="utf-8")

    def synthetic_zip(self, files=None):
        path = self.root / "fixture.zip"
        entries = files or {
          "CrushX-v220/frontend/src/App.jsx": "function navigateBack() { history.back(); } // dialog route popstate back navigate",
          "CrushX-v220/frontend/src/components/Reels.jsx": "const touchSwipe = 'pointer touch swipe scroll';",
          "CrushX-v220/frontend/src/components/CommentsSheet.tsx": "const modal = 'sheet dialog safe-area expand scroll';",
          "CrushX-v220/frontend/src/components/Stories.jsx": "const story = 'swipe pointer touch gesture';",
        }
        with zipfile.ZipFile(path, "w") as z:
            for name, data in entries.items():
                z.writestr(name, data)
        return path

    @staticmethod
    def attest(path, expected_version, sha):
        return {
          "archive_sha256": sha, "trusted_sha256_match": True, "source_preflight_pass": True,
          "source": {"source_version": expected_version,
                     "candidate_roots": ["CrushX-v220/"]}, "reasons": []
        }

    def test_snapshot_has_verified_pr_numbers_without_duplicate(self):
        result = gate.checked_manifest(self.manifest)
        self.assertEqual(len(result["pull_requests"]), 12)
        self.assertEqual(result["canonical_behavior_lineage"][-1], 45)
        self.assertNotIn(35, result["canonical_behavior_lineage"])
        self.assertNotIn(36, result["canonical_behavior_lineage"])

    def test_missing_original_source_is_blocked(self):
        result = gate.audit(self.manifest)
        self.assertEqual(result["status"], "BLOCKED_NO_ATTESTED_V402_SOURCE")
        self.assertEqual(result["blocked_reason"], "ORIGINAL_V402_ZIP_NOT_PROVIDED")
        self.assertFalse(result["automated_copy_allowed"])
        self.assertFalse(result["react_integrated"])
        self.assertFalse(result["android_apk_built"])

    def test_missing_hash_prevents_inspection(self):
        path = self.synthetic_zip()
        def inspector(*a):
            raise AssertionError("No ZIP metadata should be read without trusted hash")
        result = gate.audit(self.manifest, path, inspector=inspector)
        self.assertEqual(result["blocked_reason"], "INDEPENDENT_SHA256_REQUIRED")

    def test_invalid_hash_prevents_inspection(self):
        result = gate.audit(self.manifest, self.synthetic_zip(), "nonsense")
        self.assertEqual(result["blocked_reason"], "INDEPENDENT_SHA256_REQUIRED")

    def test_failed_source_preflight_blocks_candidates(self):
        path = self.synthetic_zip()
        def fail(*args):
            return {"trusted_sha256_match": False, "source_preflight_pass": False,
                    "source": {"source_version": "20.401.0-v401", "candidate_roots": []},
                    "reasons": ["SOURCE_VERSION_MISMATCH"]}
        result = gate.audit(self.manifest, path, "a"*64, inspector=fail)
        self.assertEqual(result["status"], "BLOCKED_NO_ATTESTED_V402_SOURCE")
        self.assertEqual(result["blocked_reason"], "V402_SOURCE_PREFLIGHT_FAILED")
        self.assertEqual(result["source"]["reasons"], ["SOURCE_VERSION_MISMATCH"])

    def test_attested_synthetic_archive_maps_react_files_without_porting(self):
        path = self.synthetic_zip()
        result = gate.audit(self.manifest, path, "a"*64, inspector=self.attest)
        self.assertEqual(result["status"], "ATTESTED_TARGETS_FOR_MANUAL_PORT_REVIEW")
        f = {x["feature"]: x for x in result["behavior_workstreams"]}
        self.assertTrue(any("Reels.jsx" in x["path"] for x in f["reels-gestures"]["target_candidates"]))
        self.assertTrue(any("CommentsSheet" in x["path"] for x in f["comments-share-expand"]["target_candidates"]))
        self.assertTrue(any("Stories.jsx" in x["path"] for x in f["story-gestures"]["target_candidates"]))
        self.assertTrue(all(x["status"] == "MANUAL_REIMPLEMENT_AND_TEST" for x in f.values()))
        self.assertTrue(all(not x["feature_integrated"] for x in f.values()))
        self.assertFalse(result["production_release_ready"])

    def test_filename_and_source_token_evidence_is_not_functional_verification(self):
        r = gate.audit(self.manifest, self.synthetic_zip(), "a"*64, inspector=self.attest)
        candidate = next(c for c in next(x for x in r["behavior_workstreams"]
            if x["feature"] == "comments-share-expand")["target_candidates"]
            if "CommentsSheet" in c["path"])
        self.assertGreater(candidate["score"], 0)
        self.assertFalse(candidate["feature_verified"])
        self.assertTrue(candidate["manual_review"])

    def test_duplicate_pr_rejected(self):
        self.good["pull_requests"].append(copy.deepcopy(self.good["pull_requests"][-1]))
        self.write_manifest()
        with self.assertRaises(ValueError):
            gate.checked_manifest(self.manifest)

    def test_unsafe_changed_path_rejected(self):
        self.good["pull_requests"][0]["changed_paths"] = ["../../index.html"]
        self.write_manifest()
        with self.assertRaises(ValueError):
            gate.checked_manifest(self.manifest)

    def test_conflicting_canonical_alternate_rejected(self):
        self.good["alternate_overlapping_prs"].append(45)
        self.write_manifest()
        with self.assertRaises(ValueError):
            gate.checked_manifest(self.manifest)

    def test_manifest_symlink_rejected(self):
        other = self.root / "shortcut.json"
        try:
            other.symlink_to(self.manifest)
        except (OSError, NotImplementedError):
            self.skipTest("Symlinks unavailable")
        with self.assertRaises(ValueError):
            gate.checked_manifest(other)

    def test_explicit_strict_mode_blocks_source_absence(self):
        capture = io.StringIO()
        with contextlib.redirect_stdout(capture):
            result = gate.main(["--manifest", str(self.manifest), "--strict"])
        self.assertEqual(result, 2)
        self.assertIn("BLOCKED_NO_ATTESTED_V402_SOURCE", capture.getvalue())

    def test_report_refuses_overwrite(self):
        destination = self.root / "exists.json"
        destination.write_text("protected", encoding="utf-8")
        with self.assertRaises(SystemExit):
            gate.main(["--manifest", str(self.manifest), "--output", str(destination)])
        self.assertEqual(destination.read_text(), "protected")

    def test_missing_metadata_cannot_certify_by_fake_pass(self):
        def broken(*args):
            return {"trusted_sha256_match": True, "source_preflight_pass": True,
                    "source": {"source_version": "20.402.0-v402", "candidate_roots": []},
                    "reasons": []}
        result = gate.audit(self.manifest, self.synthetic_zip(), "a"*64, inspector=broken)
        self.assertNotEqual(result["status"], "ATTESTED_TARGETS_FOR_MANUAL_PORT_REVIEW")


if __name__ == "__main__":
    unittest.main()
