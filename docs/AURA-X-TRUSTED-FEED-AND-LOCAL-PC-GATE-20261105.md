# Crush.X AI — trusted engagement and PC-host rollout gate (5 Nov 2026)

Status: review-only source on an isolated GitHub branch. This is **not** a connected Android app, a running local server, a model call, or a production release.

## What changed
- `operating-system/engagement/trusted-receipts.cjs`: server-side HMAC-SHA256 receipts for trusted player/interaction events. The verifier reads the independent server receipt record by subject and event ID, and validates the exact subject, content, action, watch fraction, timestamp, issuer, audience and signature. Tampered, missing, expired, swapped, or replayed mismatched claims fail closed.
- `operating-system/tests/trusted-receipts.test.cjs`: no-receipt, cross-account, tampering, freshness, and key mismatch tests.
- PostgreSQL integration test now uses verifiable receipts instead of its previous blanket-trust event stub. Event deduplication and consent remain inside `createPostgresContentStore`.

## Wiring requirements (not automatically enabled)
The trusted backend must provide a **separate receipt store** and a real, authenticated event collector. The collector must validate real account session, app/player action provenance, signed event identity, plausible playback duration and timestamps. Do not sign arbitrary JSON sent from a phone. Do not expose a signing HTTP endpoint.

```js
const {createTrustedReceiptService}=require('./operating-system/engagement/trusted-receipts.cjs');
const {createPostgresContentStore}=require('./operating-system/storage/postgres-content-store.cjs');
const receipts=createTrustedReceiptService({
  key:serverOnlyRandomKey32Bytes,
  readSignedReceipt:({subject,eventId})=>protectedReceiptStore.read({subject,eventId})
});
const contentStore=createPostgresContentStore({
  pool:trustedPgPool,
  verifyTrustedEvent:receipts.verifyTrustedEvent
});
// On trusted player event ingestion after independent verification:
// await protectedReceiptStore.write(receipts.signTrustedEvent({subject,event}));
// await contentStore.recordTrustedEvent({subject,event});
```

The code does **not** implement the missing player-event collector, durable receipt store, or a public ingestion endpoint. A signature proves which trusted service issued a record, not whether a user actually watched content. The collector needs separate abuse and spoof-resistant telemetry checks.

## Local-PC migration: independent owner-only gate
For the suspended AWS setup, stage PostgreSQL and authorized media storage on the owner's PC without changing the existing cloud stack:
1. Preserve latest F: sources and stage a fresh separate working directory; reconcile Step252 GitHub branch with Step259 React/Capacitor and Unity files by hashes and diffs.
2. Use PostgreSQL 16+ with encrypted backups, retention, least-privilege service accounts and access-restricted media folders. Keep session signing keys and HMAC keys out of the app, GitHub and logs.
3. Replace Cognito-only validation with a reviewed signed-session or independently verified JWT implementation. Reject expired, disabled and revoked accounts. Do **not** assume that changing the hostname provides authentication.
4. Serve authenticated AI/content APIs over TLS. LAN or public exposure requires firewall, rate limiting, abuse protections and tested recovery; do not port-forward a staging host directly.
5. Configure a durable worker/queue, receipt store and authenticated client adapter. No synthetic watch-time events may enter the production recommender.
6. Validate consent revoke, history deletion, creator access changes, two-account isolation, real video/audio inference, model licensing, Android/Unity builds, OnePlus 9 Pro physical QA and backup restore.
7. Deploy only after explicit owner review/approval.

## Commands on a GitHub checkout
```powershell
node --check operating-system/engagement/trusted-receipts.cjs
node --test operating-system/tests/trusted-receipts.test.cjs
node --test operating-system/tests/*.test.cjs
```
Optional database integration test requires an owner-approved temporary PostgreSQL instance and the documented `POSTGRES_TEST_URL` test setting. **Never** point automated tests to live user-data tables.

## Known holds
- Latest Windows app source and local PC not mounted in this environment.
- Local PostgreSQL / receipt store / session service not provisioned or verified.
- Real player-event collector, provider-backed video understanding and mobile model startup pending.
- No Unity/IL2CPP APK build, physical device test, production deploy or main-branch merge.

## Read-only Windows source inventory (added in this PR)
Run from the checkout containing this script on your Windows PC. The target is your current isolated working copy; it **does not** modify it:

```powershell
node operating-system/tools/scan-local-ai-source.cjs --root "F:\CrushX-Step259-Isolated\CrushX-Step249-Work\Windows-App-Work"
```

This lists sample source paths for AURA, OS, Feed, Media, Camera and Safety modules. It skips `node_modules`, `dist`, `build`, `.git` and other generated folders, and does not inspect source text, secrets, credentials or user content. The result is an inventory **only**; it does not prove successful inference, integration, backend connection or Android execution.


## Production hardening implemented after first CI review

The isolated branch now adds **PostgreSQL migration 002** and `createPostgresReceiptStore`:
- Account-scoped, signed event receipts in `cx_trusted_event_receipts`, with expiring validity, protected duplicate IDs, and bounded expiry cleanup.
- Signature verification is performed by the server before persistence. Recipient metadata, audience, event fields, and watch fraction must match exactly.
- Database consent-row locking serializes receipt insertion, event writes, personalization withdrawal, and history erasure. Receipt verification occurs *after* event-write consent locking to eliminate stale-proof reinsert after reset.
- Deleted catalog items cascade-delete associated receipts. Reset and personalization withdrawal remove their receipts and stored events.
- `createVerifiedEngagementIngestor` takes only an event ID and a privileged worker credential; it reads a verified first-party event from protected server storage. It never trusts a caller-provided watch fraction or user account.

**Migrations:** Apply `001_content_intelligence.sql` before `002_trusted_engagement_receipts.sql`. Run only after reviewing DB schema/backups; the revised content store now expects the second table.

### Required production wiring (server only)

```js
const {createTrustedReceiptService}=require('./operating-system/engagement/trusted-receipts.cjs');
const {createPostgresReceiptStore}=require('./operating-system/storage/postgres-trusted-receipts.cjs');
const {createVerifiedEngagementIngestor}=require('./operating-system/engagement/verified-ingestor.cjs');
let receiptStore;
const receiptService=createTrustedReceiptService({
  key:approvedServerSecretBuffer,
  readSignedReceipt:({subject,eventId})=>receiptStore.read({subject,eventId})
});
receiptStore=createPostgresReceiptStore({
  pool:trustedPostgresPool,
  validateReceipt:receiptService.verifyIssuedReceipt
});
const ingestor=createVerifiedEngagementIngestor({
  authenticateWorker:verifyPrivilegedServiceCredential, // implement securely
  readAttestedEvent:readProtectedFirstPartyEvent,         // implement durably
  verifyAttestation:verifyServerSignedPlaybackOrAction,   // never return true by default
  checkActiveAccount:readProtectedAccountStatus,
  consumeRateLimit:sharedAccountRateLimiter,
  receiptService,receiptStore,
  contentStore:trustedContentStore,
  audit:durableAudit
});
// From a private trusted worker, not a public route:
// await ingestor.ingest({workerCredential:privilegedCredential,eventId:trustedEventId});
```

Neither signed receipts nor the ingestor magically prove that a person actually watched a video. The independent playback/action collector, attestation signing, anti-replay protection, realistic durations, production identity and first-party event pipeline still need implementation and device evidence.

### Verification
- CI tests use a real temporary PostgreSQL 16 service. They verify receipt durability, idempotent insert, consent removal, reset behavior, stale-proof rejection, and TTL cleanup.
- The OS unit suite tests worker authorization failures, missing/forged attestation, account revocation, limiting, and deterministic retries.
- No local-PC server or app release is created by these GitHub commits. Keep PR draft until source reconciliation and Android/OnePlus tests are complete.

