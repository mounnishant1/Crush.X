# Crush.X AURA-X — Steps 9–13 implementation (isolated review)

**Scope:** builds on Step 8. This is server-side integration code and unit tests,
not a live production deployment. No secrets are stored in GitHub.

## Step 9 — Real AI provider + identity + API

- `providers/openai-responses.cjs`: server-only OpenAI Responses API adapter.
  Explicit `apiKey` + `model` configuration; bounded prompts/outputs; 12s timeout;
  no tools; `store:false`; no user ID sent to provider; suggestions only.
- `auth/cognito-verifier.cjs`: verifies Cognito **access** JWT signatures with
  issuer-pinned AWS JWKS, RS256, expiry, token_use and client ID. Access denial
  fails closed. Your protected role/account-status store must also verify that
  users are active and authorized.
- `http/aura-handler.cjs`: authenticated JSON `POST /v1/aura/guide`, job-status
  `GET /v1/aura/jobs/:id`, and `POST /v1/aura/jobs/:id/cancel`. Account identity
  is derived from the verified access token rather than a browser-supplied ID.
  Exact allowed CORS origins, bounded bodies, local rate limiting, generic
  errors, no arbitrary tool names, and no self-claimed owner privileges.
  No server is started automatically. A trusted worker must execute jobs.

## Step 10 — Owned media understanding contract

- `media/media-analysis.cjs`: checks user ownership and explicit consent;
  delegates to a configured *server-side media inference adapter*, without
  accepting untrusted remote URLs or allowing model training. Output topics
  are restricted to coarse, non-sensitive categories.
- **Not present:** an actual video decoder, transcription model, frame
  embeddings, device integration or verified exported MP4. The adapter alone
  is not video intelligence.

## Step 11 — Interest personalization

- `recommendations/interest-engine.cjs`: consent-dependent per-account
  coarse content-topic signal history (views, completion, likes, saves,
  shares, skips and negative feedback), recency decay, blocked creator and
  hidden-content filtering, basic creator diversity and exploration.
- `recommendations/feed-service.cjs`: account-scoped permissions, trusted
  catalog and exclusion adapters, audits and data erasure. Consent withdrawal
  disables personalized ranking.
- **Development-only state:** history is currently in-memory. Nothing here
  indexes an actual production content catalog or writes persistent
  recommendation storage. Requires secure server persistence and data lifecycle.

## Step 12 — AURA-X orchestration

- `operating-system/index.cjs` optionally composes trusted feed and media
  adapters; the same OS kernel, permissions, queue, audit, and single
  AURA-X registry remain in place.
- High-impact actions (publish, send, call, pay, deploy, ban) remain disabled.
  There is no autonomous action permission or hidden backend connection.
- Jobs/consents/audit require durable multi-worker infrastructure and verified
  user approvals before production.

## Step 13 — Tests and source verification

```sh
node --check operating-system/index.cjs
for f in operating-system/{auth,providers,recommendations,media,http}/*.cjs; do node --check "$f"; done
node --test operating-system/tests/*.test.cjs
```

CI runs these plus existing OS regression tests. Need staging secrets, Cognito
access token, live provider quota, actual media model, trusted catalog database,
distributed rate limits, durable queue and audit, security tests, and
OnePlus 9 Pro device QA before calling this production-ready.

### Integration sketch (backend ONLY)

```js
const {createProvider}=require('./operating-system/providers/openai-responses.cjs');
const {createCognitoVerifier}=require('./operating-system/auth/cognito-verifier.cjs');
const {createOperatingSystem}=require('./operating-system');
const {createAuraHttpHandler}=require('./operating-system/http/aura-handler.cjs');
const {createServer}=require('node:http');

const auth=createCognitoVerifier({
 issuer:process.env.COGNITO_ISSUER,
 clientId:process.env.COGNITO_APP_CLIENT_ID
});
const modelProvider=createProvider({
 apiKey:process.env.OPENAI_API_KEY,
 model:process.env.AURA_MODEL
});
const os=createOperatingSystem({
 verifyCredential:auth.verifyCredential,
 getRoles:async subject=>{throw Error('CONFIGURE_PROTECTED_RBAC_STORE');},
 ownerSubject:process.env.CRUSHX_OWNER_SUBJECT,
 auditSink:async entry=>{throw Error('CONFIGURE_DURABLE_AUDIT_SINK');},
 modelProvider,
 aiConsent:async ({subject,workflow})=>{
   throw Error('CONFIGURE_PERSISTED_USER_CONSENT');
 },
 // feedOptions: {checkConsent,readCatalog,readExclusions},
 // mediaOptions: {checkConsent,resolveMedia,inferMedia}
});
await os.start();
const handler=createAuraHttpHandler({
 system:os,verifyCredential:auth.verifyCredential,
 allowedOrigins:['https://crushx.in']
});
// The HTTP listener should be behind TLS, WAF and distributed rate limiting.
// createServer(handler).listen(process.env.INTERNAL_PORT);
```

**Never commit keys, auto-deploy, merge without review, infer sensitive
attributes, scrape private inboxes, train on users' media without consent,
or claim real production inference based only on mocked tests.**
