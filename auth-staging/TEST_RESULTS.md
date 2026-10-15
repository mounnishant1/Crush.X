# Completed checks — preparation only

15 October 2026. No live authentication or AWS mutation was executed.

| Check | Result |
| --- | --- |
| Existing DescribeUserPool | BLOCKED — AWS credentials unavailable |
| Existing DescribeUserPoolClient (secret-safe projection) | BLOCKED — AWS credentials unavailable |
| CloudFormation us-west-2 schema/lint | PASS — cfn-lint 1.57.2, no findings |
| Standard-library offline tests | PASS — 8 tests, zero skipped with CRUSHX_SOURCE set |
| Synthetic browser checks | PASS — 2 origins: wrong origin blocked before SDK initialization; approved synthetic origin uses only synthetic staging pool/client, null API and isolated state |
| AWS calls during browser/unit tests | None; SDK mocked and requests intercepted |
| Repository source preservation | PASS — source SHA-256 matches pinned 032ea7f manifest; Git working tree clean; same branch/HEAD |
| Original index.html/production settings | Unchanged |
| PR #1 / PR #2 | No writes, pushes, comments, merges or metadata changes for this task |
| AWS ValidateTemplate / change set | NOT RUN / NOT CREATED |
| Staging resource creation / account creation / messages | NOT RUN |
| Real login/reset/recovery/refresh/delivery | NOT RUN |
| Hosting/deployment | NOT RUN |

Commands used from the preparation package:

```sh
CRUSHX_SOURCE=/workspace/Crush.X/index.html python3 -m unittest discover -s tests -v
/workspace/work/crushx-staging-tools/bin/cfn-lint infra/cognito-staging.json --regions us-west-2
CRUSHX_SOURCE=/workspace/Crush.X/index.html \
PLAYWRIGHT_MODULE=/workspace/cloud-onboarding/crushx/node_modules/playwright \
CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/frontend_guard.cjs
```

Python 3.12; AWS CLI 1.46.1; cfn-lint 1.57.2. Tool installation was isolated in
work, outside repository dependency declarations and lockfiles. TLS verification
was never bypassed. No IAM identity was configured, guessed or switched to make
the read-only requests succeed. The sanitized blocked inspection is included.

Unit coverage includes production-ID rejection, no imports/shared references,
password/MFA/recovery/token settings, default-closed public self-sign-up with an
explicit test-window parameter, no secret or SMS configuration, region/account
and retention guards, read-only inspection allowlisting, disabled example config,
unsafe origin/API/secret/upload rejection, source drift and overwrite protection.
The frontend guard browser cases use fabricated IDs and make no AWS requests.
These results do not establish service-level provisioning, mail delivery, IAM,
quotas, live authorizers or production readiness. Remaining approvals/decisions and
all future live cases are documented in the deployment guide and live matrix.
