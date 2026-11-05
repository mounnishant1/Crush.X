# Crush.X local development QA. Never deploys production/release APKs.
# Example: .\OpenLens\run_lens_qa.ps1 -RunTests
# Example: .\OpenLens\run_lens_qa.ps1 -ConfigureURP -RunTests -ExportAndroid -BuildGradleApk -ConfirmIsolatedSource
[CmdletBinding()]
param(
    [string]$ProjectPath = (Join-Path $PSScriptRoot ".."),
    [string]$UnityExe = "F:\6000.0.30f1\Editor\Unity.exe",
    [string]$AndroidSdk = "F:\Android\Sdk",
    [switch]$ConfigureURP,
    [switch]$RunTests,
    [switch]$RunDevGate,
    [switch]$RunReleaseGate,
    [switch]$ExportAndroid,
    [switch]$BuildGradleApk,
    [switch]$InstallDeviceApk,
    [switch]$ConfirmIsolatedSource,
    [string]$Serial = "",
    [string]$ExistingApk = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$project = (Resolve-Path -LiteralPath $ProjectPath).Path
if (!(Test-Path -LiteralPath $UnityExe -PathType Leaf)) { throw "Unity missing: $UnityExe" }
if (!(Test-Path -LiteralPath (Join-Path $project "Packages\manifest.json"))) {
    throw "Invalid Unity project: $project"
}
if (!(Test-Path -LiteralPath $AndroidSdk)) { throw "Android SDK missing: $AndroidSdk" }
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$reportParent = Join-Path (Split-Path -Parent $project) "CrushXLens-QA-Reports"
New-Item -ItemType Directory -Force -Path $reportParent | Out-Null
$report = Join-Path $reportParent $stamp
New-Item -ItemType Directory -Force -Path $report | Out-Null

function Run-Unity([string[]]$unityArguments, [string]$label) {
    $log = Join-Path $report ($label + ".log")
    & $UnityExe -batchmode -nographics -quit -projectPath $project -logFile $log @unityArguments
    $code = $LASTEXITCODE
    Write-Host "$label exit=$code log=$log"
    if ($code -ne 0) {
        Get-Content -LiteralPath $log -Tail 70
        throw "$label failed with exit=$code"
    }
}

if (($ConfigureURP -or $ExportAndroid -or $BuildGradleApk -or $InstallDeviceApk) -and
    -not $ConfirmIsolatedSource) {
    throw "Use -ConfirmIsolatedSource with a separate checkout. Never mutate a production working directory."
}
if ($ConfigureURP) {
    $env:CRUSHX_ALLOW_DEBUG_URP_SETUP = "1"
    try { Run-Unity @("-executeMethod","CrushX.LensEngine.Editor.CrushXIsolatedURPSetup.CreateForCI") "configure-urp" }
    finally { Remove-Item Env:\CRUSHX_ALLOW_DEBUG_URP_SETUP -ErrorAction SilentlyContinue }
}
if ($RunDevGate) {
    Run-Unity @("-executeMethod","CrushX.LensEngine.Editor.CrushXLensReleasePreflight.RunDevCI") "dev-gates"
}
if ($RunReleaseGate) {
    Run-Unity @("-executeMethod","CrushX.LensEngine.Editor.CrushXLensReleasePreflight.RunReleaseCI") "release-gates"
}
if ($RunTests) {
    $xml = Join-Path $report "editmode-results.xml"
    Run-Unity @("-runTests","-testPlatform","EditMode","-testResults",$xml) "editmode"
    if (!(Test-Path -LiteralPath $xml)) { throw "Missing EditMode NUnit XML: $xml" }
    [xml]$parsed = Get-Content -LiteralPath $xml -Raw
    $failed = [int]$parsed.DocumentElement.GetAttribute("failed")
    if ($failed -gt 0) { throw "NUnit test failures=$failed, see $xml" }
}
$exported = Join-Path $report "ExportedAndroid"
if ($ExportAndroid) {
    $env:CRUSHX_ALLOW_LENS_EXPORT = "1"
    $env:CRUSHX_LENS_EXPORT_DIR = $exported
    try {
        Run-Unity @("-buildTarget","Android","-executeMethod","CrushX.LensEngine.Editor.CrushXLensAndroidExport.ExportArm64Development") "unity-arm64-export"
    } finally {
        Remove-Item Env:\CRUSHX_ALLOW_LENS_EXPORT -ErrorAction SilentlyContinue
        Remove-Item Env:\CRUSHX_LENS_EXPORT_DIR -ErrorAction SilentlyContinue
    }
}
$apk = $ExistingApk
if ($BuildGradleApk) {
    if (!(Test-Path -LiteralPath $exported)) { throw "Exported Unity Android project missing. Use -ExportAndroid in this run." }
    $wrapper = Join-Path $exported "gradlew.bat"
    if (!(Test-Path -LiteralPath $wrapper)) { throw "Gradle wrapper missing: $wrapper" }
    if (Test-Path -LiteralPath (Join-Path $exported "launcher")) { $module = "launcher" }
    elseif (Test-Path -LiteralPath (Join-Path $exported "app")) { $module = "app" }
    else { throw "No launcher or app module in Unity Gradle export" }
    Push-Location $exported
    try {
        $gradleLog = Join-Path $report "gradle-assemble.log"
        & $wrapper ":$($module):assembleDebug" --no-daemon *> $gradleLog
        if ($LASTEXITCODE -ne 0) {
            Get-Content -LiteralPath $gradleLog -Tail 100
            throw "Gradle debug assemble failed: $gradleLog"
        }
        $apks = @(Get-ChildItem -Path (Join-Path $exported $module) -Filter "*debug*.apk" -Recurse -File)
        if ($apks.Count -eq 0) { throw "Gradle passed but no Debug APK found" }
        $apk = ($apks | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
        Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
    } finally { Pop-Location }
}
if ($InstallDeviceApk) {
    if ([string]::IsNullOrWhiteSpace($Serial)) { throw "ADB serial required: use adb devices -l" }
    if (!(Test-Path -LiteralPath $apk -PathType Leaf)) { throw "Debug APK missing: $apk" }
    $adb = Join-Path $AndroidSdk "platform-tools\adb.exe"
    if (!(Test-Path -LiteralPath $adb)) { throw "ADB missing: $adb" }
    & $adb -s $Serial get-state | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "ADB target device not responding" }
    & $adb -s $Serial install -r $apk | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Android debug APK installation failed" }
}
Write-Host "Lens QA results: $report"
Write-Host "Visual front-camera QA, 30 FPS and video export parity remain separate acceptance gates."
