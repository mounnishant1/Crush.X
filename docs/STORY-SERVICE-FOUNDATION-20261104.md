# Crush.X Story service — isolated backend foundation (4 Nov 2026)

This branch is a **review-only foundation**, not a deployed service. It does not change the Android APK, access AWS credentials, create a DynamoDB table or enable Story publishing in the sample web app.

## Implemented API

| Method | Path | Authentication | Result |
| --- | --- | --- | --- |
| POST | \`/v1/stories\` | Owner access token | Create approved 24-hour story metadata, returning an idempotent receipt |
| GET | \`/v1/stories/{id}\` | Viewer access token | Read metadata after live audience/privacy checks |
| POST | \`/v1/stories/{id}/view\` | Viewer access token | Unique viewed receipt (same viewer counted once) |
| PUT | \`/v1/stories/{id}/reaction\` | Viewer access token | Upsert viewer's selected emoji |
| POST | \`/v1/stories/{id}/replies\` | Viewer access token | Persist a private Story-inbox reply; **not** a delivered DM |
| GET | \`/v1/stories/{id}/insights\` | Owner access token | Owner-only counts of views, reactions and replies |
| DELETE | \`/v1/stories/{id}\` | Owner access token | Soft-delete Story metadata; interactions rejected thereafter |

All routes require a trusted *server-side* credential verifier. View/reply permissions never use browser-submitted follower lists or owner IDs. The HTTP handler checks an explicit HTTPS origin allowlist, no-store headers and modest in-process limits; **production also needs a shared rate limiter, perimeter protections and HTTPS termination**.

## Components

- \`operating-system/stories/story-service.cjs\` — Story domain rules, author-scoped publish, 24-hour expiry, audience gates, cross-content/mention/text moderation hooks, idempotent receipts and privacy-preserving status errors.
- \`operating-system/stories/dynamo-story-store.cjs\` — AWS SDK v3 DocumentClient adapter for metadata, unique views, replacement reactions, idempotent replies and transactional active-story checks.
- \`operating-system/http/story-handler.cjs\` — authenticated Story routes. Integrated **optionally** into the existing loopback-only staging host by passing \`storyService\` to \`createStagingHost\`.
- \`story-api-client.js\` — browser-side HTTPS client interface. It obtains an access token from a caller-provided function per operation, never saves tokens, and is **not** automatically enabled.
- \`operating-system/tests/story-service.test.cjs\`, \`story-api-client.test.cjs\`, \`dynamo-story-store.test.cjs\` — security and idempotency regressions.

## Mandatory trusted adapters

\`createStoryService\` refuses startup without *all* of the following:

\`\`\`js
const {createStoryService}=require('./operating-system/stories/story-service.cjs');
const storyService=createStoryService({
  store: persistentStoryStore,
  verifyMedia: async ({ownerId,mediaId}) => {
    // Server reads trusted media upload + virus/moderation receipt.
    // Return {ready:true,ownerId,mediaId,kind:'image'|'video',moderationStatus:'approved'}.
    throw Error('MEDIA_RECEIPT_BACKEND_NOT_CONFIGURED');
  },
  relationship: async ({ownerId,viewerId}) => {
    // Server reads up-to-date blocks, private-account restrictions,
    // follower and Close Friends edges.
    // Return {checked:true,blocked:false,accountAllowed:true,
    //         follows:boolean,closeFriend:boolean}.
    throw Error('RELATIONSHIP_STORE_NOT_CONFIGURED');
  },
  verifyRelated: async ({ownerId,type,id}) => {
    // Authorize sharing/referencing an existing Reel/Post, not just its ID.
    throw Error('RELATED_CONTENT_GATE_NOT_CONFIGURED');
  },
  verifyMentions: async ({ownerId,subjectIds}) => {
    // Check mention permissions and block relationships.
    throw Error('MENTION_POLICY_NOT_CONFIGURED');
  },
  reviewText: async ({ownerId,caption}) => {
    // Approve caption after domain moderation.
    throw Error('TEXT_MODERATION_NOT_CONFIGURED');
  }
});
\`\`\`

The thrown errors above are intentional placeholders. **They are not production integrations.**

## DynamoDB prerequisites

The sample adapter expects an **already provisioned** DocumentClient-compatible table with String keys \`PK\`, \`SK\` and DynamoDB TTL attribute \`ttl\` (epoch seconds). AWS SDK v3 \`GetCommand\`, \`PutCommand\`, \`QueryCommand\`, \`UpdateCommand\` and \`TransactWriteCommand\` constructors must be injected. Metadata uses \`STORY#{id}\` + \`META\`; interactions use the same partition with \`VIEW#{viewer}\`, \`REACTION#{viewer}\`, \`REPLY#{requestHash}\`. Unique views and replies use conditional writes. Interactions transactionally assert the Story still exists, is undeleted and has not expired.

Production requires KMS encryption, least-privilege IAM, encrypted backups, protected reply access, account deletion/retention policy, metrics, throttling, provisioned capacity/on-demand budgeting, moderation audit, retention controls and legal review.

## Still pending — must NOT claim complete

1. Match/merge with the user's newer Windows Step202/Step230 Android frontend; this repo branch is **not** that verified source. Avoid overwriting newer Story editor code.
2. Bind Cognito access-token verification to real sessions and account-disable/revocation state; add server-side social relationships and Close Friends persistence.
3. Implement approved media upload pipeline (signed URLs, scanning/moderation, durable storage, thumbnail/video transcoding, content visibility, expiring playback URLs, cleanup after deletion).
4. Implement feed listing, seen/unseen synchronization, mention notifications and the actual encrypted DM delivery adapter with user permissions.
5. Deliver creator interaction insights with suitable limits, event ordering and dashboards. Current counts are direct reads, not an analytics warehouse.
6. Run real AWS integration and security/load tests, Android APK install and OnePlus 9 Pro gestures/media/navigation tests.
7. Release only after code review, explicit owner deployment approval and rollback readiness.

The implementation deliberately distinguishes a **saved Story-inbox reply** from a DM delivered to the creator; the API returns \`deliveredAsDM:false\` and \`notificationSent:false\`. Likewise, a published Story metadata receipt returns \`deliveryConfirmed:false\` until a real feed/distribution pipeline acknowledges it.

## Tests

\`\`\`sh
node --check operating-system/stories/story-service.cjs
node --check operating-system/stories/dynamo-story-store.cjs
node --check operating-system/http/story-handler.cjs
node --check story-api-client.js
node --test operating-system/tests/story-service.test.cjs
node --test operating-system/tests/dynamo-story-store.test.cjs
node --test operating-system/tests/story-api-client.test.cjs
\`\`\`

These source tests are also added to the frontend CI workflow. CI green does **not** mean the live cloud APIs or Android device were verified.
