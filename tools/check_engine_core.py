#!/usr/bin/env python3
"""Compile and execute actual platform-independent Unity runtime policies on host .NET.

This does not use Unity stubs, import Unity assets, compile the Unity project,
exercise Android codecs, or certify device behavior. Generated files stay in work/.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet', default=shutil.which('dotnet'), help='Path to .NET 8 SDK executable')
    parser.add_argument('--output', type=Path, default=ROOT / 'work/engine-core')
    args = parser.parse_args()
    if not args.dotnet:
        parser.error('A .NET 8 SDK is required; use --dotnet or put dotnet on PATH.')
    output = args.output.resolve()
    # Keep the build out of versioned Unity/application directories.
    try:
        output.relative_to(ROOT / 'work')
    except ValueError:
        parser.error('--output must be inside the repository work/ directory.')
    output.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ)
    environment.update({
        'DOTNET_CLI_HOME': str(output / 'dotnet-home'),
        'DOTNET_CLI_TELEMETRY_OPTOUT': '1',
        'DOTNET_SKIP_FIRST_TIME_EXPERIENCE': '1',
        'DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE': '1',
        'NUGET_PACKAGES': str(output / 'packages'),
    })
    project = ROOT / 'tests/engine_core/EngineCoreTests.csproj'
    intermediate = str(output / 'obj') + os.sep
    build = [args.dotnet, 'build', str(project), '--nologo', '--verbosity', 'minimal',
             '--output', str(output / 'bin'), f'-p:BaseIntermediateOutputPath={intermediate}']
    result = subprocess.run(build, cwd=ROOT, env=environment, check=False, timeout=180)
    if result.returncode:
        return result.returncode
    test = [args.dotnet, str(output / 'bin/EngineCoreTests.dll'), '--workers=0',
            f'--result={output / "test-results.xml"}']
    return subprocess.run(test, cwd=ROOT, env=environment, check=False, timeout=120).returncode


if __name__ == '__main__':
    raise SystemExit(main())
