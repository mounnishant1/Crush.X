'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','app-improvements.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','app-experience.css'),'utf8');
test('Repost updates only browser-local state and does not claim network publishing',()=>{
  const fn=js.match(/function toggleLocalRepost\(id\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn,'Repost state handler exists');
  let saves=0;const state={reels:[{id:'r1',reposted:false}]};
  const toggle=new Function('getState','saveState',fn+'\nreturn toggleLocalRepost;')(()=>state,()=>{saves++;});
  assert.equal(toggle('r1'),true);
  assert.equal(toggle('r1'),false);
  assert.equal(toggle('unknown'),null);
  assert.equal(saves,2);
});
test('Repost rail icon, feedback and Profile Reposts tab are wired',()=>{
  assert.match(js,/data-repost="\$\{id\}"/);
  assert.match(js,/data-profile-filter="reposts"/);
  assert.match(js,/appProfileFilter === 'reposts'/);
  assert.match(js,/data-repost-feedback="\$\{id\}"/);
  assert.match(css,/\.reel-repost-action\.repost-spin svg/);
});
test('Repost does not introduce another Reel seek control or an external publishing claim',()=>{
  assert.equal((js.match(/data-reel-progress="\$\{id\}"/g)||[]).length,1);
  assert.match(js,/local-only repost state/);
});
