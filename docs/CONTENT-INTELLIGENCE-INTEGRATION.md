# Crush.X Content Intelligence — isolated implementation

**Review-only:** \`feature/content-intelligence-foundation-20261104\`
Base: \`feature/aura-x-whole-app-workflows-20261104\`.

## What actually runs in the current web preview

- Local deterministic metadata ranker for known demo Post, Reel and Story IDs.
- Home, Stories and Reels use opt-in interest-aware ordering; Discover shows sample media and opens the relevant screen.
- Existing single AURA-X assistant exposes separate **temporary 15-minute** content consent, broad-interest selection, a source-ID search over demo captions, reset and opt-out.
- Post/Reel **Why this?** and **Not interested** controls. Explicit hiding works locally without profiling.
- Local like/save engagement signals and Reel video-complete event (where an actual video is present); no external telemetry.
- Blocked/muted creators, hidden media, expired Stories and unsupported IDs are excluded from the additional local retrieval/ranker. Browser memory is discarded on logout or user switch.
- The existing user message, wallet, live and account modules are **not** indexed.

**Warning:** The preview source has only one hardcoded Reel and two sample Posts. No production recommendation outcomes, user-retention gains, model accuracy or Android stability are claimed. Real video/audio frames and speech are not processed. Caption lookup is lexical evidence retrieval, not an LLM answer.

## Server-side contract, not a deployment

\`operating-system/features/content-intelligence.cjs\` registers two tools on the already-existing AURA gateway *only when all trusted adapters are supplied*:

- \`content.feed.rank\`: lists eligible content, optionally using approved broad-topic preferences and consented stored engagement signals.
- \`content.find\`: finds authorized caption/transcript excerpts, returns source IDs; fails closed without analysis consent.

\`createOperatingSystem({...contentIntelligence})\` requires the existing trustworthy server identity + role verification and audit sink, **plus** these adapters:

\`\`\`js
contentIntelligence: {
  // Authenticated subject is supplied by the task engine, NEVER from client args.
  async checkConsent({subject,scope}) {/* durable server-side grant: true/false */},
  async loadAuthorizedContent({subject,kind,limit}) {/* ACL-filtered published moderated records */},
  async authorizeContent({subject,id,kind}) {/* independent current per-item authorization */},
  async readEngagementEvents({subject,limit}) {/* own bounded consented events only */},
  async readExplicitInterests({subject}) {/* own approved topics only */}
}
\`\`\`

The OS tools recheck item access and consent before results are returned. Omit the adapter object until all five calls have trusted implementations. A browser-supplied \`viewerId\`, a sampled app profile, or a client checkbox is **not** trusted authorization.

Server objects should include \`id,creatorId,kind,status,moderation,visibility\`, plus \`publishedAt\`, optional \`expiresAt\`, broad \`topics\` and authorized caption/transcript snippets. Never feed DMs, private/Close Friends content, payments, OTPs, sensitive profile attributes or unmoderated media to the public recommender. A live service additionally needs age/maturity eligibility, block lists, abuse detection, creator privacy changes, content deletion propagation, retention rules and rate limits.

## Run checks on the GitHub branch

\`\`\`powershell
node --check content-intelligence.js
node --check app-content-intelligence.js
node --check aura-x-assistant.js
node --check operating-system/features/content-intelligence.cjs
node --test tests/content-intelligence-integration.test.cjs
node --test operating-system/tests/*.test.cjs
\`\`\`

The PR should also run current frontend browser tests and other unit/security suites. Do not merge if they fail.

## Still required for release

1. Compare this GitHub review branch with the actual newest Windows Step202/Step402 and current Unity/Android sources; perform conflict-safe integration without replacing newer work.
2. Configure real Cognito verification, RBAC, consent store, content database ACLs, moderation, deletion invalidation and an authenticated API.
3. Add robust event ingestion with consent, export/reset/deletion, opt-out enforcement and durable idempotency. Watch-time currently has no native player integration.
4. Add creator-safe multimodal indexing: video frames, captions/ASR/audio permissions, language detection and model licensing; guard prompt-injected user content if an LLM summarizes excerpts.
5. Implement real feed pagination, ranking evaluation, exploration/following balance, minors' safeguards and appeal/recommendation controls.
6. Run device QA, export/playback/memory performance, staging security tests, production rollback rehearsal and obtain explicit owner deployment approval.

**No production AWS operations, Android APK, real-user content access or main-branch merge were performed.**