# Step252 Home Publishing Feedback — controlled semantic merge
Source branch: `work/reel-follow-scrub-story-publish-20261018` (legacy 2026-10-18).
Integrated only explicit publishing progress, Home banner and receipt-driven toast.
**Not merged:** old `addReelScrubbers` and local Follow override because current `app-improvements.js` already provides Reel progress and Follow handling. Duplicating them would cause double progress bars and reset playback.
Supported API: `window.CrushXPublishFlow.start({id,kind})`, `.progress(id,measuredPercent)`, `.complete(id)`, `.fail(id)`; or `crushx:publish-*` document events.
Important: calling `complete` is ONLY valid after trusted backend publication receipt and audience checks; uploading 100% of bytes is not publication.
This is a browser reference UI and does **not** attach to Windows React+Capacitor or certify Android.
