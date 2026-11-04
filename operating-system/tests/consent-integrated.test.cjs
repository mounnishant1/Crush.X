'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
function runtime(){
 let now=1900000000000;const values=new Map(),events=[],models=[];
 const store={
  get:async({subject,scope})=>values.get(subject+'|'+scope)||null,
  put:async v=>{values.set(v.subject+'|'+v.scope,{...v});return true;},
  delete:async({subject,scope})=>{values.delete(subject+'|'+scope);return true;}
 };
 const os=createOperatingSystem({
  now:()=>now,
  ownerSubject:'admin',
  verifyCredential:async token=>({verified:['alice','bob','admin'].includes(token),
   subject:token,expiresAt:now+1800000}),
  getRoles:async sub=>sub==='admin'?['owner']:['user'],
  auditSink:async e=>{events.push(e);return true;},
  modelProvider:{suggest:async request=>{models.push(request);return 'Suggestion only';}},
  consentOptions:{store},
  contentIntelligence:{
   // Deliberately bogus adapter: central trusted consent must supersede it.
   checkConsent:async()=>true,
   loadAuthorizedContent:async()=>[],
   authorizeContent:async()=>true,
   readEngagementEvents:async()=>[],
   readExplicitInterests:async()=>[]
  }
 });
 return {os,values,events,models,get now(){return now;},tick:ms=>{now+=ms}};
}
test('model unavailable without grant; consent works for 15 minutes and rechecks at worker execution',async()=>{
 const x=runtime();await x.os.start();
 const args={credential:'alice',resourceOwner:'alice',toolName:'ai.reels.guide',
  args:{prompt:'Review captions'},idempotencyKey:'consent-00001'};
 const queued=await x.os.aura.invoke(args);
 assert.equal((await x.os.tasks.runNext()).status,'failed');
 assert.equal(x.models.length,0);
 const allowed=await x.os.consents.grant({credential:'alice',subject:'alice',scope:'ai:reels'});
 assert.equal(allowed.granted,true);
 assert.equal(await x.os.consents.check({subject:'alice',scope:'ai:reels'}),true);
 const request=await x.os.aura.invoke({...args,idempotencyKey:'consent-00002'});
 assert.equal((await x.os.tasks.runNext()).status,'completed');
 const result=await x.os.tasks.inspect({credential:'alice',jobId:request.jobId});
 assert.equal(result.result.executed,false);
 assert.equal(x.models.length,1);
 const again=await x.os.aura.invoke({...args,idempotencyKey:'consent-00003'});
 await x.os.consents.revoke({credential:'alice',subject:'alice',scope:'ai:reels'});
 assert.equal((await x.os.tasks.runNext()).status,'failed');
 assert.equal(x.models.length,1);
 assert.equal((await x.os.tasks.inspect({credential:'alice',jobId:again.jobId})).result,null);
});
test('owner grant cannot be self-elevated and cross-account consent access is forbidden',async()=>{
 const x=runtime();await x.os.start();
 await assert.rejects(x.os.consents.grant({credential:'alice',subject:'bob',scope:'ai:reels'}),/ACCESS_DENIED/);
 await assert.rejects(x.os.consents.grant({credential:'alice',subject:'alice',scope:'ai:owner'}),/ACCESS_DENIED/);
 await assert.rejects(x.os.consents.grant({credential:'admin',subject:'alice',scope:'ai:reels'}),/ACCESS_DENIED/);
 assert.equal((await x.os.consents.grant({credential:'admin',subject:'admin',scope:'ai:owner'})).granted,true);
 await assert.rejects(x.os.consents.grant({credential:'alice',subject:'alice',scope:'ai:reels',ttlMs:86400000}),/INVALID_CONSENT_TTL/);
 await assert.rejects(x.os.consents.grant({credential:'alice',subject:'alice',scope:'ai:wallet.pay'}),/ACCESS_DENIED/);
});
test('consent expires and authenticated users can revoke; content ACL requires separate scope',async()=>{
 const x=runtime();await x.os.start();
 await x.os.consents.grant({credential:'alice',subject:'alice',scope:'content:read',ttlMs:60000});
 assert.equal((await x.os.consents.status({credential:'alice',subject:'alice',scope:'content:read'})).active,true);
 const first=await x.os.aura.invoke({credential:'alice',resourceOwner:'alice',
  toolName:'content.feed.rank',args:{kind:'reel'},idempotencyKey:'rank-000001'});
 assert.equal((await x.os.tasks.runNext()).status,'completed');
 assert.equal((await x.os.tasks.inspect({credential:'alice',jobId:first.jobId})).result.personalized,false);
 x.tick(61000);
 assert.equal(await x.os.consents.check({subject:'alice',scope:'content:read'}),false);
 const second=await x.os.aura.invoke({credential:'alice',resourceOwner:'alice',
  toolName:'content.feed.rank',args:{kind:'reel'},idempotencyKey:'rank-000002'});
 assert.equal((await x.os.tasks.runNext()).status,'failed');
 assert.equal((await x.os.tasks.inspect({credential:'alice',jobId:second.jobId})).result,null);
 await x.os.consents.revoke({credential:'alice',subject:'alice',scope:'content:read'});
 assert.equal(x.values.has('alice|content:read'),false);
 assert.equal(JSON.stringify(x.events).includes('Review captions'),false);
});
