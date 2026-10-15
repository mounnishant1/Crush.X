param(
    [string]$Repository = (Split-Path -Parent $PSScriptRoot),
    [string]$Unity = 'F:\6000.0.30f1\Editor\Unity.exe',
    [string]$CacheRoot = 'F:\CrushX-Temp\Caches',
    [string]$Artifacts = 'F:\CrushX-Temp\UnityRuns',
    [switch]$BuildAndroid,
    [switch]$RunPlayMode,
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

function Invoke-Unity([string]$Stage, [string[]]$Extra) {
    $log = Join-Path $output "$Stage.log"
    $arguments = @('-batchmode', '-nographics', '-projectPath', $project, '-buildTarget', 'Android', '-logFile', $log) + $Extra
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
    Invoke-Unity -Stage 'import-compile' -Extra @('-quit')
    Invoke-Unity -Stage 'editmode' -Extra @('-runTests', '-testPlatform', 'EditMode', '-testResults', (Join-Path $output 'editmode.xml'))
    if (!(Test-Path -LiteralPath (Join-Path $output 'editmode.xml'))) { throw 'Unity returned without EditMode results.' }
    [xml]$testResults = Get-Content -LiteralPath (Join-Path $output 'editmode.xml') -Raw
    $testRoot = $testResults.DocumentElement
    if ([int]$testRoot.GetAttribute('testcasecount') -lt 1 -or [int]$testRoot.GetAttribute('failed') -gt 0 -or $testRoot.GetAttribute('result') -ne 'Passed') {
        throw 'EditMode results did not verify a nonempty, passing test suite.'
    }
    if ($RunPlayMode) {
        Invoke-Unity -Stage 'playmode' -Extra @('-runTests', '-testPlatform', 'PlayMode', '-testResults', (Join-Path $output 'playmode.xml'))
        if (!(Test-Path -LiteralPath (Join-Path $output 'playmode.xml'))) { throw 'Unity returned without PlayMode results.' }
        [xml]$playResults = Get-Content -LiteralPath (Join-Path $output 'playmode.xml') -Raw
        if ([int]$playResults.DocumentElement.GetAttribute('testcasecount') -lt 1 -or $playResults.DocumentElement.GetAttribute('result') -ne 'Passed') { throw 'PlayMode suite missing, empty or failing.' }
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
