/* Crush.X Explore/Profile media tiles: poster/first-frame only, with a corner view count.
 * No center play icon, no fabricated views, no click interception.
 */
(function () {
  'use strict';
  const TILE_SELECTOR = '.explore-grid button[data-cx-item-kind], .app-media-grid button[data-cx-item-kind], .explore-grid button:has(video), .app-media-grid button:has(video)';
  const BLOCKED = '.reels-deck, .story-viewer, .story-studio, .ss-editor, .cx-player, .cxmusic-modal, .reel-visual';
  const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const REEL = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7 5 3h14l2 4M8 3l3 4m4-4 3 4M3 11h18"/></svg>';

  function formatViews(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n < 1000) return String(Math.floor(n));
    if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
    return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  function isThumbnail(video) {
    return Boolean(video && video.tagName === 'VIDEO' && video.closest?.('.explore-grid button, .app-media-grid button') && !video.closest?.(BLOCKED));
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {formatViews, isThumbnail, EYE, REEL};
  }
  if (typeof document === 'undefined') return;

  // Decode frames only for near-viewport cards; never prefetch an entire video grid.
  const frameObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          frameObserver.unobserve(entry.target);
          const video = entry.target;
          if (!video.isConnected) continue;
          video.setAttribute('preload', 'auto');
          if (video.readyState < 2) {
            try { video.load(); } catch { /* Unsupported or unavailable media remains neutral. */ }
          }
        }
      }, {rootMargin:'220px'})
    : null;

  const loadFrame = video => {
    const tile = video.closest('button');
    if (!tile || video.dataset.cxGridFrameInit === '1') return;
    video.dataset.cxGridFrameInit = '1';
    const poster = video.getAttribute('poster') || tile.dataset.cxThumbnail;
    if (poster) {
      if (!video.getAttribute('poster')) video.setAttribute('poster', poster);
      tile.classList.add('cx-mono-has-frame');
      video.setAttribute('preload', 'none');
      return;
    }
    // Show a decoded, paused video frame, rather than the browser's play glyph.
    // A real server-generated poster is preferable and avoids per-grid video requests.
    let didSeek = false;
    const show = () => {
      if (!video.isConnected || video.readyState < 2) return;
      video.pause();
      tile.classList.add('cx-mono-has-frame');
    };
    video.addEventListener('loadeddata', show);
    video.addEventListener('seeked', show);
    video.addEventListener('loadedmetadata', () => {
      if (didSeek || !Number.isFinite(video.duration) || video.duration <= 0) return;
      didSeek = true;
      try { video.currentTime = Math.min(0.5, video.duration / 4); } catch {}
    });
    video.addEventListener('error', () => tile.classList.add('cx-mono-fallback'));
    video.removeAttribute('autoplay');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('preload', 'none');
    if (video.readyState >= 2) show();
    if (frameObserver) frameObserver.observe(video);
    else {
      video.setAttribute('preload', 'auto');
      if (video.readyState < 2) { try { video.load(); } catch {} }
    }
  };

  function enhance(tile) {
    if (!tile?.matches?.('button') || tile.closest(BLOCKED)) return;
    const video = tile.querySelector('video');
    if (!video && tile.dataset.cxItemKind !== 'reel') return;
    if (video && !isThumbnail(video)) return;
    tile.classList.add('cx-mono-video-tile');
    tile.querySelectorAll(':scope > .cx-mono-play-mark').forEach(mark => mark.remove());
    if (video) {
      video.classList.add('cx-mono-video-preview');
      loadFrame(video);
    }
    const reel = tile.dataset.cxItemKind === 'reel';
    if (reel && !tile.querySelector(':scope > .cx-reel-mark')) {
      const mark = document.createElement('span');
      mark.className = 'cx-reel-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = REEL;
      tile.appendChild(mark);
    }
    if (tile.dataset.cxItemKind === 'post' && !video) return;
    const formatted = formatViews(tile.dataset.cxViews);
    let badge = tile.querySelector(':scope > .cx-view-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'cx-view-badge';
      tile.appendChild(badge);
    }
    const label = formatted === null ? 'View count unavailable' : Number(tile.dataset.cxViews).toLocaleString() + ' views';
    badge.setAttribute('aria-label', label);
    badge.setAttribute('title', label);
    badge.innerHTML = EYE + (formatted === null ? '' : '<span class="cx-view-number">' + formatted + '</span>');
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(TILE_SELECTOR)) enhance(root);
    root.querySelectorAll?.(TILE_SELECTOR).forEach(enhance);
  }
  function init() {
    scan(document);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) scan(node);
    });
    observer.observe(document.body, {subtree: true, childList: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
