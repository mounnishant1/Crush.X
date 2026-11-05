# Crush.X social flow parity tracker — 18 October 2026

**Source under review:** `work/social-friend-reply-share-20261018`, draft PR #10. This is an original Crush.X design inspired by common social-app conventions, **not** copied Instagram code, and **not** a claim of every Instagram feature working.

## Connected sample-mode flows built in this branch

| Journey | Browser-local path | Real-service boundary |
| --- | --- | --- |
| Friend liked a post/Reel | Sample avatar cluster → followed sample liker list → reply/emoji → sample DM draft screen | No real social graph, friend activity, notifications or message delivery |
| Post/Reel share | Share → search/select multiple sample recipients → add text → save drafts; optional device media URL share | No posted content permalink or remote DM send |
| Comments | Post/Reel comments → local threaded reply → like/unlike comment → edit/delete own comment | No server comment ID, mention notification, moderation or remote syncing |
| Save collections | Post options → Save to collection → create/select → Profile Saved collections → reopen item | Saved locally, not synced to account |
| Share to Story | Share / Post options → Story draft → add short text → Profile Story drafts → delete | No actual Story upload, editor composition, license check or publish |
| Explore/Profile handoff | Open sample post → like/save/comments/share; sample creator profile → follow/unfollow → DM draft | No server profile/follower counts |
| Feed preference | Post option hide/not interested, mute sample creator → feed filtering → Profile hidden/muted list for undo | No ranking, report submission or cross-device mute |
| Safety status | Report entry displays explicit unavailable state | No fabricated report receipt |

## Existing browser UI from earlier branches

Home Story rail, Follow/For You switch, Reels scroll and preview controls, Explore filters, sample profile, Story viewer/reactions/reply preview, Story editor stickers, post composer draft options and AURA-X entry points exist. They have **different levels of verification**. An icon is not proof of live behavior.

## Remaining implementation tracks before genuine Instagram-level operation

1. **Backend identity/content:** Isolated Cognito staging login, per-user feed/comments/reactions/follows, creator access control, signed media uploads, post update/delete, privacy and block enforcement.
2. **Social interaction contract:** Real `post_id`, `comment_id`, `parent_comment_id`, per-user like reactions, idempotent writes, notification fan-out, pagination, deep links, audit receipts and retries.
3. **Messages:** Authenticated inbox, share-as-attachment reference, reply to shared post, read/delivered states, requests and group roles, typing presence, edit/unsend, safety controls and push notifications.
4. **Story/Reel creation:** Production Story publishing and privacy, camera/gallery permission handling, safe music licensing, templates, remix attribution, robust timeline editor, transcoding and content moderation.
5. **Real-time features:** Live streaming, calls, reconnect/retry, microphone, background delivery and device notification behavior.
6. **Explore/Profile:** Real ranking, hashtags, mentions, follower lists, stories/highlights, profiles with proper public/private gates and saved collection sync.
7. **Android native camera:** OnePlus 9 Pro front-camera/ARCore verification, Fox mask tracking, native capture and long-press recording, mic/gallery integration and hand gestures.
8. **Quality, privacy and accessibility:** Automated server/device flows, keyboard and TalkBack, 320px layouts, touch targets, offline/retry behavior, localization, creator safety and GDPR/account data actions.

## QA and launch rules

- Existing tests are regression checks on source and local browser behavior only; see the draft PR's Actions check for the exact latest status.
- Test all flows with two different **staging** identities, not the hard-coded sample personas, before claiming real friend activity or delivery.
- Add a Playwright mobile touch suite, Android OnePlus 9 Pro logcat/screen capture, and staging transaction trace before release.
- Media shared via device is the sample asset URL, not a Crush.X canonical post link. Do not record fake delivered/read/report-success statuses.
- Never deploy PR #10 to production merely because browser CI passes. Merge only after review and then validate an isolated staging environment.

## Next actions by priority

P0: real identity and social backend contracts → P1: DM/share/thread receipts → P2: profile + story/reel publish permissions → P3: native AR/camera and live communication → P4: detailed screenshot-by-screenshot parity including edge cases.
