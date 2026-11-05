# Crush.X Beauty, Alien and Trending Lens Collections

## Prototype scope

This change extends the Unity demo catalog from 10 to 22 procedural 3D lenses.
The additions are **not** finished beauty-retouch / face-morph shaders and have
not been tested on a physical Android device.

| Collection | Added effects |
|---|---|
| Beauty | `beauty-glow`, `beauty-blush`, `beauty-freckles`, `beauty-crystals` |
| Alien | `alien-classic`, `alien-nebula`, `alien-mech`, `alien-royal` |
| Trending candidates | `trend-hearts`, `trend-pixels`, `trend-disco`, `trend-starlight` |

The **Trending** tab is a ranking of installed, approved lenses; it is **not**
an unlimited collection of third-party Snapchat/Instagram effects. On-device
fallback highlights are explicitly curated and are not claims about which
lenses are popular today.

## Category controls

- `LensEngineBootstrap.SetCollection("All"|"Beauty"|"Alien"|"Trending")`
- Native Unity message: `UnitySendMessage("CrushXLensReceiver", "SetCollection", "Alien")`.
- Swipe left/right advances by exactly one lens within the current collection.
- Existing Favorite support and direct `SetLens` remain available.
- A direct `SetLens` pointing outside a filtered collection switches to All.

## Trusted trend-feed contract

`UnitySendMessage("CrushXLensReceiver", "ApplyTrendingFeed", json)` accepts
a JSON snapshot with a UTC expiry and scores:

```json
{
  "expiresUtc": "2026-11-06T12:00:00Z",
  "items": [
    { "id": "alien-classic", "score": 950 },
    { "id": "beauty-glow", "score": 870 }
  ]
}
```

The Unity runtime rejects unknown IDs, duplicates, malformed or expired feeds,
negative scores, snapshots larger than 4,096 characters, more than 32 entries,
and expiry values over seven days away. Scores sort descending, with ID as a
deterministic tie-breaker. A rejected feed keeps the last valid snapshot,
which expires into the offline curated list.

**Security requirement:** Android/backend code must authenticate the feed and
verify that a trusted Crush.X publisher authorized it *before* calling Unity.
The Unity JSON validator is not authentication. Do not scrape/clone external
lenses, download executable code, accept arbitrary effect URLs or upload user
video to another platform without consent.

A future server scheduler can compute scores from consented, aggregated
in-app impressions, uses, shares, saves, freshness and reports, then publish
the next signed/authorized feed. Add anti-spam, human moderation, geo/language
preferences, minimum sample sizes and privacy thresholds before production.

## Production work still required

1. **Beauty:** face landmarks and segmentation; skin smoothing and retouch
   shaders; adjustable makeup, blush, lip, eye and teeth presets; preserve skin
   texture; off switch and before/after; device-grade color pipeline.
2. **Alien:** tracked mesh deformation, depth occlusion, expressions, blink,
   mouth and head tracking; asset LODs, animation and lost-tracking recovery.
3. **Trending:** authenticated API + scheduled publisher + analytics + safe
   feed refresh; lens lifecycle and moderation.
4. **Integration:** compare this GitHub demo branch against the latest local
   Windows F: source before porting; do not overwrite or auto-merge it.
5. **Release gate:** Unity 6 compile + EditMode/PlayMode tests; Android ARM64
   APK; front/back camera switching, real device face tracking, photos and MP4
   results matching preview; performance / battery / crash checks on OnePlus 9 Pro.

**Status:** source implemented on isolated branch, not production released.
