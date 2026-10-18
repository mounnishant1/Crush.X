const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inlineScript, 'Inline app script is present');

const app = {innerHTML: ''};
const empty = {addEventListener() {}};
const document = {
  body: {classList: {toggle() {}}},
  activeElement: null,
  getElementById(id) {return id === 'app' ? app : id === 'cancelConfirmation' || id === 'authForm' || id === 'switchAuthButton' || id === 'confirmButton' || id === 'resendButton' || id === 'forgotButton' ? empty : null;},
  querySelectorAll() {return [];},
  addEventListener() {}
};
let stored = null;
const context = vm.createContext({
  console, Date, URL, document, location: {hash: ''}, history: {pushState() {}},
  window: {addEventListener() {}, scrollTo() {}},
  localStorage: {getItem() {return stored;}, setItem(key, value) {stored = value;}, removeItem() {stored = null;}},
  sessionStorage: {getItem() {return null;}, setItem() {}, removeItem() {}}
});
vm.runInContext(inlineScript, context, {filename: 'index.html'});
vm.runInContext(fs.readFileSync(path.join(root, 'app-improvements.js'), 'utf8'), context, {filename: 'app-improvements.js'});
vm.runInContext(fs.readFileSync(path.join(root, 'story-editor.js'), 'utf8'), context, {filename: 'story-editor.js'});

const evaluate = source => vm.runInContext(source, context);
const home = evaluate('renderHome(getState())');
assert.match(home, /class="home-stories/);
assert.equal((home.match(/data-open-story=/g) || []).length, 3);
assert.match(home, /data-story-create/);
assert.match(home, /Your story/);
assert.match(home, /data-post-options="post_1"/);
assert.match(home, /data-like="post_1"/);
assert.match(home, /data-comment-input="post_1"/);
assert.match(home, /data-share="post_1"/);
assert.match(home, /data-save="post_1"/);
assert.match(home, /data-feed-filter="following"/);

evaluate("appFeedFilter = 'following'");
assert.match(evaluate('renderHome(getState())'), /data-feed-filter="following" aria-pressed="true"/);
evaluate("appFeedFilter = 'all'");

evaluate(`{
  const state = getState();
  state.posts[0].source = 'https://example.com/clip.webm';
  state.posts[0].mediaType = 'video';
  saveState(state);
}`);
assert.match(evaluate('renderHome(getState())'), /<video src="https:\/\/example.com\/clip.webm" controls playsinline/);

evaluate('renderApp()');
assert.match(app.innerHTML, /id="activityButton"/);
assert.match(app.innerHTML, /data-tab="create" aria-label="Create a post or story"/);
const mobileNav = app.innerHTML.match(/<nav class="bottom-nav[\s\S]*?<\/nav>/)?.[0];
assert.ok(mobileNav, 'Mobile navigation exists');
assert.deepEqual(Array.from(mobileNav.matchAll(/data-tab="([^"]+)"/g), match => match[1]), ['home', 'reels', 'messages', 'discover', 'profile']);
assert.match(mobileNav, /aria-current="page"/);
assert.doesNotMatch(mobileNav, /data-tab="create"/);
assert.match(html, /env\(safe-area-inset-bottom\)/);

const navButton = {dataset: {tab: 'reels'}, addEventListener(event, handler) {if (event === 'click') this.click = handler;}};
document.querySelectorAll = selector => selector === '[data-tab]' ? [navButton] : [];
evaluate('renderApp()');
navButton.click();
assert.equal(evaluate('getState().activeTab'), 'reels', 'Bottom tab click changes the screen');
navButton.dataset.tab = 'create';
navButton.click();
assert.equal(evaluate('getState().activeTab'), 'create', 'Top plus shortcut changes to Create');

let dialogTitle = '';
evaluate('appDialog = (title) => { globalThis.testDialogTitle = title; }');
evaluate('openSampleActivity()');
dialogTitle = evaluate('globalThis.testDialogTitle');
assert.equal(dialogTitle, 'Activity', 'Heart icon action can open activity preview');

console.log('Home UI source and rendering checks PASS');
