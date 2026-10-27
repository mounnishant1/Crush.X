# Crush.X Step 15 — v402 original ZIP safety gate (27 Oct 2026)

Status: BLOCKED. No complete original v402 ZIP or independently trusted publisher SHA256 is accessible. This branch modifies only offline audit code and tests, NOT Android, Unity, backend or production.

## Verified source-level defects corrected

1. Untrusted archives were parsed even with absent, invalid or mismatched SHA256. The checker now exits BEFORE opening the ZIP contents when any digest-provenance check fails.
2. Windows extraction path ambiguity is blocked: CON.txt, AUX, COM1.jpg, trailing dots/spaces and special filename punctuation are rejected. Existing ZIP traversal and symlink guards remain.
3. Implicit parent directories are now checked, preventing case-folded, Unicode NFC-normalized and file/directory collisions.
4. ZIP entries larger than 8 MiB with compression ratio exceeding 500:1 are rejected BEFORE full decompression or CRC. Extremely compressible legitimate files must be reviewed rather than auto-extracted.
5. Existing reports or symlink report paths are refused, preventing overwrite.

## Tests

Prior 9 synthetic source tests retained. Added 8 adversarial tests in tests/test_zip_safety_v402.py. A source-only test PASS does not certify a real v402 ZIP, Android build or device feature.

Run on a checked-out branch:

    python -m unittest discover -s tests -p 'test_*zip*py' -v
    python tools/source_handoff_preflight.py --archive 'F:\CrushX-Source\CrushX-v402-MERGED-FULL-SOURCE-20261027.zip' --trusted-sha256 '<independent_sha256>' --output 'F:\CrushX-Reports\v402-new-preflight.json' --strict

The second command needs the actual original ZIP and an independently trusted hash. A SHA calculated from the file being inspected is diagnostic only, not independent authenticity evidence. Report destination must not already exist.

## Blockers

No automatic browser PR cherry-pick into React, no source patch installation, no Unity camera or MP4 release certification, no INR live payments/ledger activation, no AWS/Cognito deployment and no main merge.

Next after an independently attested v402 ZIP arrives: compare precise React/Unity contracts, port only approved changes into an isolated branch and perform Node/Vite, Gradle, licensed Unity, OnePlus and staging acceptance.
