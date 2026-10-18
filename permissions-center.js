/* Crush.X permission center. Browser permissions are authoritative; never cache a grant.
   Only explicit user actions request access. Does not impersonate an Android system dialog. */
(function (root) {
  'use strict';
  const NAMES = ['camera', 'microphone', 'location', 'notifications', 'photos'];
  const META = {
    camera: {title: 'Camera', why: 'Photos, video and AR lenses', browser: 'camera'},
    microphone: {title: 'Microphone', why: 'Record videos and voice clips', browser: 'microphone'},
    location: {title: 'Location', why: 'Add a location to a post or story', browser: 'geolocation'},
    notifications: {title: 'Notifications', why: 'Alerts after notification delivery is connected', browser: 'notifications'},
    photos: {title: 'Photos & videos', why: 'Only files you choose', browser: null}
  };
  let dialog = null;
  let busy = false;

  function supported(kind) {
    if (kind === 'camera' || kind === 'microphone') return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
    if (kind === 'location') return !!navigator.geolocation && !!window.isSecureContext;
    if (kind === 'notifications') return 'Notification' in window && window.isSecureContext;
    return kind === 'photos';
  }
  async function state(kind) {
    if (!NAMES.includes(kind)) throw new Error('Unknown permission');
    if (kind === 'photos') return 'picker';
    if (!supported(kind)) return 'unavailable';
    if (kind === 'notifications') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const result = await navigator.permissions.query({name: META[kind].browser});
        if (result && ['granted', 'prompt', 'denied'].includes(result.state)) return result.state;
      } catch (_) { /* browser may not expose the camera/mic permission descriptor */ }
    }
    return 'unknown';
  }
  function readMessage(s) {
    return {
      granted: 'Allowed by your device or browser',
      denied: 'Blocked in device / browser settings',
      prompt: 'Ask when you use it',
      unknown: 'Status unavailable; the browser decides',
      picker: 'File picker; no permanent access',
      unavailable: 'Not supported in this browser'
    }[s] || 'Not available';
  }
  function escaped(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  }
  function showText(message) {
    if (!dialog) return;
    const node = dialog.querySelector('[data-permission-message]');
    if (node) node.textContent = message;
  }
  async function refresh() {
    if (!dialog || !dialog.isConnected) return;
    for (const kind of NAMES) {
      const row = dialog.querySelector('[data-permission-kind="' + kind + '"]');
      if (!row) continue;
      const s = await state(kind);
      if (!dialog || !dialog.isConnected) return;
      const status = row.querySelector('[data-permission-status]');
      if (status) status.textContent = readMessage(s);
      const action = row.querySelector('button[data-permission-request]');
      if (!action) continue;
      if (kind === 'photos') {
        action.textContent = 'Open Create';
      } else if (s === 'granted') {
        action.textContent = 'Allowed';
      } else if (s === 'denied') {
        action.textContent = 'How to enable';
      } else if (s === 'unavailable') {
        action.textContent = 'Unavailable';
      } else if (kind === 'notifications') {
        action.textContent = 'Allow alerts';
      } else {
        action.textContent = 'Allow';
      }
      action.disabled = busy || s === 'granted' || s === 'unavailable';
    }
  }
  async function request(kind) {
    if (busy || !NAMES.includes(kind)) return;
    if (kind === 'photos') {
      close();
      if (typeof navigate === 'function') navigate('create');
      return;
    }
    const s = await state(kind);
    if (s === 'granted') return refresh();
    if (s === 'unavailable') { showText('This feature requires a secure, compatible browser or native app.'); return refresh(); }
    if (s === 'denied') {
      showText('Access is blocked. Open your phone Settings > Apps > Crush.X > Permissions, or your browser site settings, and allow it there. Then return to Crush.X. We cannot override the device setting.');
      return refresh();
    }
    // Do not ask for push notification permission if there is no delivery backend.
    if (kind === 'notifications' && !root.CrushXPushNotificationsEnabled) {
      showText('Live notification delivery is not connected. No permission request was sent.');
      return refresh();
    }
    if ((kind === 'camera' || kind === 'microphone') && !supported(kind)) return refresh();
    busy = true;
    showText('Waiting for your device or browser…');
    await refresh();
    try {
      if (kind === 'camera' || kind === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({video: kind === 'camera', audio: kind === 'microphone'});
        try { stream.getTracks().forEach(track => track.stop()); }
        catch (e) { /* best-effort release */ }
      } else if (kind === 'location') {
        // Permission check only; do not store coordinates, request precision, or upload location.
        await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          () => resolve(), reject, {enableHighAccuracy: false, maximumAge: 0, timeout: 10000}
        ));
      } else if (kind === 'notifications') {
        await Notification.requestPermission();
      }
      showText('Permission response received. Android and the browser decide its duration.');
    } catch (error) {
      showText(error && error.name === 'NotAllowedError' ? 'Access was declined or blocked. Use device settings if needed.' :
        'Access was not available: ' + (error && error.message ? error.message : 'unknown error'));
    } finally {
      busy = false;
      await refresh();
    }
  }
  function close() {
    if (!dialog) return;
    const old = dialog;
    dialog = null;
    if (old.open && typeof old.close === 'function') old.close();
    old.remove();
  }
  function open() {
    if (dialog) return;
    const opener = document.activeElement;
    const el = document.createElement('dialog');
    el.className = 'cx-permissions-dialog app-dialog';
    el.setAttribute('aria-label', 'Privacy and permissions');
    el.setAttribute('data-app-dialog', 'true');
    el.innerHTML = '<section><header class="flex items-center justify-between gap-3 mb-4"><h2 class="text-xl font-bold">Privacy & Permissions</h2><button type="button" data-permission-close class="rounded-lg border px-3 py-2">Close</button></header>' +
      '<p class="text-sm text-slate-500 mb-4">Access is requested only when you choose to use a feature. Previously allowed access is checked again, not requested repeatedly.</p>' +
      NAMES.map(kind => '<div data-permission-kind="' + kind + '" class="flex items-center justify-between gap-3 rounded-xl border p-3 mb-2"><div><strong>' +
        escaped(META[kind].title) + '</strong><p class="text-xs text-slate-500">' + escaped(META[kind].why) +
        '</p><p data-permission-status role="status" class="text-xs">Checking…</p></div><button type="button" data-permission-request="' +
        kind + '" class="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-semibold shrink-0">Check</button></div>').join('') +
      '<p data-permission-message aria-live="polite" class="text-sm mt-3"></p>' +
      '<p class="text-xs text-slate-500 mt-3">“Only this time”, permanent allowances and blocked states are controlled by Android / your browser, not by Crush.X.</p></section>';
    document.body.appendChild(el);
    dialog = el;
    el.addEventListener('click', event => {
      if (event.target === el) close();
      const button = event.target.closest && event.target.closest('[data-permission-request]');
      if (button && el.contains(button)) void request(button.dataset.permissionRequest);
    });
    el.querySelector('[data-permission-close]').addEventListener('click', close);
    el.addEventListener('close', () => { if (dialog === el) dialog = null; el.remove(); if (opener && opener.isConnected) opener.focus(); });
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    void refresh();
  }
  // bindRepairEvents is invoked after every view render. Don't introduce new nav tabs.
  if (typeof bindRepairEvents === 'function') {
    const previous = bindRepairEvents;
    bindRepairEvents = function () {
      previous();
      document.getElementById('privacyPermissionsButton')?.addEventListener('click', open);
    };
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  root.CrushXPermissions = Object.freeze({open, close, state, refresh, request});
})(window);
