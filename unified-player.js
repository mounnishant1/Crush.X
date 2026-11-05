/* Crush.X unified, lightweight player. Progressive enhancement for ordinary media;
 * Reels/Stories/Editor keep their own gesture and timeline controllers. */
(function () {
  'use strict';
  const SELECTOR = 'video[controls], audio[controls]';
  const EXCLUDED = '.reels-deck, [data-reel-visual], .story-viewer, .story-studio, .explore-grid, .app-media-grid, [data-open-local-item], .cxmusic-modal';

  function timeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds), h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60, remainder = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${remainder}` : `${m}:${remainder}`;
  }
  function shouldEnhance(media) {
    if (!media || media.tagName !== 'VIDEO' || !media.hasAttribute('controls')) return false;
    if (media.dataset.cxUnifiedPlayer === '1' || media.matches('[data-reel-video], [data-cx-story-video]')) return false;
    if (media.closest(EXCLUDED)) return false;
    return true;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {timeLabel, shouldEnhance};
  if (typeof document === 'undefined') return;

  function enhance(video) {
    if (!shouldEnhance(video) || !video.parentNode) return;
    video.dataset.cxUnifiedPlayer = '1';
    const shell = document.createElement('div');
    shell.className = 'cx-player';
    shell.setAttribute('role', 'group');
    shell.setAttribute('aria-label', video.getAttribute('aria-label') || 'Video player');
    video.parentNode.insertBefore(shell, video);
    shell.appendChild(video);
    video.classList.add('cx-player-video');
    video.controls = false;
    video.removeAttribute('controls');

    const controls = document.createElement('div');
    controls.className = 'cx-player-controls';
    controls.innerHTML = '<button type="button" class="cx-player-toggle" aria-label="Play video" title="Play or pause">▶</button>' +
      '<span class="cx-player-clock" aria-label="Playback time">0:00 / 0:00</span>' +
      '<input class="cx-player-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Video playback position" disabled>' +
      '<button type="button" class="cx-player-mute" aria-label="Unmute video" title="Mute or unmute">♪</button>' +
      '<button type="button" class="cx-player-expand" aria-label="Expand video" title="Full screen">⛶</button>';
    const center = document.createElement('button');
    center.className = 'cx-player-center';
    center.type = 'button';
    center.textContent = '▶';
    center.setAttribute('aria-label', 'Play video');
    shell.append(center, controls);
    const toggle = controls.querySelector('.cx-player-toggle');
    const seek = controls.querySelector('.cx-player-seek');
    const mute = controls.querySelector('.cx-player-mute');
    const expand = controls.querySelector('.cx-player-expand');
    const clock = controls.querySelector('.cx-player-clock');
    let scrubbing = false;

    function sync() {
      const playing = !video.paused && !video.ended;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      shell.classList.toggle('is-playing', playing);
      toggle.textContent = playing ? 'Ⅱ' : '▶';
      toggle.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
      center.setAttribute('aria-label', video.ended ? 'Replay video' : 'Play video');
      mute.textContent = video.muted || video.volume === 0 ? '♪̸' : '♪';
      mute.setAttribute('aria-label', video.muted || video.volume === 0 ? 'Unmute video' : 'Mute video');
      clock.textContent = `${timeLabel(video.currentTime)} / ${timeLabel(duration)}`;
      seek.disabled = !duration;
      if (!scrubbing) seek.value = duration ? String(Math.round(video.currentTime / duration * 1000)) : '0';
      seek.style.setProperty('--cx-progress', `${Number(seek.value) / 10}%`);
    }
    function togglePlayback() {
      if (video.paused || video.ended) {
        const playAttempt = video.play();
        if (playAttempt && typeof playAttempt.catch === 'function') playAttempt.catch(sync);
      } else video.pause();
      sync();
    }
    toggle.addEventListener('click', togglePlayback);
    center.addEventListener('click', togglePlayback);
    mute.addEventListener('click', () => { video.muted = !video.muted; sync(); });
    seek.addEventListener('input', () => {
      scrubbing = true;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Number(seek.value) / 1000 * video.duration;
      }
      sync();
    });
    for (const name of ['change', 'pointerup', 'pointercancel', 'blur']) {
      seek.addEventListener(name, () => { scrubbing = false; sync(); });
    }
    expand.addEventListener('click', () => {
      try {
        if (document.fullscreenElement === shell) {
          document.exitFullscreen?.();
        } else if (shell.requestFullscreen) {
          const request = shell.requestFullscreen();
          request?.catch?.(() => video.webkitEnterFullscreen?.());
        } else video.webkitEnterFullscreen?.();
      } catch { /* Keep inline controls available if fullscreen is blocked. */ }
    });
    if (!shell.requestFullscreen && !video.webkitEnterFullscreen) expand.hidden = true;
    shell.addEventListener('keydown', event => {
      if (event.target !== shell || ![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault(); togglePlayback();
    });
    for (const name of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'volumechange', 'emptied', 'seeking']) {
      video.addEventListener(name, sync);
    }
    sync();
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(SELECTOR)) enhance(root);
    root.querySelectorAll?.(SELECTOR).forEach(enhance);
    root.querySelectorAll?.('audio[controls]').forEach(audio => audio.classList.add('cx-player-audio'));
    if (root.matches?.('audio[controls]')) root.classList.add('cx-player-audio');
  }
  function init() {
    scan(document);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) scan(node);
    });
    observer.observe(document.body, {childList:true, subtree:true});
    document.addEventListener('play', event => {
      const started = event.target;
      if (!started.matches?.('video,audio')) return;
      // One active media at a time; no multiple reels/feed/audio playing over one another.
      document.querySelectorAll('video,audio').forEach(media => { if (media !== started && !media.paused) media.pause(); });
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) document.querySelectorAll('video,audio').forEach(media => { if (!media.paused) media.pause(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
