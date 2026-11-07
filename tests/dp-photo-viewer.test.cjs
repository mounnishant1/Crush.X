'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const files=['index.html','app-improvements.js','social-advanced.js','social-interactions.js'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),js=read('dp-photo-viewer.js'),css=read('dp-photo-viewer.css');

test('DP viewer script and stylesheet load on existing app after all app modules',()=>{
 assert.match(html,/<script src="\.\/dp-photo-viewer\.js"><\/script>/);
 assert.match(html,/<link rel="stylesheet" href="\.\/dp-photo-viewer\.css"/);
 assert.ok(html.lastIndexOf('dp-photo-viewer.js')>html.lastIndexOf('app-improvements.js'));
});
test('profile, feed, search, messages, reels and public profile opt into DP photos',()=>{
 const counts=Object.fromEntries(files.map(p=>[p,(read(p).match(/data-cx-dp(?=\s)/g)||[]).length]));
 assert.ok(counts['index.html']>=5);
 assert.ok(counts['app-improvements.js']>=4);
 assert.ok(counts['social-advanced.js']>=1);
 assert.ok(counts['social-interactions.js']>=1);
 assert.match(html,/data-cx-dp-label="Photo of @\$\{escapeHTML\(user\.username\)\}"/);
 assert.match(js,/getAttribute\('data-cx-dp-label'\)/);
});
test('stories and navigation buttons retain their previous action',()=>{
 const story=html.match(/data-open-story="\$\{escapeHTML\(story\.id\)\}"[\s\S]{0,200}?<\/button>/);
 assert.ok(story,'Expected original story ring');
 assert.doesNotMatch(story[0],/data-cx-dp/);
 assert.match(html,/id="profileButton"/);
 assert.match(html,/data-tab="\$\{id\}"/);
 assert.match(js,/el\.closest\('\[data-open-story\]/);
});
test('pinch, pan, double-tap, desktop wheel, keyboard and reset are implemented',()=>{
 for(const gesture of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','dblclick','wheel','Escape','ArrowLeft','ArrowRight']){
  assert.ok(js.includes(gesture),gesture);
 }
 assert.match(js,/MAX=5/);
 assert.match(css,/touch-action:none/);
 assert.match(js,/setPointerCapture/);
 assert.match(js,/classList/); // NOTE: this assertion is replaced in CI if needed.
});
test('viewer fails closed on unsafe image schemes, no server mutations or file writes',()=>{
 assert.match(js,/url\.protocol==='https:'|url\.protocol === 'https:'/);
 assert.doesNotMatch(js,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
 assert.match(js,/getAttribute\('aria-label'/);
});
