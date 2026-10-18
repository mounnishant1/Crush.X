const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /heads-up-notifications\\.css/);
assert.match(html, /heads-up-notifications\\.js/);
const listeners = {}, nodes = [], nav = [];
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.events = {}; this.attributes = {}; this.classList = { add: () => {}, remove: () => {} }; this.dataset = {}; this.isConnected = true; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(n, fn) { this.events[n] = fn; }
  remove() { this.removed = true; this.isConnected = false; }
  closest() { return null; }
}
const doc = {
  body: { append(n) { nodes.push(n); } }, hidden: false, createElement: tag => new Node(tag),
  createTextNode: text => ({ text }), querySelectorAll: () => [],
  addEventListener: (n, fn) => { listeners[n] = fn; },
  dispatchEvent(e) { return !e.defaultPrevented; }
};
const state = { currentUserId: 'me', users: [{ id: 'u1', username: 'riya', avatar: 'https://example.com/riya.png' }], reels: [], socialMutedIds: [] };
const scheduled = new Map(); let nextTimer = 1;
const ctx = vm.createContext({
  document: doc, window: {}, Date, URL, Set, String, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; } },
  setTimeout(fn, delay) { const id = nextTimer++; scheduled.set(id, {fn, delay}); return id; },
  clearTimeout(id) { scheduled.delete(id); },
  getState() { return state; }, navigate(tab, user) { nav.push([tab, user]); }
});
vm.runInContext(fs.readFileSync(path.join(root, 'heads-up-notifications.js'), 'utf8'), ctx);
const notify = ctx.window.CrushXHeadsUp.notify;
const payload = { id: 'm1', type: 'reel', senderId: 'u1', recipientId: 'me', reelId: 'r1', text: 'Watch this!', thumbnail: 'https://example.com/r1.jpg' };
assert.equal(notify(payload), true);
assert.equal(notify(payload), false, 'duplicate event should not appear');
assert.equal(nodes.length, 1);
let panel = nodes[0].children[0];
assert.match(panel.children[0].children[1].children[0].children[1].text, /sent you a reel/);
assert.equal(panel.children[0].children[1].children[1].textContent, 'Watch this!');
assert.equal([...scheduled.values()][0].delay, 3900);
panel.children[0].events.click();
assert.deepEqual(nav[0], ['messages', 'u1']);
for(const task of [...scheduled.values()].filter(t => t.delay === 290)) task.fn();
assert.equal(notify({ ...payload, id: 'm2', type: 'message', text: '<script>alert(1)</script>' }), true);
panel = nodes[0].children[0];
assert.equal(panel.children[0].children[1].children[1].textContent, '<script>alert(1)</script>', 'plain text, never HTML');
assert.equal(notify({ ...payload, id: 'other', recipientId: 'not-me' }), false);
state.socialMutedIds = ['u1'];
assert.equal(notify({ ...payload, id: 'muted' }), false);
state.socialMutedIds = [];
assert.equal(notify({ ...payload, id: 'badtype', type: 'magic' }), false);
listeners['crushx:session-ended']();
assert.equal(nodes[0].children[0].removed, true);
console.log('Heads-up: reel, message, dedupe, 3.9s timing, tap navigation, escaped rendering, recipient/mute checks, session cleanup PASS');
