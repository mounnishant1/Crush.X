'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
const {validRank,validQuery}=require('../features/content-intelligence.cjs');
const NOW=1800000000000;
function reel(id,topic='cooking',extra={}) {
 return {id,creatorId:id.split('_')[0],kind:'reel',status:'published',moderation:'approved',
 visibility:'public',caption:topic+' tutorial',topics:[topic],publishedAt:NOW-1000,...extra};
}
function fixture({configured=true}={}){
 const calls=[],consents=new Set(),blocked=new Set(),audit=[];
 const items=[reel('a_1','gaming'),reel('b_1','cooking'),reel('c_1','science')];
 const adapters={
  checkConsent:async({subject,scope})=>consents.has(subject+':'+scope),
  loadAuthorizedContent:async({subject})=>{calls.push('load:'+subject);return items;},
  authorizeContent:async({subject,id})=>{calls.push('acl:'+subject+':'+id);return !blocked.has(id);},
  readEngagementEvents:async({subject})=>{calls.push('signals:'+subject);return [{viewerId:subject,action:'save',topics:['cooking']}];},
  readExplicitInterests:async({subject})=>{calls.push('interests:'+subject);return ['cooking'];}
 };
 const values={
  verifyCredential:async token=>({verified:['alice','bob'].includes(token),subject:token,expiresAt:NOW+100000}),
  getRoles:async()=>['user'],ownerSubject:'owner',now:()=>NOW,
  auditSink:async entry=>{audit.push(entry);return true;}
 };
 if(configured)values.contentIntelligence=adapters;
 return {os:createOperatingSystem(values),items,consents,blocked,calls,audit,adapters};
}
async function request(f,toolName,args,key='content-request-001',credential='alice',resourceOwner='alice'){
 return f.os.aura.invoke({credential,toolName,args,idempotencyKey:key,resourceOwner});
}
test('no content adapter means no callable content tools',async()=>{
 const f=fixture({configured:false});
 assert.deepEqual(f.os.contentWorkflowRegistration.configured,[]);
 await f.os.start();
 await assert.rejects(request(f,'content.find',{question:'cooking'}),/UNKNOWN_TOOL/);
});
test('strict input contracts reject account IDs or model instructions',()=>{
 assert.equal(validRank({kind:'reel',limit:10}),true);
 assert.equal(validRank({kind:'dm'}),false);
 assert.equal(validRank({viewerId:'bob'}),false);
 assert.equal(validQuery({question:'Show cooking'}),true);
 assert.equal(validQuery({question:'Show cooking',subject:'bob'}),false);
});
test('verified identity and both consent scopes gate sourced questions',async()=>{
 const f=fixture();await f.os.start();
 const r=await request(f,'content.find',{question:'cooking'},'content-request-002');
 assert.equal((await f.os.tasks.runNext()).status,'failed');
 assert.equal(f.calls.length,0);
 f.consents.add('alice:content:read');f.consents.add('alice:content:analyze');
 const a=await request(f,'content.find',{question:'cooking'},'content-request-003');
 assert.equal((await f.os.tasks.runNext()).status,'completed');
 const answer=(await f.os.tasks.inspect({credential:'alice',jobId:a.jobId})).result;
 assert.equal(answer.sources[0].id,'b_1');
 assert.equal(answer.modelUsed,false);
 assert.ok(!JSON.stringify(f.audit).includes('cooking'));
});
test('ranker never reads signals without explicit personalization consent',async()=>{
 const f=fixture();await f.os.start();f.consents.add('alice:content:read');
 const r=await request(f,'content.feed.rank',{kind:'reel',limit:10},'content-request-004');
 await f.os.tasks.runNext();
 const result=(await f.os.tasks.inspect({credential:'alice',jobId:r.jobId})).result;
 assert.equal(result.personalized,false);
 assert.equal(f.calls.some(x=>x.startsWith('signals:')),false);
 f.consents.add('alice:content:personalize');
 const b=await request(f,'content.feed.rank',{kind:'reel',limit:10},'content-request-005');
 await f.os.tasks.runNext();
 const ranked=(await f.os.tasks.inspect({credential:'alice',jobId:b.jobId})).result;
 assert.equal(ranked.personalized,true);
 assert.equal(ranked.items[0].id,'b_1');
 assert.equal(f.calls.some(x=>x==='signals:alice'),true);
});
test('independent ACL removes blocked content from results and citations',async()=>{
 const f=fixture();f.blocked.add('b_1');
 f.consents.add('alice:content:read');f.consents.add('alice:content:analyze');
 await f.os.start();
 const r=await request(f,'content.find',{question:'cooking'},'content-request-006');
 await f.os.tasks.runNext();
 const answer=(await f.os.tasks.inspect({credential:'alice',jobId:r.jobId})).result;
 assert.equal(answer.sources.length,0);
});
test('cross-account resource access fails before a worker runs',async()=>{
 const f=fixture();await f.os.start();
 await assert.rejects(request(f,'content.find',{question:'cooking'},'content-request-007','alice','bob'),/ACCESS_DENIED/);
 assert.equal(f.calls.length,0);
});
test('hidden private and expired content excluded even if an adapter returns it',async()=>{
 const f=fixture();
 f.items.push(reel('x_1','cooking',{visibility:'private'}));
 f.items.push(reel('x_2','cooking',{moderation:'rejected'}));
 f.items.push(reel('x_3','cooking',{kind:'story',expiresAt:NOW-1}));
 f.blocked.add('b_1');
 f.consents.add('alice:content:read');f.consents.add('alice:content:analyze');
 await f.os.start();
 const r=await request(f,'content.find',{question:'cooking'},'content-request-008');
 await f.os.tasks.runNext();
 const answer=(await f.os.tasks.inspect({credential:'alice',jobId:r.jobId})).result;
 assert.equal(answer.sources.length,0);
});
