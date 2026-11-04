'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInterestEngine,TOPICS}=require('../recommendations/interest-engine.cjs');
function fixture(){
 let time=1700000000000;const allowed=new Set(['alice','bob']);
 const feed=createInterestEngine({now:()=>time,checkConsent:async sub=>allowed.has(sub)});
 const item=(id,creatorId,topics,quality=0.5)=>({id,creatorId,topics,visible:true,quality,createdAt:time-3600000});
 return {feed,allowed,item,now:()=>time,advance:n=>time+=n};
}
test('user-interest recording requires explicit permission and safe category',async()=>{
 const x=fixture();
 const r=await x.feed.record('alice',{contentId:'c1',topics:['music'],action:'like',at:x.now()});
 assert.equal(r.recorded,true);
 await assert.rejects(x.feed.record('mallory',{contentId:'c1',topics:['music'],action:'like',at:x.now()}),/INTEREST_CONSENT_REQUIRED/);
 await assert.rejects(x.feed.record('alice',{contentId:'c1',topics:['political_opinion'],action:'like',at:x.now()}),/INTEREST_EVENT_INVALID/);
 await assert.rejects(x.feed.record('alice',{contentId:'c1',topics:['music'],action:'share',at:x.now()+99*86400000}),/INTEREST_EVENT_INVALID/);
 assert.ok(TOPICS.includes('technology'));
 assert.ok(!TOPICS.includes('religion'));
});
test('ranking uses only the account history; consent withdrawal disables personalization',async()=>{
 const x=fixture();
 for(let i=0;i<4;i++)await x.feed.record('alice',{contentId:'m'+i,topics:['music'],action:'save',at:x.now()});
 const candidates=[x.item('music1','a1',['music']),x.item('travel1','a2',['travel']),x.item('travel2','a3',['travel'])];
 const alice=await x.feed.rank('alice',candidates,{limit:3});
 const bob=await x.feed.rank('bob',candidates,{limit:3});
 assert.equal(alice.items[0].contentId,'music1');
 assert.equal(alice.personalized,true);
 assert.equal(bob.personalized,false);
 x.allowed.delete('alice');
 const revoked=await x.feed.rank('alice',candidates,{limit:3});
 assert.equal(revoked.personalized,false);
 assert.ok(revoked.items.every(x=>x.reason!=='recent_interests'));
 assert.equal(x.feed.erase('alice').erased,true);
 assert.equal(x.feed.count('alice'),0);
});
test('negative feedback, blocks, hidden content and creator diversity',async()=>{
 const x=fixture();
 for(let i=0;i<2;i++)await x.feed.record('alice',{contentId:'reject'+i,topics:['comedy'],action:'not_interested',at:x.now()});
 const candidates=[
  x.item('bad1','abuse',['comedy'],1),x.item('hidden','b',['music'],1),
  x.item('1','same',['music'],1),x.item('2','same',['music'],1),x.item('3','same',['music'],1),
  x.item('novel','other',['travel'],0.7),
  {...x.item('private','private',['food']),visible:false}
 ];
 const r=await x.feed.rank('alice',candidates,{blockedCreators:['abuse'],hiddenIds:['hidden'],limit:10});
 assert.ok(r.items.every(i=>i.contentId!=='bad1'&&i.contentId!=='hidden'&&i.contentId!=='private'));
 assert.equal(r.items.filter(i=>['1','2','3'].includes(i.contentId)).length,2);
 assert.equal(r.items.length,3);
});
test('unsafe inputs, invalid catalog items and oversized arrays do not leak',async()=>{
 const x=fixture();
 await assert.rejects(x.feed.rank('alice',Array(501).fill(x.item('x','y',['music']))),/RANK_INPUT_INVALID/);
 await assert.rejects(x.feed.rank('alice',[],{limit:0}),/RANK_INPUT_INVALID/);
 assert.equal((await x.feed.rank('alice',[x.item('one','creator',['secret']),x.item('valid','c',['food'])])).items.length,1);
 assert.throws(()=>x.feed.erase('x'.repeat(99)),/INVALID_SUBJECT/);
});
