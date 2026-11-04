'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app-improvements.js'),'utf8');
test('Story pointer start is owned by primary pointer and second finger is ignored',()=>{
  assert.match(source,/let storyViewerPointerId = null/);
  assert.match(source,/event\.isPrimary===false \|\| storyViewerPointerId!==null/);
  assert.match(source,/storyViewerPointerId=event\.pointerId/);
  assert.match(source,/storyViewerPointerId!==event\.pointerId \|\| storyViewerStartX===null/);
});
test('Story pointer handler ignores near-vertical drags and suppresses ghost clicks',()=>{
  assert.match(source,/Math\.abs\(dx\)>55 && Math\.abs\(dx\)>Math\.abs\(dy\)\*1\.2/);
  assert.match(source,/Math\.abs\(dy\)>24/);
  assert.match(source,/storyViewerSwipeUntil=Date\.now\(\)\+250/);
});
test('Story pointer ownership resets on close, reopen and owner cancellation',()=>{
  assert.match(source,/storyViewerStartX=null;storyViewerStartY=null;storyViewerPointerId=null;storyViewerHold=false;storyViewerSwipeUntil=0/);
  assert.match(source,/storyViewerHold=false;storyViewerStartX=null;storyViewerStartY=null;storyViewerPointerId=null;/);
  assert.match(source,/if\(storyViewerPointerId!==event\.pointerId\)return/);
});
