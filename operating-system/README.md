# Crush.X Operating System Foundation — Steps 2–6

**Status:** Server-side proof-of-integration, behind an isolated review branch. Not a native Android OS, not connected to the existing Android app, not deployed. This adds no second AI assistant: AURA-X is the sole future orchestration surface.

## Implemented

| Step | Code | Contract |
|---|---|---|
| 2 Core kernel | core/kernel.cjs | Module registration, dependency order, startup rollback, reverse shutdown, health checks, internal event bus |
| 3 Owner/User authorization | core/permissions.cjs | Trusted backend identity + RBAC adapters, owner-subject binding, account-scoped permissions, short-lived opaque grants, revocation and revalidation |
| 4 Tasks/events | core/task-engine.cjs | Registered server actions only, JSON input validation, idempotent request keys, bounded in-memory queue, retries/backoff, cancellations, worker dispatch, task receipts |
| 5 AURA-X integration | core/aura-gateway.cjs, index.cjs | Single allowlisted tool registry; authorized actions submitted to task engine, high-risk tools blocked pending separate approval workflow; optional self-profile and model suggestion adapters |
| 6 Audit/monitoring foundation | core/audit.cjs, index.cjs | Validated metadata-only SHA-256 audit chain with mandatory sink acknowledgment, OS health task, queue status and module liveness |

## Integration sample — trusted Node server ONLY

    const {createOperatingSystem}=require('./operating-system');
    const system=createOperatingSystem({
      verifyCredential: async token => {
        // REQUIRED: validate signed Cognito JWT/session on server using JWKS,
        // issuer, audience/client id, expiry, token use and account status.
        // Return {verified:true,subject:'trusted-sub',expiresAt:expiryEpochMs}.
        throw Error('AUTH_PROVIDER_NOT_CONFIGURED');
      },
      getRoles: async sub => {
        // REQUIRED: query protected server RBAC store, never browser claims.
        throw Error('ROLE_STORE_NOT_CONFIGURED');
      },
      ownerSubject: process.env.CRUSHX_OWNER_SUBJECT,
      auditSink: async entry => {
        // REQUIRED: immutable durable append + acknowledgment in an audit DB.
        throw Error('AUDIT_STORAGE_NOT_CONFIGURED');
      },
      readOwnProfile: async subject => {
        // OPTIONAL: read profile by authenticated subject.
        throw Error('PROFILE_STORE_NOT_CONFIGURED');
      },
      modelProvider: {
        async suggest({prompt,subject}) {
          // OPTIONAL: call selected AI provider with user consent and
          // a server-side API key. Return suggestion text only.
          throw Error('AI_PROVIDER_NOT_CONFIGURED');
        }
      }
    });
    await system.start();
    // The authenticated API must derive credential + resourceOwner itself.
    // Call after input validation + rate limit + CSRF protection:
    const receipt=await system.aura.invoke({
      credential: verifiedSessionToken,
      toolName: 'assistant.suggest',
      args: {prompt: 'Suggest an original reel caption'},
      resourceOwner: authenticatedSubject,
      idempotencyKey: requestIdFromAuthenticatedSession
    });
    // Trusted worker process (NOT browser): await system.tasks.runNext();
    // Authorized request: await system.tasks.inspect({credential: verifiedSessionToken, jobId: receipt.jobId});

This module does **not** provide a usable HTTP API by itself. Authentication, sessions, model API configuration, persistent job queue, secure front-end integration and mobile releases remain external work.

## Threat boundary

- The LLM never registers tools or chooses server capabilities; trusted backend code owns the allowlist.
- The model's tool calls are untrusted *requests*. The backend derives identity and enforces permissions on submission and again immediately before execution.
- Owner-only capabilities require the exact configured owner subject **and** a currently authorized owner role. A normal user cannot elevate by claiming role = owner.
- Personal tools always require resourceOwner === authenticated subject; no unscoped inbox/creator/customer data access.
- High-risk tool actions (money, publishing, moderation bans, system deployment, infrastructure changes) are intentionally not activated by this module. Separate owner confirmation and domain-specific approval protocols are prerequisites.
- Permission grants are opaque in-process objects, capped to 60 seconds by default and rechecked against server roles. No client-created grant is accepted.
- Task inputs and outputs are bounded JSON. Functions, unexpected prototypes and dangerous keys are rejected.
- Audit events contain only approved identifiers/status fields, not source code, prompts, access tokens or private messages.
- The provided queue, idempotency index and grants are **in-memory, single-process only**. Do not put them behind multiple workers or promise exactly-once delivery. A crashed process loses pending jobs and may leave partially executed operations.
- The hash-chained audit sink needs real transactional, append-only persistence, a protected root hash and independent monitoring. Hash chaining alone does not prove against a privileged writer rewriting its own storage.
- Safe read-only examples: owner OS health and the authenticated user's self profile (if adapter configured). Optional AI output is a *suggestion*, never an autonomous remote action.
- User/owner AURA display components do not yet invoke these server-only modules.

## Tests

    node --check operating-system/index.cjs
    node --test operating-system/tests/*.test.cjs

The isolated .github/workflows/os-core.yml runs syntax checks plus OS tests with Node 22. Existing frontend/Unity regressions must still pass separately.

## Follow-on tasks before staging/production

1. Compare and conflict-safe merge with latest Windows Step202–231 and AR source. This branch is based on feature/aura-x-owner-coding-review-20261103, not updated Windows source or main.
2. Add real Cognito JWT verification, server-side RBAC persistence, short-lived session handling and authenticated routes (rate limits, replay/CSRF checks, security headers).
3. Add a durable transactional outbox/queue, distributed idempotency keys, consistent worker leases, dead letter queue, recovery and compensation receipts.
4. Add durable external audit storage, key management, retention rules, query privileges, alerts, CloudWatch metrics and backups.
5. Map real feature adapters to Story/Reel/Camera/Editor/Messages/Calls/Live/Ads, each with explicit permissions and user approvals where needed.
6. Connect AURA-X on-device UI to authenticated API and real model service. No browser/model/GitHub secrets.
7. Perform staging auth tests, failure injection, full app regressions, Android APK and OnePlus device verification, release approval and rollback rehearsal.

**Deployment gate:** No direct production deployment, no PR auto-merge and no elevated workflows. Code review and CI success are not equivalent to full-app or production readiness.
