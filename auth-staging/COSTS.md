# Cost review

Sources checked 15 October 2026. Reconfirm regional/account pricing immediately
before approval; no AWS pricing API or billing account was inspected here.

The template explicitly selects Cognito LITE rather than the new-pool default
Essentials plan. Cognito pricing is usage-based, principally monthly active users
(MAUs). AWS currently documents a 10,000 direct/social MAU free tier aggregated per
account or AWS organization for eligible Lite/Essentials usage; staging does not
receive its own independent allowance. Existing usage can exhaust eligibility.
As an illustration only, 20 billable direct-user MAUs at the documented initial
Lite rate of $0.0055/MAU are $0.11 for that month, excluding all other charges and
taxes. This is not an account-specific quote or a guaranteed zero-cost environment.
See [Cognito pricing](https://aws.amazon.com/cognito/pricing/).

Email verification and recovery have separate service limits and potential message
charges. This template uses Cognito's default small-volume email delivery; it does
not provision SES identities or approve production email sending. Check its current
quota and availability before live tests. Moving to SES DEVELOPER delivery would
need separate identity/region/sandbox/permission and cost approval. See
[email delivery configuration](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html).

No phone aliases, SMS role, phone auto-verification or SMS recovery are configured,
and MFA is OFF. No SMS tests are authorized. If phone parity is later requested,
review origination, sandbox, destination/country restrictions and message costs
before changing infrastructure. No advanced security add-on, Plus tier, managed
login domain, analytics integration, Lambda, WAF, API, object storage or hosting is
created by this template; adding any may create additional charges.

Administrative testing can affect MAU accounting: for example, AdminGetUser can
mark a user active. Deleting accounts after testing does not undo charges already
incurred. See [Cognito cost tracking](https://docs.aws.amazon.com/cognito/latest/developerguide/tracking-cost.html).

Before approval, record an owner, cleanup date, approved count (suggestion: at most
5 controlled disposable users), expected email volume (suggestion: <=20), and an
account-level budget/alert decision. These suggestions are planning caps, not
service-enforced spending limits. This package does not create budgets, alarms or
an automatic cost cutoff. Public-client self-sign-up is disabled initially and must be enabled only for the
approved registration matrix. It can be abused while enabled; keep the test window
short, disable it again afterward and remove the staging client under approved
teardown. Hiding the origin or
public client ID is not a signup security boundary. Retained resources survive
stack removal and still need owner-led cleanup.
