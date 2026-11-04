# Step252 Story pointer ownership semantic port
Source branch: `fix/story-pointer-ownership-20261027`.
Original bug: unrelated pointerup could complete the originating swipe; horizontal movement mixed with vertical drag could skip Story. This branch ports only pointer-identity, drag-axis and state-reset safety to the current, newer Story/Reels/AI UI in `app-improvements.js` without replacing other screen code.
Additional guard suppresses synthetic click after a vertical drag. Browser-source tests are added. **Not an Android physical touch verification.**
Other older source audit scripts in this divergent branch were not reintroduced because their v402 preflight differs from current integration.
