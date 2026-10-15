# Required staging Cognito verification

These tests have **not** been run against real accounts. The regression suite uses
SDK mocks and never sends Cognito requests. No passwords, users or AWS resources
were changed during the review.

## Preconditions

A maintainer must supply an isolated staging pool/client and HTTPS staging origin.
The embedded application currently identifies the existing pool/client; do not run
account-changing tests against those settings. Configure the staging copy only after
confirming its pool/client and test accounts belong to the isolated environment.
Use dedicated disposable test accounts under the staging owner's approved test
process, not existing personal or production accounts. Password reset/registration
steps below describe future verification, not authorization to change accounts now.
Do not upload or enable publishing while performing auth verification.

Record pool/client settings without secrets: username/email case sensitivity and
aliases, app-client auth flows, password policy, PreventUserExistenceErrors,
verification/recovery settings, SMS MFA configuration, token durations and refresh
policy, allowed origins and required challenge modes. There are no server/API
contracts in this checkout from which to validate API authorizers.

## Required matrix

| Scenario | Expected evidence |
| --- | --- |
| Normal login by username and configured email alias | Real SDK success stores matching access **and** ID tokens; inspect token type/issuer/audience/expiry without logging token values; password input cleared |
| Incorrect password and nonexistent username | Generic incorrect-credentials state; no stale frontend tokens; loader released; retry works; confirm server-side existence-error policy |
| Account confirmation | Valid/invalid/expired code and resend rate limiting; confirmation back action; already-confirmed registration; unconfirmed login reopens confirmation |
| SMS MFA | Valid code stores both tokens; invalid/expired code releases loader, stores neither token and permits fresh login; whitespace, cancel, repeated login and SDK/network failure remain closed |
| Required challenges | Verify pool requires only implemented SRP/password and SMS MFA paths. TOTP, MFA setup/selection, custom challenge and NEW_PASSWORD_REQUIRED currently display explicit unsupported errors; if any is required for intended users, implementation is a merge blocker |
| Forgot password | Known/unknown usernames, recovery-disabled account, rate limit, network failure and code-delivery failure; no success claim outside Cognito callbacks; unknown username uses generic wording |
| Reset password | Valid/invalid/expired code, pool password-policy rejection and successful reset on a disposable staging test account only; back action clears reset fields; login with new password; verify server enforcement |
| Reload and SDK refresh | Fresh session restores both tokens; expired access/ID token with valid refresh token uses SDK getSession refresh; rejected/revoked/expired refresh requires login and clears stale tokens |
| Active expiration | UI returns to login at earliest token expiry; foregrounding a suspended tab also detects expiry. This frontend deliberately requires login at active expiry, rather than promising background refresh |
| Logout and races | SDK local signOut, both frontend tokens removed, sensitive auth fields/confirmation state and local drafts cleared, unrelated storage retained; late getSession callback cannot reopen the app; a tab-local logout marker prevents automatic restore even if a late SDK refresh recaches credentials |
| Storage denied/quota | Token write denial leaves auth closed with neither frontend token; sample actions fall back to page memory; storage failures cannot leave the loader stuck |
| Sample identity isolation | Login as two different staging subjects; neither is mapped to seeded `me`. Profile says sample and not Cognito data; no real username/email/token claims appear in sample content; no API writes |

Use normal TLS verification. Verify on supported desktop/mobile browsers, including
real native Web Share UI and intended MP4/WebM codecs. Do not treat mocked auth,
HTTP 200 or successful local video playback as proof of live Cognito behavior.

## Remaining security boundaries

Cognito SDK uses its normal browser credential cache. Access/ID token copies in
sessionStorage and SDK refresh credentials remain exposed to same-origin scripts;
frontend validity checks do not replace server JWT validation. Logout is local
signOut, not global server session revocation, and does not claim to revoke other
devices or already-issued tokens. Other open tabs are not actively logged out by
this implementation and their accepted sessions expire independently.

Browser sample state is shared by this browser, never keyed to a Cognito account.
Drafts are explicitly browser-local and cleared by logout in the current tab;
other open tabs can still have previously rendered or in-memory content. Sample
comments/likes/follows remain after logout and never claim account ownership.

The application still loads third-party scripts (including Tailwind CDN and Lucide
`latest`) and has inline script/style without a restrictive CSP. Pinning/self-hosting
assets, CSP rollout, cross-tab session coordination and a server-backed profile are
separate deployment-hardening work; do not call this production ready. No live
backend publishing, chat delivery, notifications or authorization has been verified.

## Merge evidence

Keep PR #2 draft until its GitHub Actions frontend check is green and the required
staging auth matrix above has recorded results. Record browser/version, isolated
pool/client, test outcome and sanitized screenshots/logs without passwords or token
values. A failing required challenge or pool-policy mismatch must be resolved
before declaring authentication merge-ready. Missing backend contracts are blockers
for enabling backend features; those features remain visibly unavailable/local here.
