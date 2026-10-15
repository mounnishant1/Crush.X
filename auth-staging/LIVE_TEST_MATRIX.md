# Disposable account procedure and live authentication matrix

**Preparation only. All live cases below are NOT RUN / NOT AUTHORIZED yet.**
The pool does not exist yet. Creation of infrastructure, hosting, emails, accounts,
password changes and teardown each require the named approvals in DEPLOYMENT.md.
Do not run this against `us-west-2_PAT0udHTx` under any circumstances.

## Account and evidence controls

- Approve an isolated account/pool/client, separate HTTPS origin, test owner/window,
  controlled mailbox recipients and message budget. Suggested cap: 5 disposable
  identities and <=20 messages, reducing scope if the default email quota is lower.
- Use unique usernames like `stg_<run>_alice`, never names/IDs copied from the existing
  pool. Email alias usernames cannot be email-shaped; use owned test mailboxes whose
  deliverability and alias behavior are known. No phone numbers or SMS cases.
- Generate a unique throwaway compliant password locally for each account in a
  password manager. Do not reuse the illustrative unit-test passwords in live tests,
  commit secrets or put passwords in shell history/process arguments/logs.
- Prefer the approved staging frontend's self-sign-up and code confirmation, which
  exercise the actual application. This intentionally sends email and requires
  Approval D. Do not auto-confirm or set email_verified through an admin workaround
  to claim verification/recovery coverage. No bulk seed script is provided.
- Keep one disposable unconfirmed account and one disposable confirmed account.
  Use additional identities only for alias-collision and attribute-change cases.
  Do not create an account with a real person's email/phone, including for negative
  existence tests: use an owner-controlled nonexistent test alias instead.
- Record case ID, browser/version, timestamp, observed pool/client IDs, sanitized
  outcome and message count. Record only token metadata (type, issuer, audience,
  expiry); never tokens, passwords, MFA/reset/confirmation codes or inbox contents.
- For DevTools evidence, redact Authorization, cookies, SRP authentication proof,
  refresh tokens, codes and personal attributes before saving. Disable verbose SDK
  debug logging. Never paste raw network HARs into GitHub.
- Stop on unexpected recipient, production ID/origin, SMS prompt/delivery, rate
  limit, unexpected cost, custom/new-password challenge, real account interaction or
  inability to verify staging identity. Investigate read-only; do not broaden scope.
- After testing, separately approve inventoried AdminDeleteUser cleanup on the new
  staging pool, mailbox cleanup and resource teardown. No mutation commands run
  automatically as part of this matrix.

## Complete live matrix

| ID | Scenario / precondition | Expected evidence |
| --- | --- | --- |
| S01 | Read-only pool/client/output preflight | New physical IDs/name/tags/account/region; no secret; exact policy/flows/token units; production IDs absent from copy |
| S02 | Wrong/production IDs or missing approval in frontend config | Builder refuses output; source unchanged; example null-ID config remains disabled |
| S03 | Generated HTML on unapproved HTTP/HTTPS origin | Inline origin guard blocks auth initialization; no pool requests. Host only after approved staging origin is configured |
| S04 | Registration: short, missing uppercase/lowercase/number/special; `Password123` | Frontend rejects before SignUp call; clear shared requirements; no account/message created |
| S05 | Unique compliant disposable registration | One SignUp to staging; only approved mailbox gets a verification code; no SMS; pending confirmation state |
| S06 | Missing/malformed/incorrect/expired confirmation code | Local validation or Cognito error; loader released; account remains unconfirmed; retry possible |
| S07 | Resend code, cancellation/back | Only approved mailbox gets a bounded resend; errors handled; back clears confirmation/password state |
| S08 | Valid confirmation | Real email ownership verified; account confirmed; return to login; no automatic identity migration |
| S09 | SRP login by exact username | USER_SRP_AUTH path, normal success; both access and ID token copies; no plaintext password auth grant; input password cleared |
| S10 | Login by verified email alias | Same staging subject as S09; exact alias forwarded; no sample-profile remapping. Confirm actual alias casing behavior rather than assuming it |
| S11 | Username casing / whitespace | Distinct case-sensitive usernames behave as configured; outer whitespace is trimmed; email normalization behavior documented; no silent username lowercase |
| S12 | Phone alias attempt | Initial staging has no phone alias/SMS. Expected rejection/no delivery. Existing-pool phone parity remains out of scope until separately approved SMS-capable design |
| S13 | Wrong password / controlled nonexistent username | Generic error, no stale tokens, no MFA, no real-user existence claim; retry succeeds; note Cognito prevention is not universal anti-enumeration |
| S14 | Login while unconfirmed | Confirmation screen opens; no authenticated UI/token pair; correct retry/back behavior |
| S15 | Confirmed login with MFA OFF | No MFA/enrollment screen, challenge or SMS. Mock defensive MFA tests do not constitute live MFA coverage |
| S16 | Existing verified email alias collision between disposable users | AliasExists/error handled; forced alias transfer is false; original disposable user's alias is not silently migrated |
| S17 | Forgot password for confirmed verified-email account | Code sent to controlled verified email only; generic request state; no SMS/fallback; exact staging pool ID |
| S18 | Forgot password for controlled unknown/unconfirmed/unrecoverable account | No success/delivery promise beyond callbacks; generic known/unknown handling where AWS supports it; no unintended recipient |
| S19 | Reset with missing/incorrect/expired code or bad password | Local policy rejects without SDK mutation or Cognito rejects code; loader released; retry/back usable |
| S20 | Valid reset on a disposable staging account only | One intended password change after Approval D; old password login fails, new password succeeds; no token or real-account leak |
| S21 | New/changed email verification and recovery | Frontend has no email editor: an approved isolated SDK harness is needed. Until verified, old verified email stays effective; unverified alias cannot take over; only approved mailboxes. Otherwise record NOT RUN, not pass |
| S22 | Reopen/reload with valid SDK session | Both frontend tokens restored; accepted issuer/client/subject correspond to staging; sample persona still explicitly sample |
| S23 | Reload after natural access/ID expiry but within 5-day refresh lifetime | SDK getSession refresh succeeds and both new tokens stored. Do not shorten pool tokens to manufacture a pass |
| S24 | Active UI at natural 60-minute token boundary and suspended-tab resume | Earliest accepted token expiry returns to login; visibility check handles throttled timers. UI does not promise background refresh |
| S25 | Expired (5 days), revoked or rejected refresh | No accepted stale session; both copies cleared; login shown. Wait natural lifetime or use separately approved staging-only token revocation; record which path was actually tested |
| S26 | Logout / pending restore / reload | SDK local signOut, both token copies and local drafts removed; unrelated state retained; late callback cannot reopen UI; logout marker prevents recached session restore in that tab |
| S27 | Two different disposable subjects and sample identity | Neither becomes seeded `me`; profile says sample/not Cognito data; sample likes/comments/drafts never claim server identity or delivery |
| S28 | Denied storage, quota, offline/SDK/network error | Fail closed for token writes; no stuck loader; sample-only memory fallback; no secret logging; reconnection requires valid session |
| S29 | Browser back/forward, deep links, unknown/malformed hashes | Correct screen/contact or safe fallback; no auth bypass/extra AWS mutation; reload preserves allowed navigation |
| S30 | Persisted text/attribute/URL XSS | Run mock/offline cases first; approved staging input stays text, scripts/events never execute; no token exposure. Do not insert actual scripts into shared systems |
| S31 | Preview, video/image playback, invalid MIME/size and blocked publishing | Local previews work; object URLs cleaned; invalid types/sizes rejected; upload guard remains closed; zero API/S3 writes |
| S32 | Duplicate-submit, service throttle and transport failure | Loader prevents duplicate submission; bounded manual retry; no deliberate flood/load test; error clears UI state |
| S33 | Device/browser/native share compatibility | Supported desktop/mobile auth UI, native share cancellation/failure, actual supported MP4/WebM codecs; share only sample media URLs |
| S34 | JWT and backend boundary | Metadata checks show staging issuer/audience/token_use/expiry. No backend is configured; server authorization remains NOT TESTED, never infer it from frontend success |
| S35 | Teardown review | Inventory only disposable identities/new resources, approvals recorded, retention accounted for, final read-only absence checks; production unchanged |

Use real service responses for live evidence. Mock success is not a substitute for
mail delivery, SDK refresh, alias uniqueness/casing or service-side policy rejection.
Most weak-password cases are blocked by the UI; separately testing Cognito's policy
requires an approved isolated harness and must not be reported as verified by those
UI cases alone. Respect Cognito's quotas; don't force throttling through high volume.

MFA remains OFF. TOTP/SMS/email MFA, setup/selection, custom auth, passwordless and
NEW_PASSWORD_REQUIRED are not implemented live-test paths in this design. Should
an intended account require an unsupported challenge, stop and review it rather
than enabling a new flow or modifying an existing identity to bypass it.

Acceptance requires all applicable cases recorded with pass/fail/not-run and
reasons, no production effects, no unauthorized messages and no unreviewed costs.
Natural 60-minute/5-day cases may keep acceptance pending beyond a short session.
Server authorization, global logout, cross-tab revocation and backend messaging/
publishing remain outside this frontend-only staging package.
