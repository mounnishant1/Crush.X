# Combined app improvement candidate

15 October 2026. This review candidate combines existing work without modifying production or merging a PR.

## Reused sources

- Native engine: `codex/crushx-final-lens-engine` at `0843da3ac4f901336e1f75749265c37c6f7acb97`, which descends from PR #3. Native source, assets, prefabs, scene references and metadata are unchanged by this integration.
- Web/auth repair: `repair/p0-frontend` at `032ea7f4a125fbfc3f77e1728d92da2ada30897c`. Existing session, policy, recovery, normalization, local action, layout and upload guards remain.
- Existing read-only AWS inventory collector and mocked tests from the completed task workspace, with partial-failure/credential-error handling improved.
- `prep/isolated-cognito-staging` remains separate and undeployed. Its offline tests were run against its exact manifest-approved frontend source, not against the changed combined app. It requires a new explicit source/configuration review before preparing a copy of this candidate.

## Additional app changes

- Keyboard-accessible story viewer with Previous/Next, native dialog focus containment, Close and Escape.
- All/Following feed filters over the existing sample state.
- Saved posts and reels displayed in the sample profile, with media viewing and empty states.
- Sample profile name/bio editing with escaped text, bounded inputs and truthful local-only labeling.
- Following and post counts derived from the displayed sample data rather than hard-coded values.
- Caption drafts retained across navigation in page memory and cleared on logout; file selections are not persisted or uploaded.
- Shorter sample/publishing explanations with an accessible details dialog; consistent feed width, media grid, focus indicators, touch targets and reduced-motion handling.
- Original production upload/publish path remains blocked. No fake message sending, notification delivery, live feed or native host launcher was added.

Social interactions remain sample/browser-only. These changes do not implement Instagram's shared backend, moderation pipeline, recommendations, or global feature parity.

## Backend status

There is no deployed Lambda/social API source or OpenAPI contract in the inspected branches, and no AWS credentials/role are configured here. The configured web Cognito/API values remain unchanged in us-west-2; the user-reported production region is ap-south-1. Region differences must be investigated through authenticated read access, not by changing identifiers.

The included `tools/aws_inventory.py` makes metadata reads only, omits credential-bearing fields, returns an error when credential setup is unavailable, and returns partial failure when any metadata request is denied. All tests use mocks. Do not infer that an empty or denied inventory proves a deployed component does not exist.

Needed for shared backend work: securely configured read-only AWS role, the existing Lambda/API/database source and contracts, and an approved staging test account/environment. No new AWS resources were created and no infrastructure template was deployed.

## Verification

- PASS: 35 Python source/asset/evidence/inventory tests, with no skips when the optional C# parser is installed. C# parsing is not Unity compilation.
- PASS: expanded mocked browser suite, covering the existing auth/media/layout/storage/XSS cases plus story keyboard controls, saved posts/reels, sample profile edits, feed filters, caption retention and logout cleanup. No remote mutations or JS exceptions.
- PASS: Android Java source compiles against API34 reference classes; 8 pure RGBA/YUV conversion cases. Three pre-existing deprecated color-format warnings remain. This is host validation, not an APK build or codec/device test.
- PASS: separate staging source tests and origin guard, using synthetic configuration only; no AWS requests or deployment. See the task evidence for exact results.
- SKIPPED: Unity Editor compilation and NUnit execution, Unity package/shader/import resolution, Android APK builds, physical camera/face/mask/media/codec/performance acceptance, and live AWS/auth/backend integration.

Use `tools/check_all.py` for repeatable local checks. Install free source-test dependencies from `tests/requirements-source.txt` and supply an installed Playwright module/Chromium for `--browser`. To include Java host checks, supply `--ecj` and `--android-api` JAR paths; they are neither downloaded nor committed by the runner. The runner never installs an APK or deploys resources and explicitly records skipped acceptance gates. GitHub CI runs source/browser checks only.

This candidate is not production-ready. No merge, force-push, deployment, app-content publication or paid service is part of this work.
