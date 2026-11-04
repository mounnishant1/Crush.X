# Step255 — Story/Editor keyboard focus + native Android QA gate (2026-11-04)

The browser-integrated Story player regenerated the dialog HTML after a pause/next action and discarded focus. A real touch/keyboard switch user could lose navigation. Fixes:
- Keep focus on the active Story pause/next control or stage after a rerender when possible, never focus a disabled button.
- Activate the Story stage through Enter as well as Space/arrow keys.
- Suppress synthetic click after pointer cancellation, preserving the one-action-per-gesture rule.
- Automated Chromium touch viewport flow: Home -> Story -> pause (focus preserved) -> stage Enter -> ArrowRight -> canceled pointer -> close -> Story Studio gallery -> template/editor -> text input -> Back -> close.
- Node source guards and Chromium flow run with frontend CI; these tests do not certify WebView or Android hardware.

## Remaining release blockers
- Latest Windows React/Capacitor v402 source at F: is not mounted; GitHub root lacks Android Gradle wrapper/app and Unity IL2CPP export. A physical APK or ADB touch test cannot run inside this environment.
- Do not confuse browser sample Story editor with production export/editing. Genuine Android QA requires successful native build, ADB device, device screenshots/logcat, and owner-approved staging accounts.
