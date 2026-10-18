# Shared emoji, stickers & GIF entry point

The shared expression picker is loaded on the Crush.X web UI via expression-picker.css and expression-picker.js, using a single user-facing smiley button next to eligible text composers. It is intentionally added through DOM observation rather than duplicating controls across render functions, so comment boxes, replies, saved DM drafts, note text, share captions, upload captions and Story Studio text fields can inherit it when shown.

## Implemented in this branch
- Simple one-tap picker with three tabs: Emoji / Stickers / GIF.
- Crisp system-native Unicode emoji (including colored emoji glyphs), recent emoji memory in this browser, category navigation and local search.
- Lightweight, visually animated sticker previews that insert combined emoji characters as text; they remain plain text in the published content. Sticker animation is only in the picker preview.
- Caret-aware insertion preserving text before/after selection, maxlength protection, and input events for existing draft handlers.
- Responsive mobile sheet respecting safe-area insets, dark mode, reduced-motion preferences, Escape and outside-to-close behavior.
- Story Studio's **existing** local GIF upload control remains available when active inside its dialog; external GIF discovery is not configured.
- No tracking, third-party content loading or GIF API key embedded in this implementation.

## Not claimed complete
- An external searchable licensed GIF catalog, moderation, preview/CDN optimization, storage, delivery and playback in chat/comment threads need backend integration before GIF sending can be enabled there.
- Sticker entries in this picker are emoji text pairs, not a rich sticker message schema. Interactive animations in posted content require message/story payload support.
- Real multi-device behavior must be tested on staging; this branch has static/source checks only.
- One editor-specific sticker toolbar may continue to offer its own advanced story stickers, since those are rich interactive story objects and not text input.

## Manual checks before merge
1. Mobile: comments in Home and Reels, open picker from smiley, insert, edit, send; verify no layout overlap.
2. Messages: insert into a local draft; confirm nothing sends as a real DM unexpectedly.
3. Story Studio + Notes: insert into text fields; confirm live preview responds and old tools still function.
4. Accessibility: keyboard Tab/Enter/Escape and focus return; test browser zoom and reduced motion.
5. Search/filter, recents, max-length, and very long comments; check light/dark and Android native emoji glyph rendering.
6. GIF tab: do not present unconfigured external catalog as functional. Confirm Story Studio's existing GIF file flow where applicable.

Run: node tests/expression-picker.cjs