import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class Infrastructure(unittest.TestCase):
    def setUp(self):
        self.template = json.loads((ROOT / 'infra/cognito-staging.json').read_text())
        self.pool = self.template['Resources']['StagingUserPool']['Properties']
        self.client = self.template['Resources']['StagingBrowserClient']['Properties']

    def test_isolation_and_retention(self):
        self.assertEqual(len(self.template['Resources']), 2)
        self.assertEqual(self.pool['UserPoolName'], 'crushx-auth-staging')
        self.assertEqual(self.client['UserPoolId'], {'Ref': 'StagingUserPool'})
        self.assertNotIn('us-west-2_PAT0udHTx', json.dumps(self.template))
        self.assertNotIn('1fvstb7h8vqbk7qt98bd46aj0', json.dumps(self.template))
        for resource in self.template['Resources'].values():
            self.assertEqual(resource['DeletionPolicy'], 'Retain')
            self.assertEqual(resource['UpdateReplacePolicy'], 'Retain')
        self.assertEqual(self.template['Parameters']['StagingDeletionProtection']['Default'], 'ACTIVE')
        self.assertIn('ApprovedAccountOnly', self.template['Rules'])
        self.assertIn('WestRegionOnly', self.template['Rules'])

    def test_verified_email_only_no_sms(self):
        self.assertEqual(self.pool['AliasAttributes'], ['email'])
        self.assertEqual(self.pool['AutoVerifiedAttributes'], ['email'])
        self.assertEqual(self.pool['AccountRecoverySetting']['RecoveryMechanisms'], [{'Name': 'verified_email', 'Priority': 1}])
        self.assertEqual(self.pool['MfaConfiguration'], 'OFF')
        self.assertNotIn('SmsConfiguration', self.pool)
        self.assertNotIn('LambdaConfig', self.pool)
        self.assertEqual(self.pool['UserAttributeUpdateSettings']['AttributesRequireVerificationBeforeUpdate'], ['email'])
        self.assertEqual(self.pool['AdminCreateUserConfig']['AllowAdminCreateUserOnly'], {'Fn::If': ['DisposableSignupEnabled', False, True]})
        self.assertEqual(self.template['Parameters']['EnableDisposableSelfSignUp']['Default'], 'false')
        self.assertEqual(self.pool['EmailConfiguration']['EmailSendingAccount'], 'COGNITO_DEFAULT')

    def test_policy_and_public_srp_client(self):
        policy = self.pool['Policies']['PasswordPolicy']
        self.assertEqual(policy['MinimumLength'], 8)
        self.assertTrue(all(policy[key] is True for key in ['RequireUppercase', 'RequireLowercase', 'RequireNumbers', 'RequireSymbols']))
        self.assertIs(self.client['GenerateSecret'], False)
        self.assertEqual(set(self.client['ExplicitAuthFlows']), {'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'})
        self.assertEqual(self.client['PreventUserExistenceErrors'], 'ENABLED')
        self.assertTrue(self.client['EnableTokenRevocation'])
        self.assertEqual((self.client['AccessTokenValidity'], self.client['IdTokenValidity'], self.client['RefreshTokenValidity']), (60, 60, 5))
        self.assertEqual(self.client['TokenValidityUnits'], {'AccessToken': 'minutes', 'IdToken': 'minutes', 'RefreshToken': 'days'})
        self.assertEqual(self.client['WriteAttributes'], ['email'])
        self.assertFalse(self.client['AllowedOAuthFlowsUserPoolClient'])

    def test_default_frontend_cannot_be_used(self):
        config = json.loads((ROOT / 'frontend/staging-config.example.json').read_text())
        with self.assertRaisesRegex(ValueError, 'approval'):
            module('prepare_frontend').build('unused', config, 'unused2')

    def test_inspector_allowlist_and_no_secret_output(self):
        inspector = module('inspect_existing')
        with self.assertRaises(ValueError):
            inspector.read('create-user-pool', 'anything')
        result = subprocess.CompletedProcess([], 0, '{"HasClientSecret":false}', '')
        with patch.object(inspector.subprocess, 'run', return_value=result) as run:
            report = inspector.read('describe-user-pool-client', inspector.CLIENT_QUERY, '--client-id', inspector.CLIENT)
        args = run.call_args.args[0]
        self.assertEqual(args[1:3], ['cognito-idp', 'describe-user-pool-client'])
        self.assertIn('HasClientSecret:ClientSecret!=`null`', args[args.index('--query') + 1])
        self.assertEqual(report['configuration'], {'HasClientSecret': False})
        with patch.object(inspector.subprocess, 'run', return_value=subprocess.CompletedProcess([], 255, '', 'Unable to locate credentials')):
            self.assertEqual(inspector.read('describe-user-pool', inspector.POOL_QUERY)['reason'], 'credentials unavailable')


@unittest.skipUnless(os.environ.get('CRUSHX_SOURCE'), 'Set CRUSHX_SOURCE to the reviewed index.html for copy-builder checks')
class FrontendCopy(unittest.TestCase):
    def setUp(self):
        self.builder = module('prepare_frontend')
        self.source = Path(os.environ['CRUSHX_SOURCE'])
        self.original = self.source.read_bytes()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / 'staging/index.html'
        # Synthetic IDs/origin only; no resource exists and no request is made.
        self.config = {'environment': 'staging', 'region': 'us-west-2', 'poolName': 'crushx-auth-staging',
                       'userPoolId': 'us-west-2_SYNTHETIC', 'clientId': 'syntheticclientonly',
                       'approvedOrigin': 'https://auth-staging.example.test', 'approvedForLiveTesting': True,
                       'apiBaseUrl': None, 'uploadsEnabled': False}

    def test_copy_isolated_and_source_unchanged(self):
        result = self.builder.build(self.source, self.config, self.output)
        text = self.output.read_text()
        self.assertTrue(result['sourceUnchanged'])
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertNotIn(self.builder.EXISTING_POOL, text)
        self.assertNotIn(self.builder.EXISTING_CLIENT, text)
        self.assertNotIn('execute-api.us-west-2.amazonaws.com/prod', text)
        self.assertIn('const API_BASE_URL = null;', text)
        self.assertIn('location.origin !== "https://auth-staging.example.test"', text)
        self.assertIn('crushx_auth_staging_us-west-2_SYNTHETIC', text)
        self.assertIn('STAGING ONLY', text)

    def test_rejects_unsafe_configurations(self):
        for field, value in [('userPoolId', self.builder.EXISTING_POOL), ('clientId', self.builder.EXISTING_CLIENT),
                             ('region', 'us-east-1'), ('poolName', 'production'), ('approvedForLiveTesting', False),
                             ('approvedOrigin', 'http://localhost:8000'), ('approvedOrigin', 'https://user:pw@example.test'),
                             ('approvedOrigin', 'https://example.test/path'), ('approvedOrigin', 'https://example.test?q=x'),
                             ('approvedOrigin', None), ('uploadsEnabled', True), ('apiBaseUrl', 'https://api.example.test'),
                             ('clientSecret', 'forbidden')]:
            with self.subTest(field=field, value=value):
                config = copy.deepcopy(self.config)
                config[field] = value
                with self.assertRaises(ValueError):
                    self.builder.build(self.source, config, self.output)
                self.assertFalse(self.output.exists())

    def test_refuses_source_overwrite_and_drift(self):
        with self.assertRaises(ValueError):
            self.builder.build(self.source, self.config, self.source)
        changed = Path(self.directory.name) / 'changed.html'
        changed.write_bytes(self.original + b'\n')
        with self.assertRaisesRegex(ValueError, 'Source differs'):
            self.builder.build(changed, self.config, self.output)
        self.assertEqual(self.source.read_bytes(), self.original)


if __name__ == '__main__':
    unittest.main()
