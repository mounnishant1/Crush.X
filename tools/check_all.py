#!/usr/bin/env python3
"""Run available local regressions. Never deploys, installs software or contacts AWS."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import unittest

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser',action='store_true',help='Run mocked browser suite; requires installed Playwright/Chromium. Fetches public CSS/icon scripts.')
    parser.add_argument('--ecj',type=Path)
    parser.add_argument('--android-api',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    checks=[]
    def run(name,command,timeout=180):
        print(f'Running {name}…',flush=True)
        try:
            process=subprocess.run(command,cwd=ROOT,timeout=timeout,check=False)
            checks.append({'check':name,'status':'PASS' if process.returncode==0 else 'FAIL','exitCode':process.returncode})
        except (OSError,subprocess.TimeoutExpired) as error:
            checks.append({'check':name,'status':'FAIL','errorType':type(error).__name__})
    suite=unittest.defaultTestLoader.discover(str(ROOT/'tests'),pattern='test_*.py')
    result=unittest.TextTestRunner(verbosity=1).run(suite)
    checks.append({'check':'Python source, asset and tool tests','status':'PASS' if result.wasSuccessful() else 'FAIL','executed':result.testsRun,'skipped':len(result.skipped),'skippedTests':[{'test':str(test),'reason':reason} for test,reason in result.skipped]})
    run('App JavaScript syntax',['node','--check','app-improvements.js'])
    run('Music library JS syntax',['node','--check','music-library.js'])
    run('Licensed music catalog tests',['node','--test','tests/music-library.cjs'])
    if args.browser:
        server=None
        try:
            # Never test a different application that happens to occupy the standard test port.
            with socket.socket() as probe:probe.bind(('127.0.0.1',8000))
            server=subprocess.Popen([sys.executable,'-m','http.server','8000','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(50):
                if server.poll() is not None:raise RuntimeError('Test server exited.')
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8000',timeout=1) as response:
                        if response.status==200:break
                except OSError:time.sleep(.1)
            else:raise RuntimeError('Test server did not start.')
            run('Mocked frontend browser regressions',['node','tests/frontend.cjs'],300)
        except (OSError,RuntimeError) as error:
            checks.append({'check':'Mocked frontend browser regressions','status':'FAIL','reason':str(error)})
        finally:
            if server is not None:
                server.terminate()
                try:server.wait(timeout=5)
                except subprocess.TimeoutExpired:server.kill();server.wait()
    else:checks.append({'check':'Mocked frontend browser regressions','status':'SKIPPED','reason':'Use --browser with installed Playwright.'})
    if args.ecj and args.android_api:
        with tempfile.TemporaryDirectory(prefix='crushx-java-') as scratch:
            run('Android Java host compile and conversion tests',[sys.executable,'tools/check_android_media_java.py','--ecj',str(args.ecj.resolve()),'--android-api',str(args.android_api.resolve()),'--output',scratch])
    else:checks.append({'check':'Android Java host compile and conversion tests','status':'SKIPPED','reason':'Supply --ecj and --android-api reference JARs. This is not an APK build.'})
    for name,reason in [
      ('Unity compilation and EditMode execution','Requires Unity Editor 6000.0.30f1; source syntax checks do not compile Unity.'),
      ('Android build and real-device acceptance','Requires Unity Android toolchain and an approved test device.'),
      ('Existing AWS backend integration','No configured AWS credentials or social backend source/contracts; no live mutations made.')]:
        checks.append({'check':name,'status':'SKIPPED','reason':reason})
    result={'checks':checks,'releaseReady':False,'productionChanged':False}
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    return 1 if any(c['status']=='FAIL' for c in checks) else 0

if __name__=='__main__':raise SystemExit(main())
