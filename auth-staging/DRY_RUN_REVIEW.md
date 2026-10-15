# Offline dry-run review — no AWS changes executed

Prepared resource graph:

```text
approved account + us-west-2 rules
    └── new StagingUserPool: crushx-auth-staging (LITE, MFA OFF)
          └── new StagingBrowserClient: no secret, SRP + refresh
```

Expected **future CREATE change set**: exactly two `Add` actions. There must be no
`Modify`, `Remove`, import, replacement, existing-pool reference, IAM resource,
Lambda trigger, domain, SMS role, SES identity, backend, storage or deployment.
Outputs contain only the new pool/client IDs and non-secret account/region metadata.
The stack has no dependency on production or another stack's exports.

| Review check | Result |
| --- | --- |
| Correct pool name / region / account guard | Source checked; CFN rules constrain account and us-west-2 |
| Existing pool/client absent from template | Offline tests pass |
| Policy / MFA / verified-email recovery | Offline tests pass |
| Public registration | Closed initially (EnableDisposableSelfSignUp=false); approved live window requires reviewed staging update |
| Browser secret disabled / SRP / minimal attributes | Offline tests pass |
| Explicit token units / revocation | Offline tests pass |
| LITE plan, no SMS or paid advanced features | Explicit in source |
| Deletion / replacement | Retain both resources; deletion protection ACTIVE |
| Runtime IDs not invented | Example IDs null; copy builder refuses unapproved/production config |
| Frontend runtime origin/isolation guards | Two intercepted browser cases pass; zero AWS requests |
| Existing frontend/settings/PRs | Unchanged; source digest pinned |
| Syntax/schema validation | cfn-lint 1.57.2 passes |
| CloudFormation ValidateTemplate | NOT RUN: no authorized identity; local lint is not equivalent |
| Change-set preview | NOT CREATED: creates AWS control-plane state and requires separate approval |
| Resource/account/message creation | NOT RUN, not authorized |
| Live auth / email quotas / actual cost | NOT VERIFIED |

Cognito CreateUserPool has no general `--dry-run` safety flag. CloudFormation
ValidateTemplate checks template validity, not a deployment plan or authorization.
Creating a change set (even without executing it) writes CloudFormation state and
can create a REVIEW_IN_PROGRESS stack shell. It is therefore intentionally deferred.
A real change set must be reviewed later; this document is the offline review only.

Stop future execution if the account, region, resource graph, IAM role, aliases,
case sensitivity, required attributes or tier differ from the reviewed design.
Keep deletion protection ACTIVE for normal creation. No automated teardown job is
included: the TestWindowEnd tag is a reminder, not a deletion schedule.

Retention is intentional: a failed creation, rollback or stack deletion can leave
the staging pool/client behind. Creation rollback is not guaranteed to clean up
these resources. Record physical IDs and follow separately approved cleanup; do
not retry by reusing or importing an existing pool. Costs/quota usage can continue
until retained resources and their test accounts are explicitly removed.
