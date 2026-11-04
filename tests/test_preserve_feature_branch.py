"""Real local Git repositories test portable source preservation; no remote push occurs."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("preserve_feature_branch", ROOT / "tools/preserve_feature_branch.py")
PRESERVE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRESERVE)


class PreservationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="crushx-preservation-test-")
        self.folder = Path(self.temporary.name)
        self.repo = self.folder / "repo"
        self.repo.mkdir()
        self.branch = PRESERVE.FEATURE
        self.command("init", "--quiet", "--initial-branch=" + self.branch)
        self.command("config", "user.name", "Preservation test")
        self.command("config", "user.email", "preservation@example.invalid")
        (self.repo / ".gitignore").write_text("work/\n")
        (self.repo / "source.cs").write_text("// original source\n")
        self.commit("baseline")
        self.base = self.command("rev-parse", "HEAD").strip()

    def tearDown(self):
        self.temporary.cleanup()

    def command(self, *arguments):
        result = subprocess.run(["git", "-C", str(self.repo), *arguments], capture_output=True,
                                text=True, timeout=30, check=True)
        return result.stdout

    def commit(self, message):
        self.command("add", "-A")
        self.command("commit", "--quiet", "-m", message)

    def preserve(self, **kwargs):
        return PRESERVE.preserve(self.repo, self.folder / "export", branch=self.branch, **kwargs)

    def test_complete_bundle_clones_without_base_and_retains_deleted_history(self):
        (self.repo / "old-source.cs").write_text("// retained by history\n")
        self.commit("add historical source")
        self.command("rm", "old-source.cs")
        (self.repo / "source.cs").write_text("// implemented source\n")
        self.commit("new implementation")
        (self.repo / "work").mkdir()
        (self.repo / "work" / "ignored-cache").write_text("not source")
        report = self.preserve(required_ancestor=self.base)
        self.assertTrue(report["completeHistoryBundle"])
        self.assertTrue(report["freshEmptyRepositoryVerified"])
        self.assertTrue(report["freshCloneHeadHistoryAndFilesVerified"])
        self.assertEqual(3, report["reachableCommitCount"])
        self.assertFalse(report["downloadVerified"])
        self.assertFalse(report["githubPushed"])
        with zipfile.ZipFile(self.folder / "export" / "CrushX-feature-source.zip") as archive:
            self.assertEqual(b"// implemented source\n", archive.read("Crush.X/source.cs"))
            self.assertNotIn("Crush.X/work/ignored-cache", archive.namelist())
        manifest = json.loads((self.folder / "export" / "preservation-manifest.json").read_text())
        self.assertEqual(report["commit"], manifest["commit"])

    def test_dirty_default_rejected_and_explicit_snapshot_excludes_uncommitted_bytes(self):
        (self.repo / "source.cs").write_text("// uncommitted change\n")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "dirty"):
            self.preserve()
        report = self.preserve(allow_dirty=True)
        self.assertFalse(report["workingTreeClean"])
        self.assertFalse(report["snapshotIncludesUncommittedChanges"])
        with zipfile.ZipFile(self.folder / "export" / "CrushX-feature-source.zip") as archive:
            self.assertEqual(b"// original source\n", archive.read("Crush.X/source.cs"))

    def test_deleted_private_key_path_in_history_blocks_complete_bundle(self):
        (self.repo / "signing.pem").write_text("fixture; not a key")
        self.commit("historical key filename")
        self.command("rm", "signing.pem")
        self.commit("delete filename")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "private/cache/build path"):
            self.preserve()

    def test_private_token_shape_is_not_printed_or_exported(self):
        token = "ghp_" + "a" * 36
        (self.repo / "ordinary.txt").write_text(token)
        self.commit("unsafe token fixture")
        with self.assertRaises(PRESERVE.PreservationError) as error:
            self.preserve()
        self.assertNotIn(token, str(error.exception))
        self.assertFalse((self.folder / "export").exists())

    def test_output_preserves_existing_artifacts_and_refuses_tracked_source_directory(self):
        output = self.folder / "export"
        output.mkdir(); marker = output / "keep.txt"; marker.write_text("keep")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "already contains"):
            self.preserve()
        self.assertEqual("keep", marker.read_text())
        with self.assertRaisesRegex(PRESERVE.PreservationError, "ignored work"):
            PRESERVE.preserve(self.repo, self.repo / "exports", branch=self.branch)

    def test_wrong_branch_and_unreachable_required_ancestor_are_rejected(self):
        with self.assertRaisesRegex(PRESERVE.PreservationError, "Active branch"):
            PRESERVE.preserve(self.repo, self.folder / "export", branch="main")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "ancestor"):
            self.preserve(required_ancestor="f" * 40)

    def test_lfs_pointer_history_needs_separate_preservation(self):
        (self.repo / "model.bin").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:" + "a" * 64 + "\nsize 10\n")
        self.commit("unresolved LFS fixture")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "LFS pointer"):
            self.preserve()
        self.command("rm", "model.bin")
        self.commit("remove unresolved pointer")
        # The whole reachable history is checked, so deleting the pointer cannot make the bundle complete.
        with self.assertRaisesRegex(PRESERVE.PreservationError, "LFS pointer"):
            self.preserve()

    def test_symbolic_link_source_is_rejected_before_archive_extraction(self):
        (self.repo / "link.cs").symlink_to("source.cs")
        self.commit("symbolic-link fixture")
        with self.assertRaisesRegex(PRESERVE.PreservationError, "symbolic-link"):
            self.preserve()

    def test_shallow_source_cannot_claim_complete_history(self):
        (self.repo / "source.cs").write_text("// second revision\n")
        self.commit("second revision")
        shallow = self.folder / "shallow"
        subprocess.run(["git", "clone", "--quiet", "--depth", "1", "--branch", self.branch,
                        self.repo.as_uri(), str(shallow)], check=True, capture_output=True, timeout=30)
        with self.assertRaisesRegex(PRESERVE.PreservationError, "shallow"):
            PRESERVE.preserve(shallow, self.folder / "export", branch=self.branch)


if __name__ == "__main__":
    unittest.main(verbosity=2)
