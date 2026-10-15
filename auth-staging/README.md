# Crush.X isolated Cognito staging preparation

**Prepared, not provisioned or approved for live testing.** No AWS resources,
accounts, messages, deployments or merges were created. Existing application
source/settings and PR #1/#2 are unchanged. The original pool is never staging.

The source package is in `auth-staging/` on the separate
`prep/isolated-cognito-staging` branch, based on main. Existing PR branches are
unchanged. The generated frontend must use the reviewed repair source, **not the
older parent-directory main index.html**. Extract it from an existing full checkout
without switching branches or changing files:

```sh
mkdir -p work
git -C /path/to/Crush.X show 032ea7f4a125fbfc3f77e1728d92da2ada30897c:index.html > work/reviewed-index.html
```

Use that work/reviewed-index.html as CRUSHX_SOURCE below. Its pinned hash is checked.

Start with:

- [Sanitized configuration report](CONFIGURATION_REPORT.md): read-only inspection
  attempts blocked by missing credentials; user-supplied facts clearly separated.
- [CloudFormation source](infra/cognito-staging.json): new fixed-name pool/public
  browser client, account/region guards, verified-email recovery, MFA OFF, no secret,
  SRP, explicit secure token settings and retention protections.
- [Offline dry-run review](DRY_RUN_REVIEW.md): exact expected graph and limitations.
- [Deployment and rollback instructions](DEPLOYMENT.md): separate approval gates,
  read-only preflight, change-set review, isolated frontend preparation and cleanup.
- [Disposable account/live matrix](LIVE_TEST_MATRIX.md): 35 cases, all live NOT RUN.
- [Costs and limitations](COSTS.md): MAU/message implications and retained resources.
- [Disabled staging configuration](frontend/staging-config.example.json) and
  [offline copy builder](scripts/prepare_frontend.py): no production replacement or
  fallback; null IDs and approvedForLiveTesting=false by default.

Initial creation keeps public self-sign-up disabled. EnableDisposableSelfSignUp
defaults to false and may be set true only through an approved staging-only change
set for controlled live-account/email tests, then set false at the end of the window.

Initial alias decision: new staging uses username + email only. The existing pool
also has phone aliases; phone/SMS parity is intentionally deferred until a separately
reviewed SMS-capable design. Case-sensitive usernames are an explicit staging
choice; existing-pool case sensitivity is not known. Required email verification
is exercised only by controlled live recipients after approval.

## Run local checks

From this package, with the repository's reviewed index.html available:

```sh
CRUSHX_SOURCE=/path/to/Crush.X/index.html python3 -m unittest discover -s tests -v
cfn-lint infra/cognito-staging.json --regions us-west-2
CRUSHX_SOURCE=/path/to/Crush.X/index.html node tests/frontend_guard.cjs
```

Python tests need only the standard library. cfn-lint 1.57.2 and awscli 1.46.1 were
used in an isolated work virtualenv, not added to repository dependencies. The
browser guard test needs an installed Playwright and Chromium; optional
PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE select an existing cloud installation.
It intercepts all requests, stubs the SDK and uses synthetic IDs; it sends no AWS
requests, creates no account and never sends mail. No TLS-bypass setting is used.
The real-cloud app smoke test remains separate and the original frontend is unchanged.

No deploy script or CI auto-deployment is included. Do not populate or enable the
example configuration with old pool IDs. Review TEST_RESULTS.md for completed
checks and the distinction between local validation and unperformed live checks.
