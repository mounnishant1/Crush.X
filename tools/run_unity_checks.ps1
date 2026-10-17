param(
    [string]$Repository = (Split-Path -Parent $PSScriptRoot),
    [string]$Unity = 'F:\6000.0.30f1\Editor\Unity.exe',
    [string]$CacheRoot = 'F:\CrushX-Temp\Caches',
    [string]$Artifacts = 'F:\CrushX-Temp\UnityRuns',
    [switch]$BuildAndroid,
    [switch]$RunPlayMode,
    [switch]$GenerateLensCovers,
    [switch]$AllowLowMemory,
    [int]$TimeoutMinutes = 45,
    [string]$Package = 'in.crushx.lens.pr3test'
)
$ErrorActionPreference = 'Stop'
if ($TimeoutMinutes -lt 1 -or $TimeoutMinutes -gt 180) { throw 'TimeoutMinutes must be 1..180.' }
if (!(Test-Path -LiteralPath $Unity -PathType Leaf)) { throw "Unity executable unavailable: $Unity" }
$editorVersion = (Get-Item -LiteralPath $Unity).VersionInfo.ProductVersion
if ($editorVersion -notmatch '(?<![0-9])6000\.0\.30f1(?![a-zA-Z0-9])') {
    throw "Selected Unity executable reports '$editorVersion'; expected 6000.0.30f1. Verify the installed Editor before opening this project."
}
$Repository = (Resolve-Path -LiteralPath $Repository).Path
$project = Join-Path $Repository 'UnityProjects\CrushXLensEngine'
if (!(Test-Path -LiteralPath (Join-Path $project 'ProjectSettings\ProjectVersion.txt'))) { throw 'Unity project not found.' }
$version = Get-Content -LiteralPath (Join-Path $project 'ProjectSettings\ProjectVersion.txt') -Raw
if ($version -notmatch 'm_EditorVersion: 6000\.0\.30f1\s') { throw 'Project is not the audited Unity 6000.0.30f1 version.' }
if ($Package -cnotmatch '^in\.crushx\.lens\.(pr3test|devtest)(\.[a-z][a-z0-9_]*)*$') { throw 'Only an isolated test package is permitted.' }
# Default to F: and fail clearly if that drive is absent; never silently consume C:.
foreach ($path in @($CacheRoot, $Artifacts)) {
    $root = [System.IO.Path]::GetPathRoot($path)
    if ($root -and !(Test-Path -LiteralPath $root)) { throw "Configured output drive unavailable: $root" }
    New-Item -ItemType Directory -Force -Path $path | Out-Null
}
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$output = Join-Path $Artifacts $runId
New-Item -ItemType Directory -Path $output | Out-Null
$environmentNames = @('TEMP', 'TMP', 'GRADLE_USER_HOME', 'UPM_CACHE_ROOT', 'UNITY_GI_CACHE_FOLDER', 'JAVA_TOOL_OPTIONS')
$previous = @{}
foreach ($name in $environmentNames) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$tempDirectory = Join-Path $CacheRoot 'Temp'
$gradleDirectory = Join-Path $CacheRoot 'Gradle'
$upmDirectory = Join-Path $CacheRoot 'UPM'
$giDirectory = Join-Path $CacheRoot 'GI'
foreach ($path in @($tempDirectory, $gradleDirectory, $upmDirectory, $giDirectory)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }

function Invoke-Unity([string]$Stage, [string[]]$Extra, [switch]$WithGraphics) {
    $log = Join-Path $output "$Stage.log"
    $arguments = @('-batchmode')
    if (!$WithGraphics) { $arguments += '-nographics' }
    $arguments += @('-projectPath', $project, '-buildTarget', 'Android', '-logFile', $log) + $Extra
    # Start-Process ArgumentList joins values; quote whitespace/backslashes explicitly for Windows.
    $quoted = foreach ($argument in $arguments) {
        '"' + [regex]::Replace([regex]::Replace($argument, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
    }
    Write-Host "Unity $Stage; log: $log"
    $process = Start-Process -FilePath $Unity -ArgumentList ($quoted -join ' ') -PassThru -WorkingDirectory $project
    if (!$process.WaitForExit($TimeoutMinutes * 60000)) {
        Stop-Process -Id $process.Id -Force
        throw "Unity $Stage exceeded $TimeoutMinutes minutes; see $log."
    }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw "Unity $Stage failed (exit $($process.ExitCode)); see $log." }
}

function Read-UnityTestSummary([string]$Stage, [string]$Path) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Unity returned without $Stage results: $Path" }
    [xml]$results = Get-Content -LiteralPath $Path -Raw
    $root = $results.DocumentElement
    $cases = [int]$root.GetAttribute('testcasecount')
    $passed = [int]$root.GetAttribute('passed')
    $failed = [int]$root.GetAttribute('failed')
    return [pscustomobject]@{
        stage = $Stage; result = $root.GetAttribute('result'); cases = $cases
        passed = $passed; failed = $failed; skipped = [int]$root.GetAttribute('skipped')
        inconclusive = [int]$root.GetAttribute('inconclusive'); resultsPath = $Path
        accepted = ($cases -gt 0 -and $passed -gt 0 -and $failed -eq 0 -and $root.GetAttribute('result') -eq 'Passed')
    }
}

function Confirm-UnityTests([string]$Stage, [string]$Path) {
    $summary = Read-UnityTestSummary -Stage $Stage -Path $Path
    $testSummaries[$Stage] = $summary
    $testSummaries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'test-summary.json') -Encoding utf8
    Write-Host "$Stage results: passed=$($summary.passed), failed=$($summary.failed), skipped=$($summary.skipped), inconclusive=$($summary.inconclusive)"
    if (!$summary.accepted) { throw "$Stage suite is empty, entirely skipped, or failing; see $Path." }
}

# Practical headroom guard, not a claim about Unity's minimum hardware requirements.
# The 17 October OnePlus test build reached UnityLinker and ran out of memory
# with only ~0.64 GiB free physical and ~0.26 GiB free virtual memory.
function Confirm-BuildMemoryHeadroom {
    try { $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop }
    catch {
        Write-Warning "Could not inspect Windows memory headroom: $($_.Exception.Message)"
        return
    }
    $memory = [pscustomobject]@{
        totalPhysicalGiB = [math]::Round([double]$os.TotalVisibleMemorySize / 1048576, 2)
        freePhysicalGiB  = [math]::Round([double]$os.FreePhysicalMemory / 1048576, 2)
        freeVirtualGiB   = [math]::Round([double]$os.FreeVirtualMemory / 1048576, 2)
        lowMemoryOverride = [bool]$AllowLowMemory
    }
    $memory | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'memory-preflight.json') -Encoding utf8
    Write-Host "Build memory: physical free=$($memory.freePhysicalGiB) GiB; virtual free=$($memory.freeVirtualGiB) GiB"
    if ($memory.freePhysicalGiB -lt 2 -or $memory.freeVirtualGiB -lt 4) {
        $message = 'Low memory headroom may fail UnityLinker. Save work, close other applications and reboot before the Android build. Check pagefile and disk space if virtual memory stays low.'
        if (!$AllowLowMemory) { throw "$message The -AllowLowMemory switch explicitly permits an attempted build." }
        Write-Warning "$message Continuing because -AllowLowMemory was specified."
    }
    elseif ($memory.freePhysicalGiB -lt 3 -or $memory.freeVirtualGiB -lt 6) {
        Write-Warning 'Memory headroom is limited; an Android IL2CPP build may still fail. Watch the UnityLinker stage.'
    }
}

$testSummaries = @{}

try {
    $env:TEMP = $tempDirectory
    $env:TMP = $tempDirectory
    $env:GRADLE_USER_HOME = $gradleDirectory
    $env:UPM_CACHE_ROOT = $upmDirectory
    $env:UNITY_GI_CACHE_FOLDER = $giDirectory
    # Unity/Gradle children inherit temp directories; preserve any existing JVM options.
    $env:JAVA_TOOL_OPTIONS = (($previous['JAVA_TOOL_OPTIONS'], ('-Djava.io.tmpdir="' + $tempDirectory + '"')) -join ' ').Trim()
    $commit = (& git -C $Repository rev-parse HEAD)
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Cannot identify exact checkout commit.' }
    & git -C $Repository status --short | Out-File -LiteralPath (Join-Path $output 'source-status.txt') -Encoding utf8
    if ($BuildAndroid) { Confirm-BuildMemoryHeadroom }
    Invoke-Unity -Stage 'import-compile' -Extra @('-quit')
    if ($GenerateLensCovers) {
        # Actual effect covers need GPU rendering. Preserve new source assets for review/build provenance.
        Invoke-Unity -Stage 'lens-covers' -WithGraphics -Extra @('-quit', '-executeMethod', 'CrushX.LensEngine.Editor.CrushXLensCoverBaker.BatchGenerate')
        & git -C $Repository status --short | Out-File -LiteralPath (Join-Path $output 'source-status-after-covers.txt') -Encoding utf8
    }
    Invoke-Unity -Stage 'editmode' -Extra @('-runTests', '-testPlatform', 'EditMode', '-testResults', (Join-Path $output 'editmode.xml'))
    Confirm-UnityTests -Stage 'EditMode' -Path (Join-Path $output 'editmode.xml')
    if ($RunPlayMode) {
        Invoke-Unity -Stage 'playmode' -Extra @('-runTests', '-testPlatform', 'PlayMode', '-testResults', (Join-Path $output 'playmode.xml'))
        Confirm-UnityTests -Stage 'PlayMode' -Path (Join-Path $output 'playmode.xml')
    }
    if ($BuildAndroid) {
        Invoke-Unity -Stage 'android-build' -Extra @('-quit', '-executeMethod', 'CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk',
            '-crushxApk', (Join-Path $output 'CrushX-pr3test.apk'), '-crushxPackage', $Package, '-crushxCommit', $commit)
        if (!(Test-Path -LiteralPath (Join-Path $output 'CrushX-pr3test.apk'))) { throw 'Unity returned without the APK.' }
        Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output 'CrushX-pr3test.apk') | Format-List | Out-File -LiteralPath (Join-Path $output 'apk-sha256.txt')
    }
    Write-Host "Completed requested Unity stages. Evidence: $output. Physical-device behavior remains unverified."
}
finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
