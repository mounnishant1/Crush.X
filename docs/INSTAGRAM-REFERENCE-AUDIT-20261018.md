# Crush.X / Instagram reference flow audit — 18 October 2026

This is a static reference-flow comparison of the supplied screenshots, Instagram package metadata and Crush.X browser UI. **It is not a claim of full Instagram parity, instrumented APK functionality, native Android compatibility or production readiness.** Crush.X branding and existing screens are retained.

## Reference coverage

- **Recovered the user's existing uploads:** four screenshot archives dated 17 October with **160 JPEG files / 148 distinct byte hashes**. These include Instagram Home/profile, post and story creators, story sticker/music/effect panels, Reels, sharing, direct messages, settings and onboarding; also Snapchat lens/editor references and screenshots of existing Crush.X UI. The archives were extracted and indexed as 000–159 for comparison. Not every image depicts Instagram and not every screen is a contiguous flow.
- **APK verified:** `Instagram-451.0.0.53.80-split-apks.zip` contains six APK splits and a manifest describing `com.instagram.android`, version `451.0.0.53.80`, code `385713116`. SHA-256 of **all six** extracted APKs matches its manifest. The `base.apk` ZIP has **10,423 archive entries**, including Android manifest, native AR/module assets, bundled JS bytecode and resources. This is a package-integrity and static-entry inspection, **not** a decoded Android resource audit, app installation, or behavioral trace.
- The individual `upload/1000001285.jpg`–`1000001292.jpg` paths and Windows `IG-Home.png` path from an earlier attempt are not locally mountable; their content is represented by the recovered archives where present. No repeat upload is needed for the four archives or APK.
- No actual Android device, working Playwright Chromium browser or verified staging backend is attached to this run.

## Screenshot flow index (contact-sheet IDs)

| IDs | Predominant evidence | UI comparison priority |
| --- | --- | --- |
| 000–015 | Snapchat AR camera/lens carousel, creative tools, share destinations | Separate native lens/camera parity audit |
| 016–057 | Instagram create menu, Story gallery/share, Home, profile, DM, Explore; Crush.X crop/create/AI/camera/shop snapshots | Home and creation entry points; contrast unconnected services with local preview |
| 058–107 | Instagram Reels, replies, controls, post composer and image edits, settings/message requests; Snapchat setup and Crush.X snapshots | Post editor options, Reels interactions, messaging boundaries |
| 108–159 | Instagram Story text/brush/sticker/music/effects browser, sharing, Reels audio and feed; Crush.X native-camera screenshots | Story overlay panels, sticker options, effect categories, no false publish state |

The screenshot ZIPs and proprietary APK binaries are reference inputs and are intentionally **not committed to the source branch**.

## Coverage matrix

| Screen / flow | Existing or implemented in this branch | Still missing or unverified |
| --- | --- | --- |
| Home/navigation | Five-icon mobile bar, Crush.X header, story rail, follow/sample feed actions, image/video post playback, share-media link | Production feed rank, real notification/view counts, native gesture and Android layout QA |
| Story gallery | Camera/file chooser, Recents/Photos/Videos session filters, backgrounds, templates and 2–4 item collage | Direct phone gallery enumeration, Google Photos/Meta integrations |
| Story editor | Ten icon tools, 24 writing presets, five languages; **18 visible sticker routes** (Location, Mention, Music, GIF, Add Yours, Add Yours Music, Frame, Photo, Cutouts, Avatar, Questions, Poll, Quiz, Countdown, Link, Emoji Slider, Hashtag and Date/Time); manual place text, clipped-photo shapes, emoji avatar, local audio, drawing, PNG rendering | True segmented-person cutouts, account avatars, licensed music/search, remote sticker responses, actual publishing |
| **Post composer (expanded)** | Local 4-filter image preview, Original/1:1/4:5/9:16 crop view, manual place and sample handle fields, optional local-audio preview, draft audience, poll inputs, and advanced count/comment/AI-label/profile-only toggles; review dialog | Actual tagging, music muxing, remote geocoding, privacy application, server poll, cloud upload/publish validation |
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
- A location sticker is a manually entered label, not real GPS sharing or a place search. Cutouts are CSS/canvas clips, not automatic background segmentation. Avatar is a selectable emoji, not a personal 3D avatar.
- Post draft audience, tags, poll, hide counts/comments, AI label and distribution toggles do not change the account or backend. Optional audio remains a standalone preview; it is **not mixed** into exported or published media.
- External image sources may refuse canvas export due to CORS. PNG export encodes a static frame, not music/video/GIF animation.

## Verification in this environment

- `node tests/home-ui.cjs` — PASS.
- `node tests/story-editor.cjs` — PASS, including all 18 sticker routes, preview-only semantics and HTML escaping.
- `node tests/experience-flows.cjs` — PASS for Story viewer, Reels, Explore, and post-composer icons/options/escaping.
- `node --check app-improvements.js`, `node --check story-editor.js`, and CRLF-aware whitespace checks — PASS.
- `node tests/frontend.cjs` — BLOCKED: Playwright Chromium headless-shell executable missing. CDN access works outside the restricted sandbox, but the browser binary has not been installed. This is not a visual/mobile QA pass.

## Next verification gates before claiming parity

1. Run an actual rendered/browser/device comparison against the recovered screenshot contact sheets; static UI labels and state tests cannot verify pixel placement, touch hitboxes, keyboard overlap or back navigation.
2. Run Android device capture on the OnePlus 9 Pro using the latest Crush.X app, not older installed v172, and compare screen-by-screen with the reference.
3. Validate videos/gesture hitboxes, story timer behavior, gallery/camera picker, fonts/emoji rendering and export in Chromium and on Android.
4. Configure isolated staging login/media/story/message contracts and two test accounts; verify server receipts and permissions before enabling publish or delivery buttons.
5. Audit and fix Unity native lens pipeline separately; browser Story Studio and Reel preview do not fix device AR.
