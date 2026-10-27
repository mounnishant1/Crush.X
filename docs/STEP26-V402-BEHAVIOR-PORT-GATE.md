# Crush.X Step 26 — Browser PR #34–#45 to v402 React/Capacitor port gate
Date: 2026-10-27 (Asia/Kolkata)

## Actual result
A **pinned, read-only behavior-port contract** and automated source gate were added.
No authenticated v402 React/Capacitor ZIP + independent publisher SHA256 was found in
available GitHub branches or ChatGPT Library. Thus **Android integration remains BLOCKED**.

This is not an APK build, Unity compile, payment implementation, agent training,
live broadcast, cloud deployment, or claim of device-tested feature parity.

## Pinned browser source evidence
- `docs/STEP26-PR34-45-BEHAVIOR-PORT-CONTRACTS.json` snapshots the 12
  GitHub PR head SHAs and changed paths from #34 to #45.
- Canonical *behavior reference* sequence: #34 → #37 → #38 → #39 → #41 →
  #42 → #43 → #44 → #45.
- #35/#36 are **parallel overlapping variants** of Story/Reels pointer handling.
  They must not be blindly cherry-picked on top of #34/#37.
- #40 edge-to-edge Story styles were manually carried into #42. Port #42's
  behavior once; do not apply #40 again.
- Repeated edits to `app-improvements.js`, `tests/frontend.cjs`, and
  `social-interactions.js` are browser demo changes, not Android React modules.
  A passing GitHub browser test does not certify the physical OnePlus app.

## Read-only handoff commands

From the checked-out Step 26 branch:

```powershell
# Honest blocker report; exit code 2 with --strict because no original source
python tools/step26_v402_behavior_port_gate.py --strict

# Strict source attestation and React/Capacitor candidate locations (ONLY if
# original complete ZIP and independently supplied trusted SHA256 are available)
python tools/step26_v402_behavior_port_gate.py `
  --archive 'F:\CrushX-Source\CrushX-v402-MERGED-FULL-SOURCE-20261027.zip' `
  --trusted-sha256 '<owner-published-independent-64-char-sha256>' `
  --output 'F:\CrushX-Reports\step26-manual-port-targets.json' `
  --strict

# Synthetic source-only regression tests, no Android compilation
python -m unittest discover -s tests -p 'test_step26_v402_behavior_port_gate.py' -v
```

The ZIP path/name above is **illustrative**; not evidence the archive exists.
Do not use a hash calculated from the same untrusted ZIP as independent
publication evidence. The checker calls the existing Step 15 safety preflight
**before** inspecting ZIP source or reading JSX/TSX. It only reports filename
candidates and source keyword presence, never rewrites files.

## Migration acceptance (all mandatory)
1. Authenticate original v402 ZIP and extract to a *new* isolated directory.
2. Trace real target React route/state providers, Android Back handlers, modal
   stack ownership, safe areas, overlays, Story/Reel touch pointers.
3. Reimplement verified behavior in actual components. No root browser
   `index.html`, `app-improvements.js` or `social-*.js` copy.
4. Add component/test evidence for Back/Forward/deeplinks, one-gesture/one-Reel
   and Story, edge-to-edge screen, media details, and partial→full sheets.
5. Perform clean Node/Vite builds, Android Gradle build, OnePlus hardware Back,
   camera/microphone/media, and authenticated staging QA.
6. Keep all real payments/coins, live, calls/P2P, cloud deployment and AURA-X
   model tools gated by their own authorization and live service tests.

**Release decision:** NO-GO until verified v402 source, real integration and
physical/staging checks are complete. No main merge or production operation.
