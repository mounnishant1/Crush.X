# Step406 — Highlight Photo/Video Cover source integration handoff (2026-11-04)

## Source provenance and reality check

- User-uploaded ZIP: `CrushX-Step405-HIGHLIGHT-PHOTO-COVER-SAFE-PATCH(1).zip`
- Original ZIP SHA-256: `53fbf006b5103d601311040244be83d27bd49dfa63dff5cefea3654696087834`
- Step405 patch was authored against **older React/Capacitor v402 Step65 source**, not the Step252 Windows latest checkout.
- The Step252 GitHub browser+OS+Unity tree **does not contain** `frontend/src/components/StoryLibrary.jsx`, `frontend/src/lib/highlight-viewer-v358.mjs`, `frontend/src/profile-highlights-v320.css` or `backend/social/story-library.mjs`. Do not add orphan files to the GitHub root and call the Android app integrated.

## Safe merge deliverable (generated in conversation)

The Step406 Highlight Master Integration Kit contains exact Step405 target files plus **4 reconstructed ancestor files**, derived via `git apply --reverse` on the uploaded target and re-verified with a forward patch roundtrip. The safe `step406_highlight_merge.py` performs a guarded three-way merge into an **isolated copy** of the actual Windows React source (after the official Step249 source rebase). It preserves nonoverlapping Windows edits and refuses conflicts, missing originals, newer test-file collisions, stale source and absent isolated-copy marker.

Payload: 4 modified source files + 2 new unit tests. No GitHub app feature file was overwritten. `RUN-STEP406.ps1` extends the official isolated Step252 Windows merge workflow, applying Step405 after Step249 only when the read-only preflight is clean.

## Proposed behavior

- Viewer-authorized photo covers on Highlight circles; muted/paused first frame for video-only Highlights.
- Owner can select a retained Story or choose automatic cover.
- 60-second signed image/video cover URL after profile + original Story audience check.
- Restricted cover falls back to an authorized Story. No raw S3 key in cover response.
- Existing fullscreen Highlight viewer remains authoritative.

## Checks on available source

- Uploaded archive path/CRC/manifest SHA: PASS.
- Reverse + forward patch roundtrip to the exact target: PASS.
- 7/7 synthetic safe-merge tests: PASS.
- 2/2 frontend cover URL unit tests: PASS.
- Provided backend/JS module syntax checks: PASS.

## Remaining release gates

1. Apply the Step406 runner on **the user's actual Windows F: checkout**, always via a separate isolated working copy. Inspect any three-way conflict report.
2. Run full Story Library backend tests against real repo dependencies, Vite build and API integration; verify both-owner and viewer account scopes.
3. Build native Android and run OnePlus 9 Pro Highlight photo/video circle, manual cover, close-friends, expiration, first-frame crop, fullscreen viewer and account-switch QA.
4. No production AWS deployments, push to main, real signed media signoff or release certification from this source-only handoff.

**State:** ZIP payload integrated into a separate guarded Windows merge package; **NOT yet applied to the user's latest Windows source and NOT yet compiled/verified on device**.
