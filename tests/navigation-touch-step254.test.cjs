'use strict';
// Step254: executable extraction tests against the shipping navigation handler.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app-improvements.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'app-experience.css'), 'utf8');
function extractedFunction(start, end) {
  const i=app.indexOf(start),j=app.indexOf(end,i+start.length);
  assert.ok(i>=0 && j>i, 'live function boundaries must exist');
  return app.slice(i,j);
}
function navigationFixture() {
  const actions=[];
  const reels=[{id:'reel_one'},{id:'reel_two'},{id:'reel_three'}];
  const sandbox={reelPendingOpenId:null,
    getState:()=>({reels}),
    previewRanked:(_kind,list)=>[list[2],list[0]], // one is hidden, third is first
    navigate:tab=>actions.push(['navigate',tab]),
    appDialog:(title,body)=>actions.push(['dialog',title,body]),
    showLocalItem:id=>actions.push(['post',id])};
  const fn=extractedFunction('function openGridMedia(id) {','\nfunction showLocalItem');
  vm.runInNewContext(fn,sandbox);
  return {sandbox,actions};
}
test('Explore/Profile Reel uses the requested ID, not raw array index',()=>{
  const {sandbox,actions}=navigationFixture();
  sandbox.openGridMedia('reel_one');
  assert.equal(sandbox.reelPendingOpenId,'reel_one');
  assert.deepEqual(actions,[['navigate','reels']]);
  sandbox.openGridMedia('reel_three');
  assert.equal(sandbox.reelPendingOpenId,'reel_three');
});
test('filtered-out Reel cannot navigate to the wrong visible media',()=>{
  const {sandbox,actions}=navigationFixture();
  sandbox.openGridMedia('reel_two');
  assert.equal(sandbox.reelPendingOpenId,null);
  assert.equal(actions.length,1);
  assert.equal(actions[0][0],'dialog');
  assert.match(actions[0][1],/unavailable/);
});
test('post grid retains its separate media open route',()=>{
  const {sandbox,actions}=navigationFixture();
  sandbox.openGridMedia('post_100');
  assert.deepEqual(actions,[['post','post_100']]);
});
test('Reel deck preserves ID after rerenders, account boundaries and logout',()=>{
  assert.match(app,/reelReturnId = oldSlides\[current\]\?\.dataset\.reelSlide/);
  assert.match(app,/const desiredId = reelPendingOpenId \|\| reelReturnId/);
  assert.match(app,/newSlides\.findIndex\(slide => slide\.dataset\.reelSlide === desiredId\)/);
  assert.match(app,/reelPendingOpenId = null; reelReturnId = null/);
  assert.match(app,/reelAudioEnabled = false; reelPendingOpenId = null; reelReturnId = null/);
});
test('nested action rail and scrub own wheel scrolling',()=>{
  assert.match(app,/event\.target\?\.closest\?\.\('\.reel-rail, \.reel-progress, \.reel-comment-box/);
  assert.match(app,/event\.preventDefault\(\)/);
});
test('keyboard, media touch, cancellation and one-wheel-step remain wired',()=>{
  for (const phrase of ["deck.addEventListener('keydown'","deck.addEventListener('touchstart'","deck.addEventListener('touchend'","deck.addEventListener('touchcancel'","let gestureLockUntil = 0","scroll-snap-stop:always"]) {
    assert.ok((app+'\n'+css).includes(phrase),phrase);
  }
});
test('reduce motion bypasses smooth navigation and animation',()=>{
  assert.match(app,/behavior: reducedMotion \? 'auto' : 'smooth'/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/\.reels-deck \{ scroll-behavior: auto !important; \}/);
});
