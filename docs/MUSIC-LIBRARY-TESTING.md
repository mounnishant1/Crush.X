# Crush.X licensed test music — 20 October 2026

## Scope
This patch adds a **12-track test catalog**, not a subscription music service.
Current branch: work/music-library-ccby-20261020 (based on work/unified-expression-picker-20261018).
Source: Kevin MacLeod's official [Incompetech](https://incompetech.com/music/royalty-free/music.html). Each recording is referenced by ISRC and its individual page in music-library.js.
License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).
Public source FAQ: https://incompetech.com/music/royalty-free/faq.html

The app shows the artist, title, official recording page, license, exact required attribution, and clip selection. Native HTML audio previews use official-host MP3 URLs; no MP3 file or third-party artwork is checked into GitHub. Runtime streaming success requires real browser/network verification and the upstream host to allow embedded playback. If unavailable, show an error and open the official track page rather than claim playback works.

## UI integration
- Post creation: **Browse licensed Music Library**; select a track, set the start time and 15/30/60-second segment, and see track+credit in draft preview.
- Story Studio: Music > **Browse licensed music**; choose audio with a matching credit. User-selected device audio is still supported.
- Reels: tapping the audio label opens a catalog picker. **Unlicensed sample reel music is not automatically reusable.** "Use Audio" carries a licensed selection into a new local Create draft.
- Search accepts title, artist, genre and mood; genre chips and Saved are browser-local. Favorite IDs never leave the browser.

## Legal and engineering safeguards
CC BY 4.0 requires credit, license link, indication of changes if you trim, remix or otherwise adapt recordings, and no suggestion of creator endorsement. Keep attribution available in the final post/reel/story description and download. This test picker shows credit in editors and detail view; **actual publishing and exported-file attribution are not wired**.
Do not claim other catalogs are freely reusable, or insert copyrighted Instagram/Spotify songs, commercial lyrics, or album covers without separate permission. Pixabay prohibits standalone content distribution; it was deliberately excluded.

**Important production gaps:** No backend catalog/rights endpoint; no signed or CDN-hosted transcoded previews; no audio waveform or actual audio-to-video mux/sync; no media upload/publishing contract; no final-asset attribution pipeline; no usage analytics/royalty reporting; no moderation, takedown or regional entitlements. These need staging/backend work before any production release. Frontend UI demonstrates selection only.

## Verification checklist
Run \`node --test tests/music-library.cjs\`; confirm existing browser suites and android checks.
On a real phone and desktop browser check: open Music from Post, Story, Reel; search titles; Saved; play/pause; seek; clip length; network denied; browser back/escape; light/dark mode; keyboard focus; safe areas. The library should never claim a file was published. Verify each official MP3 loads and track attribution/license before promoting production. No audio was uploaded to AWS.

## 12 seed titles
Wallpaper; Reunited; Sneaky Snitch; Blippy Trance; The Complex; Summer Day; Clean Soul; Almost Bliss; Miami Viceroy; All This; Wholesome; Juniper.

To expand, add only recordings individually verified for licensing/distribution and keep ISRC, title, artist, duration, source URL, required credit and evidence. Change manifests through review, never via arbitrary client uploads.
