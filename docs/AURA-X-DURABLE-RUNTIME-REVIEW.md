# Crush.X — AURA-X durable runtime hardening (review only)

**Branch:** `feature/aura-x-durable-runtime-hardening-20261104`
**Base:** `feature/aura-x-consolidated-ai-integration-20261104` (PR #58)

The earlier AURA-X OS queue is in process memory. This change introduces
**optional** production-oriented interfaces for advice-only AI jobs. Existing
content search, local preview and the single AURA-X UI are preserved. No
AWS resources or real user data were modified.

## New backend modules

- `operating-system/durable/advice-queue.cjs`
  - Verified account permission + current account status at enqueue,
    inspect, cancel and erase. Rechecks roles and server consent before
    inference, after inference, and when serving completed suggestions.
  - Deterministic HMAC-derived opaque job ID for cross-instance
    idempotency. Prompt fingerprint is HMAC-keyed, not a public SHA digest.
  - Prompts/context and finished model suggestions are encrypted using
    AES-256-GCM with per-record nonces and authenticated job/subject/workflow
    associated data. Plaintext is not written to persistent task rows or
    audit logs.
  - Advice only: `executed:false`, `published:false`, `sent:false`,
    `charged:false`. No calls, publishing, wallets or deployment actions.
  - Conditional leases provide crash recovery. **At-least-once** inference:
    provider charges could repeat after a worker dies during a request.
    Model output is never treated as app authorization.
- `operating-system/durable/dynamo-advice-store.cjs`
  - DynamoDB DocumentClient adapter with `attribute_not_exists` conditional
    inserts, consistent strongly checked reads, GSI ready queue, atomic
    lease claim/settle/cancel and conditional user erasure. Two workers
    cannot both hold a valid lease simultaneously; expired leases can
    be reclaimed.
  - Completed rows erase encrypted prompt payloads. The response is
    encrypted with application-layer AES-GCM; DynamoDB encryption at rest
    remains enabled.
- `operating-system/http/dynamo-rate-limiter.cjs`
  - Cross-instance atomic per-account counters with HMAC-hashed keys
    and DynamoDB TTL. A DynamoDB outage is **not** interpreted as permission
    to bypass the limiter.
- `operating-system/http/ai-handler.cjs` optionally accepts
  `durableAdvice` and `rateLimiter` adapters. A production host must pass
  `requireDistributedLimiter:true` and supply the distributed limiter.
  `DELETE /v1/aura/jobs/{id}` enables subject-bound erasure for durable jobs.
  Without these adapters, the earlier in-memory staging behavior remains.
- `operating-system/host/staging-host.cjs` can run the durable worker on
  loopback for integration verification. **Never expose this listener to
  the public internet.**

## Staging IaC, not deployed

`operating-system/infra/aura-staging-dynamodb.yaml` describes three
PAY_PER_REQUEST DynamoDB tables, each with TTL, encryption at rest, PITR
and retain-on-delete. The job table has `GSI1` over `GSI1PK/GSI1SK`.
This is a template, **not an AWS deployment**. Region, naming, billing
limits and least-privilege IAM must be checked by the owner.

The backend requires three separate classes of secrets:

1. Cognito issuer/client ID and protected role/active-account checker.
2. Model key and approved model choice; these must exist only in
   server-side Secrets Manager or an equivalent restricted secret store.
3. Two distinct 32-byte random keys for job HMAC and AES-GCM. Rotate with
   key-versioned envelopes and managed KMS; **do not rotate or overwrite
   active keys without a migration/decryption plan**.

Never place any secret in HTML, a mobile APK, GitHub, CloudFormation
parameters or CI logs. Restrict DynamoDB permissions to the exact
consent, jobs and rate tables and require TLS.

## Trusted runtime example (not plug-and-play)

```js
const {createDurableAdvisoryQueue}=require('./operating-system/durable/advice-queue.cjs');
const {createDynamoAdviceStore}=require('./operating-system/durable/dynamo-advice-store.cjs');
const {createDynamoRateLimiter}=require('./operating-system/http/dynamo-rate-limiter.cjs');
const {createAIHttpHandler}=require('./operating-system/http/ai-handler.cjs');

const durableAdvice=createDurableAdvisoryQueue({
 store:createDynamoAdviceStore({
  client:trustedDocumentClient,tableName:process.env.AURA_JOBS_TABLE,
  commands:dynamoDocumentCommands,gsi:'GSI1'
 }),
 permissions:system.permissions,audit:system.audit,consents:system.consents,
 modelProvider:trustedModelProvider,
 getRoles:protectedRoleLookup,isAccountActive:protectedAccountStatusLookup,
 encryptionKey:trustedKmsDecryptedAesKey, // Buffer, 32 bytes
 hmacKey:trustedKmsDecryptedHmacKey // Buffer, 32 bytes
});
const rateLimiter=createDynamoRateLimiter({
 client:trustedDocumentClient,tableName:process.env.AURA_RATE_TABLE,
 UpdateCommand:dynamoDocumentCommands.UpdateCommand,
 secret:trustedKmsDecryptedRateHmacKey // Buffer, 32 bytes
});
const handler=createAIHttpHandler({
 system,verifyCredential:trustedCognito.verifyCredential,
 allowedOrigins:['https://crushx.in'],durableAdvice,rateLimiter,
 requireDistributedLimiter:true
});
// Place behind authenticated TLS proxy, WAF, retries, and isolated workers.
// Do not expose local staging host or deploy based only on this snippet.
```

## Tests

```sh
node --test operating-system/tests/*.test.cjs
node --check operating-system/durable/advice-queue.cjs
node --check operating-system/durable/dynamo-advice-store.cjs
node --check operating-system/http/dynamo-rate-limiter.cjs
```

Tests include client isolation, idempotent enqueue, encrypted persistence,
consent expiration/revocation, inactive account, conditional Dynamo leases,
worker crash recovery, stale lease ownership, cancellation, erasure,
cross-instance rate limits, outage denial and HTTP end-to-end receipts.

## Remaining hard production gates

- Provision staging resources after **explicit owner approval**, configure
  signed roles, account disable/revocation checks, authoritative consent and
  reliable append-only audit sink. No Secrets Manager/KMS resources provisioned
  here; wire/rotate per environment.
- Multi-worker load/chaos tests, lease fencing around provider timeouts,
  alarms and distributed capacity handling. GSI polling has eventual
  consistency; expired running jobs may be re-executed. Limit cost and
  request latency with quotas; choose provider idempotency if available.
- Safely serve HTTPS from the real Android/React app, with accurate mobile
  back/navigation, keyboard, and model failure behavior.
- Data retention/export/erasure across prompts, Dynamo PITR backups,
  audit logs and any model-provider retention, with user age protections.
- Actual video understanding, interest signals from verified player events,
  full feed ACL/pagination and native Unity camera model integration.
- Verify and conflict-safe merge with latest local Windows/Capacitor/Unity
  source. Android IL2CPP APK and OnePlus 9 Pro QA still **not done**.

**No production deployment, APK, cloud model call, user content access,
financial action, main-branch merge or owner approval bypass occurs here.**
