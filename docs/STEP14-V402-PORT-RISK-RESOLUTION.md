# Crush.X Step 14 — v402 integration risk review (27 Oct 2026)

**Status: BLOCKED / NO-GO.** Original complete v402 Android ZIP and trusted SHA are unavailable. This branch does not patch Android source, merge to main or deploy anything.

## Verified inputs

- GitHub PR #17–#28 changed-path snapshot: 55 occurrences across 32 unique paths.
- 13 root-level legacy browser HTML/JS/CSS paths demand manual React/Capacitor reimplementation, not copying.
- Three Unity native C# paths require review against actual v402 and Unity compilation plus ARCore acceptance.
- Browser, ledger and AURA demo features are not equivalent to social backend, INR transactions or real agent actions.

## Specific corrected issue

The source compatibility classifier previously used Path.is_file() alone for same-path collisions. A broken symlink could be misclassified as absent. Updated checker marks Path.is_symlink() as a collision too and adds a focused synthetic regression. It remains read-only and fail-closed.

## Integration conditions

1. Validate original full v402 ZIP and independent SHA256 using Step 12; do not infer from version labels alone.
2. Review old browser behavior against v402 React component and navigation/API contracts.
3. Review Unity camera/permission diffs against exact target source; URP MP4 and face expression tracking remain blocked.
4. Implement only approved missing behavior in a clean target branch, with tests; do not overwrite newer source.
5. Validate Node/Vite, Gradle, Unity, Firebase, OnePlus, second device and isolated staging.
6. INR ledger, real Live streaming, AURA model/actions and authenticated social services each require independent server-side release gates.
7. Merge/deploy to main or production only after owner authorization and full acceptance.

**No actual v402 integration, APK build, AWS mutation, payments or physical-device testing was performed.**
