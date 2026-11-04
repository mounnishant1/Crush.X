const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const enhancement = fs.readFileSync(path.join(root, 'story-reference-enhancement.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'story-reference-enhancement.css'), 'utf8');
assert.match(html, /story-reference-enhancement\.js/);
assert.match(html, /story-reference-enhancement\.css/);
for (const cls of ['.cx-story-media', '.cx-story-background', '.cx-story-stickers', '.cx-story-follow']) assert.ok(css.includes(cls), cls);

const dialogs = [];
const noop = {addEventListener(){}};
const doc = {
  hidden:false, activeElement:null,
  body:{classList:{toggle(){}},append(dialog){dialogs.push(dialog);}},
  getElementById(id){return ['cancelConfirmation','authForm','switchAuthButton','confirmButton','resendButton','forgotButton'].includes(id) ? noop : null;},
  querySelectorAll(){return [];}, querySelector(){return null;}, addEventListener(){},
  createElement(tag) {
    assert.equal(tag, 'dialog');
    return {
      open:false, innerHTML:'', events:Object.create(null),
      setAttribute(){},
      addEventListener(type,handler,options){(this.events[type] ||= []).push({handler,capture:options === true});},
      querySelectorAll(){return [];},
      querySelector(){return null;},
      showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}
    };
  }
};
const context = vm.createContext({
  document:doc, console, Date, URL, setInterval, clearInterval, setTimeout, clearTimeout,
  window:{addEventListener(){},scrollTo(){}},
  location:{hash:''}, history:{pushState(){},back(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}
});
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline);
vm.runInContext(inline[1], context, {filename:'index.html'});
vm.runInContext(fs.readFileSync(path.join(root, 'app-improvements.js'), 'utf8'), context, {filename:'app-improvements.js'});
vm.runInContext(enhancement, context, {filename:'story-reference-enhancement.js'});
const run = source => vm.runInContext(source, context);

// Normalized story metadata survives local state and can't point at unknown content.
run('{const s=getState();s.stories[1].reelId="reel_1";s.stories[1].mentions=[{userId:"user_1"},{userId:"not_a_user"}];s.stories[1].durationMs=11000;saveState(s);}');
assert.equal(run('getState().stories[1].reelId'), 'reel_1');
assert.equal(run('getState().stories[1].mentions.length'), 1);
run('openSampleStory("story_2")');
assert.equal(dialogs.length, 1);
const dialog = dialogs[0];
for (const fragment of ['cx-story-background', 'cx-story-media', 'cx-story-linked', 'Watch full Reel', 'cx-story-mention', 'data-sv="reaction"']) {
  assert.ok(dialog.innerHTML.includes(fragment), fragment);
}
run('storyViewerElapsed=7000;storyViewerLastTick=Date.now();storyViewerTick()');
assert.equal(run('storyViewerIndex'), 1, '11-second Story should not expire at 6.5 seconds');
run('storyViewerElapsed=11000;storyViewerLastTick=Date.now();storyViewerTick()');
assert.equal(run('storyViewerIndex'), 2, 'Story advances when duration completes');
run('closeStoryViewer()');

// Video-only Stories must open, use a video element and remain muted by default.
run('{const s=getState();s.stories[1].image="";s.stories[1].video="https://example.com/story.mp4";s.stories[1].reelId="";saveState(s);}');
run('openSampleStory("story_2")');
assert.equal(dialogs.length, 2);
assert.match(dialogs[1].innerHTML, /data-cx-story-video/);
assert.match(dialogs[1].innerHTML, /muted playsinline/);
assert.doesNotMatch(dialogs[1].innerHTML, /<script/i);
const down = dialogs[1].events.pointerdown.find(listener => listener.capture);
const up = dialogs[1].events.pointerup.find(listener => listener.capture);
const stage = {closest(selector){return selector === '[data-sv-stage]' ? {} : null;}};
down.handler({pointerId:8,clientX:120,clientY:180,target:stage});
up.handler({pointerId:8,clientX:125,clientY:300,preventDefault(){},stopImmediatePropagation(){}});
assert.equal(run('storyViewerDialog'), null, 'swipe down closes Story');
console.log('Story reference: media, links, mentions, duration, video, and swipe-close checks PASS');
