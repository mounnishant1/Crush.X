/* Crush.X Story reference enhancement.
 * Enhances the local sample viewer; does not deliver messages or publish content.
 * Optional story fields: video, reelId, postId, mentions: [{userId}], durationMs.
 */
(function () {
  'use strict';
  if (typeof storyViewerHTML !== 'function' || typeof openSampleStory !== 'function') return;

  const baseHTML = storyViewerHTML;
  const basePaint = storyViewerPaint;
  const baseOpen = openSampleStory;
  let stopClickUntil = 0;
  let gesture = null;

  function currentStory() { return storyViewerStories[storyViewerIndex] || null; }
  function duration() {
    const story = currentStory();
    const ms = Number(story && story.durationMs);
    if (Number.isFinite(ms) && ms >= 2000 && ms <= 60000) return ms;
    const video = storyViewerDialog && storyViewerDialog.querySelector && storyViewerDialog.querySelector('[data-cx-story-video]');
    if (video && Number.isFinite(video.duration) && video.duration > 0) return Math.max(2000, Math.min(60000, video.duration * 1000));
    return story && story.video ? 10000 : storyViewerDuration;
  }
  function label(value) { return escapeHTML(String(value == null ? '' : value)); }
  function activeLink(story, state) {
    if (story.reelId && state.reels.some(item => item.id === story.reelId)) {
      return '<button type="button" class="cx-story-linked" data-cx-story-open="reel" aria-label="Watch full Reel">Watch full Reel ›</button>';
    }
    if (story.postId && state.posts.some(item => item.id === story.postId)) {
      return '<button type="button" class="cx-story-linked" data-cx-story-open="post" aria-label="View full post">View post ›</button>';
    }
    return '';
  }

  storyViewerHTML = function () {
    const story = currentStory();
    const html = baseHTML();
    if (!story) return html;
    const state = getState();
    const user = userById(state, story.userId);
    const media = story.video ? safeMediaUrl(story.video) : safeMediaUrl(story.image);
    const poster = safeMediaUrl(story.image || story.video);
    const video = Boolean(story.video) && media !== '';
    const linked = activeLink(story, state);
    const mentions = Array.isArray(story.mentions) ? story.mentions.slice(0, 5) : [];
    const mentionHTML = mentions.map(mention => {
      const match = state.users.find(person => person.id === mention.userId);
      return match ? '<button type="button" data-cx-story-profile="' + label(match.id) + '" class="cx-story-mention">@' + label(match.username) + '</button>' : '';
    }).join('');
    const mediaHTML = video
      ? '<video data-cx-story-video src="' + media + '" poster="' + poster + '" muted playsinline preload="metadata" aria-label="Story video"></video>'
      : '<img class="cx-story-main" src="' + media + '" alt="Story by ' + label(user && user.username || 'creator') + '" draggable="false">';
    const replacement = '<div class="sv-photo cx-story-stage" data-sv-stage tabindex="0" role="button" aria-label="Story; tap edges to navigate and hold to pause">'
      + '<div class="cx-story-background" aria-hidden="true"><img src="' + poster + '" alt=""></div>'
      + '<div class="cx-story-media">' + mediaHTML + '</div>'
      + '<div class="cx-story-stickers">' + mentionHTML + linked + '</div>'
      + '</div>';
    let enhanced = html.replace(/<div class="sv-photo"[\s\S]*?<\/div>/, replacement);
    if (user && user.id !== state.currentUserId) {
      enhanced = enhanced.replace('<button data-sv="pause"', '<button type="button" class="cx-story-follow" data-cx-story-follow aria-label="' + (user.following ? 'Following' : 'Follow') + ' ' + label(user.username) + '">' + (user.following ? 'Following' : 'Follow') + '</button><button data-sv="pause"');
    }
    return enhanced;
  };

  storyViewerProgress = function () {
    if (!storyViewerDialog) return;
    const limit = duration();
    storyViewerDialog.querySelectorAll('[data-sv-progress]').forEach((bar, i) => {
      bar.style.width = (i < storyViewerIndex ? 100 : i > storyViewerIndex ? 0 : Math.min(100, storyViewerElapsed / limit * 100)) + '%';
    });
  };

  storyViewerPaint = function () {
    basePaint();
    const video = storyViewerDialog && storyViewerDialog.querySelector && storyViewerDialog.querySelector('[data-cx-story-video]');
    if (!video) return;
    if (storyViewerPaused || storyViewerHold || document.hidden) {
      if (typeof video.pause === 'function') video.pause();
      return;
    }
    video.onended = function () { if (storyViewerDialog) storyViewerMove(1); };
    if (typeof video.play === 'function') {
      const result = video.play();
      if (result && typeof result.catch === 'function') result.catch(() => {
        if (!storyViewerDialog) return;
        storyViewerPaused = true;
        storyViewerStatus = 'Video needs a tap to play. Your story is paused.';
        const notice = storyViewerDialog.querySelector('.sv-notice');
        if (notice) notice.textContent = storyViewerStatus;
      });
    }
  };

  storyViewerTick = function () {
    if (!storyViewerDialog) return;
    const now = Date.now();
    const elapsed = Math.min(250, Math.max(0, now - storyViewerLastTick));
    storyViewerLastTick = now;
    const video = storyViewerDialog.querySelector && storyViewerDialog.querySelector('[data-cx-story-video]');
    if (storyViewerPaused || storyViewerHold || document.hidden) {
      if (video && typeof video.pause === 'function') video.pause();
      return;
    }
    if (video && video.paused && typeof video.play === 'function') {
      const result = video.play();
      if (result && typeof result.catch === 'function') result.catch(() => { storyViewerPaused = true; });
    }
    storyViewerElapsed += elapsed;
    if (video && video.readyState >= 1 && video.currentTime > 0) storyViewerElapsed = video.currentTime * 1000;
    if (storyViewerElapsed >= duration()) return storyViewerMove(1);
    storyViewerProgress();
  };

  function openLinked(kind) {
    const story = currentStory();
    const state = getState();
    if (!story) return;
    if (kind === 'reel' && state.reels.some(item => item.id === story.reelId)) {
      const id = story.reelId;
      closeStoryViewer();
      openGridMedia(id);
    } else if (kind === 'post' && state.posts.some(item => item.id === story.postId)) {
      const id = story.postId;
      closeStoryViewer();
      showLocalItem(id);
    }
  }
  function openProfile(userId) {
    const state = getState();
    if (!state.users.some(user => user.id === userId)) return;
    appProfileReturnTab = state.activeTab;
    appProfileOpenedInSession = true;
    closeStoryViewer();
    navigate('profile', userId === state.currentUserId ? null : userId);
  }

  openSampleStory = function (id) {
    baseOpen(id);
    const dialog = storyViewerDialog;
    if (!dialog) return;
    dialog.addEventListener('click', event => {
      if (Date.now() < stopClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const button = event.target && event.target.closest && event.target.closest('[data-cx-story-open],[data-cx-story-profile],[data-cx-story-follow]');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (button.dataset.cxStoryOpen) return openLinked(button.dataset.cxStoryOpen);
      if (button.dataset.cxStoryProfile) return openProfile(button.dataset.cxStoryProfile);
      if (button.hasAttribute('data-cx-story-follow')) {
        const story = currentStory();
        const state = getState();
        const person = story && state.users.find(user => user.id === story.userId);
        if (!person || person.id === state.currentUserId) return;
        person.following = !person.following;
        saveState(state);
        storyViewerStatus = 'Follow change saved in this browser preview only.';
        storyViewerPaint();
      }
    }, true);
    dialog.addEventListener('pointerdown', event => {
      if (!event.target || !event.target.closest || !event.target.closest('[data-sv-stage]')) return;
      gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, time:Date.now()};
    }, true);
    dialog.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      const held = Date.now() - gesture.time > 300;
      gesture = null;
      if (dy > 75 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        stopClickUntil = Date.now() + 450;
        event.preventDefault(); event.stopImmediatePropagation();
        closeStoryViewer(); return;
      }
      if (held && Math.abs(dx) < 25 && Math.abs(dy) < 25) {
        stopClickUntil = Date.now() + 450;
      }
    }, true);
    dialog.addEventListener('pointercancel', () => { gesture = null; }, true);
    dialog.addEventListener('visibilitychange', () => { storyViewerLastTick = Date.now(); });
  };
})();