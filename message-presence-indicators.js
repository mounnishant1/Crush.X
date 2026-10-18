/* Crush.X unread and online presence indicators: foreground display state only.
   The authenticated transport must supply verified incoming events/snapshots. */
(() => {
  'use strict';
  const PRESENCE_TTL_MS = 90000;
  const unread = new Map(), presence = new Map(), seen = new Set();
  let currentRecipient = null;

  const state = () => {
    try { return typeof getState === 'function' ? getState() : null; }
    catch { return null; }
  };
  const short = value => typeof value === 'string' ? value.trim().slice(0, 128) : '';
  const count = value => Number.isSafeInteger(Number(value))
    ? Math.max(0, Math.min(9999, Number(value))) : 0;
  function accountId() {
    const id = short(state()?.currentUserId);
    if (id !== currentRecipient) {
      unread.clear(); presence.clear(); seen.clear();
      currentRecipient = id;
    }
    return id;
  }
  function acceptedForAccount(payload) {
    return payload && typeof payload === 'object'
      && short(payload.recipientId) !== ''
      && short(payload.recipientId) === accountId();
  }
  function markRead(senderId) {
    const sender = short(senderId);
    if (!sender || !unread.has(sender)) return;
    unread.delete(sender);
    paint();
  }
  function registerUnread(payload) {
    if (!acceptedForAccount(payload)) return;
    const sender = short(payload.senderId), id = short(payload.id);
    if (!sender || !id || sender === accountId() || seen.has(id)) return;
    if (!['message', 'reel', 'post', 'story'].includes(payload.type)) return;
    seen.add(id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    const current = state();
    if (current?.activeTab === 'messages' && current?.chatUserId === sender) return;
    unread.set(sender, Math.min(9999, (unread.get(sender) || 0) + 1));
    paint();
  }
  function snapshot(payload) {
    if (!acceptedForAccount(payload) || !Array.isArray(payload.conversations)) return;
    unread.clear();
    for (const conversation of payload.conversations.slice(0, 500)) {
      const sender = short(conversation?.senderId);
      if (sender && sender !== accountId() && count(conversation?.unreadCount) > 0) {
        unread.set(sender, count(conversation.unreadCount));
      }
    }
    paint();
  }
  function updatePresence(payload) {
    if (!acceptedForAccount(payload)) return;
    const sender = short(payload.userId), now = Date.now();
    if (!sender || sender === accountId()) return;
    // Online must be explicit, visible by the subject's choice, and fresh.
    const observedAt = Number(payload.observedAt), expiresAt = Number(payload.expiresAt);
    const valid = payload.online === true && payload.visible === true
      && Number.isFinite(observedAt) && observedAt <= now + 5000
      && observedAt >= now - PRESENCE_TTL_MS
      && Number.isFinite(expiresAt) && expiresAt > now
      && expiresAt <= now + PRESENCE_TTL_MS;
    if (valid) presence.set(sender, expiresAt);
    else presence.delete(sender);
    paint();
  }
  function prune() {
    const now = Date.now();
    let dirty = false;
    for (const [userId, expiry] of presence) if (expiry <= now) {
      presence.delete(userId);
      dirty = true;
    }
    if (dirty) paint();
  }
  function ensure(host, key, className, label, shouldShow, textContent = '') {
    if (!host || !host.querySelector) return;
    let dot = host.querySelector('[data-' + key + ']');
    if (!shouldShow) {
      dot?.remove();
      return;
    }
    if (!dot) {
      dot = document.createElement('span');
      dot.setAttribute('data-' + key, '');
      dot.className = className;
      dot.setAttribute('aria-label', label);
      host.append(dot);
    }
    if (dot.textContent !== textContent) dot.textContent = textContent;
  }
  function paint() {
    accountId(); pruneExpiredWithoutRecursion();
    if (!document.querySelectorAll) return;
    const total = [...unread.values()].reduce((a, b) => a + b, 0);
    for (const tab of document.querySelectorAll('[data-tab="messages"]')) {
      tab.classList.add('cx-message-tab');
      ensure(tab, 'cx-nav-unread', 'cx-nav-unread-dot',
        total + ' unread messages', total > 0);
      tab.setAttribute('aria-label', total ? 'Messages, ' + total + ' unread' : 'Messages');
    }
    for (const button of document.querySelectorAll('[data-chat-user]')) {
      const sender = short(button.dataset?.chatUser);
      if (!sender) continue;
      button.classList.add('cx-chat-state-host');
      ensure(button, 'cx-chat-unread', 'cx-chat-unread-dot', 
        (unread.get(sender) || 0) + ' unread messages', !!unread.get(sender));
      ensure(button, 'cx-chat-active', 'cx-chat-active-dot', 
        'Active now', presence.has(sender));
    }
    const chat = state();
    const currentChat = short(chat?.chatUserId);
    const back = document.getElementById?.('messagesBack');
    const title = back?.nextElementSibling;
    if (title && currentChat) {
      title.classList.add('cx-chat-title');
      ensure(title, 'cx-title-active', 'cx-chat-title-active',
        'Active now', presence.has(currentChat));
    }
  }
  function pruneExpiredWithoutRecursion() {
    const now = Date.now();
    for (const [userId, expiry] of presence) if (expiry <= now) presence.delete(userId);
  }
  function reset() {
    unread.clear(); presence.clear(); seen.clear(); paint();
  }
  document.addEventListener('crushx:heads-up-accepted', event => registerUnread(event.detail));
  document.addEventListener('crushx:unread-snapshot', event => snapshot(event.detail));
  document.addEventListener('crushx:presence-update', event => updatePresence(event.detail));
  document.addEventListener('crushx:conversation-read', event => {
    if (acceptedForAccount(event.detail)) markRead(event.detail.senderId);
  });
  document.addEventListener('crushx:session-ended', reset);
  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('[data-chat-user]');
    if (btn) markRead(btn.dataset.chatUser);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });
  if (typeof MutationObserver === 'function') {
    const target = document.getElementById('app');
    if (target) new MutationObserver(paint).observe(target, { childList: true, subtree: true });
  }
  if (typeof setInterval === 'function') setInterval(prune, 20000);
  window.CrushXMessageIndicators = Object.freeze({
    paint, unreadTotal: () => [...unread.values()].reduce((a, b) => a + b, 0),
    isActive: userId => { pruneExpiredWithoutRecursion(); return presence.has(short(userId)); }
  });
  paint();
})();
