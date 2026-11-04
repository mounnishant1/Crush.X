const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reels-friend-activity.js'), 'utf8');
function harness() {
  const calls = [];
  const users = [
    { id: 'me', username: 'me', following: false, avatar: 'https://example.com/me.png' },
    { id: 'user_1', username: 'aanya', following: true, avatar: 'https://example.com/a.png' },
    { id: 'user_3', username: 'zoe', following: true, avatar: 'https://example.com/z.png' },
    { id: 'blocked', username: 'private', following: false, avatar: 'https://example.com/b.png' }
  ];
  const state = { currentUserId: 'me', activeTab: 'reels', reels: [{ id: 'reel_1' }, { id: 'reel_2' }], users };
  const controls = [
    { dataset: { cxReelMode: 'friends' }, addEventListener(kind, fn) { this.onClick = fn; } },
    { dataset: { cxReelMode: 'all' }, addEventListener(kind, fn) { this.onClick = fn; } }
  ];
  const context = {
    window: { addEventListener() {}, CrushXFriendActivityFeed: null },
    document: { querySelectorAll(selector) { return selector === '[data-cx-reel-mode]' ? controls : []; } },
    renderReels(s) {
      return '<main class="reels-deck">' + s.reels.map(reel => '<section class="reel-slide" data-reel-slide="' + reel.id + '">' +
        '<div class="reel-details"><div class="reel-creator">creator</div></div></section>').join('') + '</main>';
    },
    bindRepairEvents() { calls.push('old bind'); },
    getState() { return state; },
    renderApp() { calls.push('render'); },
    socialItem(s, id) { return s.reels.find(r => r.id === id); },
    userById(s, id) { return s.users.find(u => u.id === id); },
    escapeHTML(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'); },
    safeMediaUrl(s) { return /^https:\/\//.test(s || '') ? s : ''; },
    Set, Object, Array, String, setTimeout, requestAnimationFrame() {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, state, calls, controls };
}

test('renders compact circular friend DPs for like and repost', () => {
  const { context, state } = harness();
  const html = context.renderReels(state);
  assert.equal((html.match(/class="cx-friend-avatar"/g) || []).length, 2);
  assert.match(html, /data-cx-friend-type="like"/);
  assert.match(html, /data-cx-friend-type="repost"/);
  assert.match(html, /data-cx-reel-mode="friends"/);
  assert.equal((html.match(/class="reel-slide"/g) || []).length, 2);
});

test('does not show non-followed or own activity from provider', () => {
  const { context, state } = harness();
  context.window.CrushXFriendActivityFeed = { getForReel() {
    return [
      { actorId: 'blocked', type: 'like' }, { actorId: 'me', type: 'repost' },
      { actorId: 'user_1', type: 'repost' }, { actorId: 'user_1', type: 'repost' }
    ];
  } };
  const activities = context.window.CrushXFriendReelActivity.getActivities(state, 'reel_1');
  assert.equal(activities.length, 1);
  assert.equal(activities[0].actorId, 'user_1');
  assert.equal(activities[0].type, 'repost');
});

test('configured empty feed never displays invented demo activity', () => {
  const { context, state } = harness();
  context.window.CrushXFriendActivityFeed = { getForReel() { return []; } };
  assert.equal(context.window.CrushXFriendReelActivity.getActivities(state, 'reel_1').length, 0);
  assert.doesNotMatch(context.renderReels(state), /class="cx-friend-avatar"/);
});

test('Friends filter has an empty state and returns to all reels', () => {
  const { context, state, calls, controls } = harness();
  context.bindRepairEvents();
  controls[0].onClick({ stopPropagation() {} });
  assert.equal(context.window.CrushXFriendReelActivity.getFriendsOnly(), true);
  let html = context.renderReels(state);
  assert.equal((html.match(/class="reel-slide"/g) || []).length, 1);
  context.window.CrushXFriendActivityFeed = { getForReel() { return []; } };
  html = context.renderReels(state);
  assert.match(html, /No followed friends have visible Reel activity/);
  controls[1].onClick({ stopPropagation() {} });
  assert.equal(context.window.CrushXFriendReelActivity.getFriendsOnly(), false);
  assert.ok(calls.length >= 3);
});
