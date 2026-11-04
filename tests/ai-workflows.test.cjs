'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const guide=require('../app-ai-workflows.js');
test('whole app AI surface covers all user modules and owner guidance',()=>{
 const items=guide.list();
 assert.equal(items.length,25);
 assert.equal(new Set(items.map(x=>x.id)).size,25);
 for(const id of ['home','stories','reels','posts','camera','editor','stickers',
  'messages','calls','live','wallet','ads','avatar','offline','owner'])
  assert.ok(guide.lookup(id),id+' should be covered');
 assert.equal(guide.lookup('not-a-module'),null);
});
test('screen routing retains one AURA-X surface across every main tab',()=>{
 assert.equal(guide.forTab('create'),'editor');
 assert.equal(guide.forTab('messages'),'messages');
 assert.equal(guide.forTab('discover'),'explore');
 assert.equal(guide.forTab('home'),'home');
 assert.equal(guide.forTab('reels'),'reels');
 assert.equal(guide.forTab('profile'),'profile');
});
test('checklists do not execute actions, use secrets or report AI model execution',()=>{
 const r=guide.review('editor','Fix touch overlap and MP4 export');
 assert.match(r.title,/Editor/);
 assert.match(r.steps.join(' '),/gesture ownership/);
 assert.match(r.steps.join(' '),/saved media/);
 assert.match(r.limitations,/No model connected/i);
 assert.match(r.limitations,/no changes applied/i);
 assert.equal(guide.review('does-not-exist','hello'),null);
 assert.equal(guide.review('home','').steps.length,1);
});
test('all review output is derived from static, bounded feature checks',()=>{
 const a=guide.review('wallet','send payment');
 assert.match(a.steps.join(' '),/user confirmation/);
 const b=guide.review('home','x'.repeat(301));
 assert.equal(b.steps.length,1);
 assert.ok(!JSON.stringify(a).includes('your funds were sent'));
});
