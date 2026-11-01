# Local Lens Creator foundation

This is an implemented local preset editor over **installed procedural 3D lenses**. It does not add finished artistic assets, import binary AssetBundles, run an AI model or publish content.

## Working source paths

- `Assets/Scripts/Creator/CreatorLensDocument.cs`: schema/revision, catalogue base, asset dependencies, thumbnail, licence metadata, shader choice, bounded transforms/tint/pulse and expression rules.
- `CreatorLensValidation.cs`: strict catalogue/dependency allowlists, finite parameter bounds, expression hysteresis and default-deny moderation hook.
- `CreatorDocumentStore.cs`: bounded strict-UTF8 local file load, SHA-256 before decoding, symbolic-link rejection, immutable revision saves with atomic rename and temporary-file cleanup.
- `CreatorLensRuntime.cs`: application to the existing engine/effect root, model-channel availability checks, independent material ownership and restoration. Tracking pose and camera ownership stay with the existing engine.
- `Editor/CreatorLensWindow.cs`: edit, actual isolated 3D preview, save, reviewed import and export of a local pending-review request.

## Editor workflow

1. Open Unity 6000.0.30f1 with this project, then **CrushX → Lens Creator → Local Preset Editor**.
2. Choose an installed base. Edit ID, display name, revision, licence metadata, shader, bounded transform/tint and optional pulse/expression rules.
3. Click **Validate and rebuild preview**. This builds the real installed effect in a separate preview scene; it does not start a camera. Preview expression rules remain neutral because it supplies no synthetic model signals.
4. **Save new immutable revision** writes `<id>.r<revision>.lens.json` and displays the SHA-256. Existing revisions are refused. Increment Revision before saving a changed version.
5. To import, supply the SHA-256 from an independently reviewed record and select the corresponding local JSON. A hash copied from an unknown file beside the package does not establish review. Data is size/hash/UTF8/schema/asset checked before activation.
6. In Play Mode, **Apply to running lens engine** selects the installed base and applies this preset. The normal rendering/capture path sees the same effect objects. Existing tracking availability and capture limitations still apply.
7. **Export pending review request** requires the exact saved revision. It saves only request metadata and package hash; there is no upload or publication.

Capture result metadata still identifies the installed base lens. Linking a captured-media draft to a particular creator preset/revision requires an additional host draft adapter; it is not implemented here.

Shader selection is restricted to installed Built-in/URP choices and must match the active pipeline. A shader stripped from the player build is rejected. Parameter offsets use the existing effect's local asset coordinates; the tracked parent continues to apply face-size calibration. Scale is 0.25–2, offsets ±0.3 asset units, rotations ±45°, pulse at most 10%/2 Hz, and each expression multiplier at most 1.5. Combined expression rules take the maximum rather than compounding scale.

Expression rules read `FaceExpressionSample.TryGet`. Missing model channels and tracking loss reset the rule. ARCore pose/mesh does not supply those channels by itself. This package includes no inference model and never uploads face/camera data.

Capture freezes the active creator preset ID, revision and normalized configuration
SHA-256 when a photo/video starts and retains them in completed media and local
workflow draft metadata. The configuration fingerprint identifies the applied
parameters; it is distinct from a reviewed package file hash or moderation receipt.
Actual host editor import and immutable package resolution still require the
missing application adapter.

## Trust, dependencies and publishing

Packages are **data-only**. They can reference only existing `LensCatalog` implementations and installed catalogue asset/thumbnail references. Required base dependencies are checked. Arbitrary C# types, remote URLs, shaders, source scripts and binary bundles cannot be loaded. Scene-controlled imported assets and fullscreen color filters need separate parameter adapters and are explicitly rejected here.

`AssetLicense` is user-supplied metadata, not evidence of legal rights. The imported Fox asset's provenance/rigging/licence still needs review before distribution. Current procedural geometry remains labelled a prototype. The `ICreatorPublishReview` extension must approve the exact package hash and return a trusted moderation/licence receipt. With no reviewer, failed review or an exception, `CanPublish` returns false. No host publishing transport is implemented or invoked.

A future binary AssetBundle loader requires platform compatibility validation, a reviewed content inventory, provenance/signatures, asset licensing and a constrained component policy. It is intentionally absent; supplying a JSON checksum does not authorize executable/unknown asset content.

## Validation status

Portable NUnit tests exercise trust-before-decode, tampering, invalid UTF8, size limits, immutable revision files, failed-save cleanup, unsafe IDs/dependencies/shaders, finite bounds and genuine-signal availability/hysteresis behavior. These are host tests of actual shared source, not Unity Editor/runtime certification.

Additional Unity EditMode fixtures cover `JsonUtility` round-trip, installed catalogue dependency checks, live transform/tint application/restoration and unavailable-expression reset. Run with the existing licensed Unity test runner. Editor preview rendering, shader compilation, Android activation/capture and physical-device visuals remain unverified until that environment is available.
