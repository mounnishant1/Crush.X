# Crush.X — AURA-X Owner Coding Agent (review-stage)

This module adds server-only code inspection, AI-generated full-file patch proposals, and **owner-approved draft GitHub PRs** to the existing single AURA-X concept. The static app still contains only local, rule-based AURA-X features: this module is **not yet connected to the authenticated UI/backend**.

## What the code actually does
- Uses trusted backend authentication with scoped access: code:read, code:propose and code:approve. Normal users must never receive these scopes.
- Reads at most 3 existing source files per task, each at most 64 KiB; refuses secrets, workflow paths, build controls and traversal.
- Calls a model adapter to suggest updated full file contents. No model output executes automatically.
- Returns complete proposed contents and SHA-256 review digest. The owner must inspect the diff and explicitly approve using an authenticated session within 15 minutes.
- Ensures the base branch has not advanced, then creates a *new branch and draft PR* for code review. No merge, deployment, workflow dispatch, autonomous command execution, billing, private user-data access or user messaging.
- Requires durable audit acknowledgment for write entry points; proposal state is currently process-memory only.

## Trusted server integration
1. Put aura-owner-coding.cjs in a trusted Node.js server. Never ship this to a frontend or Android web bundle.
2. Supply a backend authenticate(credential) function which validates a signed Cognito/JWT/session, resolves ownerSubject from server configuration and derives scopes from server-managed RBAC. Do not trust the browser's role or scope fields.
3. Supply an audit(event) function which durably writes append-only events and returns true. Use restricted logs; do not log source files or secrets.
4. Configure a fine-grained CRUSHX_GITHUB_TOKEN with only the repository Contents read/write and Pull Requests write permissions. Do not enable workflow modification or administration.
5. Optionally createChatModelAdapter with server-side CRUSHX_MODEL_API_KEY and CRUSHX_MODEL_ID, or inject a dedicated trusted model adapter. Check licensing, confidentiality and data-retention requirements before sending source to a third-party model.
6. Wire the single AURA-X owner surface through a trusted API: inspect, propose, render full diff and approve; add CSRF/replay protection, rate limits, and encrypted durable proposal storage before staging.
7. After creation, review draft PR, wait for GitHub CI, perform security testing, then require *separate* owner release approval for any merge/deployment.

Example server-only usage:

    const {createOwnerCodingAgent,createGitHubAdapter,createChatModelAdapter}=require('./aura-owner-coding.cjs');
    const github=createGitHubAdapter({token:process.env.CRUSHX_GITHUB_TOKEN});
    const model=createChatModelAdapter({apiKey:process.env.CRUSHX_MODEL_API_KEY,model:process.env.CRUSHX_MODEL_ID});
    const agent=createOwnerCodingAgent({
      authenticate, // secure server-side identity verifier, NOT a client-supplied object
      audit,        // durable audit sink returning true
      github,model,ownerSubject:process.env.CRUSHX_OWNER_SUBJECT
    });
    // await agent.inspect({credential,paths:['aura-x-core.js']});
    // const plan=await agent.propose({credential,task:'Fix one scoped bug',paths:['aura-x-core.js']});
    // Render full diff from plan.files, then require explicit reviewed approval.
    // await agent.approve({credential,proposalId:plan.proposalId,reviewDigest:plan.reviewDigest,approved:true});

## Validation
Run:
- node --check aura-owner-coding.cjs
- node --test tests/aura-owner-coding.test.cjs

GitHub pull-request CI is configured to run these checks. The CI results must be inspected independently. This is NOT an Android, Unity IL2CPP, full app integration or production deployment verification.

## Still pending before real owner use
Authenticated backend hosting and Cognito mapping, rate limits, CSRF controls, secure diff review UI, durable audit and proposal database, GitHub token and real model configuration, full app source synchronization, failure recovery/idempotency, production authorization tests, independent security review, staging smoke tests, physical Android QA and release controls.

## Branch safety
The patch is based on feature/aura-x-consent-memory-policy-20261027, rather than the much older GitHub main or the user's separate Windows Step230/231 tree. No existing files were merged into main and no production credentials or deployment actions are included.
