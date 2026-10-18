# Crush.X / Instagram reference flow audit — 18 October 2026

This is an evidence-limited audit of the available source and local screenshot attachments. **It is not a claim of full Instagram parity, reverse-engineered APK functionality, or production readiness.** Crush.X branding and existing screens are retained.

## Reference coverage

- Available here: eight images `upload/1000001285.jpg` to `1000001292.jpg`. `1285` shows Instagram Home (top +, stories rail, tall media/reel, bottom five icons). `1286`–`1292` show Instagram's Add to Story gallery, album menu, toolbar, text, effects, mentions and drawing panels.
- Not available here: the user's Windows `F:\CrushX-Temp\Instagram-451-20261018-105051` Instagram v451 split APK set (six files, about 238 MB total) and `IG-Home.png`. Prior screenshot bundles (reportedly ~160 images) are not mounted in this workspace. No APK static/decompiled inspection or instrumented behavior test has been performed.
- No actual Android device, working Playwright Chromium browser or verified staging backend is attached to this run.

## Coverage matrix

| Screen / flow | Existing or implemented in this branch | Still missing or unverified |
| --- | --- | --- |
| Home/navigation | Five-icon mobile bar, Crush.X header, story rail, follow/sample feed actions, image/video post playback, share-media link | Production feed rank, real notification/view counts, native gesture and Android layout QA |
| Story gallery | Camera/file chooser, Recents/Photos/Videos session filters, backgrounds, templates and 2–4 item collage | Direct phone gallery enumeration, Google Photos/Meta integrations |
| Story editor | Ten icon tools, 24 writing presets, five languages, local GIF/Poll/Questions/Quiz/Countdown/Link/Add Yours/Emoji Slider/Hashtag/Date-Time/Photo/Frame, drawing, PNG save | Live model-generated editing, licensed audio/lyrics sync, remote sticker responses, actual publishing |
| **Story viewer (new)** | Immersive local 9:16 modal, segmented 6.5s progress, auto next, previous/next buttons, side-tap, horizontal pointer-swipe, pause/resume, keyboard navigation, preview emoji reactions and reply drafts, proper timer cleanup | Stories from backend, media video segments, delivered replies, DMs, viewers/read receipts, reaction-to-chat animation, touch/device visual QA |
| **Reels (new)** | Vertical full-height CSS snap, conditional native video/image, visible video autoplay/pause, sound toggle, speed options, local like/comment/share/bookmark, follow, caption expansion, sample audio details and local Story template/audio shortcut | Source reels in this snapshot are sample imagery, not playable video; scrub behavior needs a video/device test; translations, remix, genuine Use Audio, trending counts/catalog require integration |
| **Explore (new)** | One Search/Explore screen with People/Posts/Reels/Tags filters, sample media grid, local caption hashtag discovery and search, follow and item opening | Live global search, trending index, real hashtag pages, ranking, server pagination |
| Camera / 3D lens | Separate Unity source exists in repository | OnePlus 9 Pro front-camera tracking, Fox attachment, lens ring, mic/recording, hand gestures: **not verified or repaired in this browser UI pass** |
| Messages / Live | Existing sample DM drafts and UI | Authenticated send/delivery/read/typing, voice notes, calls, live broadcast, microphone/reconnect/backend QA |
| Profile / Shop / AURA-X | Existing sample profile editor/save and separate project subsystems | Real profile/story highlight account changes, orders/payments, hosted models/actions and authorization QA |

## Behavior and safety boundaries

- Story reaction buttons do not send messages. Text entered as a story reply is explicitly a local draft/preview.
- Remote Story publish, close-friends authorization and notifications are not connected. No fake success state is shown.
- Reel audio details do not imply rights to use named commercial songs; the shortcut selects **the user's own audio** in the local Story Studio.
- Searching people, tags, posts and reels uses browser sample records only. Hashtag suggestions are derived from captions, not a fabricated trending feed.
- External image sources may refuse canvas export due to CORS. PNG export encodes a static frame, not music/video/GIF animation.

## Verification in this environment

- `node tests/home-ui.cjs` — PASS.
- `node tests/story-editor.cjs` — PASS.
- `node tests/experience-flows.cjs` — PASS for story viewer state, progress/navigation/gesture events, reply/reaction safety, reel actions/icons, Explore category filters/search, and HTML escaping.
- `node --check app-improvements.js`, `node --check story-editor.js`, and CRLF-aware whitespace checks — PASS.
- `node tests/frontend.cjs` — BLOCKED: Playwright Chromium headless-shell executable missing. CDN access works outside the restricted sandbox, but the browser binary has not been installed. This is not a visual/mobile QA pass.

## Next verification gates before claiming parity

1. Import the user's exact missing screenshot bundles or annotated screenshot contact sheets and inspect per-screen option placements, overlay conflicts, input/keyboard behavior, and back flow.
2. Run Android device capture on the OnePlus 9 Pro using the latest Crush.X app, not older installed v172, and compare screen-by-screen with the reference.
3. Validate videos/gesture hitboxes, story timer behavior, gallery/camera picker, fonts/emoji rendering and export in Chromium and on Android.
4. Configure isolated staging login/media/story/message contracts and two test accounts; verify server receipts and permissions before enabling publish or delivery buttons.
5. Audit and fix Unity native lens pipeline separately; browser Story Studio and Reel preview do not fix device AR.
