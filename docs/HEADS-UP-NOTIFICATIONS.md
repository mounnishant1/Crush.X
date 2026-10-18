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

For a shared reel, emit `crushx:incoming-reel` with `type: 'reel'`, `reelId`, and optional trusted HTTPS `thumbnail`. The UI validates type, deduplicates ids, drops messages for other current accounts or from muted sample senders, and shows at most eight queued alerts. It only surfaces foreground UI; it does not authenticate server events, send messages, persist an inbox, or enable Android system push. Those responsibilities remain with authenticated DM/WebSocket delivery and FCM integration.

Tap dispatches a cancellable `crushx:open-incoming-notification` event (containing id/type/senderId/reelId). Future real chat routing should `preventDefault()` after opening the persisted message or reel. The current fallback opens the existing sample DM draft for known sample users. A backend sender who is not in sample state falls back to the Messages tab, or a matched local reel. No unsent sample draft is represented as a delivered message.

On account logout, dispatch `crushx:session-ended` to flush pending alerts. The banner does not show stale alerts while the document is hidden; the queue expires after one minute. This UI is intentionally isolated from notification preference and backend subscription implementation.

Run `node tests/heads-up-notifications.cjs` for the local unit checks.
