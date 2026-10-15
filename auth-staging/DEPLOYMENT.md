# Deployment and rollback — instructions only, not executed

No resource/account creation, message sending, hosting or merge is authorized now.
Do not paste all phases into a terminal. Approval of source preparation is not
approval of a change set, execution, account creation, delivery tests or cleanup.

## 0. Offline review (safe now)

Open the `auth-staging/` source package and work from its directory. The application stays in the
existing repository checkout, unchanged. No worktree is needed.

```sh
mkdir -p work
python3 -m venv work/tools
work/tools/bin/pip install 'cfn-lint==1.57.2' 'awscli==1.46.1'
work/tools/bin/cfn-lint infra/cognito-staging.json --regions us-west-2
CRUSHX_SOURCE=/path/to/reviewed/Crush.X/index.html python3 -m unittest discover -s tests -v
```

The frontend source must match `source-manifest.json` (repair commit `032ea7f`).
The tests use synthetic staging IDs only and never call AWS. Dependencies are
isolated; do not modify application/Unity dependencies or lockfiles. Read
DRY_RUN_REVIEW.md, CONFIGURATION_REPORT.md, COSTS.md and LIVE_TEST_MATRIX.md.

## 1. Read-only identity/configuration preflight

Use an authorized identity supplied through the managed environment or normal AWS
SDK/CLI configuration, preserving proxy and CA settings. Do not paste credentials
into this package or disable TLS. If a manifest supplies a named AWS identity,
select its documented AWS_PROFILE/AWS_CONFIG_FILE for the command. Do not silently
fall back to another account. Needed networking: Cognito us-west-2; later approved
CFN/STS endpoints must also be allowed by the environment, never bypassed.

Existing-pool read permissions: only `cognito-idp:DescribeUserPool` and
`cognito-idp:DescribeUserPoolClient` on its exact ARN. Run:

```sh
python3 scripts/inspect_existing.py > work/existing-inspection.json
```

The captured report here is blocked by missing credentials; rerunning is required.
Do not list/get users to inspect public policy. Treat a returned HasClientSecret
true or missing SRP flow as a report finding, not permission to modify the old pool.

Choose an approved **separate staging AWS account** where possible. If the owner
chooses the same account, require a least-privilege CloudFormation execution role
and operator role with explicit deny protection for the existing pool ARN and
restricted region/tagged staging operations. Role creation/modification is outside
this template and needs its own approval. The existing account/ARN was not observed
here, so no account number or execution role has been invented.

Read the selected identity and check against the owner's approved account:

```sh
aws sts get-caller-identity --query Account --output text
aws cloudformation describe-stacks --region us-west-2 --stack-name crushx-auth-staging
aws cognito-idp list-user-pools --region us-west-2 --max-results 60 --query 'UserPools[?Name==`crushx-auth-staging`].{Id:Id,Name:Name}'
```

A not-found stack is expected. Existing stack/pool name collisions are a STOP,
not permission to update/import/reuse anything. CFN does not guarantee the pool
name uniquely identifies a resource; review generated physical IDs and tags.
Use inline template-body (below), so no S3 upload/bucket is required.

Fill a local copy of `infra/parameters.example.json`: approved account ID, owner
label and reviewed cleanup date. Its shipped sentinel values deliberately fail
CloudFormation constraints. Keep deletion protection ACTIVE. Validate that the
date is real and in the future; its regex/tag is not a cleanup scheduler.

Optional read-only service syntax validation, if the authorized network supports it:

```sh
aws cloudformation validate-template --region us-west-2 --template-body file://infra/cognito-staging.json
```

This was not run here. It is not a deploy preview and does not verify IAM, email,
pricing or quotas. Do not move forward on local lint alone.

## 2. Approval A — create a review-only CloudFormation change set

Requires separate approval for CloudFormation control-plane state. Record account,
role, template digest, parameter values, cost cap, owner and cleanup date. Export
CRUSHX_APPROVED_CFN_ROLE_ARN to the exact reviewed execution-role ARN; no wildcard
or administrator role. Then, and only then, an owner may run:

```sh
aws cloudformation create-change-set \
  --region us-west-2 --stack-name crushx-auth-staging \
  --change-set-name crushx-auth-staging-create-reviewed --change-set-type CREATE \
  --template-body file://infra/cognito-staging.json \
  --parameters file://infra/parameters.reviewed.json \
  --role-arn "${CRUSHX_APPROVED_CFN_ROLE_ARN:?Set the separately approved CFN role ARN}"
aws cloudformation describe-change-set \
  --region us-west-2 --stack-name crushx-auth-staging \
  --change-set-name crushx-auth-staging-create-reviewed \
  --query 'Changes[].ResourceChange.{Action:Action,Type:ResourceType,LogicalId:LogicalResourceId,Replacement:Replacement}'
```

Expected exactly two Add actions for the two resources in DRY_RUN_REVIEW.md, with
no replacement/import/existing resource. Stop on any other graph or warning.
Creating a change set can create a REVIEW_IN_PROGRESS stack shell. It is not a
zero-write dry run. An unexecuted change set can be deleted later with the owner's
approval; delete any empty review stack shell only after confirming no resources.

## 3. Approval B — provision the reviewed staging resources

Separate approval must name the exact change-set ARN/digest, account, role, cost
and parameters. No test accounts or messages are included in this approval.

```sh
aws cloudformation execute-change-set \
  --region us-west-2 --stack-name crushx-auth-staging \
  --change-set-name crushx-auth-staging-create-reviewed
aws cloudformation wait stack-create-complete --region us-west-2 --stack-name crushx-auth-staging
aws cloudformation describe-stacks --region us-west-2 --stack-name crushx-auth-staging --query 'Stacks[0].Outputs'
```

Read-only verify the returned IDs with DescribeUserPool and DescribeUserPoolClient.
Use sanitized projections from scripts/inspect_existing.py, substituting the **new**
staging IDs in manual CLI commands (the inspector itself is intentionally fixed to
existing IDs). Never print raw client output. Require: pool name and staging tags,
expected account ARN, region, no secret, exact password/MFA/recovery/flow/token
settings, and a distinct new pool/client. Record these non-secret observations.
Stop if any ID equals the existing pool/client. Do not retry by importing a pool.

## 4. Approval C — configure a separate staging frontend copy

No production index.html/configuration is replaced. Fill a local copy of
frontend/staging-config.example.json only from the approved stack outputs and
read-only observations. Set approvedOrigin to the exact separately approved HTTPS
origin **without a trailing slash**; confirm it is not the production origin.
Only after approval for live auth testing set approvedForLiveTesting to true.
Keep apiBaseUrl null and uploadsEnabled false. The origin flag is a local safety
check, not an AWS signup/origin access policy or proof of approval.

```sh
python3 scripts/prepare_frontend.py \
  --source /path/to/reviewed/Crush.X/index.html \
  --config work/staging-config.reviewed.json \
  --output work/staging-site/index.html
```

The builder performs no network calls and refuses production IDs, changed source,
unsafe origin, API/uploads, secrets, unapproved config and output overwrite. It
injects only staging IDs, a fail-closed exact-origin check, a separate sample-state
namespace and a staging banner. There is no production fallback. Its source hash
must be deliberately re-reviewed if PR #2 changes. Before separately approved
hosting, inspect the generated copy and rerun mock frontend tests against it.

Actual publishing/hosting and opening it for real auth are separate approvals,
not performed or automated by this kit. Direct SRP calls use Cognito service CORS;
no hosted UI domain/callback URLs or OAuth grant is configured. A browser origin
check cannot restrict direct callers of a public app client.

## 5. Approval D — disposable accounts and email/authentication tests

Follow LIVE_TEST_MATRIX.md. Resource approval does not approve emails, SMS, user
creation, password changes or login/reset tests. Approve exact controlled recipients,
account count, message budget, test window and evidence handling before any such
action. No SMS is needed or configured. Never use the existing pool, existing
personal accounts, production identities or production passwords.

## 6. Rollback and teardown — separate approval required

1. Stop or withdraw only the staging frontend under its own hosting approval;
   do not alter production. Freeze live tests and collect sanitized evidence.
2. If provisioning failed, inspect the stack's actual resource states/physical IDs
   with read-only calls first. Retain + deletion protection may leave resources on
   a failed create, replacement or rollback. Do not assume CloudFormation cleaned up.
3. For non-destructive rollback, leave the protected staging pool intact with a
   named owner/expiry; charges/quota use can remain. An UPDATE rollback must not
   replace the pool or repoint the frontend to an old/production pool.
4. After destructive cleanup approval, delete only the inventoried disposable
   staging accounts using AdminDeleteUser scoped to the approved new pool. No user
   export/backup is required for disposable identities. Deletion is irreversible.
5. Prepare and review a staging-only UPDATE change set using this same template,
   changing only StagingDeletionProtection from ACTIVE to INACTIVE and preserving
   the other approved parameter values. Expect one non-replacing Modify to the
   staging pool. Execute only after that change set is approved.
6. An approved delete-stack retains both resources by design. To actually remove
   them, verify the new pool's ARN/account, exact name, tags and physical IDs again,
   then delete the retained browser client and staging pool explicitly. For an
   approved teardown only, with CRUSHX_NEW_POOL_ID/CRUSHX_NEW_CLIENT_ID taken from
   the reviewed stack outputs:

```sh
# Destructive: NOT authorized now. These guards are mandatory, but not approval.
set -eu
test -n "${CRUSHX_NEW_POOL_ID:?New staging pool ID required}"
test -n "${CRUSHX_NEW_CLIENT_ID:?New staging client ID required}"
test "$CRUSHX_NEW_POOL_ID" != 'us-west-2_PAT0udHTx'
test "$CRUSHX_NEW_CLIENT_ID" != '1fvstb7h8vqbk7qt98bd46aj0'
test "$(aws sts get-caller-identity --query Account --output text)" = "${CRUSHX_APPROVED_ACCOUNT_ID:?Approved staging account ID required}"
test "$(aws cognito-idp describe-user-pool --region us-west-2 --user-pool-id "$CRUSHX_NEW_POOL_ID" --query UserPool.Name --output text)" = 'crushx-auth-staging'
test "$(aws cognito-idp describe-user-pool --region us-west-2 --user-pool-id "$CRUSHX_NEW_POOL_ID" --query UserPool.UserPoolTags.Environment --output text)" = 'staging'
test "$(aws cognito-idp describe-user-pool --region us-west-2 --user-pool-id "$CRUSHX_NEW_POOL_ID" --query UserPool.DeletionProtection --output text)" = 'INACTIVE'
test "$(aws cloudformation describe-stack-resource --region us-west-2 --stack-name crushx-auth-staging --logical-resource-id StagingUserPool --query StackResourceDetail.PhysicalResourceId --output text)" = "$CRUSHX_NEW_POOL_ID"
test "$(aws cloudformation describe-stack-resource --region us-west-2 --stack-name crushx-auth-staging --logical-resource-id StagingBrowserClient --query StackResourceDetail.PhysicalResourceId --output text)" = "$CRUSHX_NEW_CLIENT_ID"
# Manually review the pool ARN/account and approved inventory as well.
aws cloudformation delete-stack --region us-west-2 --stack-name crushx-auth-staging
aws cloudformation wait stack-delete-complete --region us-west-2 --stack-name crushx-auth-staging
aws cognito-idp delete-user-pool-client --region us-west-2 --user-pool-id "$CRUSHX_NEW_POOL_ID" --client-id "$CRUSHX_NEW_CLIENT_ID"
aws cognito-idp delete-user-pool --region us-west-2 --user-pool-id "$CRUSHX_NEW_POOL_ID"
```

7. Confirm pool/client removal with read-only calls; dispose of local test secrets,
   browser storage, generated config and mailbox messages per the test policy.
   Record residual charges/resources. Deleting users/clients/pools does not promise
   instantaneous invalidation of already-issued JWTs at offline token consumers;
   allow expiry or enforce server revocation/issuer denial where applicable. No
   backend is connected here. Recreating a pool creates new user subjects and IDs;
   it does not restore deleted disposable users or migrate production identities.

Official schema references:
[UserPool](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html),
[UserPoolClient](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html).
