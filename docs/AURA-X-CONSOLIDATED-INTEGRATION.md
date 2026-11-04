# Crush.X AURA-X consolidated integration — review status

**GitHub:** `feature/aura-x-consolidated-ai-integration-20261104` (draft PR #58)
**Base:** `feature/content-intelligence-foundation-20261104` (PR #54)
**Status:** Code integration, staging host and tests. **NOT deployed or verified on an Android device.**

## Integration decisions

The original Step 8 single AURA-X dialog remains the only assistant.
We retained PR #54's content ranking/source search and local-demo controls
rather than introducing a competing second ranker. We integrated selected
parts of PR #53, keeping account-scoped access and data minimization:

- `operating-system/auth/cognito-verifier.cjs` — pinned AWS Cognito RS256
  access-JWT validation via JWKS, client/issuer/expiry/token-use checks.
- `operating-system/providers/openai-responses.cjs` — bounded OpenAI
  Responses API adapter, advice only (`tools:[]`, `store:false`).
- `operating-system/consent/consent-service.cjs` — server-side
  subject+scope+expiry consent, owner restrictions and revocation; rechecked
  inside the queued AI actions. Browser checkboxes are not server grants.
- `operating-system/consent/dynamo-store.cjs` — DynamoDB storage adapter,
  strongly consistent grant reads, TTL attribute, account-scoped keys.
  Host supplies AWS SDK v3 DynamoDB DocumentClient and command constructors.
- `operating-system/http/ai-handler.cjs` — authenticated AURA guide
  requests, source-backed content find/rank, consent grant/status/revoke,
  and job receipt/cancel endpoints. CORS origin allowlist, body caps, rate
  guard, account-derived identity, no arbitrary model tool execution.
- `operating-system/media/media-analysis.cjs` — consented **owned**
  Reel/Story/Post analysis adapter; needs a real provider for inference.
- `operating-system/host/staging-host.cjs` — loopback-only staging
  server and in-process worker, useful for integration tests but **not
  a production job queue**.
- `aura-remote-client.js`, `aura-remote-ui.js`, `aura-remote.css`
  — optional live-model section inside the existing dialog. **Default off**.

## Integration contract and configuration

Only a trusted server can create the operating-system instance. Provide:

1. Cognito config (`issuer`, `clientId`), and a protected DB-backed role
   store with account-active / revocation checks.
2. Server-side AI key and selected approved model (do not put them in HTML,
   Android assets, or GitHub).
3. An append-only authenticated durable audit sink and an AWS DynamoDB table
   with partition `PK`, sort key `SK`, and TTL attribute `ttl`.
4. A DynamoDB DocumentClient adapter for the consent store. Use DynamoDB's
   consistent read, not an eventually consistent cache, for consent checks.
5. Authorized content adapters: `loadAuthorizedContent`,
   `authorizeContent`, `readEngagementEvents`,
   `readExplicitInterests`. Never index private/Close Friends media or
   DMs into a public feed.
6. Optional owned-media resolver and licensed inference runtime. Do not
   train on user media by default.

Example skeleton (application wiring, not an executable deployment):

```js
const {createOperatingSystem}=require('./operating-system');
const {createCognitoVerifier}=require('./operating-system/auth/cognito-verifier.cjs');
const {createProvider}=require('./operating-system/providers/openai-responses.cjs');
const {createDynamoConsentStore}=require('./operating-system/consent/dynamo-store.cjs');
const {createStagingHost}=require('./operating-system/host/staging-host.cjs');

const verifier=createCognitoVerifier({
 issuer:process.env.COGNITO_ISSUER,
 clientId:process.env.COGNITO_CLIENT_ID
});
const provider=createProvider({
 apiKey:process.env.OPENAI_API_KEY,
 model:process.env.AURA_MODEL
});
const consentStore=createDynamoConsentStore({
 client:trustedDynamoDocumentClient,
 tableName:process.env.CRUSHX_AI_CONSENT_TABLE,
 commands:awsDynamoDocumentCommands
});
const system=createOperatingSystem({
 verifyCredential:verifier.verifyCredential,
 getRoles:protectedAccountAndRoleLookup, // implement on trusted server
 ownerSubject:process.env.CRUSHX_OWNER_SUBJECT,
 auditSink:durableAuditAppend, // implement atomically
 modelProvider:provider,
 consentOptions:{store:consentStore},
 contentIntelligence:authorizedContentAdapters,
 mediaOptions:ownedMediaAdapters
});
const staging=createStagingHost({
 system,verifyCredential:verifier.verifyCredential,
 allowedOrigins:['https://crushx.in'],port:8080
});
await staging.start(); // staging ONLY; never expose directly
```

To enable model UI **after** the authenticated server and same-origin TLS
proxy are configured, add to production HTML:

```html
<meta name="crushx-aura-api" content="same-origin">
```

This flag does not grant permission. The user still explicitly grants a
scoped 15-minute server consent and types their prompt. The request carries
the Cognito access token from the existing user session, the API verifies it,
and an audited worker produces the receipt. No private feed, photo, incoming
message, profile or wallet data is automatically sent to the provider.

## Test gates

```sh
node --test operating-system/tests/*.test.cjs
node --test tests/aura-remote-client.test.cjs
node --check aura-remote-ui.js
node --check aura-remote-client.js
```

Frontend Playwright `tests/aura-remote-browser.cjs` tests explicit
consent, one assistant, typed prompt only, authenticated queued response,
and revocation with mocked endpoints. Real provider credentials are *not*
used by CI.

## Open work before a production release

- **Durability:** Replace in-process task queue, worker/timer, revocation
  caches, rate limiting and idempotency with shared durable stores, leases,
  recovery and alerting. The staging host is loopback-only by design.
- **Privacy:** Real consent retention/export/deletion across backend
  datasets, prompt logs, embeddings and analytics. Security review and
  appropriate protections for younger users.
- **Real content:** Account-authorized feed database, moderation and
  deletion invalidation, verified engagement telemetry, offline/blocked
  profiles, caching and pagination.
- **Multimodal:** Actual video frames/audio/ASR model, licensed models,
  export preview fidelity, tracking and OnePlus 9 Pro performance QA.
- **Source reconciliation:** Merge safely with newest Windows Step202/402
  and Unity/Android source, not the older GitHub demo without comparison.
- **Product gate:** Deploy only after Cognito staging credentials, model
  quotas, audit persistence, security/abuse testing, actual API latency and
  real Android tests, rollback plan and explicit owner approval.

No production AWS changes, secrets, real messages, payment, calls, publish,
ban or auto-deploy are included in this review branch.
