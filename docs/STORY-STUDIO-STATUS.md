# Crush.X Story Studio — screenshot audit (18 October 2026)

Seven user-provided Story screenshots (`1000001286.jpg`–`1000001292.jpg`) were used as UI references. Their earlier attachment-path errors did not prevent inspection in the current workspace.

| Reference | Icons / options | Crush.X implementation |
| --- | --- | --- |
| `1286` — Add to Story | Close, settings, Templates, Effects, Music, Collage, Recents, Select, camera and gallery grid | Added dark mobile composer; browser media chooser/camera capture; session gallery with explicitly labeled sample tiles; manual background templates; optional 2–4-tile collage |
| `1287` — album menu | Recents, Photos, Videos, Google Photos, All albums, From Meta apps | Recents/Photos/Videos filter accessible session tiles; All albums explains browser scope; Google Photos and Meta apps clearly report **not connected** |
| `1288` — editor | Back, Text, Stickers, Music, Restyle, Effects, Mention, Draw, Save, Label AI, More; Your story, Close Friends, Next | All icons open relevant local controls; Next opens local review; audiences change the draft only |
| `1289` — text | Classic, Signature, Editor, Poster, text size, placement, color, alignment, background | Implemented textarea and live preview with these controls; no device keyboard imitation |
| `1290` — effects | Trending, New, Personalized, Film Effects, saved effects, search, finish | Offline CSS filters, filtered categories, bookmark/unbookmark and search; close button exits panel |
| `1291` — mention | Search/select users, allow mentioned people to repost, Add | Search across local sample users, select/deselect, repost preference stored in session; **no messages, mentions or notifications delivered** |
| `1292` — drawing | Brush, stroke size, color palette, undo | Pointer/touch drawing on canvas, palette, size, undo and clear |

## What works locally

- Home **Your story (+)** and Create **Add story** enter the composer.
- User-selected JPEG/PNG/WebP/GIF and MP4/WebM are validated with the existing 100 MB media-size guard; imported media remains in memory for the session.
- A story may use one medium, a 2–4 item collage, or a color-only template. A manual location sticker and emoji stickers are supported.
- Music may be previewed from a locally selected audio file up to 20 MB. It is not bundled into PNG output.
- Save downloads a composed **PNG preview**, including media frame, text, stickers, mentions, filters and brush strokes if the browser permits drawing from the source. Videos are exported only as still frames.
- Close discards this session's draft and revokes local object URLs. User content is not sent to an upload API.

## Known limits (do not describe as connected)

- **Publishing:** there is no verified upload destination, story backend, followers delivery or Close Friends server policy. Review explicitly blocks real sharing; the existing upload guard remains in place.
- **Mentions:** selections refer to local sample profiles. They are not delivered, and the repost toggle does not change another user's permissions.
- **Music:** no licensed catalog, music search or server-side media mixing.
- **Restyle and AI label:** restyle is a manual background picker; the AI label is self-declared, not an authenticity detector or image-generation feature.
- **Gallery:** browsers cannot enumerate a phone gallery or third-party album provider without user authorization/integration. Sample media may refuse PNG export because of cross-origin image policy; locally selected files are recommended.
- **Verification:** `node tests/home-ui.cjs`, `node tests/story-editor.cjs`, and JS syntax checks pass. Full Playwright tests are blocked in this environment because Chromium is not installed. Physical mobile-device UI testing, media/audio playback, and a verified backend integration remain pending.
