/* Crush.X unified expression picker: text-safe, accessible and reusable.
 * GIF discovery requires a licensed provider; the existing Story Studio GIF upload stays available.
 */
(() => {
  'use strict';
  if (window.CrushXExpressionPicker) return;

  const sections = [
    { label: 'Smileys', terms: 'smile happy face laugh love sad cry wink cool', icons: '😀 😃 😄 😁 😆 😅 😂 🤣 🥹 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤩 🥳 😏 😔 😢 😭 😤 😡 🥺 😱 🤗 🤔 🫶 🥲 😴 🤭 😬 🫠'.split(' ') },
    { label: 'Hearts', terms: 'heart love romance sparkle flower', icons: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💌 💟 ❣️ 💔 ❤️‍🔥 ❤️‍🩹 🌹 🌸 🌷 💐 ✨ 🌟 ⭐ 💫'.split(' ') },
    { label: 'Gestures', terms: 'hands clap thumbs high five pray peace', icons: '👍 👎 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👋 🫰 🫵 💪 👀 🫂 🥂'.split(' ') },
    { label: 'Animals', terms: 'pets animal cat dog nature', icons: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐸 🐵 🐣 🦋 🐝 🐢 🐬 🦄 🌈 🍀 🌻'.split(' ') },
    { label: 'Food', terms: 'food sweets coffee birthday cake', icons: '🍕 🍔 🍟 🌮 🍣 🍩 🍪 🍫 🍿 🍓 🍒 🍉 🥭 🍦 🍰 🎂 ☕ 🧋 🍹'.split(' ') },
    { label: 'Fun', terms: 'party sports music celebration travel', icons: '🎉 🎊 🎈 🎁 🎀 🎶 🎵 🎤 🎧 🎸 🎮 🏆 ⚽ 🏀 🏖️ 🌅 🌙 ☀️ 💯 🔥 💥 🚀 👑 💎 📸'.split(' ') }
  ];
  const stickers = [
    { label: 'So cute', text: '🥹🩷', terms: 'cute love heart' }, { label: 'Love it', text: '😍💖', terms: 'love romantic' },
    { label: 'Big laugh', text: '🤣🤣', terms: 'funny laugh' }, { label: 'Fire', text: '🔥🔥', terms: 'fire lit cool' },
    { label: 'Celebrate', text: '🥳🎉', terms: 'party happy' }, { label: 'Thank you', text: '🙏💗', terms: 'thank thanks' },
    { label: 'Besties', text: '🫶✨', terms: 'friends heart' }, { label: 'Good vibes', text: '🌈🌸', terms: 'vibes rainbow' },
    { label: 'Royal', text: '👑💎', terms: 'king queen' }, { label: 'Wow', text: '🤩✨', terms: 'wow awesome' },
    { label: 'Sleepy', text: '😴🌙', terms: 'night tired' }, { label: 'Cute pet', text: '🐱💕', terms: 'cat pet' }
  ];
  const candidates = '[data-comment-input], #messageDraft, #captionInput, [data-social-reply-text], [data-social-note], [data-advanced-text], [data-advanced-edit-text], [data-advanced-story-note], [data-cxn-text], textarea:not([readonly]):not([disabled]), [contenteditable="true"]';
  const excluded = '#authOverlay, #confirmationModal, #cx-expression-picker, [data-cx-expression-ignore], [hidden]';
  let active = null;
  let sheet = null;
  let tab = 'emoji';
  let filter = '';
  let start = 0;
  let end = 0;
  let savedRange = null;
  let scheduled = false;
  let gifUploader = null;
  const memoriesKey = 'crushx-expression-recents-v1';
  const recent = (() => {
    try {
      const value = JSON.parse(localStorage.getItem(memoriesKey) || '[]');
      return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 18) : [];
    } catch { return []; }
  })();

  function eligible(node) {
    if (!(node instanceof HTMLElement) || node.closest(excluded)) return false;
    if (node.matches('textarea, input') && (node.readOnly || node.disabled || node.type === 'password')) return false;
    if (node.offsetParent === null && !node.closest('dialog[open]')) return false;
    if (node.matches('input') && !node.hasAttribute('data-comment-input')) return false;
    if (node.closest('#cx-expression-picker')) return false;
    return true;
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll(candidates).forEach(node => {
      if (!eligible(node) || node.dataset.cxExpressionReady === 'true') return;
      node.dataset.cxExpressionReady = 'true';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cx-expression-trigger';
      button.setAttribute('aria-label', 'Open emojis, stickers and GIFs');
      button.setAttribute('title', 'Emojis, stickers and GIFs');
      button.textContent = '☺';
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => open(node));
      node.insertAdjacentElement('afterend', button);
      if (node.matches('textarea')) node.classList.add('cx-expression-textarea');
    });
  }
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function remember(text) {
    const index = recent.indexOf(text);
    if (index >= 0) recent.splice(index, 1);
    recent.unshift(text);
    recent.length = Math.min(recent.length, 18);
    try { localStorage.setItem(memoriesKey, JSON.stringify(recent)); } catch { /* storage optional */ }
  }

  function saveSelection(node) {
    if (node.matches('textarea, input')) {
      start = node.selectionStart ?? node.value.length;
      end = node.selectionEnd ?? start;
      savedRange = null;
    } else {
      const sel = getSelection();
      savedRange = sel && sel.rangeCount && node.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    }
  }

  function insert(text) {
    if (!active || !active.isConnected) { close(); return; }
    const node = active;
    if (node.matches('textarea, input')) {
      const before = node.value.slice(0, start);
      const after = node.value.slice(end);
      const maximum = node.maxLength > -1 ? Math.max(0, node.maxLength - before.length - after.length) : Infinity;
      const allowed = maximum === Infinity ? text : Array.from(text).reduce((s, part) => s.length + part.length <= maximum ? s + part : s, '');
      if (!allowed) { status('Text limit reached.'); return; }
      node.focus({ preventScroll: true });
      node.setRangeText(allowed, start, end, 'end');
      start = end = node.selectionStart;
    } else {
      node.focus({ preventScroll: true });
      const selection = getSelection();
      if (savedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
      if (!document.execCommand('insertText', false, text)) {
        const range = selection && selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        if (selection) { selection.removeAllRanges(); selection.addRange(range); }
      }
      saveSelection(node);
    }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    remember(text);
    close(false);
  }

  function status(value) {
    const region = sheet && sheet.querySelector('[data-cx-exp-status]');
    if (region) region.textContent = value;
  }
  function escapeMarkup(value) {
    return String(value).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  }
  function iconButton(emoji, group) {
    return '<button type="button" class="cx-expression-cell" data-cx-exp-value="' + escapeMarkup(emoji) +
      '" aria-label="Insert ' + escapeMarkup(emoji) + '" title="' + escapeMarkup(group) + '">' + escapeMarkup(emoji) + '</button>';
  }
  function drawGrid() {
    if (!sheet) return;
    const grid = sheet.querySelector('[data-cx-exp-content]');
    const q = filter.trim().toLocaleLowerCase();
    if (tab === 'emoji') {
      const chunks = [];
      if (!q && recent.length) chunks.push('<h3>Recently used</h3><div class="cx-expression-grid">' +
        recent.map(x => iconButton(x, 'Recent')).join('') + '</div>');
      sections.forEach(section => {
        const values = !q || (section.label + ' ' + section.terms).toLocaleLowerCase().includes(q) ?
          section.icons : section.icons.filter(x => x.includes(q));
        if (values.length) chunks.push('<h3>' + section.label + '</h3><div class="cx-expression-grid">' +
          values.map(x => iconButton(x, section.label)).join('') + '</div>');
      });
      grid.innerHTML = chunks.join('') || '<p class="cx-expression-empty">No emojis found.</p>';
    } else if (tab === 'sticker') {
      const matching = stickers.filter(s => !q || (s.label + ' ' + s.terms + ' ' + s.text).toLocaleLowerCase().includes(q));
      grid.innerHTML = '<p class="cx-expression-hint">Tap once to insert a crisp emoji sticker in your text.</p><div class="cx-expression-stickers">' +
        matching.map(s => '<button type="button" class="cx-expression-sticker" data-cx-exp-value="' + escapeMarkup(s.text) +
          '" aria-label="Insert ' + escapeMarkup(s.label) + '"><span aria-hidden="true">' + escapeMarkup(s.text) + '</span><small>' +
          escapeMarkup(s.label) + '</small></button>').join('') + '</div>' +
          (matching.length ? '' : '<p class="cx-expression-empty">No stickers found.</p>');
    } else {
      const storyGif = active && active.closest('dialog')?.querySelector('[data-ss-gif]');
      const available = typeof gifUploader === 'function' || !!storyGif;
      grid.innerHTML = '<div class="cx-expression-gif"><div class="cx-expression-gif-icon">GIF</div><h3>Animated GIFs</h3>' +
        (available ?
          '<p>Add a GIF you own or are allowed to use.</p><button type="button" data-cx-exp-gif-upload class="cx-expression-gif-cta">Choose GIF</button>' :
          '<p>GIF attachments are not available in this text-only composer yet. A licensed GIF search provider and media upload support are required.</p>') +
        '</div>';
    }
    sheet.querySelectorAll('[data-cx-exp-tab]').forEach(button => {
      const selected = button.dataset.cxExpTab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
    });
  }

  function open(node) {
    if (!eligible(node)) return;
    if (sheet) close(false);
    active = node;
    saveSelection(node);
    tab = 'emoji';
    filter = '';
    sheet = document.createElement('div');
    sheet.id = 'cx-expression-picker';
    sheet.className = 'cx-expression-backdrop';
    sheet.innerHTML =
      '<div class="cx-expression-sheet" role="dialog" aria-modal="true" aria-label="Choose emoji, sticker or GIF">' +
        '<div class="cx-expression-top"><strong>Express yourself</strong><button type="button" data-cx-exp-close aria-label="Close picker">×</button></div>' +
        '<input class="cx-expression-search" type="search" placeholder="Search emoji or sticker" aria-label="Search emoji or sticker" data-cx-exp-search autocomplete="off">' +
        '<div class="cx-expression-tabs" role="tablist" aria-label="Expression type">' +
          '<button type="button" data-cx-exp-tab="emoji" role="tab">😊 Emoji</button>' +
          '<button type="button" data-cx-exp-tab="sticker" role="tab">✨ Stickers</button>' +
          '<button type="button" data-cx-exp-tab="gif" role="tab">GIF</button>' +
        '</div><div class="cx-expression-content" data-cx-exp-content></div>' +
        '<p class="cx-expression-status" data-cx-exp-status role="status" aria-live="polite"></p>' +
      '</div>';
    // Native <dialog> elements render in the browser top layer, above page z-indexes.
    // Mount inside the active modal so the picker is not hidden behind Story/Notes editors.
    (node.closest('dialog[open]') || document.body).append(sheet);
    sheet.addEventListener('click', event => {
      if (event.target === sheet || event.target.closest('[data-cx-exp-close]')) { close(); return; }
      const picker = event.target.closest('[data-cx-exp-value]');
      if (picker) { insert(picker.dataset.cxExpValue); return; }
      const tabButton = event.target.closest('[data-cx-exp-tab]');
      if (tabButton) {
        tab = tabButton.dataset.cxExpTab;
        filter = '';
        sheet.querySelector('[data-cx-exp-search]').value = '';
        drawGrid();
        return;
      }
      if (event.target.closest('[data-cx-exp-gif-upload]')) {
        const input = active?.closest('dialog')?.querySelector('[data-ss-gif]');
        if (input) { close(false); input.click(); }
        else if (gifUploader) {
          const dest = active;
          close(false);
          gifUploader(dest);
        }
      }
    });
    sheet.querySelector('[data-cx-exp-search]').addEventListener('input', event => {
      filter = event.target.value;
      drawGrid();
    });
    drawGrid();
    sheet.querySelector('[data-cx-exp-search]').focus({ preventScroll: true });
  }

  function close(refocus = true) {
    const node = active;
    if (sheet) sheet.remove();
    sheet = null;
    active = null;
    if (refocus && node?.isConnected) node.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', event => {
    if (sheet && event.key === 'Escape') { event.preventDefault(); close(); }
  });
  window.CrushXExpressionPicker = Object.freeze({
    refresh: scheduleScan,
    open,
    close,
    registerGifUpload(callback) {
      if (typeof callback !== 'function') throw new TypeError('GIF upload callback must be a function');
      gifUploader = callback;
    }
  });
  function startPicker() {
    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPicker, { once: true });
  else startPicker();
})();