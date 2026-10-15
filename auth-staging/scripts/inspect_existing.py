#!/usr/bin/env python3
"""Read-only, allowlisted Cognito inspection. Never lists users or prints secrets."""
import json
import os
import subprocess
import sys

POOL = 'us-west-2_PAT0udHTx'
CLIENT = '1fvstb7h8vqbk7qt98bd46aj0'
POOL_QUERY = 'UserPool.{Id:Id,Name:Name,Policies:Policies,MfaConfiguration:MfaConfiguration,AliasAttributes:AliasAttributes,UsernameConfiguration:UsernameConfiguration,AutoVerifiedAttributes:AutoVerifiedAttributes,AccountRecoverySetting:AccountRecoverySetting,EmailSendingAccount:EmailConfiguration.EmailSendingAccount,DeletionProtection:DeletionProtection,UserPoolTier:UserPoolTier}'
CLIENT_QUERY = 'UserPoolClient.{ClientId:ClientId,UserPoolId:UserPoolId,HasClientSecret:ClientSecret!=`null`,ExplicitAuthFlows:ExplicitAuthFlows,AccessTokenValidity:AccessTokenValidity,IdTokenValidity:IdTokenValidity,RefreshTokenValidity:RefreshTokenValidity,TokenValidityUnits:TokenValidityUnits,PreventUserExistenceErrors:PreventUserExistenceErrors,EnableTokenRevocation:EnableTokenRevocation,AuthSessionValidity:AuthSessionValidity,ReadAttributes:ReadAttributes,WriteAttributes:WriteAttributes,AllowedOAuthFlowsUserPoolClient:AllowedOAuthFlowsUserPoolClient}'


def read(operation, query, *arguments):
    expected = {'describe-user-pool': (POOL_QUERY, ()),
                'describe-user-pool-client': (CLIENT_QUERY, ('--client-id', CLIENT))}
    if operation not in expected or (query, arguments) != expected[operation]:
        raise ValueError('Only the two fixed sanitized Describe requests are allowed.')
    # AWS_PROFILE/AWS_CONFIG_FILE and inherited proxy/CA settings are preserved.
    command = [os.environ.get('AWS_CLI', 'aws'), 'cognito-idp', operation,
               '--region', 'us-west-2', '--user-pool-id', POOL, *arguments,
               '--query', query, '--output', 'json']
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=45,
                                env={**os.environ, 'AWS_PAGER': '', 'AWS_EC2_METADATA_DISABLED': 'true'})
        if result.returncode:
            # Do not copy raw CLI diagnostics (which could contain account details).
            reason = 'credentials unavailable' if 'Unable to locate credentials' in result.stderr else 'AWS call failed; inspect authorized local diagnostics without sharing credentials'
            return {'status': 'blocked', 'reason': reason, 'operation': operation}
        return {'status': 'observed', 'operation': operation, 'configuration': json.loads(result.stdout)}
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return {'status': 'blocked', 'operation': operation, 'reason': 'CLI unavailable, timeout or invalid JSON'}


def main():
    report = {'scope': 'existing pool; read-only; NOT staging',
              'pool': read('describe-user-pool', POOL_QUERY),
              'client': read('describe-user-pool-client', CLIENT_QUERY, '--client-id', CLIENT)}
    print(json.dumps(report, indent=2))
    return 0 if all(report[key]['status'] == 'observed' for key in ('pool', 'client')) else 1


if __name__ == '__main__':
    sys.exit(main())
