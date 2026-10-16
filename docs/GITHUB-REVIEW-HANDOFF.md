# Review the approved source on Windows

16 October 2026. The user approved pushing the reviewed feature branch and updating draft PR #4,
and installing the verified development APK on the identified OnePlus when it becomes connected.
No merge, deployment, store publishing or AWS production change is authorized or performed.

Draft PR: https://github.com/mounnishant1/Crush.X/pull/4
Branch: `codex/crushx-final-lens-engine`. Base: the existing PR #3 review branch.
The draft remains unverified on Windows/OnePlus; sharing source is not an acceptance result.

Use Windows PowerShell to fetch the feature branch and create a separate review worktree on F:.
The existing `F:\CrushX-Git\Crush.X` working files and selected branch are preserved, including
uncommitted work. These commands do not install an APK, push Git, delete files, or deploy anything.

```powershell
$ErrorActionPreference = 'Stop'
$repo = 'F:\CrushX-Git\Crush.X'
$branch = 'codex/crushx-final-lens-engine'
& git -C $repo status --short
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the original repository.' }
& git -C $repo fetch 'https://github.com/mounnishant1/Crush.X.git' ('refs/heads/' + $branch)
if ($LASTEXITCODE -ne 0) { throw 'Feature branch fetch failed.' }
$revision = & git -C $repo rev-parse FETCH_HEAD
if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[0-9a-f]{40}$') { throw 'Cannot identify the fetched review commit.' }
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$parent = 'F:\CrushX-Temp\ReviewCopies'
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$review = Join-Path $parent ('Crush.X-' + $revision.Substring(0, 12) + '-' + $runId)
if (Test-Path -LiteralPath $review) { throw 'Review directory already exists.' }
& git -C $repo worktree add --detach $review $revision
if ($LASTEXITCODE -ne 0) { throw 'Isolated review worktree creation failed.' }
& git -C $review show -s --format='%H %s' HEAD
& git -C $review status --short
Write-Host "Review source: $review"
```

Confirm the revision matches the current PR head. The explicit GitHub fetch avoids assuming an
existing `origin` points to the expected repository. It only writes local Git fetch metadata and
creates the new source worktree; it does not switch or clean the original checkout.

With a licensed Unity 6000.0.30f1 Editor and its Android support installed, build/test the review copy:

```powershell
$unity = 'F:\6000.0.30f1\Editor\Unity.exe'
powershell.exe -NoProfile -File (Join-Path $review 'tools\run_unity_checks.ps1') `
    -Repository $review -Unity $unity `
    -CacheRoot 'F:\CrushX-Temp\Caches' -Artifacts 'F:\CrushX-Temp\UnityRuns' `
    -RunPlayMode -BuildAndroid -Package 'in.crushx.lens.pr3test'
if ($LASTEXITCODE -ne 0) { throw 'Unity checks/build failed; inspect the captured logs and XML.' }
```

The Editor path is a candidate and is verified before the project opens. APK build success does not
install or verify anything. Inspect exact source/build ID, isolated package, APK hash and merged
manifest. [ANDROID-VERIFICATION.md](ANDROID-VERIFICATION.md) contains read-only device collection
commands and physical acceptance gates. The PowerShell evidence wrapper has no install option;
the underlying Python collector's optional install requires exact serial/model, isolated development
package, matching APK manifest and packaged build identity. Never substitute an unrelated installed
app or an unverified artifact. Permission to install does not establish device connectivity.

Keep this PR in draft until Unity import/type compilation/tests, Android build and actual OnePlus
front-camera/face subsystem/Fox/input/media/performance gates are independently recorded. No
Snapchat parity or exact device root cause is claimed by this source publication.

## Authorized guarded development installation

Only run after the exact review APK builds successfully and the connected physical phone is
confirmed to be the authorized OnePlus 9 Pro. Keep the build sidecar alongside the APK. First use
the read-only device commands in the Android runbook to confirm actual serial/model and manifest.
The collector additionally requires those exact values, the isolated test-package manifest and
matching development build metadata embedded in the APK. It installs with replacement only for
that separate test package; it never uninstalls, clears app data/logs, grants permissions or launches.
No APK/device was available for this operation in the engineering session.

```powershell
$adb = Read-Host 'Full path to installed adb.exe'
$python = Read-Host 'Full path to Python 3.10+ python.exe'
& $adb devices -l
$serial = Read-Host 'Exact serial of the physically confirmed authorized OnePlus 9 Pro'
& $adb -s $serial shell getprop ro.product.model
$model = Read-Host 'Exact verified OnePlus model identifier shown by the command above'
$apk = Read-Host 'Full path to the successfully built review APK'
$manifestTool = Read-Host 'Full path to installed aapt2.exe for actual APK manifest inspection'
$installEvidence = Join-Path 'F:\CrushX-Temp\DeviceEvidence' ('authorized-install-' + [guid]::NewGuid().ToString('N'))
& $python (Join-Path $review 'tools\collect_android_evidence.py') `
    --adb $adb --serial $serial --expected-model $model --package 'in.crushx.lens.pr3test' `
    --install --apk $apk --build-info ($apk + '.build-info.json') --manifest-tool $manifestTool `
    --seconds 90 --output $installEvidence
if ($LASTEXITCODE -ne 0) { throw 'Guarded installation/evidence failed; inspect the preserved errors.' }
```

Wait for the live Logcat capture prompt, then open the test app manually and perform the Android
acceptance runbook. Installation success or a Tracking log does not verify visible mask alignment,
media, input, recovery or performance. Record each acceptance result and exact native errors.
