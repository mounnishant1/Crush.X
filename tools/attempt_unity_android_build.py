#!/usr/bin/env python3
"""Record a real, finite Unity Android build attempt for an isolated test package.

No Editor/SDK is downloaded, no licence is activated or inspected, and no APK is
installed. Missing executables are BLOCKED before compilation, never a build pass.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = re.compile(r"\Ain\.crushx\.lens\.(?:pr3test|devtest)(?:\.[a-z][a-z0-9_]*)*\Z")


def git_value(repository, *arguments):
    result = subprocess.run(['git', '-C', str(repository), *arguments], capture_output=True,
                            text=True, timeout=15, check=False)
    if result.returncode:
        raise RuntimeError('Cannot identify repository source: git ' + arguments[0])
    return result.stdout.strip()


def inspect_apk(apk, commit, package):
    """Check completed build artifacts; this does not prove installation or runtime behavior."""
    summary_path = Path(str(apk) + '.build-summary.json')
    identity_path = Path(str(apk) + '.build-info.json')
    if not apk.is_file() or not 0 < apk.stat().st_size <= 512 * 1024 * 1024:
        raise ValueError('Unity did not produce a nonempty bounded APK')
    if not summary_path.is_file() or not identity_path.is_file():
        raise ValueError('Unity build summary or build identity is missing')
    if max(summary_path.stat().st_size, identity_path.stat().st_size) > 1024 * 1024:
        raise ValueError('Build metadata exceeds its size limit')
    summary = json.loads(summary_path.read_text())
    identity = json.loads(identity_path.read_text())
    if summary.get('result') != 'Succeeded' or summary.get('errors') != 0:
        raise ValueError('Unity BuildReport did not report a successful zero-error build')
    if identity.get('commitSha') != commit or identity.get('packageId') != package or identity.get('developmentBuild') is not True:
        raise ValueError('APK build identity does not match the requested development source/package')
    if identity.get('unityVersion') != '6000.0.30f1':
        raise ValueError('APK build identity does not match the pinned Unity 6000.0.30f1 Editor')
    with zipfile.ZipFile(apk) as archive:
        names = set(archive.namelist())
        if 'AndroidManifest.xml' not in names or 'classes.dex' not in names:
            raise ValueError('APK is missing its Android manifest or DEX entry')
        if 'lib/arm64-v8a/libil2cpp.so' not in names:
            raise ValueError('APK is missing the configured ARM64 IL2CPP runtime')
        if archive.testzip() is not None:
            raise ValueError('APK ZIP CRC validation failed')
    digest = hashlib.sha256()
    with apk.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'path': str(apk), 'sizeBytes': apk.stat().st_size, 'sha256': digest.hexdigest(),
            'summary': str(summary_path), 'buildIdentity': str(identity_path),
            'unityVersion': identity.get('unityVersion'), 'sourceDirty': identity.get('sourceDirty')}


def attempt(repository, output, *, unity='Unity', package='in.crushx.lens.devtest.advanced',
            timeout=2700, execute=False, runner=subprocess.run):
    repository, output = Path(repository).resolve(), Path(output).resolve()
    if not PACKAGE.fullmatch(package):
        raise ValueError('Only an isolated in.crushx.lens.devtest/pr3test package is allowed')
    if not 30 <= timeout <= 10800:
        raise ValueError('Build timeout must be between 30 and 10800 seconds')
    project = repository / 'UnityProjects/CrushXLensEngine'
    version_file = project / 'ProjectSettings/ProjectVersion.txt'
    if not version_file.is_file():
        raise ValueError('Unity source project is unavailable')
    if 'm_EditorVersion: 6000.0.30f1\n' not in version_file.read_text():
        raise ValueError('Project is not the verified Unity 6000.0.30f1 source')
    # Reports/artifacts must not overwrite versioned engine assets or old evidence.
    if output == repository or output == project or project in output.parents:
        raise ValueError('Build evidence must be outside the Unity project')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Choose a new empty evidence directory; existing results are preserved')
    commit = git_value(repository, 'rev-parse', 'HEAD')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Cannot establish an exact source commit')
    output.mkdir(parents=True, exist_ok=True)
    apk = output / 'CrushX-devtest.apk'
    resolved_editor = shutil.which(unity)
    explicit = Path(unity)
    if explicit.is_file():
        resolved_editor = str(explicit.resolve())
    command = [resolved_editor or unity, '-batchmode', '-nographics', '-quit', '-projectPath', str(project),
               '-buildTarget', 'Android', '-executeMethod', 'CrushX.LensEngine.Editor.CrushXAndroidBuild.DevelopmentApk',
               '-crushxApk', str(apk), '-crushxPackage', package, '-crushxCommit', commit,
               '-logFile', str(output / 'unity-build.log')]
    report = {
        'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'repository': str(repository), 'branch': git_value(repository, 'branch', '--show-current'),
        'commit': commit, 'sourceDirty': bool(git_value(repository, 'status', '--porcelain')),
        'projectVersion': '6000.0.30f1', 'command': command,
        'tools': {name: shutil.which(name) for name in ('Unity', 'unity-editor', 'unityhub', 'adb', 'sdkmanager', 'gradle', 'java', 'javac')},
        'editorResolved': resolved_editor, 'attemptRequested': execute, 'processStarted': False,
        'status': 'NOT_STARTED' if resolved_editor else 'BLOCKED', 'apk': None,
        'deviceInstalled': False, 'deviceBehaviorVerified': False, 'productionChanged': False,
    }
    if execute:
        try:
            process = runner(command, cwd=repository, capture_output=True, text=True,
                             timeout=timeout, check=False)
            report['processStarted'] = True
            report['exitCode'] = process.returncode
            # Full raw logs stay local for inspection before sharing.
            (output / 'unity-stdout.log').write_text(process.stdout or '')
            (output / 'unity-stderr.log').write_text(process.stderr or '')
            if process.returncode:
                report['status'] = 'FAIL'
                report['reason'] = 'Unity exited with a nonzero status; inspect the preserved local logs'
            else:
                report['apk'] = inspect_apk(apk, commit, package)
                report['status'] = 'BUILT_UNVERIFIED'
                report['reason'] = 'Development APK built and structurally checked; no device installation or acceptance performed'
        except FileNotFoundError as error:
            report.update(status='BLOCKED', errorType=type(error).__name__, error=str(error),
                          reason='Unity executable is unavailable; compilation never started')
        except subprocess.TimeoutExpired as error:
            report.update(status='FAIL', processStarted=True, errorType=type(error).__name__,
                          reason='Unity exceeded the finite build timeout; no successful APK result is claimed')
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            report.update(status='FAIL', errorType=type(error).__name__, error=str(error),
                          reason='Unity launch or completed artifact validation failed')
    else:
        report['reason'] = 'Preflight only; use --attempt-build for a real launch' if resolved_editor else 'Unity executable is unavailable; no build was run'
    (output / 'build-attempt.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, required=True, help='New/empty local evidence directory outside Unity project')
    parser.add_argument('--unity', default=os.environ.get('UNITY_EDITOR_PATH', 'Unity'))
    parser.add_argument('--package', default='in.crushx.lens.devtest.advanced')
    parser.add_argument('--timeout-seconds', type=int, default=2700)
    parser.add_argument('--attempt-build', action='store_true')
    args = parser.parse_args(argv)
    try:
        report = attempt(args.repository, args.output, unity=args.unity, package=args.package,
                         timeout=args.timeout_seconds, execute=args.attempt_build)
    except (ValueError, OSError, RuntimeError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'BUILT_UNVERIFIED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
