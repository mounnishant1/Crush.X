# Sanitized configuration report — 15 October 2026

Repository: `mounnishant1/Crush.X`. Source: repair commit
`032ea7f4a125fbfc3f77e1728d92da2ada30897c`; index.html digest is in
`source-manifest.json`. Existing checkout files and branches are unchanged.
The package is delivered under `auth-staging/` on a separate
`prep/isolated-cognito-staging` branch rooted at main, without changing PR #1/#2.
Neither PR has been edited, pushed to, merged or deployed for this task.

## Observed read-only inspection status

AWS CLI 1.46.1 was installed in an isolated work virtualenv. Both of these calls
were attempted, using region `us-west-2`, normal TLS verification and the inherited
proxy. Neither could obtain credentials:

- `cognito-idp describe-user-pool --user-pool-id us-west-2_PAT0udHTx`
- `cognito-idp describe-user-pool-client --user-pool-id us-west-2_PAT0udHTx --client-id 1fvstb7h8vqbk7qt98bd46aj0`

Both returned **Unable to locate credentials**. The environment status reported no
AWS outbound identity or secret binding; there was no OIC manifest/profile binding.
IMDS credential discovery was disabled for these calls, not TLS verification.
No alternate identity was invented or configured. No secret file was inspected.
See `existing-inspection.json` for the sanitized machine-readable failure results.

The allowlisted `scripts/inspect_existing.py` reproduces only those two calls and
projects safe policy/client fields. It reports only whether a client secret exists,
never its value. It does not query users, email addresses, phone numbers, raw callback
URLs, account ARN, SES sender identities, tokens or credentials. Do not run with
`--debug` or publish raw `describe-user-pool-client` output. The public client ID in
index.html does **not** prove that AWS has GenerateSecret disabled.

## Facts supplied by the user; not independently re-observed here

| Existing-pool setting | User-verified value |
| --- | --- |
| Region / existing pool | `us-west-2` / `us-west-2_PAT0udHTx` |
| Public frontend client reference | `1fvstb7h8vqbk7qt98bd46aj0` (also read from source) |
| Password | Minimum 8; uppercase, lowercase, numbers and special character |
| MFA | OFF |
| Aliases | Email and phone enabled |
| Access / ID tokens | 60 minutes each |
| Refresh | 5 days |
| PreventUserExistenceErrors | ENABLED |

The existing pool is **never staging**. Its username case-sensitivity, actual
ExplicitAuthFlows, client-secret presence, recovery mechanisms, email delivery
mode, writable attributes, revocation setting, feature plan and IAM authorizer
contracts remain independently unverified. Read-only access to its pool ARN is
needed to run the prepared inspector in an authorized environment.

## Prepared staging design

| Component | Prepared value / difference |
| --- | --- |
| New pool | Fixed name `crushx-auth-staging`, separate physical ID in us-west-2 |
| New client | `crushx-auth-staging-browser`, GenerateSecret false |
| Password / MFA | Same required classes/minimum 8; OFF |
| Username / aliases | Case-sensitive usernames plus verified email alias only |
| Phone | Deliberately excluded initially: no phone verification or SMS setup. This is a documented parity gap with the existing pool, not a claim to test its phone alias live |
| Recovery | Only verified_email; email changes require verification before becoming effective |
| Flows | USER_SRP_AUTH and refresh only; no direct-password/admin/custom/passwordless/OAuth grant |
| Tokens | Explicit 60-minute access/ID, 5-day refresh, 3-minute challenge session, revocation enabled |
| Email | COGNITO_DEFAULT for small-volume tests; no SES identity/resources created |
| Cost tier | Explicit LITE; no paid advanced threat protection or managed-login setup |
| Safety | Account/region rules, deletion protection ACTIVE, Retain on delete/replacement; public self-sign-up disabled by default until separately approved |
| Frontend | Separate generated copy, exact approved HTTPS origin, separate local-state key, no API or uploads; example disabled with null IDs |

Username case-sensitivity is an explicit new-pool decision, not a discovered copy
of the existing pool. It cannot generally be changed in place later. Review alias,
required-attribute and case choices before approving resource creation.

## Verification performed

- CloudFormation JSON parsed and cfn-lint 1.57.2 passed for us-west-2.
- Eight offline unittest cases passed, covering resource isolation, retention,
  policy/client/recovery settings, read-only inspection allowlisting, disabled
  example configuration, source preservation, origin/config guards, production-ID
  rejection, source drift and overwrite rejection.
- Synthetic staging HTML was built only inside temporary test directories. Two
  intercepted browser cases pass: wrong origin blocks before SDK initialization;
  approved synthetic origin uses only synthetic staging IDs, null API and isolated
  state. No real pool/client IDs, hosting, AWS calls or account actions are used.
- AWS ValidateTemplate, change-set creation, service-level provisioning validation,
  real authentication and delivery testing were **not** run. Local lint is not an
  AWS deployment dry run or evidence of quota, billing or mail deliverability.

Remaining decisions: approved account/role, expiry date/owner, separate HTTPS origin,
controlled mail recipients, expected message/MAU budget, and approval for each
mutation/test phase. Existing-pool inspection remains blocked by missing credentials.
