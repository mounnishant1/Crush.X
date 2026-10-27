"""Synthetic offline checks of the Step14 path-only audit; NOT Android QA."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
from step14_source_diff import audit
MANIFEST=ROOT/"docs/STEP13-PR17-28-PATH-INVENTORY.json"
SCRIPT=ROOT/"tools/step14_source_diff.py"

def archive(path,version="20.402.0-v402",extras=None,missing=None):
    files={
        "CrushX-v220/frontend/package.json":json.dumps({"version":version}),
        "CrushX-v220/frontend/android/app/src/main/AndroidManifest.xml":"<manifest/>",
        "CrushX-v220/frontend/android/app/build.gradle":"// fake Gradle",
        "CrushX-v220/frontend/src/lib/editor-export-boundary-v378.mjs":"export const f=1",
        "CrushX-v220/tests/v378/editor-end-frame-v378.test.mjs":"export const t=1",
    }
    files.update(extras or {})
    for item in missing or (): files.pop(item)
    with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:
        for name,contents in files.items(): z.writestr(name,contents)
    return hashlib.sha256(path.read_bytes()).hexdigest()

class Step14Tests(unittest.TestCase):
    def test_missing_archive_is_blocked(self):
        x=audit(MANIFEST)
        self.assertEqual(x["feature_count"],16)
        self.assertEqual(x["status"],"BLOCKED_NO_ATTESTED_V402_ZIP")
        self.assertFalse(x["feature_integration_complete"])
        self.assertTrue(all(not f["automatic_copy_allowed"] for f in x["features"]))

    def test_pr_evidence_is_snapshot_bounded(self):
        x=audit(MANIFEST)
        reels=next(f for f in x["features"] if f["feature"]=="reels_player_gestures")
        self.assertEqual(reels["legacy_prs_with_evidence"],[18,19,20])
        wallet=next(f for f in x["features"] if f["feature"]=="coins_inr_billing")
        self.assertEqual(wallet["legacy_prs_with_evidence"],[24])

    def test_trusted_zip_candidates_are_not_feature_verification(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"v402.zip"
            digest=archive(p,extras={
                "CrushX-v220/frontend/src/components/ReelsPlayer.tsx":"// sample",
                "CrushX-v220/frontend/src/pages/ProfilePage.tsx":"// sample",
                "CrushX-v220/UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraSwipe.cs":"// sample",
            })
            x=audit(MANIFEST,p,digest)
            self.assertTrue(x["v402_zip_attested"])
            self.assertEqual(x["status"],"SOURCE_REVIEW_READY_ONLY")
            reels=next(f for f in x["features"] if f["feature"]=="reels_player_gestures")
            self.assertEqual(reels["target_file_name_candidates"],["frontend/src/components/ReelsPlayer.tsx"])
            camera=next(f for f in x["features"] if f["feature"]=="camera_unity_lenses")
            self.assertEqual(len(camera["same_relative_path_conflicts"]),1)
            self.assertFalse(any(f["feature_verified"] for f in x["features"]))
            self.assertFalse(x["production_release_ready"])

    def test_nonmatching_name_is_unknown_not_missing_feature(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"v402.zip"
            digest=archive(p,extras={"CrushX-v220/frontend/src/components/ComposableView.tsx":"// demo"})
            x=audit(MANIFEST,p,digest)
            reels=next(f for f in x["features"] if f["feature"]=="reels_player_gestures")
            self.assertEqual(reels["status"],"REVIEW_NO_FILENAME_CANDIDATE")
            self.assertFalse(reels["feature_verified"])

    def test_wrong_hash_blocks_scanning(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"v402.zip"
            archive(p,extras={"CrushX-v220/frontend/src/Reels.tsx":"// demo"})
            x=audit(MANIFEST,p,"0"*64)
            self.assertFalse(x["v402_zip_attested"])
            self.assertEqual(x["react_code_file_count"],0)
            self.assertIn("ARCHIVE_SHA256_MISMATCH",x["source_preflight"]["reasons"])

    def test_wrong_version_blocks_source(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"old.zip"
            digest=archive(p,version="20.400.0-v400")
            x=audit(MANIFEST,p,digest)
            self.assertFalse(x["v402_zip_attested"])
            self.assertIn("SOURCE_VERSION_MISMATCH",x["source_preflight"]["reasons"])

    def test_zip_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"unsafe.zip"
            digest=archive(p,extras={"../escape.txt":"malicious"})
            x=audit(MANIFEST,p,digest)
            self.assertFalse(x["v402_zip_attested"])
            self.assertIn("UNSAFE_ZIP_PATH",x["source_preflight"]["reasons"])

    def test_output_under_repo_rejected(self):
        destination=ROOT/"not-allowed-step14.json"
        p=subprocess.run([sys.executable,str(SCRIPT),"--output",str(destination)],capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0)
        self.assertFalse(destination.exists())

    def test_strict_cli_exits_two_when_missing_original_zip(self):
        p=subprocess.run([sys.executable,str(SCRIPT),"--require-attested-source"],capture_output=True,text=True)
        self.assertEqual(p.returncode,2)
        self.assertFalse(json.loads(p.stdout)["v402_zip_attested"])

    def test_inventory_output_is_safe_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/"inventory.json"
            p=subprocess.run([sys.executable,str(SCRIPT),"--output",str(file)],capture_output=True,text=True)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertFalse(json.loads(file.read_text())["feature_integration_complete"])
            second=subprocess.run([sys.executable,str(SCRIPT),"--output",str(file)],capture_output=True,text=True)
            self.assertNotEqual(second.returncode,0)

if __name__=="__main__":
    unittest.main()
