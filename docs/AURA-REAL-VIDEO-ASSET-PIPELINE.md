# AURA-X: Real Video Understanding + Original Asset Factory

## Implemented on isolated branch

The owner-approved **local video** is probed with ffprobe and sampled with ffmpeg at four times. Four real JPEG keyframes are sent to an image-capable Responses API model only after explicit rights confirmation AND frame-upload consent. Strict JSON output describes visual style, approximate motion hints, generic effect cues and a palette. No audio or all-frame understanding is claimed.

The procedural asset factory produces original RGBA PNG textures (256x256) and UV-mapped double-sided low-poly OBJ geometry. It also writes a CreatorLensDocument v1 with the mandatory installed procedural base asset, a game-theme suggestion referencing an existing game, and an immutable manifest with per-file SHA-256. These are genuine generated assets but are not finished face rigs.

The Unity Editor menu **CrushX > AURA-X > Import Generated Assets (Review Preview Only)** verifies the JSON inventory, SHA256 and size limits; it imports PNG + OBJ, creates an EditorOnly material/prefab under Assets/CrushX/AURAReviewOnly. It does NOT register a runtime AR LensCatalog item, deploy to an APK or publish publicly.

## Local usage

Requires Node 22+, ffmpeg and ffprobe, a rights-cleared local video (.mp4 / .mov / .m4v / .webm) under 250MB and 120 seconds, and a server-only model key.

PowerShell commands:

    $env:OPENAI_API_KEY = "<configure securely; never send keys in chat>"
    node tools/aura-video-to-lens.cjs --video "F:\ApprovedReel.mp4" --out "F:\CrushX-ReviewAssets" --rights-confirmed --allow-frame-upload

Bash:

    OPENAI_API_KEY="configured-server-only" node tools/aura-video-to-lens.cjs --video ./approved.mp4 --out ./work/review --rights-confirmed --allow-frame-upload

Test without an API key (the model response is mocked):

    node --test tests/aura-video-asset-pipeline.test.cjs tests/aura-x-trend-studio.test.cjs

The test suite generates a real FFmpeg synthetic MP4 for extraction. Test passing does NOT prove live provider inference or Unity/Android execution.

Five review package files: overlay.png, ornament.obj, creator-lens.json, game-theme.json, manifest.json. Manifest status is DRAFT_REVIEW_REQUIRED; AutoPublish=false; independent review is required.

## Pending for production

1. Set up model/API credentials and evaluate actual authorized videos; no user media or real model call was performed during authoring.
2. Extend beyond 4 sampled images: temporal action analysis, captions, licensed audio analysis, face/hand/body tracking, accurate AR alignment and original animations.
3. Add content safety, IP/licensing approval and signed exact-hash review records. Metadata in a package is not trusted proof of rights.
4. Turn review-only meshes into validated, tracked, runtime Unity lenses with rigging, shaders and device QA. Game-theme JSON does NOT create a new full gameplay mechanic.
5. Merge changes safely into latest Android source; build Unity IL2CPP/APK, measure frame timing and verify camera/game touches.
6. Add owner-approved backend publishing, signed asset manifest, Lens Store synchronization, analytics, rollback and rate-limited scheduled trends.
7. Integrate approved platform connectors; never scrape private social feeds or copy third-party characters/art/audio without permission.

## Security

Never scrape accounts, reuse session cookies, download arbitrary social media videos or treat trend API authorization as a licence to redistribute. Requests require explicit media rights AND frame-upload consent. Frames are processed in memory; the generated review package contains neither source video nor extracted source frames. No model-produced scripts or shaders are executed; only allowlisted styles/palettes/templates. Vision model output can be wrong and does not replace moderation.
