/* Crush.X: tiny monochrome play glyph on video thumbnails.
 * The video stays in the DOM for normal navigation/playback.
 * Without a poster, hide the old giant grey/black preview graphic.
 */
(function () {
  'use strict';
  const TILE_VIDEO = [
    '.explore-grid button video',
    '.app-media-grid button video',
    'button[data-open-local-item] video',
    '.search-media-grid button video',
    '.profile-reels-grid button video',
    '.reels-grid button video'
  ].join(', ');
  const BLOCKED = '.reels-deck, .story-viewer, .story-studio, .ss-editor, .cx-player, .cxmusic-modal, .reel-visual';
  const GLYPH = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"><path d="m9 5 11 7-11 7V5Z" fill="currentColor"/></svg>';

  function isThumbnail(video) {
    if (!video || video.tagName !== 'VIDEO' || !video.matches?.(TILE_VIDEO)) return false;
    if (video.closest?.(BLOCKED)) return false;
    return Boolean(video.closest?.('button'));
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {isThumbnail, TILE_VIDEO, GLYPH};
  }
  if (typeof document === 'undefined') return;

  function decorate(video) {
    if (!isThumbnail(video)) return;
    const tile = video.closest('button');
    if (!tile) return;
    tile.classList.add('cx-mono-video-tile');
    video.classList.add('cx-mono-video-preview');
    if (video.hasAttribute('poster') && video.getAttribute('poster')?.trim()) {
      tile.classList.add('cx-mono-has-poster');
    } else {
      tile.classList.remove('cx-mono-has-poster');
      // Grid thumbnails should not download a clip merely for a huge placeholder frame.
      video.setAttribute('preload', 'none');
    }
    if (tile.querySelector(':scope > .cx-mono-play-mark')) return;
    const mark = document.createElement('span');
    mark.className = 'cx-mono-play-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = GLYPH;
    tile.appendChild(mark);
  }

  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(TILE_VIDEO)) decorate(root);
    root.querySelectorAll?.(TILE_VIDEO).forEach(decorate);
  }

  function init() {
    scan(document);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) scan(node);
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else init();
})();
