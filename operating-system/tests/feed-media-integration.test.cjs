'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
function setup(){
 const t=1700000000000,records=[],consented=new Set(['alice']),
  calls=[],catalog=[
   {id:'music1',creatorId:'a',topics:['music'],createdAt:t-10000,quality:.5,visible:true},
   {id:'food1',creatorId:'b',topics:['food'],createdAt:t-10000,quality:.5,visible:true}
  ];
 const system=createOperatingSystem({
  verifyCredential:async credential=>({verified:credential==='alice'||credential==='bob',
   subject:credential,expiresAt:t+900000}),
  getRoles:async()=>['user'],ownerSubject:'owner-1',now:()=>t,
  auditSink:async e=>{records.push(e);return true},
  feedOptions:{
   checkConsent:async s=>consented.has(s),
   readCatalog:async({subject})=>{calls.push(['catalog',subject]);return catalog;},
   readExclusions:async({subject})=>{calls.push(['excluded',subject]);return {blockedCreators:[],hiddenIds:[]}}
  },
  mediaOptions:{
   checkConsent:async({subject,mediaId})=>consented.has(subject)&&mediaId==='own1',
   resolveMedia:async({subject,mediaId})=>({ownerSubject:subject==='alice'?'alice':'other',
     id:mediaId,kind:'reel',ready:true}),
   inferMedia:async x=>{calls.push(['inference',x]);return {topics:['music','religion','food'],
    summary:'Sample video contains music',captions:'Sample captions'};}
  }
 });
 return {system,consented,calls,records,t};
}
test('feed service reads only trusted catalog with verified account and consent',async()=>{
 const x=setup();await x.system.start();
 const event={contentId:'c1',action:'save',topics:['music'],at:x.t};
 assert.equal((await x.system.feed.record({credential:'alice',subject:'alice',event})).recorded,true);
 const r=await x.system.feed.recommend({credential:'alice',subject:'alice',feed:'reels'});
 assert.equal(r.personalized,true);
 assert.equal(r.items[0].contentId,'music1');
 assert.equal(x.calls[0][1],'alice');
 await assert.rejects(x.system.feed.record({credential:'bob',subject:'alice',event}),/ACCESS_DENIED/);
 await assert.rejects(x.system.feed.recommend({credential:'alice',subject:'bob'}),/ACCESS_DENIED/);
 x.consented.delete('alice');
 const revoked=await x.system.feed.recommend({credential:'alice',subject:'alice'});
 assert.equal(revoked.personalized,false);
 assert.equal((await x.system.feed.erase({credential:'alice',subject:'alice'})).erased,true);
});
test('media inference requires owned ready resource and explicit consent, no training',async()=>{
 const x=setup();await x.system.start();
 const result=await x.system.media.analyze({credential:'alice',subject:'alice',mediaId:'own1'});
 assert.deepEqual(result.topics,['music','food']);
 assert.equal(result.modelAnalysis,true);
 assert.equal(result.trainingAllowed,false);
 assert.equal(result.verifiedDeviceExport,false);
 const infer=x.calls.find(x=>x[0]==='inference')[1];
 assert.equal(infer.allowTraining,false);
 await assert.rejects(x.system.media.analyze({credential:'bob',subject:'alice',mediaId:'own1'}),/ACCESS_DENIED/);
 await assert.rejects(x.system.media.analyze({credential:'alice',subject:'alice',mediaId:'other'}),/MEDIA_CONSENT_REQUIRED/);
 assert.equal(x.calls.filter(x=>x[0]==='inference').length,1);
 assert.equal(JSON.stringify(x.records).includes('Sample captions'),false);
});
test('optional adapters remain disabled without trusted backend configuration',()=>{
 const x=setup();
 assert.throws(()=>createOperatingSystem({
  verifyCredential:async()=>null,getRoles:async()=>[],
  ownerSubject:'owner',auditSink:async()=>true,feedOptions:{}
 }),/FEED_TRUSTED_ADAPTERS_REQUIRED/);
 assert.equal(typeof x.system.media.analyze,'function');
});
