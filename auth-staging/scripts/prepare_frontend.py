#!/usr/bin/env python3
"""Offline staging-copy builder. Never edits the checkout, contacts AWS or deploys."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
EXISTING_POOL = 'us-west-2_PAT0udHTx'
EXISTING_CLIENT = '1fvstb7h8vqbk7qt98bd46aj0'


def build(source, config, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or output.exists():
        raise ValueError('Output must be a new file, separate from the application source.')
    if config.get('environment') != 'staging' or config.get('region') != 'us-west-2' or config.get('poolName') != 'crushx-auth-staging':
        raise ValueError('Only isolated crushx-auth-staging in us-west-2 is supported.')
    if config.get('approvedForLiveTesting') is not True:
        raise ValueError('Separate live-test approval is required; prepared configuration stays disabled.')
    pool, client = config.get('userPoolId'), config.get('clientId')
    if not isinstance(pool, str) or not re.fullmatch(r'us-west-2_[A-Za-z0-9]+', pool) or pool == EXISTING_POOL:
        raise ValueError('A new staging pool ID is required; the existing pool is forbidden.')
    if not isinstance(client, str) or not re.fullmatch(r'[a-z0-9]{1,128}', client) or client == EXISTING_CLIENT:
        raise ValueError('A separate public staging app client is required.')
    if any('secret' in key.lower() for key in config) or config.get('apiBaseUrl') is not None or config.get('uploadsEnabled') is not False:
        raise ValueError('No client secret, API connection or uploads are allowed in the staging copy.')
    origin = config.get('approvedOrigin')
    if not isinstance(origin, str):
        raise ValueError('An approved separate HTTPS origin is required.')
    url = urlsplit(origin)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError('Use an exact HTTPS origin without credentials, path, query or fragment.')
    # Access .port to reject malformed ports before emitting JavaScript.
    _ = url.port
    manifest = json.loads((ROOT / 'source-manifest.json').read_text())
    original = source.read_bytes()
    if hashlib.sha256(original).hexdigest() != manifest['frontendSha256']:
        raise ValueError('Source differs from reviewed frontend; review and update the manifest deliberately.')
    text = original.decode('utf-8')
    settings = {'UserPoolId': pool, 'ClientId': client}
    guard = "if (location.origin !== " + json.dumps(origin) + ") { throw new Error('Staging authentication is blocked on this origin.'); }\n"
    replacement = guard + '    const COGNITO_CONFIG = ' + json.dumps(settings) + ';'
    text, count = re.subn(r'    const COGNITO_CONFIG = \{[^}]+\};', lambda _: '    ' + replacement, text, count=1)
    if count != 1:
        raise ValueError('Expected exactly one Cognito configuration.')
    text, count = re.subn(r"const API_BASE_URL =\s*'[^']+';", 'const API_BASE_URL = null;', text, count=1)
    if count != 1:
        raise ValueError('Expected exactly one API configuration.')
    text, count = re.subn(r"const STATE_KEY = '[^']+';", lambda _: 'const STATE_KEY = ' + json.dumps('crushx_auth_staging_' + pool) + ';', text, count=1)
    if count != 1:
        raise ValueError('Expected exactly one browser-state configuration.')
    text = text.replace('<title>Crush.X</title>', '<title>Crush.X — STAGING ONLY</title>', 1)
    text = text.replace('<body>', '<body>\n  <div role="status" style="position:fixed;top:0;left:0;right:0;z-index:200;background:#7c3aed;color:white;text-align:center;padding:4px">STAGING ONLY · Disposable accounts · No publishing</div>', 1)
    if EXISTING_POOL in text or EXISTING_CLIENT in text or 'execute-api.us-west-2.amazonaws.com/prod' in text:
        raise ValueError('Existing-pool/client or production API reference remains; refusing output.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects against accidentally replacing any existing file.
    with output.open('x', encoding='utf-8', newline='') as handle:
        handle.write(text)
    return {'sourceUnchanged': hashlib.sha256(source.read_bytes()).hexdigest() == manifest['frontendSha256'],
            'stagingPoolId': pool, 'stagingOrigin': origin, 'publishingEnabled': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.source, json.loads(Path(args.config).read_text()), args.output), indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
