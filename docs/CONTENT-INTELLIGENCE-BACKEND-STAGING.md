# Crush.X Content Intelligence — Backend staging gate

**Scope:** Review-only branch based on PR #54. No production database, Cognito
credentials, real model inference, APK installation, or AWS deployment.

## What is implemented
- PostgreSQL 16-compatible migration: `operating-system/storage/migrations/001_content_intelligence.sql`.
- `createPostgresContentStore`: transactional consent and history reset,
  independent content authorization, blocked creators, hidden items, expired
  stories, public/owned access, server-derived topics, idempotent signed-event
  **interface**, and deleted-content event cascade. Includes actual PostgreSQL CI.
- `createContentHttpHandler`: protected `/v1/content` endpoints, JWT verifier
  interface, active-account check, required distributed limiter interface,
  exact CORS origins, no raw watch-event POST, queued jobs and safe outputs.
- `content-api-client.js`: optional HTTPS SDK, fresh Cognito access token
  callback, no automatic remote requests. AURA-X remains the only assistant.

## API
- `GET /v1/content/privacy`
- `PUT /v1/content/privacy` with `{read,analyze,personalize,topics}`
- `DELETE /v1/content/history`
- `POST /v1/content/feed/rank` with `{kind,limit,requestId}`
- `POST /v1/content/questions` with `{question,requestId}`
- `GET /v1/content/jobs/{jobId}`

All calls derive account identity from verified access credentials, not client
supplied IDs. Feed/Q&A requests are queued; a separately configured worker is
required to process them. Responses are metadata-based, not multimodal AI.

## Explicit staging requirements

1. Owner-approved, isolated PostgreSQL instance with encrypted backups, network
   restrictions and a least-privilege account. Review migration before apply.
2. Server-only `pg.Pool` and `createPostgresContentStore({pool,verifyTrustedEvent})`.
   `verifyTrustedEvent` must independently verify trusted domain receipts,
   replay, identity and event provenance. Never trust client watch-duration,
   viewer ID, topics or completion claims. No direct client event API exists.
3. Verified Cognito access JWT, protected RBAC/active account service, durable
   audit sink, shared rate limiter and durable worker/queue. A tested Cognito
   verifier exists on a **separate** branch
   `feature/aura-x-real-provider-feed-recs-20261104`; integration requires
   conflict review of the differing OS index and permissions.
4. TLS/WAF/allowlisted origin. Do not reuse unverified sample API base as the
   content service. The deployment bootstrap must inject the approved URL and
   read the already-authenticated Cognito **access** token. Example:

   ```js
   const origin = trustedDeploymentConfig.contentApiOrigin;
   window.CrushXContentBackend =
     window.CrushXContentApiClient.createContentApiClient({
       apiOrigin: origin,
       approvedOrigins: [origin], // pinned by reviewed deployment
       getAccessToken: () => sessionStorage.getItem('crushx_access_token'),
       fetchImpl: (...args) => fetch(...args),
     });
   ```

   The sample app does **not** install this configuration automatically.
   Server consent is a separate explicit decision from temporary local preview.
5. Content ingest only after moderation, rights checks and current visibility.
   Never index DMs, close-friends media, OTPs, payments, protected traits, or
   deleted/unauthorized media. Enforce per-item access again at read time.
6. For minors, enforce trusted account age band and content maturity checks
   before rollout. Do not infer age from watch history. Implement retention,
   account deletion and backup lifecycle; build alerting and rollback.
7. Staging Cognito, database concurrency, consent withdrawal race, traffic load,
   manual worker execution, cross-account attacks and OnePlus 9 Pro APK QA.

**Critical limitation:** No real video/voice models, FFmpeg indexing, ASR,
semantic embeddings, live production catalog or actual watch-time attestation.
Do not merge/deploy on CI success alone. Explicit owner approval required.
