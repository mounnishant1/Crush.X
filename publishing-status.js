/* Crush.X Home publishing receipt feedback.
 * Only explicit authenticated publishing adapters may emit success receipts.
 * Publishing UI accepts only explicit signals from a verified publishing integration.
 */
(function () {
  'use strict';

  var priorRenderApp = window.renderApp;
  if (typeof priorRenderApp !== 'function') return;

  var jobs = new Map();
  var waitingNotice = null;
  var toastTimeout = 0;
  var toastDelay = 0;

  function homeActive() {
    try { return getState().activeTab === 'home'; }
    catch (_) { return false; }
  }

  function normalizeKind(kind) {
    return ['story', 'post', 'reel'].includes(kind) ? kind : 'story';
  }

  // Existing Reels follow + scrub controls are owned by app-improvements.js.

  function activeJob() {
    var entries = Array.from(jobs.values());
    return entries.length ? entries[entries.length - 1] : null;
  }
  function progressElement() {
    var header = document.querySelector('#app .app-header');
    if (!homeActive() || !header) return null;
    var element = header.querySelector('.cx-home-publishing');
    if (!element) {
      element = document.createElement('div');
      element.className = 'cx-home-publishing';
      var label = document.createElement('span');
      label.className = 'cx-publish-label';
      var track = document.createElement('div');
      track.className = 'cx-publish-track';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      var fill = document.createElement('span');
      fill.className = 'cx-publish-fill';
      track.appendChild(fill);
      element.append(label, track);
      header.appendChild(element);
    }
    return element;
  }

  function renderPublishing() {
    var job = activeJob();
    var element = progressElement();
    if (!element) return;
    if (!job) { element.remove(); return; }
    var kind = job.kind.charAt(0).toUpperCase() + job.kind.slice(1);
    element.querySelector('.cx-publish-label').textContent = kind + ' publishing…';
    var track = element.querySelector('.cx-publish-track');
    track.setAttribute('aria-label', kind + ' publishing');
    if (job.percent === null) {
      track.removeAttribute('aria-valuenow');
      track.setAttribute('aria-valuetext', 'Publishing in progress');
      element.classList.remove('cx-publish-measured');
    } else {
      track.setAttribute('aria-valuenow', String(job.percent));
      track.setAttribute('aria-valuetext', job.percent + ' percent uploaded, awaiting publish confirmation');
      element.classList.add('cx-publish-measured');
      element.style.setProperty('--cx-upload-progress', job.percent + '%');
    }
  }

  function showNotice(text, success) {
    if (!homeActive()) {
      waitingNotice = { text: text, success: success, until: Date.now() + 12000 };
      return;
    }
    clearTimeout(toastTimeout);
    clearTimeout(toastDelay);
    document.querySelector('.cx-publish-toast')?.remove();
    var notice = document.createElement('div');
    notice.className = 'cx-publish-toast';
    notice.classList.toggle('cx-publish-failed', !success);
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    var mark = document.createElement('span');
    mark.className = 'cx-toast-mark';
    mark.textContent = success ? '✓' : '!';
    var message = document.createElement('span');
    message.textContent = text;
    notice.append(mark, message);
    document.body.appendChild(notice);
    toastTimeout = window.setTimeout(function () {
      notice.classList.add('cx-toast-exit');
      toastDelay = window.setTimeout(function () { notice.remove(); }, 260);
    }, 3200);
  }

  function refreshUI() {
    renderPublishing();
    if (homeActive() && waitingNotice) {
      var note = waitingNotice;
      waitingNotice = null;
      if (note.until >= Date.now()) showNotice(note.text, note.success);
    }
  }

  // The caller must provide a unique ID and start this only after a real
  // network publishing request has actually started. Never use a fake timer.
  function start(payload) {
    if (!payload || typeof payload.id !== 'string' || !payload.id.trim()) return false;
    var id = payload.id.trim();
    if (jobs.has(id)) return false;
    jobs.set(id, { id: id, kind: normalizeKind(payload.kind), percent: null });
    if (payload.goHome !== false && !homeActive() && typeof window.navigate === 'function') {
      window.navigate('home');
    }
    refreshUI();
    return true;
  }

  // Percent is real upload progress; 100% of bytes is NOT published yet.
  // Keep the Home line until the server confirms that the content was published.
  function progress(id, percent) {
    var job = jobs.get(id);
    if (!job || !Number.isFinite(percent)) return false;
    job.percent = Math.min(99, Math.max(0, Math.round(percent)));
    renderPublishing();
    return true;
  }

  function complete(id) {
    var job = jobs.get(id);
    if (!job) return false;
    jobs.delete(id);
    renderPublishing();
    showNotice('Your ' + job.kind + ' published', true);
    return true;
  }

  function fail(id) {
    var job = jobs.get(id);
    if (!job) return false;
    jobs.delete(id);
    renderPublishing();
    showNotice('Your ' + job.kind + ' could not be published. Try again.', false);
    return true;
  }

  window.CrushXPublishFlow = Object.freeze({
    start: start,
    progress: progress,
    complete: complete,
    fail: fail
  });

  document.addEventListener('crushx:publish-start', function (event) { start(event.detail); });
  document.addEventListener('crushx:publish-progress', function (event) {
    if (event.detail) progress(event.detail.id, event.detail.percent);
  });
  document.addEventListener('crushx:publish-success', function (event) {
    if (event.detail) complete(event.detail.id);
  });
  document.addEventListener('crushx:publish-error', function (event) {
    if (event.detail) fail(event.detail.id);
  });

  window.renderApp = function () {
    var result = priorRenderApp.apply(this, arguments);
    refreshUI();
    return result;
  };
  document.addEventListener('DOMContentLoaded', refreshUI);
  window.addEventListener('pagehide', function () {
    clearTimeout(toastTimeout);
    clearTimeout(toastDelay);
  });
})();
