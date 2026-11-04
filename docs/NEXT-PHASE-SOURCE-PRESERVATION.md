# Source preservation and integration baseline — 1 November 2026

## Verified original feature branch

At the start of this continuation, `/workspace/Crush.X` was clean on
`feature/crushx-advanced-ar-lens-engine`, exact HEAD
`d18432820ebdcf2882b429cffe510ca89b24bf80`. The seven original implementation commits
are present in order and remain ancestors of subsequent work:

```text
b4cbe3d4eba4155ccb1c2fe97da4bdf1dd0fd9c2 camera ownership/recovery/orientation/swipes
7218344c38cdc3154a439f0649bfb7ca7196e290 tracking identity/freshness/expression mapping
9dbd377c77a0cb906c6faf3e1f707849261607d3 lens physical scale and genuine expression gates
12721e445f366ee9c3c8db049736a2e4fe33d344 GPU compositor and adjustable grading
54f541c5539ada3156bae11b99f4b30ac0c22e98 rendered capture/draft recovery/gallery export
a8bd018506f467e04039ce74e9c80a384abff832 local creator preset editing/validation/versioning
d18432820ebdcf2882b429cffe510ca89b24bf80 final prior host regressions/media validation/profiling
```

Compared with `da22abcbc2d4ec1a39380f57567566683aedb3d3`, those commits change 114
files, with 7,109 insertions and 202 deletions. Existing phase/change inventories,
device instructions and `docs/ADVANCED-AR-TEST-RESULTS.json` are tracked source.
The prior recorded evidence is 79 Python, 130 portable C#, 52 Java host and 23 Node
cases plus the standalone/browser suites. These are historical results for that
snapshot; the current continuation reruns tests independently and records its
new result. They are not Unity/phone/FPS evidence.

The previous `work/exports/CrushX-advanced-ar.bundle` was incremental and required
the earlier base commit. It was not a self-contained branch backup. New
`tools/preserve_feature_branch.py` creates a complete reachable-history bundle,
without excluding an ancestor, and verifies it from an **empty repository**.

## Complete portable export

After committing the final verified source, run from the repository root:

```bash
python tools/preserve_feature_branch.py --branch feature/crushx-advanced-ar-lens-engine --required-ancestor d18432820ebdcf2882b429cffe510ca89b24bf80 --output work/preservation/final-advanced-ar
```

The default rejects a dirty checkout, a shallow repository, an unexpected branch,
unreachable required ancestry or an existing nonempty output directory. Choose a
new output directory for a later revision. The tool never checks out another
branch, changes source, pushes, installs or executes archived source.

Outputs:

- `CrushX-complete-feature.bundle`: this feature ref and **all reachable ancestor
  commits/objects**, rather than all unrelated local or remote branches.
- `CrushX-feature-source.zip`: every ordinary tracked file at the exact commit,
  including implementation, tests, reports and Android QA instructions.
- `preservation-manifest.json`: exact branch/HEAD, all reachable commit IDs,
  per-file SHA-256/mode/length, artifact SHA-256/length and actual verification
  results. A branch changing during export fails verification.

Verification creates a fresh local clone from the bundle, compares HEAD and the
complete history list, and hashes every checked-out file against the committed
tree. The ZIP gets CRC validation and exact file/hash comparison against that same
tree. An unresolved LFS pointer, submodule or symbolic link requires a separate
reviewed preservation path and is rejected rather than being declared complete.
Global Git configuration/hooks are disabled for verification checkout.

The ZIP does not use the working directory as input. Ignored/untracked caches,
SDK downloads, media fixtures, credentials and build outputs therefore do not
enter it. Private/cache/build paths are rejected in reachable history as well,
and common private-key/token shapes are scanned without printing values.
This scan is not a substitute for organization-specific secret review; preserving
complete history cannot silently remove a historical secret without changing
commit identities. No such blocked path/token was found in the original snapshot.

An initial, explicitly committed-only backup of the original seven commits was
verified at `work/preservation/d184328-original/`: 182 reachable commits, 393
tracked files, empty-repository bundle verification and fresh clone/ZIP byte
equality passed. Its manifest honestly notes that the continuation's then-dirty
working files were excluded. The final export must be recreated after the new
commits; it must not be confused with this original-source backup.

To restore a complete bundle into an empty directory, with no GitHub access:

```bash
git clone --branch feature/crushx-advanced-ar-lens-engine /path/to/CrushX-complete-feature.bundle CrushX-restored
git -C CrushX-restored rev-parse HEAD
git -C CrushX-restored fsck --full
```

## Download access and GitHub push status

The requested chat output path was re-probed:
`/codex/browser/projectless/0002-files-pasted-by-the-user-uploaded-pasted-text-po/output`.
The actual result was `PermissionError: [Errno 13] Permission denied: '/codex'`.
No current general local-file upload/export connector exists in the available tool
catalogue. Incoming Sediment download and GitHub workflow artifact retrieval do
not expose a newly created local archive. No supported download URL was returned
or tested. **Local artifact integrity is verified; client download access is not.**
Do not present local paths as downloadable links or invent URLs.

Nothing was pushed. The user explicitly requires a separate authorization before
any push. Once that authorization exists, the exact commands below inspect and
push **only** this feature branch, without tags, submodules, force, main or merge:

```bash
git remote get-url origin
git branch --show-current
git status --short
git rev-parse HEAD
git log --oneline origin/main..feature/crushx-advanced-ar-lens-engine
git -c push.followTags=false push --dry-run --no-follow-tags --recurse-submodules=no origin refs/heads/feature/crushx-advanced-ar-lens-engine:refs/heads/feature/crushx-advanced-ar-lens-engine
git -c push.followTags=false push --no-follow-tags --recurse-submodules=no --set-upstream origin refs/heads/feature/crushx-advanced-ar-lens-engine:refs/heads/feature/crushx-advanced-ar-lens-engine
```

Expected origin is `https://github.com/mounnishant1/Crush.X.git`. A non-fast-forward
rejection requires investigation; do not force-push or overwrite the remote.
These commands are prepared instructions only and were **not executed**.

## Latest full application search

Refreshed origin read-only and inspected all **53** remote branch trees. No branch
contains `package.json`, `capacitor.config.ts/json`, `build.gradle(.kts)` or
`settings.gradle(.kts)`. The latest cumulative browser/Unity baseline remains
`da22abcbc2d4ec1a39380f57567566683aedb3d3` (28 October). The v402-named audit branches
contain audit/preflight/contract tooling, not a complete application. Workspace
search found no complete v402/newer source archive or native app project. Existing
Unity improvements on divergent branches were already compared in the preserved
implementation reports; no old code was copied over this branch.

Real Android integration still requires the actual full-source package and:

- `frontend/package.json`, the React `frontend/src/` Camera/Story/Reel/Post/Editor
  routes/state, Capacitor config and exact dependency lockfile.
- The Capacitor/Android project (`frontend/android/settings.gradle`, root/app
  Gradle files, `app/src/main/AndroidManifest.xml`, Java/Kotlin Activity/plugin
  sources), package IDs, Unity-as-Library integration and real activity result API.
- A concrete `ILensComposerHost` adapter and authenticated account/route contract,
  FileProvider/content-URI ownership plus access grants, media/draft lifetime and
  imports into the actual Story/Reel/photo/video editors.
- The real upload/publish contracts and catalogue/favourites/draft repository.

Paths above describe the expected missing host structure, not files invented or
claimed to exist. No fake Unity launcher, editor route, publishing flow, v402 test
result or production AWS change was substituted.
