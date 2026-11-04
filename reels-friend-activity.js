/* Crush.X Reels friend activity. Browser-preview integration; never represents remote delivery. */
(function () {
  'use strict';
  var originalRenderReels = renderReels;
  var originalBindReelEvents = bindRepairEvents;
  var friendsOnly = false;
  var returnReelId = null;
  var activeSheet = null;

  function activityFor(state, reelId) {
    var source = null;
    var feed = window.CrushXFriendActivityFeed;
    if (feed && typeof feed.getForReel === 'function') {
      try {
        source = feed.getForReel(reelId);
        if (!Array.isArray(source)) source = []; // A configured provider must not silently fall back to demo likes.
      } catch (error) { source = []; }
    }
    if (source === null) {
      // Explicit demo fixtures, not verified likes or reposts.
      source = reelId === 'reel_1' ? [
        { actorId: 'user_1', type: 'like', sample: true },
        { actorId: 'user_3', type: 'repost', sample: true }
      ] : [];
    }
    var seen = new Set();
    return source.filter(function (event) {
      return event && typeof event.actorId === 'string' &&
        (event.type === 'like' || event.type === 'repost');
    }).map(function (event) {
      var actor = userById(state, event.actorId);
      return actor && actor.id !== state.currentUserId && actor.following === true
        ? { actorId: actor.id, actor: actor, type: event.type, sample: event.sample === true || source[0]?.sample === true }
        : null;
    }).filter(function (activity) {
      if (!activity) return false;
      var key = activity.actorId + ':' + activity.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
  }

  function activityDock(state, reelId) {
    var activities = activityFor(state, reelId);
    if (!activities.length) return '';
    var buttons = activities.map(function (activity) {
      var actor = activity.actor;
      var label = activity.type === 'repost' ? 'reposted' : 'liked';
      var badge = activity.type === 'repost' ? '↻' : '♥';
      return '<button type="button" class="cx-friend-avatar" data-cx-friend-reel="' +
        escapeHTML(reelId) + '" data-cx-friend-actor="' + escapeHTML(actor.id) +
        '" data-cx-friend-type="' + activity.type + '" aria-label="Reply to @' +
        escapeHTML(actor.username) + ' who ' + label + ' this reel">' +
        '<img src="' + safeMediaUrl(actor.avatar) + '" alt="" loading="lazy">' +
        '<span class="cx-friend-badge" aria-hidden="true">' + badge + '</span></button>';
    }).join('');
    return '<div class="cx-friends-dock" role="group" aria-label="Friends who liked or reposted this Reel">' +
      buttons + '</div>';
  }

  function reelTabs() {
    return '<nav class="cx-reel-friend-tabs" aria-label="Reel feed">' +
      '<button type="button" data-cx-reel-mode="all" aria-current="' +
      (!friendsOnly ? 'page' : 'false') + '">Reels</button><span aria-hidden="true">·</span>' +
      '<button type="button" data-cx-reel-mode="friends" aria-current="' +
      (friendsOnly ? 'page' : 'false') + '">Friends <span aria-hidden="true">◉◉</span></button></nav>';
  }

  renderReels = function (state) {
    var shown = friendsOnly ? state.reels.filter(function (reel) {
      return activityFor(state, reel.id).length > 0;
    }) : state.reels;
    if (!shown.length && friendsOnly) {
      return '<main class="cx-friends-empty">' + reelTabs() +
        '<p>No followed friends have visible Reel activity in this preview.</p>' +
        '<button type="button" data-cx-reel-mode="all">See all Reels</button></main>';
    }
    var html = originalRenderReels(Object.assign({}, state, { reels: shown }));
    // Each Reel is independent. No global DOM mutation means one-swipe rendering stays intact.
    return html.replace(/<section class="reel-slide" data-reel-slide="([^"]+)"[\s\S]*?<\/section>/g,
      function (slide, reelId) {
        var dock = activityDock(state, reelId);
        return slide.replace(/(<section class="reel-slide"[^>]*>)/,
          '$1' + reelTabs()).replace(
          '<div class="reel-details"><div class="reel-creator">',
          '<div class="reel-details">' + dock + '<div class="reel-creator">'
        );
      });
  };

  function closeSheet() {
    if (activeSheet) {
      var sheet = activeSheet;
      activeSheet = null;
      if (sheet.open) sheet.close();
      sheet.remove();
    }
  }

  function openFriendProfile(actorId, reelId) {
    returnReelId = reelId;
    closeSheet();
    appProfileReturnTab = 'reels';
    appProfileOpenedInSession = true;
    navigate('profile', actorId);
  }

  function showEmojiPreview(emoji) {
    var target = document.querySelector('.reel-slide[data-reel-slide="' + CSS.escape(returnReelId || '') + '"]') ||
      document.querySelector('.reel-slide');
    if (!target || !emoji) return;
    var bubble = document.createElement('span');
    bubble.className = 'cx-friend-emoji-float';
    bubble.textContent = emoji;
    bubble.setAttribute('aria-hidden', 'true');
    target.append(bubble);
    bubble.addEventListener('animationend', function () { bubble.remove(); }, { once: true });
    setTimeout(function () { bubble.remove(); }, 1700);
  }

  function openFriendSheet(reelId, actorId, type) {
    var state = getState();
    var activity = activityFor(state, reelId).find(function (event) {
      return event.actorId === actorId && event.type === type;
    });
    if (!activity || !socialItem(state, reelId)) return;
    closeSheet();
    returnReelId = reelId;
    var opener = document.activeElement;
    var actor = activity.actor;
    var action = type === 'repost' ? 'reposted' : 'liked';
    var sheet = document.createElement('dialog');
    activeSheet = sheet;
    sheet.className = 'cx-friend-sheet';
    sheet.setAttribute('aria-label', 'Reply to @' + actor.username);
    sheet.innerHTML =
      '<div class="cx-friend-sheet-handle" aria-hidden="true"></div>' +
      '<button type="button" class="cx-friend-sheet-close" data-cx-close aria-label="Close friend reply">×</button>' +
      '<button type="button" class="cx-friend-sheet-person" data-cx-view-profile="' +
      escapeHTML(actor.id) + '">' +
      '<img src="' + safeMediaUrl(actor.avatar) + '" alt="">' +
      '<span><strong>@' + escapeHTML(actor.username) + '</strong>' +
      '<small>' + action + ' this Reel' + (activity.sample ? ' · sample activity' : '') + '</small></span>' +
      '<span aria-hidden="true">›</span></button>' +
      '<form class="cx-friend-reply-form" data-cx-reply-form>' +
      '<label for="cx-reel-friend-reply">Message ' + escapeHTML(actor.username) + '</label>' +
      '<div class="cx-friend-input-row"><input id="cx-reel-friend-reply" data-cx-reply-input type="text" maxlength="500" ' +
      'autocomplete="off" placeholder="Reply about this Reel…" aria-label="Reply to friend" required>' +
      '<button type="submit" data-cx-save-draft>Save draft</button></div>' +
      '<div class="cx-friend-reactions" aria-label="Quick reactions">' +
      ['❤️','😂','😍','🔥','🙌','🥹'].map(function (emoji) {
        return '<button type="button" data-cx-emoji="' + emoji + '" aria-label="React ' + emoji + '">' + emoji + '</button>';
      }).join('') + '</div>' +
      '<p class="cx-friend-reply-status" data-cx-reply-status role="status">Sample preview: replies are saved as DM drafts, never sent.</p>' +
      '</form><button type="button" class="cx-friend-chat-link" data-cx-open-dm>Open chat</button>';
    sheet.addEventListener('click', function (event) {
      if (event.target === sheet) closeSheet();
    });
    sheet.addEventListener('close', function () {
      if (activeSheet === sheet) activeSheet = null;
      sheet.remove();
      if (opener && opener.isConnected) opener.focus();
    });
    sheet.querySelector('[data-cx-close]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-cx-view-profile]').addEventListener('click', function () {
      openFriendProfile(actorId, reelId);
    });
    var input = sheet.querySelector('[data-cx-reply-input]');
    var status = sheet.querySelector('[data-cx-reply-status]');
    function saveDraft(message, reaction) {
      var clean = String(message || '').trim().slice(0, 500);
      if (!clean) { input.focus(); return false; }
      var preface = type === 'repost' ? 'About your sample Reel repost: ' : 'About the Reel you liked: ';
      var count = socialSaveDrafts(reelId, [actorId], preface + clean, false);
      if (!count) { status.textContent = 'Unable to save draft. Try again.'; return false; }
      status.textContent = 'DM draft saved locally. Nothing was sent.';
      input.value = '';
      if (reaction) showEmojiPreview(reaction);
      return true;
    }
    sheet.querySelector('[data-cx-reply-form]').addEventListener('submit', function (event) {
      event.preventDefault(); saveDraft(input.value, null);
    });
    sheet.querySelectorAll('[data-cx-emoji]').forEach(function (button) {
      button.addEventListener('click', function () { saveDraft(button.dataset.cxEmoji, button.dataset.cxEmoji); });
    });
    sheet.querySelector('[data-cx-open-dm]').addEventListener('click', function () {
      if (input.value.trim()) saveDraft(input.value, null);
      closeSheet();
      navigate('messages', actorId);
    });
    document.body.append(sheet);
    sheet.showModal();
  }

  bindRepairEvents = function () {
    originalBindReelEvents();
    document.querySelectorAll('[data-cx-friend-reel]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openFriendSheet(button.dataset.cxFriendReel, button.dataset.cxFriendActor, button.dataset.cxFriendType);
      });
    });
    document.querySelectorAll('[data-cx-reel-mode]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var target = button.dataset.cxReelMode === 'friends';
        if (friendsOnly === target) return;
        friendsOnly = target;
        renderApp();
      });
    });
  };

  window.addEventListener('popstate', function () {
    if (!returnReelId) return;
    var id = returnReelId;
    requestAnimationFrame(function () {
      if (getState().activeTab !== 'reels') return;
      var deck = document.querySelector('.reels-deck');
      if (!deck) return;
      var slide = Array.from(deck.querySelectorAll('[data-reel-slide]')).find(function (node) {
        return node.dataset.reelSlide === id;
      });
      if (slide) deck.scrollTop = slide.offsetTop - deck.offsetTop;
      returnReelId = null;
    });
  });
  window.CrushXFriendReelActivity = Object.freeze({
    getActivities: activityFor,
    getFriendsOnly: function () { return friendsOnly; }
  });
})();