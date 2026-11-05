/* Crush.X Notes: pure validation helpers. No account/network side effects. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.CrushXNotesModel = model;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';
  const LIFETIME_MS = 24 * 60 * 60 * 1000;
  const MAX_LENGTH = 60;
  const audiences = new Set(['friends', 'close']);
  const colors = new Set(['pink', 'purple', 'blue', 'mint']);
  const songs = new Set(['soft-glow', 'city-lights', 'golden-hour']);
  const stickers = new Set(['', 'sparkle', 'heart', 'fire', 'smile']);
  const safeText = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

  function clean(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
      text: safeText(value.text, MAX_LENGTH),
      audience: audiences.has(value.audience) ? value.audience : 'friends',
      color: colors.has(value.color) ? value.color : 'pink',
      song: songs.has(value.song) ? value.song : '',
      sticker: stickers.has(value.sticker) ? value.sticker : '',
      location: safeText(value.location, 70),
      tag: /^[a-zA-Z0-9_.-]{1,128}$/.test(value.tag || '') ? value.tag : ''
    };
  }

  function publish(input, now = Date.now()) {
    const item = clean(input);
    if (!item.text && !item.song && !item.sticker) return null;
    if (!Number.isFinite(now) || now < 0) return null;
    return { ...item, createdAt: now, expiresAt: now + LIFETIME_MS };
  }

  function active(input, now = Date.now()) {
    if (!input || typeof input !== 'object') return null;
    const createdAt = Number(input.createdAt), expiresAt = Number(input.expiresAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;
    if (createdAt > now || expiresAt <= now || expiresAt !== createdAt + LIFETIME_MS) return null;
    const note = publish(input, createdAt);
    return note && note.expiresAt === expiresAt ? note : null;
  }

  function sanitizeFriends(input, ids) {
    const valid = new Set(Array.isArray(ids) ? ids : []);
    return [...new Set(Array.isArray(input) ? input : [])]
      .filter(id => typeof id === 'string' && valid.has(id) && id !== 'me')
      .slice(0, 100);
  }

  return Object.freeze({ LIFETIME_MS, MAX_LENGTH, clean, publish, active, sanitizeFriends });
});
