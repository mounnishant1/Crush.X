const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '..', 'reel-publish-flows.js'), 'utf8');

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.value = '';
    this.style = {values: {}, setProperty: (key, value) => { this.style.values[key] = value; }};
    this.classList = {
      add: key => this.toggleClass(key, true),
      remove: key => this.toggleClass(key, false),
      toggle: (key, value) => this.toggleClass(key, value)
    };
  }
  toggleClass(key, value) {
    const names = new Set(this.className.split(/\s+/).filter(Boolean));
    if (value === false) names.delete(key);
    else if (value === true) names.add(key);
    else if (names.has(key)) names.delete(key);
    else names.add(key);
    this.className = [...names].join(' ');
    return names.has(key);
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); node.parent = this; return node; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); }
  querySelector(selector) {
    const nodes = [...this.children];
    while (nodes.length) {
      const node = nodes.shift();
      if (selector.startsWith('.') && node.className.split(/\s+/).includes(selector.slice(1))) return node;
      nodes.unshift(...node.children);
    }
    return null;
  }
}

function setup() {
  const state = {
    activeTab: 'reels', currentUserId: 'me',
    users: [{id: 'creator', followers: 15, following: false}]
  };
  const follow = new FakeElement('button');
  follow.dataset.followUser = 'creator';
  follow.textContent = 'Follow';
  const video = new FakeElement('video');
  video.duration = 40;
  video.currentTime = 0;
  video.seekable = {length: 1};
  video.controls = true;
  const slide = new FakeElement('section');
  slide.className = 'reel-slide';
  const findInSlide = slide.querySelector.bind(slide);
  slide.querySelector = selector => selector === 'video[data-reel-video]' ? video : findInSlide(selector);
  const header = new FakeElement('header');
  const body = new FakeElement('body');
  const events = {};
  const document = {
    body,
    addEventListener(name, handler) { (events[name] ??= []).push(handler); },
    querySelectorAll(selector) {
      if (selector === '.reel-slide') return [slide];
      if (selector === '[data-follow-user]') return [follow];
      return [];
    },
    querySelector(selector) {
      if (selector === '#app .app-header') return header;
      if (selector === '.cx-publish-toast') return body.querySelector(selector);
      return null;
    },
    createElement: tag => new FakeElement(tag)
  };
  let renders = 0, saves = 0;
  const window = {
    renderApp() { renders++; },
    navigate() { state.activeTab = 'home'; },
    addEventListener() {},
    setTimeout() { return 1; }
  };
  new Function('window', 'document', 'getState', 'saveState', 'Element', code)(
    window, document, () => state, () => { saves++; }, FakeElement
  );
  return {state, follow, video, slide, header, body, events, window,
    counts: () => ({renders, saves})};
}

test('Reel follow and unfollow update immediately without restarting the video', () => {
  const ui = setup();
  ui.window.renderApp();
  const icon = new FakeElement('i');
  icon.closest = () => ui.follow;
  let stopped = 0;
  const click = () => ({
    target: icon, preventDefault() {}, stopImmediatePropagation() { stopped++; }
  });
  ui.events.click[0](click());
  assert.equal(ui.state.users[0].following, true);
  assert.equal(ui.follow.textContent, 'Following');
  assert.equal(ui.follow.getAttribute('aria-pressed'), 'true');
  ui.events.click[0](click());
  assert.equal(ui.state.users[0].following, false);
  assert.equal(ui.follow.textContent, 'Follow');
  assert.deepEqual(ui.counts(), {renders: 1, saves: 2});
  assert.equal(stopped, 2);
});

test('Reel dot scrubs using actual duration and follows playback time', () => {
  const ui = setup();
  ui.window.renderApp();
  const scrub = ui.slide.querySelector('.cx-reel-scrub');
  assert.ok(scrub);
  const slider = scrub.children[0];
  assert.equal(ui.video.controls, false);
  ui.video.listeners.loadedmetadata[0]();
  assert.equal(slider.disabled, false);
  slider.value = '750';
  slider.listeners.input[0]();
  assert.equal(ui.video.currentTime, 30);
  ui.video.currentTime = 10;
  ui.video.listeners.timeupdate[0]();
  assert.equal(slider.value, '250');
  assert.equal(slider.style.values['--cx-reel-progress'], '25%');
});

test('Home line waits for verified success, never treats uploaded bytes as publishing', () => {
  const ui = setup();
  const flow = ui.window.CrushXPublishFlow;
  assert.equal(flow.complete('unknown'), false);
  assert.equal(ui.body.querySelector('.cx-publish-toast'), null);
  assert.equal(flow.start({id: 'job1', kind: 'story'}), true);
  assert.equal(ui.state.activeTab, 'home');
  assert.ok(ui.header.querySelector('.cx-home-publishing'));
  assert.equal(flow.progress('job1', 100), true);
  const track = ui.header.querySelector('.cx-publish-track');
  assert.equal(track.getAttribute('aria-valuenow'), '99');
  assert.equal(flow.complete('job1'), true);
  assert.equal(ui.header.querySelector('.cx-home-publishing'), null);
  assert.equal(ui.body.querySelector('.cx-publish-toast').children[1].textContent, 'Your story published');
  assert.equal(flow.complete('job1'), false);
});

test('Failed publishing never shows the published success text', () => {
  const ui = setup();
  const flow = ui.window.CrushXPublishFlow;
  assert.equal(flow.start({id: 'job2', goHome: true}), true);
  assert.equal(flow.fail('job2'), true);
  assert.match(ui.body.querySelector('.cx-publish-toast').children[1].textContent, /could not be published/);
});
