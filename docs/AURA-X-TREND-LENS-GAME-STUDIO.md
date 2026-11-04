# AURA-X Trend-to-Lens/Game Studio (isolated implementation)

## Implemented

- Pure, deterministic trend scorer: authorized, current, per-post deduplicated signals from Crush.X, YouTube, Instagram, TikTok and Snapchat, without scraping private feeds or downloading video.
- Validates the source, access mode, consent/authorization flag, source-specific access, timestamp freshness, views and safe theme tokens. Rejects records with incomplete permission provenance.
- Ranks evidenced themes by sample size, engagement, freshness, permitted multi-source corroboration and optional previous-snapshot velocity. Does not invent numbers.
- Produces **data-only pending-review** CreatorLensDocument v1 objects referencing **installed Unity LensCatalog IDs**. Parameters comply with existing CreatorLensValidation bounds.
- Picks a game/puzzle ID from the installed LensMiniGameCore catalog. This is a suggestion referencing an existing template; it does **not** create new gameplay code or themed 3D art.
- All drafts are blocked from publishing (no publish transport). Independent exact-hash review, asset provenance, moderation, native APK tests and owner approval are required.

### Example input and evaluation

Node 24 (no npm dependencies):

\`\`\`js
const studio = require('./aura-x-trend-studio.js');
const now = Date.now();
const signals = [
  {source:'youtube', postId:'example-video-001', tags:['#fruitcut'],
    accessMode:'approved_api',authorized:true,
    publishedAt:now-3600000, observedAt:now,
    metrics:{views:1000,likes:150,comments:12}},
  {source:'crushx',postId:'example-reel-001',tags:['#fruitcut'],
    accessMode:'owned_metrics',authorized:true,
    publishedAt:now-7200000,observedAt:now,
    metrics:{views:800,likes:180,shares:25}}
];
const result = studio.buildTrends(signals, {now});
console.log(JSON.stringify(result.drafts,null,2));
\`\`\`

Tests: \`node --test tests/aura-x-trend-studio.test.cjs\`

## Next integration work (not implemented here)

1. Add server-side, approved provider connectors. Never put provider keys in client JS. YouTube Data API \`videos.list(chart=mostPopular)\` is one candidate; Instagram business/hashtag, TikTok business Discovery and Snapchat owner analytics require their permitted scopes and platform approvals. Not all platforms expose unrestricted public feeds or arbitrary Reels.
2. Add scheduled collection, source rate-limits, secured encrypted token storage, provenance receipts, opt-out/deletion, rechecks and analytics warehouse. Accept only platform-permitted metadata or consented media.
3. Server AURA-X tool route: \`trend.analyze\` (read) and \`trend.createDraft\` (draft only), with independently enforced owner permissions, expiry, audit and idempotency.
4. Keep unpublished concept assets off mobile public catalogs. Export an immutable CreatorLensDocument and game theme pack, review exact package SHA-256 using the existing \`ICreatorPublishReview\` gate, then test Android/Unity on a real device.
5. Integrate reviewed manifests into LensMiniGamePanel, camera lens carousel, search and recommendations with an authenticated backend and user-controlled features. Stage rollouts, measure real game starts/completions/share rate and rollback failures.

## Security boundaries

No unrestricted agent browsing, cookie/session extraction, private-DM access, account credential transfer, platform impersonation, copyrighted music import, direct video reposting, executable shaders, or automatic public publishing. AccessMode and authorized flags are *claims by the upstream ingestion service*, not a substitute for server OAuth, API review, provenance and signed receipts.

The keyword blocklist is not a production moderation classifier; every draft needs substantive safety, IP, age suitability and asset licence review. Scores are heuristic, not assertions of real-time platform trends. Source permissions must be reevaluated at the time data is fetched.
