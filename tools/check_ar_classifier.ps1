param(
    [Parameter(Mandatory = $true)][string]$NUnitFramework,
    [Parameter(Mandatory = $true)][string]$NUnitLite,
    [string]$Repository = (Split-Path -Parent $PSScriptRoot),
    [string]$Artifacts
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'This host-only compiler check requires PowerShell 7; the Windows Unity runner separately supports Windows PowerShell 5.1.' }
$Repository = (Resolve-Path -LiteralPath $Repository).Path
$NUnitFramework = (Resolve-Path -LiteralPath $NUnitFramework).Path
$NUnitLite = (Resolve-Path -LiteralPath $NUnitLite).Path
foreach ($dependency in @(@{ path = $NUnitFramework; name = 'nunit.framework' }, @{ path = $NUnitLite; name = 'nunitlite' })) {
    $identity = [System.Reflection.AssemblyName]::GetAssemblyName($dependency.path)
    if ($identity.Name -ne $dependency.name -or $identity.Version.ToString() -ne '3.13.3.0') {
        throw "Expected $($dependency.name) 3.13.3.0; found $($identity.FullName)."
    }
}
$sources = @(
    (Join-Path $Repository 'UnityProjects/CrushXLensEngine/Assets/Scripts/Tracking/ARDiagnosticClassifier.cs'),
    (Join-Path $Repository 'UnityProjects/CrushXLensEngine/Assets/Tests/EditMode/ARDiagnosticClassifierTests.cs')
)
foreach ($path in $sources) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing original C# source: $path" }
}
$referenceDirectory = Join-Path $PSHOME 'ref'
if (!(Test-Path -LiteralPath $referenceDirectory -PathType Container)) { throw 'PowerShell .NET compiler reference assemblies are unavailable.' }
if (!$Artifacts) { $Artifacts = Join-Path $Repository 'work/classifier-host-tests' }
New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null
$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$output = Join-Path $Artifacts $runId
New-Item -ItemType Directory -Path $output | Out-Null
Add-Type -Path $NUnitFramework
Add-Type -Path $NUnitLite
$references = @($NUnitFramework) + @(Get-ChildItem -LiteralPath $referenceDirectory -Filter '*.dll' -File | ForEach-Object { $_.FullName })
$assemblyPath = Join-Path $output 'CrushXClassifier.HostTests.dll'
# Compile the unchanged application classifier and its existing NUnit fixture.
# No Unity assemblies, Unity stubs, XR loader, camera or device are involved.
Add-Type -Path $sources -ReferencedAssemblies $references -OutputAssembly $assemblyPath -OutputType Library
$compiled = [System.Reflection.Assembly]::LoadFrom($assemblyPath)
$runner = [NUnitLite.AutoRun]::new($compiled)
$resultPath = Join-Path $output 'classifier-results.xml'
$arguments = [string[]]@('--workers=0', ('--work=' + $output), ('--result=' + $resultPath))
$exitCode = $runner.Execute($arguments)
if (!(Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'NUnit returned without a result file.' }
[xml]$results = Get-Content -LiteralPath $resultPath -Raw
$root = $results.DocumentElement
$summary = [ordered]@{
    scope = 'Existing platform-independent AR classifier fixture on host .NET; no Unity or Android execution'
    runtime = [System.Runtime.InteropServices.RuntimeInformation]::FrameworkDescription
    operatingSystem = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
    nunitVersion = '3.13.3'; runnerExitCode = $exitCode
    result = $root.GetAttribute('result'); cases = [int]$root.GetAttribute('testcasecount')
    passed = [int]$root.GetAttribute('passed'); failed = [int]$root.GetAttribute('failed')
    skipped = [int]$root.GetAttribute('skipped'); inconclusive = [int]$root.GetAttribute('inconclusive')
    inputs = @($sources | ForEach-Object { @{ path = $_; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash.ToLowerInvariant() } })
    resultsPath = $resultPath
    unityCompilation = 'NOT RUN'; deviceAcceptance = 'NOT TESTED'; originalARRootCause = 'NOT ESTABLISHED'
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'host-summary.json') -Encoding utf8
if ($exitCode -ne 0 -or $summary.result -ne 'Passed' -or $summary.passed -lt 1 -or $summary.failed -ne 0 -or $summary.skipped -ne 0 -or $summary.inconclusive -ne 0) {
    throw "Host C# classifier cases failed or did not all run; see $resultPath."
}
Write-Host "PASS: $($summary.passed) existing C# classifier cases compiled and executed on host .NET. Unity and Android were not executed. Evidence: $output"
