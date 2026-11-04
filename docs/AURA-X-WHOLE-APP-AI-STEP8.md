# AURA-X Step 8 — whole-app AI guidance and operating-system registry

**Status:** isolated GitHub review branch only. This is not an Android APK,
not a verified production model, and not a production-ready AI operating system.

## Scope delivered

- AURA-X remains **one** assistant. The existing floating button and full-screen
  App Controls hub open that single dialog. The module catalog adds no extra agents.
- 24 user-facing areas: Home, Explore, Stories, Reels, Posts, Camera, Editor,
  Stickers, Messages, Groups, Calls, Live, Profile, Notifications, Settings,
  Creator, Moderation, Ads, Wallet, Offline Nearby, Music, Avatar, Account, Search.
- A separate owner-only backend advisory area for OS diagnostics and release
  preparation; it is **not exposed as a trusted owner control in the browser**.
- The UI has local, rule-based checklists only, explicitly labeled as such.
  It does not inspect devices, fetch private media, or execute requested fixes.
- Backend `operating-system/features/ai-workflows.cjs` registers 25 server-only
  `ai.<module>.guide` tools **only when both** a model provider and trusted,
  account-scoped consent adapter are configured.
- Each authorized operation passes through the OS permissions engine, task queue
  and audit recording; a grant is rechecked at execution time. Owner tool
  requires configured owner subject and verified owner role.
- Results are strictly advisory with `executed:false`, `published:false`,
  `sent:false`, `broadcast:false`, and `charged:false`. No feature
  adapter publishes, sends, calls, spends money, records, bans or deploys.
- Prompts and user-supplied context are capped and omitted from audit records.

## Trusted backend integration contract

```js
const {createOperatingSystem}=require('./operating-system');
const system=createOperatingSystem({
  verifyCredential: /* server Cognito JWT/session verifier */,
  getRoles: /* protected server roles */,
  ownerSubject: /* authenticated owner subject, not browser claim */,
  auditSink: /* durable authenticated append-only storage */,
  modelProvider: {
    async suggest({subject,workflow,prompt,context,instruction,mode}) {
      // Server-only inference. Keep user text separate from trusted instructions.
      // Return a single plain-text suggestion. Do not grant model tool access.
    }
  },
  aiConsent: async ({subject,workflow,owner}) => {
    // Check actual unexpired persisted consent belonging to subject.
    // A client supplied "consent:true" is NOT sufficient.
    return await verifiedConsentStore.has({subject,workflow,owner});
  }
});
await system.start();
const receipt=await system.aura.invoke({
  credential: verifiedSessionToken,
  toolName:'ai.editor.guide',
  args:{prompt:'Suggest non-destructive trim settings'},
  resourceOwner: authenticatedSubject,
  idempotencyKey: uniqueAuthenticatedRequestId
});
// A separate trusted worker must call tasks.runNext().
// Inspect task result via authenticated API, never from browser directly.
```

If `modelProvider` or `aiConsent` is missing, the new whole-app AI
tools are not registered. Existing `assistant.suggest` behavior is unchanged.

## Verification

```sh
node --test operating-system/tests/*.test.cjs
node --test tests/ai-workflows.test.cjs
node --check app-ai-workflows.js
node --check aura-x-assistant.js
node --check app-os-integration.js
```

Playwright `tests/os-feature-browser.cjs` also checks the 24 module entries,
explicit local consent, reuse of one assistant, no remote writes, logout and
full-screen App Controls. CI workflows were updated to run these checks.

## Still missing for real end-to-end operation

1. Conflict-safe reconciliation with the latest Windows local source and
   Android/Unity AR branch. GitHub's Step 7 branch is not that verified release.
2. Cognito-issued session/JWT verification, trusted account/role storage, consent
   persistence, authenticated API routes, CSRF and rate limits.
3. Production AI provider integration, consent revocation, privacy review,
   tool/result filtering, usage budgets, multilingual evaluation and abuse tests.
4. Durable task queue, worker leases, idempotency and independent audit retention.
5. Feature-specific **real** adapters for native Camera/AR, editor media export,
   posting, direct message delivery, WebRTC/P2P, Live, ads and INR ledger.
   Risky actions need explicit confirmations plus server-side receipts.
6. Android build, OnePlus 9 Pro camera/media/interaction QA, two-device calling,
   security testing and an owner-approved staged release.
7. CI validation on the reconciled source. Neither CI nor PR opening proves
   device or production readiness.

**Safety gate:** Never auto-deploy or merge this branch; no live monetary,
communication or publishing action is enabled by this patch.
