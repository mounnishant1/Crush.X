const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const name of ['message-presence-indicators.js', 'message-presence-indicators.css']) {
  assert.ok(html.includes(name), 'asset linked: ' + name);
}
const observers = [], listeners = new Map(), hosts = [], timers = new Map();
let nextTimer = 0;
class Node {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {};
    this.events = {}; this.hidden = false; this.isConnected = true;
    this.textContent = ''; this.classes = new Set();
    this.classList = {
      add: (...items) => items.forEach(i => this.classes.add(i)),
      remove: (...items) => items.forEach(i => this.classes.delete(i))
    };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...items) { this.children.push(...items); for (const item of items) if (item && typeof item === 'object') item.parent = this; }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  addEventListener(k, f) { this.events[k] = f; }
  remove() {
    this.removed = true; this.isConnected = false;
    if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this);
  }
  querySelector(selector) {
    const key = /^\\[(data-[a-z-]+)\\]$/.exec(selector)?.[1];
    return key ? this.children.find(n => n?.attrs && Object.hasOwn(n.attrs, key)) || null : null;
  }
}
const nav = new Node('button'), chat = new Node('button'), app = new Node('div');
nav.dataset.tab = 'messages'; chat.dataset.chatUser = 'u1';
const doc = {
  body: { append: node => hosts.push(node) }, hidden: false,
  createElement: tag => new Node(tag), createTextNode: text => ({ text }),
  addEventListener: (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  },
  dispatchEvent: event => { for (const fn of listeners.get(event.type) || []) fn(event); return !event.defaultPrevented; },
  getElementById: id => id === 'app' ? app : null,
  querySelectorAll: sel => sel === '[data-tab="messages"]' ? [nav]
    : sel === '[data-chat-user]' ? [chat] : []
};
const state = {
  currentUserId: 'me', activeTab: 'home', chatUserId: null,
  users: [{ id: 'u1', username: 'Riya', avatar: 'https://example.com/riya.jpg' }],
  socialMutedIds: []
};
const ctx = vm.createContext({
  document: doc, window: {}, URL, Date, Set, Map,
  getState: () => state, navigate() {},
  CustomEvent: class { constructor(type, opt={}) { this.type = type; this.detail = opt.detail; this.defaultPrevented = false; } },
  setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; },
  clearTimeout(id) { timers.delete(id); },
  setInterval() { return 1; },
  MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }
});
for (const file of ['heads-up-notifications.js', 'message-presence-indicators.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const send = (type, detail) => doc.dispatchEvent({ type, detail, defaultPrevented: false });
for (let i = 1; i <= 6; i++) {
  assert.equal(ctx.window.CrushXHeadsUp.notify({ id: 'id'+i, senderId: 'u1',
    recipientId: 'me', type: 'message', text: 'Hello '+i }), true);
}
assert.equal(ctx.window.CrushXMessageIndicators.unreadTotal(), 6);
assert.ok(nav.querySelector('[data-cx-nav-unread]'));
assert.ok(chat.querySelector('[data-cx-chat-unread]'));
assert.equal(hosts.length, 1);
assert.equal(hosts[0].children[0].children[2].textContent, '+2 more · inbox');
assert.equal(ctx.window.CrushXHeadsUp.notify({
  id: 'id6', senderId: 'u1', recipientId: 'me', type: 'message'
}), false, 'duplicate skipped');

const now = Date.now();
send('crushx:presence-update', {recipientId: 'me', userId:'u1', online:true,
  visible:true, observedAt:now, expiresAt:now+45000});
assert.equal(ctx.window.CrushXMessageIndicators.isActive('u1'), true);
assert.ok(chat.querySelector('[data-cx-chat-active]'));
send('crushx:presence-update', {recipientId:'other', userId:'u1',
  online:false, visible:true, observedAt:now, expiresAt:now+45000});
assert.equal(ctx.window.CrushXMessageIndicators.isActive('u1'), true, 'reject other-account event');
send('crushx:presence-update', {recipientId:'me', userId:'u1', online:true,
  visible:false, observedAt:now, expiresAt:now+45000});
assert.equal(ctx.window.CrushXMessageIndicators.isActive('u1'), false, 'respect privacy');
assert.equal(chat.querySelector('[data-cx-chat-active]'), null);

send('crushx:conversation-read', {recipientId:'me', senderId:'u1'});
assert.equal(ctx.window.CrushXMessageIndicators.unreadTotal(), 0);
assert.equal(nav.querySelector('[data-cx-nav-unread]'), null);

send('crushx:unread-snapshot', {recipientId:'me', conversations:[{senderId:'u1',unreadCount:17}]});
assert.equal(ctx.window.CrushXMessageIndicators.unreadTotal(), 17);
send('crushx:session-ended');
assert.equal(ctx.window.CrushXMessageIndicators.unreadTotal(), 0);
assert.equal(hosts[0].children.length, 0, 'banner removed on logout');
console.log('PASS: 4 heads-up maximum per burst, 6 unread accounted for, overflow summary,');
console.log('unread dot, privacy-controlled active dot, snapshot, mark-read, dedupe, logout cleanup');
