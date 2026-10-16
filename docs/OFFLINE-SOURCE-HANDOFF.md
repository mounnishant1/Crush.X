# Offline source handoff without a Git push

16 October 2026. The Windows workstation is not connected. The approved development source is also shared through
draft PR #4; [GITHUB-REVIEW-HANDOFF.md](GITHUB-REVIEW-HANDOFF.md) covers that simpler fetch path.
A local Git bundle and tracked-source ZIP can carry the reviewed source to Windows without
publishing a branch or modifying `F:\CrushX-Git\Crush.X`. Creating archives is not a Windows
transfer, Unity compilation, Android build, device installation or physical acceptance result.

The handoff directory contains `CrushX-source.bundle`, `CrushX-source.zip` and
`source-manifest.json`, plus this guide as `README-WINDOWS.md`. The manifest identifies the exact source commit/tree and SHA256/size of
each archive. The bundle is self-contained and includes the history reachable from that commit.
The ZIP contains the tracked snapshot only, including Unity asset metadata, and excludes local
build/cache/evidence directories. No Unity/SDK executable, APK or device evidence is included.

After copying all four files to a new directory under `F:\CrushX-Temp`, use Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
$handoff = Read-Host 'Full path to the copied handoff directory under F:\CrushX-Temp'
$manifest = Get-Content -LiteralPath (Join-Path $handoff 'source-manifest.json') -Raw | ConvertFrom-Json
$commit = [string]$manifest.sourceCommit
if ($commit -notmatch '^[0-9a-f]{40}$') { throw 'Invalid source commit in manifest.' }
foreach ($artifact in $manifest.artifacts) {
    $path = Join-Path $handoff $artifact.name
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($hash -ne $artifact.sha256 -or (Get-Item -LiteralPath $path).Length -ne $artifact.bytes) {
        throw "Artifact hash/size mismatch: $($artifact.name)"
    }
}
$bundle = Join-Path $handoff 'CrushX-source.bundle'
& git -C 'F:\CrushX-Git\Crush.X' bundle verify $bundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed.' }
$destination = Join-Path 'F:\CrushX-Temp\ReviewCopies' ('Crush.X-' + $commit.Substring(0, 12))
if (Test-Path -LiteralPath $destination) { throw 'Review copy already exists; choose a new destination.' }
& git clone --no-checkout $bundle $destination
if ($LASTEXITCODE -ne 0) { throw 'Local bundle clone failed.' }
& git -C $destination checkout --detach $commit
if ($LASTEXITCODE -ne 0) { throw 'Reviewed commit checkout failed.' }
$actual = & git -C $destination rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $commit) { throw 'Review checkout does not match the manifest.' }
& git -C $destination status --short
Write-Host "Isolated source ready for review: $destination at $commit"
```

These commands verify local files and create a new review copy. They do not fetch from or push to
GitHub, overwrite the existing repository, delete files, install an APK or call AWS. Check the source
and scripts in the review copy, then use `$destination` as `-Repository` in
[ANDROID-VERIFICATION.md](ANDROID-VERIFICATION.md). Keep Unity caches/build output on F:.

The source commit must equal the manifest, not the older PR #4 head. The detached checkout is
intentional for review; creating a new local development branch later does not require publishing.
The original Windows project and currently installed app remain separate from this source copy.

The Linux preparation checks verify bundle integrity, a clean clone at the declared commit and
ZIP paths/bytes against the Git tree. Windows copy, commands, Unity toolchain and OnePlus behavior
still need execution. The exact original ARCore failure reason remains unestablished.
