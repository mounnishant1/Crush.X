# Step251 AR / Lens candidate (not verified for production)

This manual merge keeps current Story/Reels/FCM/AI browser modules when both branches changed the same path, while taking newer source from the AR/Lens chain for Unity and native-media test files.
Head source: feature/aura-x-real-video-asset-factory-20261104
Common baseline for this reconciliation: main
Source modified paths: 376
Exact already included: 173
Non-conflicting paths copied: 167
Native Unity/test conflicts resolved from AR side: 24
Shared frontend conflicts resolved from existing integration side: 12

## Deferred browser/OS differences (retained current versions)
- .github/workflows/frontend.yml
- app-experience.css
- app-improvements.js
- aura-x-assistant.js
- aura-x-policy.js
- docs/HEADS-UP-NOTIFICATIONS.md
- heads-up-notifications.js
- index.html
- tests/aura-ui-browser.cjs
- tests/experience-flows.cjs
- tests/frontend.cjs
- tests/heads-up-notifications.cjs

## QA limitations
- No Unity 6000.0.30f1 compilation performed here.
- No ARM64 IL2CPP export or OnePlus 9 Pro device tests performed here.
- No production cloud model, payments or streaming changes.
- Source-level merge does not prove camera/lens AR runtime works.
- Missing Step250 Windows ZIP/latest React+Capacitor source cannot be folded into this repository.
