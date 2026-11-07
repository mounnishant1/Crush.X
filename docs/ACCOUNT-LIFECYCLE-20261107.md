# Crush.X — Account suspension, appeal, deactivate and reactivate (2026-11-07)

## Scope and provenance
Isolated branch: \`feature/account-suspend-reactivate-appeals-20261107\`
Base: \`repair/step317-aura-auth-20261107\`. No production AWS calls, Android builds, email sends,
data mutation, or merge of the latest local Windows frontend were performed by this branch.
Source is browser-preview compatible but **not wired to live Cognito/HTTP API** until staging adapters are provisioned.

## End-user lifecycle
- **ACTIVE**: app features allowed only after server-side state and fresh JWT checks.
- **DEACTIVATED**: voluntary account pause; user verifies identity and reactivates. Not a moderation appeal.
- **SUSPENDED**: temporary moderation restriction, optional expiry (1–720 hours), one appeal per case.
- **BANNED**: permanent moderation restriction; safety admin + separate documented approval required.
- **RESTORED**: transition after successful reinstatement, not a separate persisted state; fresh login required.
- A moderation decision never clears the user's voluntary deactivation preference.
- Temporary restrictions are logically evaluated against server clock, not a client countdown.

## Source structure
- \`operating-system/accounts/account-service.cjs\` — role-based policy, statuses, appeals, restrictions.
- \`operating-system/accounts/dynamo-store.cjs\` — optimistic CAS and atomic state/audit/outbox/idempotency transaction.
- \`operating-system/accounts/memory-store.cjs\` — **tests only**, not production-safe.
- \`operating-system/accounts/account-http.cjs\` — HTTP API v2 Lambda request adapter.
- \`operating-system/accounts/account-guard.cjs\` — protected endpoint guard rechecks account state and JWT iat.
- \`account-lifecycle-panel.js\` / \`.css\` — accessible full-screen account status, deactivation, reactivation, appeal.
- \`app-os-integration.js\`, \`.css\`, \`index.html\` — visible entry from App Controls.
- \`operating-system/tests/account-lifecycle.test.cjs\` — isolated Node security regressions.
- \`.github/workflows/account-lifecycle-ci.yml\` — CI syntax + Node tests.

## HTTP contract
All routes require verified Cognito **access** JWT and server-issued security context.
Use \`Idempotency-Key: <random UUID>\` on each POST. Never accept owner/admin/subject from client body.

| Method | Route | Authorization |
|---|---|---|
| GET | /v1/account/status | signed-in user (even if restricted) |
| POST | /v1/account/deactivate | self + recently completed step-up |
| POST | /v1/account/reactivate | voluntarily deactivated self + step-up; **never lifts moderation** |
| POST | /v1/account/appeals | restricted user, one per case, within 30 days |
| GET | /v1/moderation/accounts/{subject}/status | moderator or safety admin |
| GET | /v1/moderation/accounts/{subject}/review | moderator with recent MFA; includes appeal text |
| POST | /v1/moderation/accounts/{subject}/suspend | moderator with MFA; permanent requires safety admin and second approval |
| POST | /v1/moderation/accounts/{subject}/reinstate | moderator MFA; banned accounts safety admin only |
| POST | /v1/moderation/accounts/{subject}/reject-appeal | moderator MFA |

No user-accessible endpoint calls \`reinstate\` or \`suspend\`.

## AWS staging integration requirements (NOT deployed)
1. Create a DynamoDB table with partition key \`pk: String\` and sort key \`sk: String\`. Enable PITR, at-rest encryption, TTL on attribute \`ttl\`, alarms and least-privilege IAM.
2. At registration, use \`dynamoStore.provision(verifiedSub)\` only after an authenticated Cognito sign-up/confirmation event. Never infer account existence solely from profile UI.
3. Wire \`createCognitoVerifier({issuer,clientId})\` to \`account-http\`; use the actual new user pool and region from verified deployment config. Do not publish AWS identifiers or tokens in the browser.
4. Implement durable \`getSecurityContext\` for **verified** roles, recent user authentication and moderator MFA/step-up. Never derive these timestamps from request JSON or user-controlled local storage. The provided adapter intentionally cannot elevate a user.
5. Implement distributed rate limits (user+IP+route), strong verification challenges, abuse controls, and case assignment policies. Supply **transaction-bound, distinct-approver** approval receipts for permanent bans. Test on real staging.
6. Restrict \`getSecurityContext\` to server-side context; enable approved CORS origins. Deploy documented HTTP API routes with JWT authorizer and middleware checks.
7. **Mandatory**: call \`account-guard.authorize()\` for every private API, DM/call handshake, media URL signer, websocket, publishing operation, P2P cloud relay, and AURA-X execution. Suspended users must retain only account-status and appeals routes.
8. Run an outbox worker to execute \`REVOKE_SESSIONS\` with Cognito \`AdminUserGlobalSignOut\` and \`ACCOUNT_STATUS_NOTICE\` via verified email/push integrations, with idempotent delivery receipts and retries. Do not silently mark sent. A stale outbox event must never revoke a newly reactivated session.
9. Configure frontend \`CrushXAccountLifecycle.configure({getAccessToken,performStepUp,onRequireFreshLogin,baseUrl})\` **only after** the real backend is deployed. Until then UI reads *not connected* and performs no mutation.
10. Configure visibility/content rules: hide voluntarily deactivated profiles, show policy-neutral restricted profiles, preserve authorized legal/security evidence, restore followers/content after reinstatement, and avoid losing drafts/media or chats.
11. Reconcile with newer Windows frontend and current React/Capacitor source before merging; check old index preview compatibility and browser tests.
12. Complete integration/abuse tests (token reuse, wrong-subject access, 429s, stale sessions, moderator privilege loss, OTP expiry, replay, duplicate appeals, high-concurrency races), OnePlus 9 Pro APK tests, production monitoring and owner sign-off.

**Important AWS behavior**: Cognito AdminUserGlobalSignOut revokes tokens for Cognito APIs, but signature-only JWT validation can still accept a revoked token. Database-based account access checks remain mandatory.

## Running local tests
\`\`\`sh
node --test operating-system/tests/account-lifecycle.test.cjs
\`\`\`

## Release gates
| Gate | Status |
|---|---|
| Source implementation and reviewable branch | Implemented |
| Node isolated test suite | Run in GitHub Actions; verify latest SHA |
| Dynamo transaction against actual table | Untested |
| Cognito + MFA/step-up evidence end-to-end | Untested |
| Outbox worker, email/push notification receipts | Untested |
| All-service account guard adoption | Untested |
| Latest Windows source reconciliation | Untested |
| Real Android APK and OnePlus 9 Pro QA | Untested |
| Production deployment | Not deployed |

Account state changes must never be represented as live or Android-ready without these receipts.
