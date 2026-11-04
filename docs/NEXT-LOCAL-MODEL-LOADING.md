# Reviewed local model and artwork loading

IMPLEMENTED source: `Assets/Scripts/AssetLoading` provides real bounded local-file
loading, exact runtime contract checks, independent approval records, runtime
lifetime ownership, optional blendshape forwarding and reviewed installed-prefab
validation with a real existing procedural fallback. No trained model, inference
runtime or new third-party artwork was added.

## Model trust and compatibility

`LocalModelManifest` is untrusted metadata. It identifies a model/version,
relative local path, exact byte length/SHA-256, file format, purpose, runtime
ID/version, input tensor dimensions/layout/type, output contract and licence ID.
It cannot approve its own licence or claim execution permission.

The host separately supplies an `IModelApprovalRegistry`, such as a source-authored
`FixedModelApprovalRegistry`. An approval binds the exact ID/version/hash/size/
purpose/licence to a reviewed-use receipt. Do not deserialize those approvals from
the same downloaded manifest or accept an adjacent unknown checksum as approval.
No approvals are registered by default. Licence IDs/receipts are trust records,
not claims that the code can determine legal rights automatically.

`VerifiedArtifactLoader.TryLoad` validates the independent approval before reading
the file. Its installed runtime registration must match the precise format,
runtime version, input tensor and output contract. Files are limited to 128 MiB;
relative traversal, rooted/remote paths and reparse links are rejected. The loader
reads a bounded snapshot, checks file length/write observations and links before
and after reading, and verifies the approved digest before any runtime sees bytes.
The runtime receives verified in-memory bytes and never reopens an untrusted path.
Portable file APIs do not create an OS sandbox; exact snapshot hashes prevent a
path race from substituting unapproved model bytes.

TFLite files must also carry their real `TFL3` FlatBuffer identifier. Task/ONNX
container and full graph/operator parsing is the installed runtime's responsibility.
An extension, checksum or TFLite identifier alone does not certify a valid model.

## Actual runtime and fallback boundary

An installed `ILocalModelRuntime` supplies its registration and parses/initializes
the real graph in `TryStart`. `LocalModelSession` becomes Ready only after the
verified file loads, initialization succeeds and the runtime reports IsRunning.
Verified bytes alone cannot create inference capability. An already-running
external runtime is not replaced. Start errors and missing/incompatible files or
approvals leave optional effects unavailable.

Verified bytes remain leased while a native runtime may use them. Stop must
synchronously end byte use and report not running. If teardown throws and the
runtime is still running or cannot confirm liveness, the session retains both
runtime and bytes, reports Failed, and blocks restart. The admission registry
keeps at most four sessions and 256 MiB total alive, including such quarantines.
It prevents reuse of the same runtime. `TryStop` or the explicit cold-path
`RetryPendingTeardowns` can release them after the runtime confirms it stopped.
A broken native plugin may require process restart; the loader does not pretend
teardown succeeded or clear a buffer it might still be reading.

`OptionalLocalModelSource` owns no camera. Configure it with a separately installed
runtime component and call `TryLoadReviewed` with the host's approved artifact
root/metadata/registry. For face use, that runtime also implements the existing
`IOnDeviceBlendshapeSource` and reports the matching loaded model ID. Assign this
adapter to `BlendshapeTrackingProvider.BlendshapeSourceComponent` only after the
host has supplied the actual runtime. The source binds the component used during
start; swapping the field cannot forward results from an unverified replacement.
Pause/focus loss, disable, exceptions and stopped runtimes remove readiness and
attempt safe teardown. Resume requires an explicit validated load.

The existing tracker continues pose/mesh tracking when expressions are unavailable.
Missing segmentation masks still bypass their beauty/background effects. Hand,
body and depth outputs need their corresponding real installed runner and consumer;
this face adapter does not fabricate them. See `NEXT-MODEL-ASSET-INVENTORY.md` for
the exact missing files/contracts and licence/provenance boundaries.

## Installed artwork

`ReviewedResourcesLensLoader` accepts only a host-authored registration of an
installed Resources path with a reviewed licence receipt and bounded component,
shader, renderer and geometry allowlists. It checks missing scripts, actual mesh
presence, shader support/pipeline compatibility and budgets before instantiation.
It does not load external C#, native libraries or binary AssetBundles. If reviewed
art is missing/rejected, it builds the explicitly selected existing procedural
lens and reports `usedFallback=true`; a prototype is not reported as production
art. Unknown fallback IDs cannot generate a new catalogue entry.

The new loader is opt-in. Existing Fox source, prefab and selection remain
unchanged, with licence provenance still unverified. No new licence approval is
invented for that artwork. Full artistic/rigging quality still requires review
and Unity/device acceptance even after structural checks pass.

## Verification

TESTED on host .NET: real file/hash/length/traversal/approval/runtime-contract
rejection, immutable verified metadata/byte leases, failed graph start, stopped
runtime detection, throwing registry/teardown, safe quarantine/retry, bounded
concurrent admission, and installed-resource registration checks. Tiny TFLite
identifier fixtures and lifecycle control doubles test loader policy only; they
are not trained models and never generate predictions.

Unity-only fixtures exercise runtime-component replacement and real procedural
fallback geometry. They are authored but not executed without Unity. Full Unity
compilation, graph/operator/delegate compatibility, model accuracy, inference
latency/memory and physical asset rendering remain BLOCKED until actual reviewed
models/runtimes and the licensed Editor/device are supplied.
