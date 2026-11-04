# Isolated Crush.X Games QA: Unity EditMode, Unity debug APK, optional OnePlus test.
# Never merges, deploys, signs for production, or touches other workspaces.
[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Dev\CrushX-AR',
    [string]$UnityExe = 'F:\6000.0.30f1\Editor\Unity.exe',
    [string]$EvidenceRoot = 'F:\CrushX-Games-QA-Artifacts',
    [string]$AdbExe = 'F:\Android\Sdk\platform-tools\adb.exe',
    [string]$DeviceSerial = '',
    [switch]$InstallOnPhone
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedBranch = 'feature/crushx-lens-mini-games-puzzles-20261104'
$packageId = 'in.crushx.lens.devtest.games'

function Require-File([string]$path, [string]$purpose) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "$purpose not found: $path"
    }
}
function Require-Exit([string]$stage) {
    if ($LASTEXITCODE -ne 0) { throw "$stage exited with $LASTEXITCODE" }
}
if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "Missing clean feature-branch clone: $RepoRoot"
}
Require-File $UnityExe 'Unity Editor'
$project = Join-Path $RepoRoot 'UnityProjects\CrushXLensEngine'
Require-File (Join-Path $project 'ProjectSettings\ProjectVersion.txt') 'Unity project'
Require-File (Join-Path $project 'Assets\Scripts\Games\SliceChallengeCore.cs') 'Slice engine source'
Require-File (Join-Path $project 'Assets\Tests\EditMode\SliceChallengeTests.cs') 'Cutting tests'
$branchName = (& git -C $RepoRoot branch --show-current).Trim()
Require-Exit 'Git branch check'
if ($branchName -ne $expectedBranch) {
    throw "Expected $expectedBranch but checkout is $branchName. Worktree left unchanged."
}
$changes = @(& git -C $RepoRoot status --porcelain)
Require-Exit 'Git status check'
if ($changes.Count -ne 0) {
    throw 'Working tree is dirty. Refusing to build in a workspace with uncommitted changes.'
}
$sha = (& git -C $RepoRoot rev-parse HEAD).Trim()
Require-Exit 'Git commit check'
if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'Source commit is not a full Git SHA.' }
$version = Get-Content -LiteralPath (Join-Path $project 'ProjectSettings\ProjectVersion.txt') -Raw
if ($version -notmatch 'm_EditorVersion:\s*6000\.0\.30f1') {
    throw 'Expected pinned Unity 6000.0.30f1.'
}
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$folder = Join-Path $EvidenceRoot $stamp
New-Item -Path $folder -ItemType Directory -Force | Out-Null
$xmlPath = Join-Path $folder 'unity-editmode.xml'
$apk = Join-Path $folder 'crushx-lens-games-debug.apk'
$testLog = Join-Path $folder 'unity-editmode.log'
$buildLog = Join-Path $folder 'unity-android-build.log'
$receipt = [ordered]@{
    branch = $branchName
    sha = $sha
    package = $packageId
    editModePass = $false
    buildPass = $false
    deviceInstallPass = $false
    manualGameplayVerified = $false
    result = 'not-started'
}
function Save-Receipt {
    ($receipt | ConvertTo-Json) | Set-Content -LiteralPath (Join-Path $folder 'qa-receipt.json') -Encoding UTF8
}
Save-Receipt
try {
    Write-Host 'Running full Unity EditMode test suite...' -ForegroundColor Cyan
    $args = @('-batchmode','-nographics','-quit','-projectPath',$project,
        '-runTests','-testPlatform','EditMode','-testResults',$xmlPath,'-logFile',$testLog)
    & $UnityExe @args
    Require-Exit 'Unity test run'
    Require-File $xmlPath 'NUnit XML'
    [xml]$testResults = Get-Content -LiteralPath $xmlPath -Raw
    $testRun = $testResults.SelectSingleNode('/test-run')
    if ($null -eq $testRun) { throw 'Missing NUnit test-run XML element.' }
    $total = [int]$testRun.GetAttribute('total')
    $failures = [int]$testRun.GetAttribute('failed')
    if ($total -le 0 -or $failures -ne 0) {
        throw "Unity EditMode tests: $failures failures among $total cases."
    }
    $receipt.editModePass = $true
    $receipt.editModeTotal = $total
    Save-Receipt

    Write-Host 'Building standalone Unity Android DEVELOPMENT APK...' -ForegroundColor Cyan
    $args = @('-batchmode','-nographics','-quit','-projectPath',$project,
        '-buildTarget','Android','-executeMethod','CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk',
        '-crushxPackage',$packageId,'-crushxApk',$apk,'-crushxCommit',$sha,'-logFile',$buildLog)
    & $UnityExe @args
    Require-Exit 'Unity APK build'
    Require-File $apk 'Development APK'
    Require-File ($apk + '.build-summary.json') 'Unity build summary'
    $build = Get-Content -LiteralPath ($apk + '.build-summary.json') -Raw | ConvertFrom-Json
    if ($build.result -ne 'Succeeded') {
        throw "Unity build summary: $($build.result)"
    }
    $receipt.buildPass = $true
    Save-Receipt

    if (-not $InstallOnPhone) {
        $receipt.result = 'apk-built; device not tested'
        Save-Receipt
        Write-Host "Build evidence: $folder" -ForegroundColor Green
        return
    }

    Require-File $AdbExe 'ADB'
    $devices = @(& $AdbExe devices | Where-Object {
        $_ -match '^[^\s]+\s+device(\s+.*)?$'
    } | ForEach-Object { ($_ -split '\s+')[0] })
    if ([string]::IsNullOrEmpty($DeviceSerial)) {
        if ($devices.Count -ne 1) {
            throw "Online ADB devices = $($devices.Count). Supply -DeviceSerial."
        }
        $DeviceSerial = $devices[0]
    }
    if ($devices -notcontains $DeviceSerial) {
        throw "ADB device not online: $DeviceSerial"
    }
    $model = (& $AdbExe -s $DeviceSerial shell getprop ro.product.model).Trim()
    Require-Exit 'ADB model lookup'
    if ($model -notmatch 'LE2121|OnePlus.?9.?Pro') {
        throw "Expected OnePlus 9 Pro; connected model is $model. Install refused."
    }
    & $AdbExe -s $DeviceSerial install -r $apk
    Require-Exit 'ADB install'
    $receipt.deviceInstallPass = $true
    $receipt.deviceSerial = $DeviceSerial
    & $AdbExe -s $DeviceSerial shell monkey -p $packageId -c android.intent.category.LAUNCHER 1 | Out-Null
    Require-Exit 'ADB launch'
    Start-Sleep -Seconds 5
    (& $AdbExe -s $DeviceSerial logcat -d -t 1500) |
        Out-File (Join-Path $folder 'android-logcat.txt') -Encoding UTF8
    (& $AdbExe -s $DeviceSerial shell dumpsys gfxinfo $packageId) |
        Out-File (Join-Path $folder 'android-gfxinfo.txt') -Encoding UTF8
    $remote = '/sdcard/crushx-game-qa.png'
    & $AdbExe -s $DeviceSerial shell screencap -p $remote
    Require-Exit 'Screenshot capture'
    & $AdbExe -s $DeviceSerial pull $remote (Join-Path $folder 'android-screenshot.png')
    Require-Exit 'Screenshot retrieval'
    $receipt.result = 'apk-launched; manual 21-game gameplay QA required'
    Save-Receipt
    Write-Host "Evidence: $folder" -ForegroundColor Green
}
catch {
    $receipt.result = 'failed'
    $receipt.errorMessage = $_.Exception.Message
    Save-Receipt
    throw
}
