#!/usr/bin/env python3
"""Preserve a committed feature branch as a self-contained Git bundle and source ZIP.

Never pushes, changes branches, executes archived source, or asserts a download URL.
A fresh local clone verifies the bundle has no prerequisite repository. Only Git
tracked files enter the ZIP; work directories, caches and private key paths fail
the export rather than being silently omitted from preserved history.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
FEATURE = "feature/crushx-advanced-ar-lens-engine"
PRIVATE_SUFFIXES = {".pem", ".pfx", ".p12", ".keystore", ".jks", ".apk", ".aab"}
FORBIDDEN_PARTS = {".git", "node_modules", "library", "temp", "logs", "obj", "build", "builds", "work", "__pycache__", ".gradle"}
SECRET_PATTERNS = (
    re.compile(rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{70,}\b"),
)


class PreservationError(RuntimeError):
    pass


def git(repository, *arguments, binary=False):
    environment = dict(os.environ)
    environment.update({"GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"})
    result = subprocess.run(["git", "-C", str(repository), *arguments], capture_output=True,
                            text=not binary, timeout=180, check=False, env=environment)
    if result.returncode:
        error = result.stderr.decode(errors="replace") if binary else result.stderr
        raise PreservationError("Git operation failed: " + error.strip())
    return result.stdout


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unsafe_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        return True
    if any(part.lower() in FORBIDDEN_PARTS for part in path.parts):
        return True
    leaf = path.name.lower()
    if leaf in {".env", "id_rsa", "id_ed25519", "credentials", "credentials.json"}:
        return True
    if leaf.startswith(".env.") and not leaf.endswith((".example", ".sample", ".template")):
        return True
    return path.suffix.lower() in PRIVATE_SUFFIXES


def tracked_tree(repository, commit):
    records = {}
    output = git(repository, "ls-tree", "-r", "-z", "--full-tree", commit, binary=True)
    for entry in output.split(b"\0"):
        if not entry:
            continue
        meta, raw_name = entry.split(b"\t", 1)
        mode, kind, object_id = meta.decode().split()
        name = raw_name.decode("utf-8", errors="strict")
        if unsafe_path(name):
            raise PreservationError("Tracked private/cache/build path cannot be exported: " + name)
        if kind != "blob" or mode not in ("100644", "100755"):
            raise PreservationError("Submodule or symbolic-link source needs a separate reviewed export: " + name)
        content = git(repository, "cat-file", "blob", object_id, binary=True)
        records[name] = {"gitObject": object_id, "mode": mode, "bytes": len(content), "sha256": digest(content)}
    return records


def check_history_paths(repository, branch):
    # Complete history must not smuggle previously deleted keys/caches into the bundle.
    paths = git(repository, "log", "--format=", "--name-only", "-z", branch, binary=True)
    for raw in paths.split(b"\0"):
        if not raw:
            continue
        name = raw.decode("utf-8", errors="strict").strip("\n")
        if name and unsafe_path(name):
            raise PreservationError("Preserved history contains a private/cache/build path: " + name)


def scan_reachable_content(repository, branch):
    # Values never enter logs or the manifest. This is deliberately a bounded-shape
    # credential check, not a claim that arbitrary organizational secrets can be inferred.
    objects = git(repository, "rev-list", "--objects", branch).splitlines()
    object_ids = [line.split(" ", 1)[0] for line in objects]
    process = subprocess.run(["git", "-C", str(repository), "cat-file", "--batch"],
                             input=("\n".join(object_ids) + "\n").encode(),
                             capture_output=True, timeout=180, check=False)
    if process.returncode:
        raise PreservationError("Could not inspect reachable Git objects for private key/token shapes")
    data, cursor, blobs = process.stdout, 0, 0
    while cursor < len(data):
        end = data.index(b"\n", cursor)
        header = data[cursor:end].split()
        if len(header) != 3:
            raise PreservationError("Unexpected Git object inspection result")
        size = int(header[2]); start = end + 1
        content = data[start:start + size]
        cursor = start + size + 1
        if len(content) != size:
            raise PreservationError("Incomplete Git object inspection result")
        if any(pattern.search(content) for pattern in SECRET_PATTERNS):
            raise PreservationError("A reachable Git object matches a private-key/token shape; export stopped without printing its value")
        if header[1] == b"blob":
            blobs += 1
            if content.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
                raise PreservationError("A reachable LFS pointer requires separate object preservation; bundle alone would be incomplete")
    return blobs


def verify_zip(path, files):
    prefix = "Crush.X/"
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise PreservationError("ZIP CRC validation failed")
        actual = {entry.filename[len(prefix):]: entry for entry in archive.infolist()
                  if not entry.is_dir() and entry.filename.startswith(prefix)}
        if set(actual) != set(files):
            raise PreservationError("Source ZIP files differ from the committed Git tree")
        for name, item in files.items():
            if digest(archive.read(actual[name])) != item["sha256"]:
                raise PreservationError("Source ZIP content mismatch: " + name)


def check_output(repository, output):
    repository, output = Path(repository).resolve(), Path(output).resolve()
    try:
        relative = output.relative_to(repository)
        if not relative.parts or relative.parts[0] != "work":
            raise PreservationError("An in-repository output must be under ignored work/")
    except ValueError:
        pass
    if output.exists() and any(output.iterdir()):
        raise PreservationError("Output already contains files; choose a new directory to preserve prior artifacts")
    output.mkdir(parents=True, exist_ok=True)
    return output


def preserve(repository, output, *, branch=FEATURE, required_ancestor=None, allow_dirty=False):
    repository = Path(repository).resolve()
    current = git(repository, "branch", "--show-current").strip()
    if current != branch:
        raise PreservationError("Active branch does not match the requested feature branch")
    if git(repository, "rev-parse", "--is-shallow-repository").strip() != "false":
        raise PreservationError("A shallow repository cannot produce a complete-history bundle")
    status = git(repository, "status", "--porcelain")
    if status and not allow_dirty:
        raise PreservationError("Working tree is dirty; commit verified changes before preservation")
    commit = git(repository, "rev-parse", branch).strip()
    if required_ancestor:
        result = subprocess.run(["git", "-C", str(repository), "merge-base", "--is-ancestor", required_ancestor, commit],
                                capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise PreservationError("Required preserved ancestor is not reachable from this feature branch")
    check_history_paths(repository, branch)
    scanned_blobs = scan_reachable_content(repository, branch)
    files = tracked_tree(repository, commit)
    history = git(repository, "rev-list", commit).splitlines()
    output = check_output(repository, output)
    bundle, source_zip = output / "CrushX-complete-feature.bundle", output / "CrushX-feature-source.zip"
    git(repository, "bundle", "create", str(bundle), branch)
    git(repository, "archive", "--format=zip", "--prefix=Crush.X/", "--output=" + str(source_zip), commit)
    verify_zip(source_zip, files)
    with tempfile.TemporaryDirectory(prefix="crushx-portable-clone-") as scratch:
        clone = Path(scratch) / "source"
        empty = Path(scratch) / "empty"
        empty_hooks = Path(scratch) / "empty-hooks"
        empty_hooks.mkdir()
        git(Path(scratch), "init", "--quiet", str(empty))
        # Empty-repository verification fails for incremental bundles with prerequisite commits.
        git(empty, "bundle", "verify", str(bundle))
        git(Path(scratch), "-c", "core.hooksPath=" + str(empty_hooks), "clone", "--quiet", "--no-local", "--branch", branch, str(bundle), str(clone))
        if git(clone, "rev-parse", "HEAD").strip() != commit:
            raise PreservationError("Fresh bundle clone did not preserve HEAD")
        if git(clone, "rev-list", "HEAD").splitlines() != history:
            raise PreservationError("Fresh bundle clone did not preserve complete reachable history")
        for name, item in files.items():
            if digest((clone / name).read_bytes()) != item["sha256"]:
                raise PreservationError("Fresh bundle clone file mismatch: " + name)
    if git(repository, "rev-parse", branch).strip() != commit:
        raise PreservationError("Feature branch changed during export; repeat with the final committed source")
    manifest = {
        "schemaVersion": 1, "branch": branch, "commit": commit,
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "workingTreeClean": not bool(status), "snapshotIncludesUncommittedChanges": False,
        "reachableCommitCount": len(history), "requiredAncestor": required_ancestor,
        "reachableCommits": history,
        "completeHistoryBundle": True, "freshEmptyRepositoryVerified": True,
        "freshCloneHeadHistoryAndFilesVerified": True, "sourceZipCrcAndFilesVerified": True,
        "trackedFileCount": len(files), "files": files,
        "reachableBlobsScanned": scanned_blobs,
        "credentialScan": "Forbidden private/cache paths and common private-key/token shapes checked across reachable history; not a substitute for organization-specific secret review.",
        "artifacts": {p.name: {"bytes": p.stat().st_size, "sha256": digest(p.read_bytes())} for p in (bundle, source_zip)},
        "excluded": "Untracked/ignored work, caches, credentials and build artifacts are not source ZIP inputs; tracked/history private/cache paths are rejected.",
        "downloadVerified": False,
        "downloadStatus": "Local filesystem artifacts only; this tool does not upload or establish client download access.",
        "githubPushed": False,
    }
    (output / "preservation-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=ROOT)
    parser.add_argument("--branch", default=FEATURE)
    parser.add_argument("--required-ancestor")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--allow-dirty", action="store_true", help="Archive only committed HEAD and explicitly record uncommitted changes are excluded")
    arguments = parser.parse_args(argv)
    try:
        result = preserve(arguments.repository, arguments.output, branch=arguments.branch,
                          required_ancestor=arguments.required_ancestor, allow_dirty=arguments.allow_dirty)
    except (PreservationError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        parser.exit(1, "Preservation failed: " + str(error) + "\n")
    print(json.dumps({key: result[key] for key in ("branch", "commit", "reachableCommitCount", "trackedFileCount", "completeHistoryBundle", "freshEmptyRepositoryVerified", "downloadVerified", "githubPushed")}, indent=2))
    print("Local artifacts: " + str(arguments.output.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
