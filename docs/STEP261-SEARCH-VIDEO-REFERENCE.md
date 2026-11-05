# Step261 Search / Explore (video reference 1000006969.mp4)
Source recording shows live query suggestions and recents, For you/Accounts/Audio/Tags tabs, a thumbnail grid with corner view counts, search history and a no-account-results state.

Browser integration implements these flows in local sample data only, without backend queries or fabricated view counts. It is an enhancement of existing Explore that is inactive until search input focus. The original discover filters and Step254 ranked-Reel opening remain available in idle mode. Ephemeral recents are per sample persona and cleared on logout. Real-video view counts display only when the existing backend-provided metadata is nonnegative.

Step261 browser tests verify 390px mobile search/submit/tabs/empty Accounts/Back. The separately generated Step261 React kit provides an authenticated search API adapter interface and safe StageReact script; it is not automatically part of this GitHub browser branch.

**Android remains HOLD:** Windows F: React/Capacitor real app and physical OnePlus device are unavailable here. No APK, media server, cross-social search API, production indexed people, or private-content authorization has been verified.