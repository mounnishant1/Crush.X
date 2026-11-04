# Reels: Friends DP activity preview (2026-11-04)

This module is integrated into the repository's **browser-preview** page, not the Windows/Capacitor/Unity Android source. It must be ported and verified on the OnePlus 9 Pro before calling the mobile feature complete.

## Visible behavior
- Each Reel shows up to three individual circular DPs for followed friends with an eligible like or repost event. Tap a DP to open that friend's activity-specific reply bottom sheet.
- Tap the sheet's avatar/name to open the routed **full profile** (not a floating profile modal). Existing story rings then use the existing Story viewer.
- The reply sheet supports keyboard input, quick emojis, Close/Back, and opening the associated DM thread. It pauses the current Reel while open, and restores playback when closed on the same Reel.
- Emojis animate over the Reel **after** closing the sheet, but **do not represent delivered reactions**.
- The Reels / Friends top switch filters only items with permitted friend activity. Empty states distinguish no activity from broken media.
- Existing Home friend-like row is retained; the old large Liked by row on Reels is suppressed so only the small DP circles remain.

## Browser-preview data / backend contract
The preview renders explicitly labelled sample activities for reel_1. It does **not** query or validate a production likes/reposts endpoint. To inject activities, provide a synchronous, previously authenticated and hydrated adapter before rendering:

    window.CrushXFriendActivityFeed = {
      getForReel(reelId) {
        return [{ actorId: 'user_1', type: 'like' }];
      }
    };

If this adapter exists, even when it returns no events or throws, the UI does not synthesize sample events. Actor IDs must map to loaded users and differ from the current user. Only explicitly followed people display. Events are deduplicated and limited. This is UI filtering **not an authorization boundary**: backend must enforce friend-relationship permissions, block/mute rules, private accounts, deleted content, audit, expiry and rate limits.

socialSaveDrafts persists local unsent DM drafts. **No message is delivered, no push notification is sent, no reaction receipt is created.** Production needs an authenticated idempotent message-send endpoint and failure/retry states; remove preview-only labels only after real delivery receipts exist.

## Tests / device gate
Run: node --test tests/reels-friend-activity.test.cjs

Browser QA:
1. Open Reel with followed friend activity. Confirm compact DPs above creator caption, unobstructed rail controls and swipe.
2. Tap like DP: sheet, keyboard, quick emoji, close and replay. Confirm locally saved draft and visible not-sent notice.
3. Tap repost DP: repost-specific sheet, avatar to full profile, active Story ring, close Story, Back to same Reel.
4. Switch Reels / Friends / Reels, including empty and error-provider data. No false demo activity after a real provider is configured.
5. Test Android Back/Escape, smaller screens and keyboard resize, video 2x/hold gestures, reduced-motion, re-render after like/save and accessibility labels.

No Android APK was built or installed as part of this browser-preview patch.
