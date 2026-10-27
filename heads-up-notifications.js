/* Crush.X foreground heads-up alerts. UI only: never asserts that a DM was delivered. */
(() => {
  'use strict';
  const DISPLAY_MS = 3900, EXIT_MS = 290, MAX_BANNERS = 4, BURST_COOLDOWN_MS = 15000;
  const TYPES = new Set(['message', 'reel', 'post', 'story', 'reaction', 'mention', 'follow', 'comment', 'like']);
  const queue = [], seen = new Set();
  // Browser-session display preferences only; delivery, push and permissions are unaffected.
  const preferences = { banners: true, previewText: true };
  let region = null, active = null, timer = null, exitTimer = null, exiting = false;
  let burstCount = 0, burstLockedUntil = 0, overflowCount = 0;
  const short = (value, max) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  function appState() {
    try { return typeof getState === 'function' ? getState() : null; } catch { return null; }
  }
  function mediaUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function normalize(input) {
    if (!input || typeof input !== 'object') return null;
    const state = appState();
    const recipientId = short(input.recipientId, 120);
    const senderId = short(input.senderId || input.actorId, 120);
    const id = short(input.id || input.messageId || input.notificationId, 150);
    if (!state || !id || !recipientId || recipientId !== state.currentUserId || !senderId || senderId === recipientId) return null;
    if ((state.socialMutedIds || []).includes(senderId)) return null;
    const type = short(input.type || 'message', 24).toLowerCase();
    if (!TYPES.has(type)) return null;
    const knownUser = Array.isArray(state.users) ? state.users.find(u => u.id === senderId) : null;
    return {
      id, recipientId, senderId, type,
      senderName: short(input.senderName || knownUser?.username || 'Someone', 48),
      avatar: mediaUrl(input.avatar || knownUser?.avatar),
      thumbnail: mediaUrl(input.thumbnail),
      text: short(input.text || input.body || input.preview, 130),
      reelId: short(input.reelId, 120),
      createdAt: Date.now()
    };
  }
  function ensureRegion() {
    if (region && region.isConnected) return region;
    if (!document.body) return null;
    region = document.createElement('div');
    region.id = 'cx-heads-up-region';
    region.className = 'cx-heads-up-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-relevant', 'additions');
    document.body.append(region);
    return region;
  }
  function titleFor(event) {
    return {
      message: 'sent you a message', reel: 'sent you a reel',
      post: 'shared a post', story: 'shared a story',
      reaction: 'reacted to your message', mention: 'mentioned you',
      follow: 'started following you', comment: 'commented',
      like: 'liked your post'
    }[event.type];
  }
  function previewFor(event) {
    if (!preferences.previewText) return 'Preview hidden in this browser';
    if (event.text) return event.text;
    return event.type === 'reel' ? 'Tap to view the shared reel'
      : event.type === 'message' ? 'Tap to open chat' : 'Tap to view';
  }
  function draw(event) {
    const holder = ensureRegion();
    if (!holder) return false;
    const panel = document.createElement('div');
    panel.className = 'cx-heads-up cx-heads-up--enter';
    panel.setAttribute('role', 'group');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'cx-heads-up-open';
    open.setAttribute('aria-label', event.senderName + ' ' + titleFor(event) + '. ' + previewFor(event));
    const avatar = document.createElement('span');
    avatar.className = 'cx-heads-up-avatar';
    if (event.avatar) {
      const image = document.createElement('img');
      image.src = event.avatar; image.alt = ''; image.decoding = 'async';
      avatar.append(image);
    } else avatar.textContent = event.senderName[0]?.toUpperCase() || '•';
    const words = document.createElement('span');
    words.className = 'cx-heads-up-words';
    const headline = document.createElement('span');
    headline.className = 'cx-heads-up-headline';
    const name = document.createElement('strong');
    name.textContent = event.senderName;
    headline.append(name, document.createTextNode(' ' + titleFor(event)));
    const preview = document.createElement('span');
    preview.className = 'cx-heads-up-preview';
    preview.textContent = previewFor(event);
    words.append(headline, preview);
    open.append(avatar, words);
    if (event.thumbnail) {
      const media = document.createElement('img');
      media.className = 'cx-heads-up-media'; media.src = event.thumbnail;
      media.alt = ''; media.decoding = 'async';
      open.append(media);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cx-heads-up-close';
    close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss notification');
    close.addEventListener('click', () => dismiss());
    open.addEventListener('click', () => { dismiss(); openNotification(event); });
    let touchStart = 0;
    panel.addEventListener('touchstart', e => { touchStart = e.touches[0]?.clientY ?? 0; }, { passive: true });
    panel.addEventListener('touchend', e => {
      if (touchStart - (e.changedTouches[0]?.clientY ?? touchStart) > 35) dismiss();
    }, { passive: true });
    const overflow = document.createElement('span');
    overflow.className = 'cx-heads-up-overflow';
    overflow.setAttribute('aria-label', 'More notifications available in Messages');
    overflow.textContent = overflowCount ? '+' + overflowCount + ' more · inbox' : '';
    overflow.hidden = overflowCount === 0;
    panel.append(open, close, overflow);
    holder.replaceChildren(panel);
    active = { event, panel, overflow };
    exiting = false;
    timer = setTimeout(dismiss, DISPLAY_MS);
    return true;
  }
  function pump() {
    if (active || exiting || document.hidden) return;
    while (queue.length && Date.now() - queue[0].createdAt > 60000) queue.shift();
    if (queue.length) draw(queue.shift());
  }
  function dismiss() {
    if (!active || exiting) return;
    clearTimeout(timer); timer = null;
    exiting = true;
    const previous = active;
    previous.panel.classList.remove('cx-heads-up--enter');
    previous.panel.classList.add('cx-heads-up--exit');
    clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      if (active === previous) active = null;
      previous.panel.remove();
      exiting = false;
      pump();
    }, EXIT_MS);
  }
  function openNotification(event) {
    // Other app modules may intercept this event to open the exact persisted DM/reel.
    const target = new CustomEvent('crushx:open-incoming-notification', {
      detail: { id: event.id, type: event.type, senderId: event.senderId, reelId: event.reelId },
      cancelable: true
    });
    if (!document.dispatchEvent(target)) return;
    const state = appState();
    const knownUser = state?.users?.some(u => u.id === event.senderId);
    if (knownUser && typeof navigate === 'function') {
      navigate('messages', event.senderId);
      return;
    }
    if (event.type === 'reel' && event.reelId && state?.reels?.some(r => r.id === event.reelId)) {
      if (typeof navigate === 'function') navigate('reels');
      const reelButton = [...document.querySelectorAll('[data-like]')].find(el => el.dataset.like === event.reelId);
      reelButton?.closest('article')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } else if (typeof navigate === 'function') navigate('messages');
  }
  function notify(payload) {
    const event = normalize(payload);
    if (!event || seen.has(event.id)) return false;
    seen.add(event.id);
    if (seen.size > 200) seen.delete(seen.values().next().value);
    // Unread state is updated even when a burst is silenced; never discard a message.
    if (['message', 'reel', 'post', 'story'].includes(event.type)) {
      document.dispatchEvent(new CustomEvent('crushx:heads-up-accepted', {
        detail: { id: event.id, type: event.type, senderId: event.senderId, recipientId: event.recipientId }
      }));
    }
    if (!preferences.banners) return true;
    const now = Date.now();
    if (!active && !queue.length && !exiting && now >= burstLockedUntil) {
      burstCount = 0;
      overflowCount = 0;
    }
    if (burstCount >= MAX_BANNERS) {
      overflowCount++;
      if (active) {
        active.overflow.hidden = false;
        active.overflow.textContent = '+' + overflowCount + ' more · inbox';
      }
      return true;
    }
    burstCount++;
    if (burstCount === MAX_BANNERS) burstLockedUntil = now + BURST_COOLDOWN_MS;
    queue.push(event);
    pump();
    return true;
  }
  function setPreferences(next) {
    if (!next || typeof next !== 'object') return getPreferences();
    const changedBanners = typeof next.banners === 'boolean' && preferences.banners !== next.banners;
    const changedPreview = typeof next.previewText === 'boolean' && preferences.previewText !== next.previewText;
    if (typeof next.banners === 'boolean') preferences.banners = next.banners;
    if (typeof next.previewText === 'boolean') preferences.previewText = next.previewText;
    if (changedBanners || changedPreview) {
      // Discard already-rendered sensitive text before reflecting new privacy settings.
      clearTimeout(timer); clearTimeout(exitTimer); timer = null; exitTimer = null;
      active?.panel.remove(); active = null; exiting = false;
      if (!preferences.banners || changedPreview) queue.length = 0;
      overflowCount = 0;
      if (preferences.banners) pump();
    }
    return getPreferences();
  }
  function getPreferences() { return { banners: preferences.banners, previewText: preferences.previewText }; }

  document.addEventListener('crushx:incoming-notification', e => notify(e.detail));
  document.addEventListener('crushx:incoming-message', e => notify(e.detail));
  document.addEventListener('crushx:incoming-reel', e => notify({ ...(e.detail || {}), type: 'reel' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });
  document.addEventListener('crushx:session-ended', () => {
    queue.length = 0; seen.clear(); clearTimeout(timer); clearTimeout(exitTimer);
    burstCount = 0; burstLockedUntil = 0; overflowCount = 0;
    active?.panel.remove(); active = null; exiting = false;
    preferences.banners = true; preferences.previewText = true;
  });
  window.CrushXHeadsUp = Object.freeze({ notify, dismiss, setPreferences, getPreferences });
})();
