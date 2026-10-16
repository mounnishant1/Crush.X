param(
    [Parameter(Mandatory = $true)][string]$Serial,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$')][string]$Package,
    [string]$Repository = (Split-Path -Parent $PSScriptRoot),
    [string]$Adb,
    [string]$Python,
    [string]$ManifestTool,
    [string]$Apk,
    [string]$Artifacts = 'F:\CrushX-Temp\DeviceEvidence',
    [ValidateRange(1, 600)][int]$Seconds = 60
)
$ErrorActionPreference = 'Stop'
# This wrapper has no installation/launch/permission-write option. Reproduce manually.
$Repository = (Resolve-Path -LiteralPath $Repository).Path
$collector = Join-Path $Repository 'tools\collect_android_evidence.py'
if (!(Test-Path -LiteralPath $collector -PathType Leaf)) { throw "Collector missing: $collector" }

$sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
if ($env:LOCALAPPDATA) { $sdkRoots += Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (!$Adb) {
    $adbCommand = Get-Command adb -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($adbCommand) { $Adb = $adbCommand.Source }
    else {
        foreach ($sdk in $sdkRoots) {
            if (!$sdk) { continue }
            $candidate = Join-Path $sdk 'platform-tools\adb.exe'
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $Adb = $candidate; break }
        }
    }
}
if (!$Adb -or !(Test-Path -LiteralPath $Adb -PathType Leaf)) {
    throw 'ADB not found. Supply -Adb with the installed adb.exe path; no SDK will be installed.'
}
$Adb = (Resolve-Path -LiteralPath $Adb).Path
$sdkRoots += Split-Path -Parent (Split-Path -Parent $Adb)
if (!$ManifestTool) {
    foreach ($name in @('aapt2', 'aapt', 'apkanalyzer')) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { $ManifestTool = $command.Source; break }
    }
    if (!$ManifestTool) {
        foreach ($sdk in $sdkRoots) {
            if (!$sdk) { continue }
            $buildTools = Join-Path $sdk 'build-tools'
            if (!(Test-Path -LiteralPath $buildTools -PathType Container)) { continue }
            foreach ($directory in (Get-ChildItem -LiteralPath $buildTools -Directory | Sort-Object Name -Descending)) {
                $candidate = Join-Path $directory.FullName 'aapt2.exe'
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $ManifestTool = $candidate; break }
            }
            if ($ManifestTool) { break }
        }
    }
}
if (!$Python) {
    foreach ($name in @('py', 'python')) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { $Python = $command.Source; break }
    }
}
if (!$Python) { throw 'Python 3.10+ is required; supply -Python with its executable path.' }
$pythonPrefix = @()
if ([System.IO.Path]::GetFileNameWithoutExtension($Python) -eq 'py') { $pythonPrefix = @('-3') }
& $Python @pythonPrefix -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 2)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required.' }
if ($Apk) { $Apk = (Resolve-Path -LiteralPath $Apk).Path }
if ($ManifestTool) { $ManifestTool = (Resolve-Path -LiteralPath $ManifestTool).Path }
if ($Apk -and !$ManifestTool) {
    throw 'Offline APK inspection requires aapt2, aapt or apkanalyzer. Supply -ManifestTool or omit -Apk for read-only device capture.'
}
$root = [System.IO.Path]::GetPathRoot($Artifacts)
if (!$root -or !(Test-Path -LiteralPath $root)) { throw "Evidence drive unavailable: $Artifacts" }
New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$output = Join-Path $Artifacts $runId
$collectorArguments = @($collector, '--adb', $Adb, '--serial', $Serial, '--package', $Package,
    '--seconds', $Seconds.ToString(), '--output', $output)
if ($ManifestTool) { $collectorArguments += @('--manifest-tool', $ManifestTool) }
if ($Apk) { $collectorArguments += @('--apk', $Apk) }
Write-Host "Read-only device capture to $output. Reproduce the failure manually during the $Seconds-second window."
& $Python @pythonPrefix @collectorArguments
if ($LASTEXITCODE -ne 0) { throw "Evidence collection failed; inspect any recorded output in $output." }
Write-Host "Evidence collected in $output. Device acceptance and root cause still require review."
