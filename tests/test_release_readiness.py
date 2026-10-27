import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from release_readiness import audit

ROOT = Path(__file__).resolve().parents[1]


class ReleaseReadinessTests(unittest.TestCase):
    def test_checkout_is_never_misrepresented_as_production_ready(self):
        result = audit(ROOT)
        self.assertFalse(result["production_release_ready"])
        self.assertGreaterEqual(result["blocker_count"], 8)
        gates = {gate["gate"]: gate for gate in result["gates"]}
        self.assertEqual(gates["browser_source"]["status"], "SOURCE_PRESENT")
        self.assertEqual(gates["latest_capacitor_android_source"]["status"], "BLOCKED")
        self.assertEqual(gates["wallet_billing_inr"]["status"], "DEMO_ONLY")
        self.assertEqual(gates["aura_x_agents_memory"]["status"], "DEMO_ONLY")
        for high_risk in ("authenticated_cloud_backend", "messages_calls_p2p",
                          "android_signed_release_and_install", "production_security_and_owner_approval"):
            self.assertEqual(gates[high_risk]["status"], "BLOCKED")
        self.assertTrue(all(g["evidence"] and g["next_action"] for g in result["gates"]))

    def test_a_copied_source_tree_never_satisfies_runtime_and_release_gates(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("index.html", "app-improvements.js",
                         "frontend/package.json", "frontend/android/app/build.gradle",
                         "frontend/android/app/src/main/AndroidManifest.xml",
                         "UnityProjects/CrushXLensEngine/Assets/Scripts/Runtime/CrushXCameraSwipe.cs",
                         "coins-ledger-sandbox.js", "docs/live-inr-ledger-production-boundaries.md",
                         "aura-x-policy.js", "aura-x-assistant.js"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("placeholder", encoding="utf-8")
            data = audit(root)
            self.assertFalse(data["production_release_ready"])
            self.assertEqual(next(x for x in data["gates"] if x["gate"] == "latest_capacitor_android_source")["status"],
                             "SOURCE_PRESENT_UNVERIFIED")
            self.assertTrue(any(x["status"] == "BLOCKED" for x in data["gates"]))

    def test_json_output_and_strict_release_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "report.json"
            command = [sys.executable, str(ROOT / "tools/release_readiness.py"),
                       "--root", str(ROOT), "--output", str(out)]
            permissive = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(permissive.returncode, 0, permissive.stderr)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertFalse(data["production_release_ready"])
            strict = subprocess.run(command + ["--require-release-ready"], check=False,
                                    capture_output=True, text=True)
            self.assertEqual(strict.returncode, 2, "Production gate must reject incomplete evidence")
            self.assertFalse(json.loads(strict.stdout)["production_release_ready"])


if __name__ == "__main__":
    unittest.main()
