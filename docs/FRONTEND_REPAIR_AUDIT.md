# Crush.X frontend repair audit

Scope: existing single-file application, based on `a4135f9`. No Unity assets,
dependency declarations, lockfiles, AWS resources, or main branch changes.

## Completed frontend repairs

- Cognito `forgotPassword` and `confirmPassword` callbacks now drive request-code,
  reset, error/retry, cancellation, and return-to-login states in the existing auth
  screen. Registration validates email and username, preserves username case, and
  handles both already-confirmed and confirmation-required results. Login errors
  and unsupported Cognito challenges release the loader. Submit works with Enter.
- Account confirmation has inline errors and a back action. Unconfirmed login can
  reopen confirmation. Password rules retain the existing minimum frontend rules;
  the actual Cognito pool policy remains authoritative.
- Reels render every item, support native video controls/inline playback through
  media type or video extension, preserve images, and handle an empty collection.
  Media controls and social actions occupy separate regions.
- Likes, follows, bookmarks, and comments work against local browser state.
  Comments are escaped and length-limited. Sharing uses the actual media URL via
  Web Share, clipboard, or a manual copy dialog; no invented post permalink or
  server-side share counter. A persistent notice identifies sample content and
  browser-only social state.
- Message contacts open local drafts with list/back and browser history support.
  There is no send action or simulated delivery. Drafts are labelled explicitly.
- Matching desktop/mobile navigation breakpoints remove the navigation gap and
  duplicate controls. A CSS specificity fix prevents Tailwind from showing desktop
  navigation on narrow screens. Flexible inputs, safe-area spacing, scrollable
  auth overlays, and separate reel controls prevent mobile overflow/overlap.
  Search retains focus across rendering. Preview object URLs are revoked.
- Media previews accept JPEG, PNG, WebP, GIF, MP4, and WebM, from 1 byte to 100 MiB.
  These are frontend restrictions, not verified server policy. Publishing is
  guarded with an explicit unavailable message and performs no network writes.
  Upload response shape validation requires both `uploadUrl` and `mediaUrl`, with
  HTTPS and no embedded credentials; shape alone never approves a destination.

## AWS and backend evidence

| Area | Evidence in this checkout | Status |
| --- | --- | --- |
| Cognito | User pool `us-west-2_PAT0udHTx`, client `1fvstb7h8vqbk7qt98bd46aj0`; SDK 6.3.12 | Real SDK wiring; pool configuration and real-account flows unverified |
| API | `https://jzym971249.execute-api.us-west-2.amazonaws.com/prod` | Configured string only; no OpenAPI schema, handlers, infrastructure, or deployment source |
| Upload | Previously presumed POST `/media/upload-url` returning `uploadUrl`/`mediaUrl`, then PUT and local reel insertion | Contract, bucket/key destination, signed headers, authorization, CORS and publish completion unverified; upload path now blocked |
| Posts/reels | Seeded arrays/localStorage | No list/create/update/delete API contracts |
| Likes/follows/comments | Local mutations | No authenticated mutation contracts or persistence |
| Chats | Seeded users | No chat listing, membership, send, delivery or realtime contracts |
| Notifications | No notification implementation | No notification API contract |
| Media publishing | No finalize/create-post operation | No publishing contract or processing status |

The frontend cannot establish server-side authorization from a bearer header or
client token. The old upload path read a cached access token but did not refresh
its session or establish whether the API authorizer expects an access or ID token.
No unverified API mutation remains enabled. Backend work requires reviewed source
or contracts defining token issuer/audience/use/scopes, server-derived identity,
post/comment ownership, follow identity, chat membership, and upload object
ownership. Client-side MIME/size checks must be enforced on the server as well.

No real uploads, live-account registration/password changes, AWS deployment or
production modification were performed. An approved upload destination and verified
contract are required before enabling publishing. This is not production readiness.
The authenticated account is not mapped to the seeded sample profile; all profile
and social content remains explicitly sample data. Local drafts/comments are not
private server-backed communications and are shared within this browser's state.

## PR #1 read-only review

`https://github.com/mounnishant1/Crush.X/pull/1` is an open draft based on the same
main commit, with 57 changed files confined to Unity. Reviewed metadata, full file
list, NativeLensUI and camera-swipe patches. It adds native AR assets, carousel/swipe
code, scene/build settings and a Unity lockfile change. The NativeLensUI patch also
contains garbled Unicode button glyphs. Its Unity compilation, EditMode, Android,
real-device tracking and performance checks are pending. None of its changes were
merged, modified, or included in this frontend repair.

## Validation

Start the requested persistent server:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace/Crush.X
```

Run:

```sh
node /workspace/cloud-onboarding/crushx/smoke.cjs
node tests/frontend.cjs
```

`tests/frontend.cjs` uses the existing cloud Playwright installation (override with
`PLAYWRIGHT_MODULE` for another installation), `/usr/bin/chromium`, and verified
TLS curl requests for CSS/icons. Cognito is mocked; all other remote requests are
blocked except an intercepted in-memory WebM fixture. It covers validation,
confirmation, credential errors, recovery error/retry/success, local interactions,
escaped comments, sharing, draft/history navigation, search focus, image/video
rendering and actual WebM playback, empty reels, preview cleanup, upload guards,
and layouts at 320/375/768/1024/1280px. It asserts no remote writes or JavaScript
exceptions. It does not establish live Cognito, native share-sheet, MP4/browser codec,
real AWS authorization, CORS, backend publishing or Unity/device behavior.

Baseline and repaired cloud smoke checks passed: HTTP 200, title `Crush.X`,
login/register switching, default-state initialization, no JS exceptions;
`externalAssets`: Cognito, Lucide and Tailwind all true; `failedHosts`: empty.
TLS verification was preserved. No dependency or lockfile changes were needed.
Unity tests are unrelated to this source change and cannot run here: no Unity
Editor executable is installed.
