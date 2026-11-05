# On-device model and 3D asset inventory — 1 November 2026

Verified source: `feature/crushx-advanced-ar-lens-engine` at
`d18432820ebdcf2882b429cffe510ca89b24bf80`, before this continuation's additions.
This inventory inspects repository files and contracts; it does not establish
inference, device support, artistic quality or legal rights.

## Included models and runners

**No trained inference model files are included.** A scan of tracked source found
zero `.onnx`, `.tflite`, `.task`, `.pb`, `.pt`, `.pth`, `.nn`, `.sentis`, `.mlmodel`
or `.mlmodelc` artifacts. No MediaPipe, TensorFlow Lite or Unity Sentis/inference
runner is declared in `Packages/manifest.json`. No hand/body runner, model delegate
or segmentation producer implementation exists in this baseline.

The existing real platform dependency is AR Foundation/ARCore 6.0.8. Its face
provider exposes pose/mesh only when the active subsystem descriptor supports
them. ARCore services are supplied by the Android device/platform; they are not
trained model files bundled with this repository. This does not guarantee a
front-camera AR configuration or any blendshape output on the OnePlus.

`BlendshapeTrackingProvider` and `IOnDeviceBlendshapeSource` are integration
contracts, not inference. `GpuBeautyPipeline.SubmitMasks` performs GPU compositing
with supplied masks; it does not generate masks or perform segmentation. The
explicit Editor Mock remains synthetic and is not a model or device fallback.

## Exact missing model integration requirements

The model family names below identify the required function. They are not pinned,
approved package names or declarations that a particular third-party file has
been acquired or licensed.

| Function | Missing artifacts | Required engine output and registration |
| --- | --- | --- |
| Facial semantic landmarks/expressions | A compatible face landmark/blendshape model task or graph, its exact runtime/native libraries and a reviewed release manifest | A real `IOnDeviceBlendshapeSource`, known AR `FaceIdentity`, confidence, input-associated Unity monotonic timestamp, and canonical coefficient names. A MediaPipe face index cannot be assumed to equal an AR trackable ID. |
| Eye/blink/smile/brow signals | Model coefficients and the same verified face association; a separate eye model if calibrated gaze is required | `jawOpen`, `eyeBlinkLeft/Right`, `mouthSmileLeft/Right`, `browInnerUp`, `browOuterUpLeft/Right`, and `eyeLookIn/Out/Up/DownLeft/Right` where actually supported. Existing gaze is a normalized coefficient difference, not a calibrated fixation point. |
| Skin/makeup masks | A skin/semantic-face segmentation model plus exact class map and compatible runner | Skin/eye/lip/cheek red-channel confidence textures. Skin smoothing must not treat an AR face mesh as semantic skin segmentation. Eye/lip masks protect those features. |
| Person/background separation | Person/selfie segmentation model, preprocessing/postprocessing specification and runner | A person confidence texture registered to the corrected full camera viewport. Background replacement/blur bypasses when unavailable. |
| Hair recoloring | Hair segmentation model with documented label/alpha semantics and runner | A hair confidence texture with the same camera identity, orientation/crop/mirror registration and capture-associated timestamp. A person mask is not a hair mask. |
| Hand landmarks/gestures | Hand detector plus hand-landmark model/task, handedness specification and runtime | Genuine hand landmarks/confidence and a camera-coordinate transform. A hand/body output adapter and gesture policy are still required; face blendshape ingress cannot substitute for them. |
| Body pose/stickers | Body detector/pose landmark model/task, topology and runtime | Genuine pose landmarks/confidence, normalized/world-space semantics and camera registration. No body tracking or body sticker adapter is present. |
| Depth-aware compositing | A supported native depth source or separately reviewed on-device depth model/runner | Camera-matched depth units, calibration and invalid-depth semantics. The existing face-depth mesh is face occlusion, not whole-scene depth inference. |

Before activating any model, record its exact file names, byte lengths and SHA-256
from a separately reviewed manifest; source/release origin; runtime ID/version;
format; input/output names, shapes, data types and normalization; topology/class
labels; supported delegate/graphics/Android ABI/API; and model-specific licence,
attribution and redistribution conditions. A code library's licence does not
automatically license its downloadable weights. No model licence has been
inferred from a family name or filename in this task.

The real runner must own preprocessing and postprocessing. It must undo model
letterboxing, sensor rotation, camera preview crop and selfie mirroring before
submitting semantic outputs. Repeated polls must retain the original input-frame
timestamp. Native callbacks need safe thread/lifetime handoff. Camera ownership
stays with `CameraSessionController`; an inference adapter must not open a second
camera.

Existing mask admission requires the actual render camera instance, viewport
pixel dimensions and a newer Unity monotonic timestamp, at most 250 ms old and
no more than 20 ms into the future. Masks may have lower texture resolution but
must describe that complete corrected viewport. Their texture lifetime belongs
to the real producer. Blendshape admission additionally requires matching face
identity, model confidence and the configured pose/model time skew.

**Fallback:** absent, incompatible, unreviewed, stale or malformed inference must
leave expression/segmentation capabilities unavailable. Pose/mesh can continue
through genuine AR Foundation support. Native camera fallback supplies real
pixels with face tracking unavailable. Camera color grading and chroma remain
usable without an inference model. No neutral or random numeric output may be
reported as model inference success.

## Existing lens art

The baseline catalogue has 11 entries: 10 procedural prototypes and one imported
rigid Fox mask. The prototype IDs are `cat-ears`, `puppy`, `cyber-visor`, `fox`,
`holo-crown`, `butterfly`, `robo-helmet`, `celestial-halo`, `neon-mask` and `dragon`.
They construct real geometry, but are explicitly labelled procedural prototypes,
not finished licensed/rigged production art. The separate Resources
`CrushXLenses/cat-ears.prefab` references two built-in Unity meshes; it is also a
prototype, not an additional premium asset.

`fox-mask-3d` uses an existing OBJ/texture/material/prefab. Its controller describes
a rigid mask attached to tracked AR faces; the OBJ contains no animation skeleton.
Source measurements below are file/topology measurements, not imported Unity
renderer counts or GPU performance measurements.

| Existing file | Bytes | SHA-256 |
| --- | ---: | --- |
| `Assets/CrushX/ImportedLenses/FoxMask/Model/FoxMask_Mobile.obj` | 7,452,362 | `971e3881199897ecffdba692ef32197f85eb97158dd4c377acd86f6b5fb37d1a` |
| `Assets/CrushX/ImportedLenses/FoxMask/Model/FoxMask_Color.jpg` | 1,602,662 | `c144518aeecf571d2cde7840e4adc63d87a4db463c6f7efac58059f2d5a07a4e` |
| `Assets/CrushX/ImportedLenses/FoxMask/Model/FoxMask_Unity.mat` | 3,781 | `85bffc733656dd43bd6e63449d992b5d900eb33b654313ffa4d6c49fd8654752` |
| `Assets/CrushX/ImportedLenses/FoxMask/FoxMask_AR.prefab` | 4,397 | `598cf39109700e9c0f5ad1be641ded6d498cd7d06ec17ded374a826bdba46b07` |
| `Assets/Resources/CrushXLenses/cat-ears.prefab` | 7,226 | `22519ebc18f9c92fc7de8dfbc2cf6891b5cf79569b1596cd316b015f7532cdc6` |

The OBJ has 49,980 vertex records, 49,980 texture-coordinate records, 49,980 normal
records and 60,827 triangular face records. Actual Unity import/submesh cost must
be measured in the licensed Editor/player.

No tracked licence/notice/attribution file was found by the baseline filename
scan, and the Fox MTL contains material values and texture reference only.
**The imported Fox artwork's provenance, permission and redistribution rights are
unverified.** Its presence in user-supplied source is not a licence certificate.
Existing bytes are preserved. Do not describe it as approved production art or
add a fabricated attribution/licence. Distribution requires the owner-approved
source licence/receipt, author attribution requirements, modification rights,
redistribution permissions and any commercial-use restrictions for each asset.

A production asset replacement also needs mobile geometry/texture budgets,
correct metre-scale anchors, supported shaders/materials, face occlusion,
blendshape/bone topology if expression deformation is required, animation clips,
thumbnail and target-device acceptance. Those assets are not included here.
An optional asset loader must validate an installed allowlisted Resources
reference and reviewed asset licence before instantiation, reject unknown scripts
or incompatible renderer/prefab structure, and retain a clearly labelled
procedural fallback when optional art is unavailable.

## Verification boundary

This inventory ran tracked-file extension/licence-name scans, source contract
inspection, SHA-256 hashing and OBJ record counts. It downloaded no model or art,
modified no artwork and ran no inference. License review, model loading/runtime
inference, Unity shader/art import and OnePlus visual/latency/performance checks
remain separate gates. The adjacent loader implementation tests local validation
and resource lifecycle only; those tests cannot certify missing models or art.
