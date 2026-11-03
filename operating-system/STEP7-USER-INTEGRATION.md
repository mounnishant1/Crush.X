# Crush.X Operating System — Step 7 User App Integration

**Scope**: browser app navigation + server-side user feature adapters. This is a reviewed, isolated implementation based on \`feature/crushx-operating-system-core-s2-s6-20261103\`. It does **not** merge the separate latest Windows source, enable live messaging/calls, connect a native camera SDK, publish media, or deploy an API.

## Files

- \`app-os-integration.js\` / \`app-os-integration.css\`: one full-screen, accessible App Controls hub linking Account, Camera, Editor, Stories, Reels, Posts, Messages, Calls and the existing **single** AURA-X assistant.
- \`index.html\`: stylesheet and script loaded after existing front-end modules, preserving current routes.
- \`operating-system/features/user-features.cjs\`: server-only feature tool registration using trusted adapters. Optional adapters register only when configured.
- \`operating-system/core/permissions.cjs\`: exact-subject authorization for camera/call preflight, editor and message drafts, plus the existing content draft permission.
- \`operating-system/index.cjs\`: optional \`userFeatures\` composition.
- \`operating-system/tests/feature-integration.test.cjs\`: backend feature authorization and workflow contracts.
- \`tests/os-feature-browser.cjs\`: Playwright testing of full-screen navigation, assistant uniqueness, status truthfulness, logout and no remote mutations.
- CI workflows include OS tests and front-end browser smoke.

## Backend API capability contracts

Inject feature adapters through the trusted Node backend:

    const os = createOperatingSystem({
      verifyCredential, getRoles, ownerSubject, auditSink,
      userFeatures: {
        cameraPreflight: async ({subject}) => ({enabled: await cameraPolicyEnabled(subject)}),
        callPreflight: async ({subject}) => ({enabled: await callPolicyEnabled(subject)}),
        saveContentDraft: async ({subject,request,jobId}) => {
          // request.kind = post/reel/story, optional title/caption/draftId.
          // Store to account-scoped draft table; never publish.
          const draftId = await saveDraftToDatabase({subject,request,jobId});
          return {saved:true,draftId};
        },
        saveEditorDraft: async ({subject,request,jobId}) => {
          // Request includes kind, draftId, small supported edit operations.
          const draftId = await saveEditMetadata({subject,request,jobId});
          return {saved:true,draftId};
        },
        saveMessageDraft: async ({subject,request,jobId}) => {
          // request.recipientId is NOT permission to send any DM.
          const draftId = await saveUnsentMessage({subject,request,jobId});
          return {saved:true,draftId};
        }
      }
    });
    await os.start();

OS tasks and the tool gateway perform **server-side** user/owner capability checks on each submission and immediately before execution. Every action needs an idempotency key, and only user-scoped drafts and preflight checks are registered. Front-end navigation is not a server authorization decision.

**Explicitly excluded**: sendMessage, startCall, publishStory, publishPost, publishReel, debitCoins, massModeration and code deployment. These require verified production APIs, domain-specific permissions, durable receipts and separate approval flows.

## Browser integration

The app adds **App controls** to the existing sample preview information banner. The button opens a full-screen page, not a center modal, with keyboard Escape/back and focus handling. The links use the app's existing navigation. AURA-X remains **one** assistant and is opened from the same hub. This browser app does not have a verified OS backend endpoint. It makes no OS network mutations; all labels clearly say local preview/unavailable.

Camera/AR currently routes to Create; physical camera support must be tested separately on Android. Story Studio is still local editing; Reels and Home contain sample data; Messages do not send; Calls use Messages navigation only (no WebRTC session). Account data in the preview is separate from verified Cognito backend account data.

## Verification

    node --test operating-system/tests/*.test.cjs

CI additionally runs Node syntax checks and Playwright \`node tests/os-feature-browser.cjs\` using the existing frontend test server. All existing frontend regressions must remain green.

## Production gates (not completed here)

1. Source reconciliation with actual latest Windows Step202–231 and Android/Unity branches, including the newest export and feature patches.
2. Verified Cognito JWT/role backend, account-owned profile service and a secure server API using rate limits, CSRF/session protection and audit receipts.
3. Durable, transactionally idempotent draft storage and job workers; the current queue is in memory only.
4. Real authenticated upload, story/reel/post publish and DM delivery contracts with separate user consent; no background action by default.
5. Call signalling, WebRTC/TURN or P2P permission handling, 2-device testing and recovery.
6. Unity camera preview, front camera, tracking, render/export and actual OnePlus 9 Pro QA.
7. End-to-end staging and security tests, CI on the reconciled source and a signed APK release with manual owner authorization.

No production deployment or merge is authorized by this Step 7 PR.
