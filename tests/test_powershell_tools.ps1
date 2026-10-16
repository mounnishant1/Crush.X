param([string]$Repository = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$Repository = (Resolve-Path -LiteralPath $Repository).Path
$runner = Join-Path $Repository 'tools/run_unity_checks.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($runner, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
# Load only the pure result readers, without invoking Windows/Unity/build stages.
foreach ($name in @('Read-UnityTestSummary', 'Confirm-UnityTests')) {
    $function = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) |
        Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if (!$function) { throw "Missing result helper: $name" }
    . ([scriptblock]::Create($function.Extent.Text))
}
$output = Join-Path $Repository ('work/powershell-result-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
$testSummaries = @{}
$fixtures = @(
    @{ name = 'mixed'; xml = '<test-run testcasecount="2" passed="1" failed="0" skipped="1" inconclusive="0" result="Passed" />'; accepted = $true },
    @{ name = 'failed'; xml = '<test-run testcasecount="2" passed="1" failed="1" skipped="0" result="Failed" />'; accepted = $false },
    @{ name = 'empty'; xml = '<test-run testcasecount="0" passed="0" failed="0" skipped="0" result="Passed" />'; accepted = $false },
    @{ name = 'all-skipped'; xml = '<test-run testcasecount="2" passed="0" failed="0" skipped="2" result="Passed" />'; accepted = $false }
)
foreach ($fixture in $fixtures) {
    $path = Join-Path $output ($fixture.name + '.xml')
    $fixture.xml | Set-Content -LiteralPath $path -Encoding utf8
    $accepted = $true
    try { Confirm-UnityTests -Stage $fixture.name -Path $path }
    catch { $accepted = $false }
    if ($accepted -ne $fixture.accepted) { throw "Incorrect acceptance: $($fixture.name)" }
}
$summary = Get-Content -LiteralPath (Join-Path $output 'test-summary.json') -Raw | ConvertFrom-Json
if ($summary.mixed.passed -ne 1 -or $summary.mixed.skipped -ne 1 -or !$summary.mixed.accepted -or $summary.'all-skipped'.accepted) {
    throw 'Persisted test summary hid skipped cases or accepted a suite that ran no passing cases.'
}
foreach ($fixture in @('malformed', 'missing')) {
    $path = Join-Path $output ($fixture + '.xml')
    if ($fixture -eq 'malformed') { '<test-run' | Set-Content -LiteralPath $path -Encoding utf8 }
    $rejected = $false
    try { $null = Read-UnityTestSummary -Stage $fixture -Path $path }
    catch { $rejected = $true }
    if (!$rejected) { throw "Did not reject $fixture XML." }
}
Write-Host "PASS: six PowerShell test-result cases. Synthetic XML only; no Unity or Windows execution. Fixtures: $output"
