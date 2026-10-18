# Crush.X foreground heads-up notifications

This feature implements a compact Instagram-style in-app alert with a spring entry, 3.9-second hold, animated upward dismiss, swipe-up dismissal, tap navigation, dark-mode support, accessible labels and reduced-motion support.

## Incoming event contract

The **authenticated, trusted message delivery adapter** should emit one document event only after the backend has authenticated the recipient and delivered a verified inbound event:

```js
document.dispatchEvent(new CustomEvent('crushx:incoming-message', {
  detail: {
    id: 'server-message-id',         // stable unique id; required to suppress replays
    recipientId: 'current-user-id',  // must match the active account
    senderId: 'sender-user-id',
    senderName: 'Riya',
    type: 'message',                 // or reel, post, story, comment, mention, reaction, follow, like
    text: 'Hi!'
  }
}));
```

For a shared reel, emit `crushx:incoming-reel` with `type: 'reel'`, `reelId`, and optional trusted HTTPS `thumbnail`. The UI validates type, deduplicates ids, drops messages for other current accounts or from muted sample senders, and shows at most four animated banners in one burst (one visible, three waiting), then suppresses more banners while retaining all unread counts. It only surfaces foreground UI; it does not authenticate server events, send messages, persist an inbox, or enable Android system push. Those responsibilities remain with authenticated DM/WebSocket delivery and FCM integration.

Tap dispatches a cancellable `crushx:open-incoming-notification` event (containing id/type/senderId/reelId). Future real chat routing should `preventDefault()` after opening the persisted message or reel. The current fallback opens the existing sample DM draft for known sample users. A backend sender who is not in sample state falls back to the Messages tab, or a matched local reel. No unsent sample draft is represented as a delivered message.

On account logout, dispatch `crushx:session-ended` to flush pending alerts. The banner does not show stale alerts while the document is hidden; the queue expires after one minute. This UI is intentionally isolated from notification preference and backend subscription implementation.

Run `node tests/heads-up-notifications.cjs` for the local unit checks.

## Unread message and active-status dots

`message-presence-indicators.js` listens to accepted incoming DM/reel/post/story events and displays a **pink unread dot** on the sender's Messages row and the Messages navigation icon. Tapping a sample conversation locally clears the dot; a real messaging adapter should confirm server-side read receipts. The in-memory counters are not a persistent inbox.

On startup or reconnect, the **authenticated messaging service** should populate unread state with:

```js
document.dispatchEvent(new CustomEvent('crushx:unread-snapshot', {detail: {
  recipientId: 'current-user-id',
  conversations: [{ senderId: 'user-123', unreadCount: 5 }]
}}));
```

After the server confirms a conversation read, dispatch `crushx:conversation-read` with `recipientId` and `senderId`.

A **green active dot** is shown only after a backend-authenticated, privacy-authorized event:

```js
const now = Date.now();
document.dispatchEvent(new CustomEvent('crushx:presence-update', {detail: {
  recipientId: 'current-user-id', userId: 'user-123',
  online: true, visible: true, observedAt: now, expiresAt: now + 45000
}}));
```

Presence requires `online === true`, `visible === true` and a timestamp fresh within 90 seconds; it expires automatically. Hidden/offline events immediately remove the dot. These client events are *display hooks*, not proof of authentication. A client script can dispatch arbitrary events, so the backend/WebSocket adapter must validate the session and recipient, subject privacy controls, and ignore unauthorized presence data. Do not infer active status from a page view or fake it for demo profiles.

A surge of more than four alerts does not create an endless popup sequence. An overflow hint such as `+2 more · inbox` appears while a banner is open, but all accepted messages still increase unread dots. The alert burst can resume after the displayed queue ends and a short cooldown. Full server-backed cross-device unread sync, background Android push, and live presence transport remain integration tasks.

Regression checks: `node tests/heads-up-notifications.cjs` and `node tests/message-presence-indicators.cjs`.
