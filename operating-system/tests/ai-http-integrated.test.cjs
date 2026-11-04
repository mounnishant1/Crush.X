'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createOperatingSystem}=require('../index.cjs');
const {createAIHttpHandler}=require('../http/ai-handler.cjs');
const now=1900000000000,aliceToken='a'.repeat(48),bobToken='b'.repeat(48);
function runtime(){
 const db=new Map(),models=[];
 const identity=async token=>({verified:token===aliceToken||token===bobToken,
  subject:token===aliceToken?'alice':token===bobToken?'bob':'',
  expiresAt:now+3600000});
 const store={
  get:async({subject,scope})=>db.get(subject+'|'+scope)||null,
  put:async o=>{db.set(o.subject+'|'+o.scope,o);return true;},
  delete:async({subject,scope})=>{db.delete(subject+'|'+scope);return true;}
 };
 const os=createOperatingSystem({now:()=>now,ownerSubject:'admin',verifyCredential:identity,
  getRoles:async()=>['user'],auditSink:async()=>true,
  consentOptions:{store},modelProvider:{suggest:async a=>{models.push(a);return 'A safer caption';}},
  contentIntelligence:{
   checkConsent:async()=>true, // must be overridden by authoritative store
   loadAuthorizedContent:async()=>[{id:'c1',creatorId:'maker',kind:'reel',status:'published',
    moderation:'approved',visibility:'public',caption:'music',publishedAt:now-1000}],
   authorizeContent:async()=>true,readEngagementEvents:async()=>[],readExplicitInterests:async()=>[]
  }
 });
 return {os,models,identity};
}
async function usingServer(fn){
 const f=runtime();await f.os.start();
 const server=createServer(createAIHttpHandler({system:f.os,verifyCredential:f.identity,
  allowedOrigins:['https://crushx.in'],now:()=>now}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const headers=(token=aliceToken,origin='https://crushx.in')=>({
  authorization:'Bearer '+token,origin,'content-type':'application/json'
 });
 try{await fn({base,headers,...f});}
 finally{await new Promise(r=>server.close(r));await f.os.stop();}
}
test('explicit grant enables one AI workflow; receipts cannot cross accounts',async()=>{
 await usingServer(async({base,headers,os,models})=>{
  const consent=await fetch(base+'/v1/aura/consent',{method:'POST',headers:headers(),
   body:JSON.stringify({scope:'ai:editor',ttlMs:900000})});
  assert.equal(consent.status,200);
  assert.equal((await consent.json()).granted,true);
  const post=await fetch(base+'/v1/aura/guide',{method:'POST',headers:headers(),body:JSON.stringify({
   workflow:'editor',prompt:'Help with pacing',requestId:'guide-request-0001'})});
  assert.equal(post.status,202);const job=await post.json();
  assert.equal(models.length,0);
  assert.equal((await os.tasks.runNext()).status,'completed');
  const receipt=await fetch(base+'/v1/aura/jobs/'+job.jobId,{headers:headers()});
  assert.equal((await receipt.json()).result.suggestion,'A safer caption');
  const denied=await fetch(base+'/v1/aura/jobs/'+job.jobId,{headers:headers(bobToken)});
  assert.equal(denied.status,403);
  assert.equal(models.length,1);
 });
});
test('consent revocation after enqueue blocks model execution',async()=>{
 await usingServer(async({base,headers,os,models})=>{
  await fetch(base+'/v1/aura/consent',{method:'POST',headers:headers(),body:JSON.stringify({scope:'ai:reels'})});
  const post=await fetch(base+'/v1/aura/guide',{method:'POST',headers:headers(),body:JSON.stringify({
   workflow:'reels',prompt:'Improve hook',requestId:'guide-request-0002'})});
  assert.equal(post.status,202);
  const revoked=await fetch(base+'/v1/aura/consent?scope=ai%3Areels',
   {method:'DELETE',headers:headers()});
  assert.equal(revoked.status,200);
  assert.equal((await revoked.json()).revoked,true);
  assert.equal((await os.tasks.runNext()).status,'failed');
  assert.equal(models.length,0);
 });
});
test('content search requires separate scopes and independently checked published content',async()=>{
 await usingServer(async({base,headers,os})=>{
  const request=()=>fetch(base+'/v1/aura/content-find',{method:'POST',headers:headers(),
   body:JSON.stringify({question:'music',requestId:'content-find-001'})});
  assert.equal((await request()).status,202);
  assert.equal((await os.tasks.runNext()).status,'failed');
  for(const scope of ['content:read','content:analyze']){
   const r=await fetch(base+'/v1/aura/consent',{method:'POST',headers:headers(),
    body:JSON.stringify({scope})});assert.equal(r.status,200);
  }
  const r=await fetch(base+'/v1/aura/content-find',{method:'POST',headers:headers(),
   body:JSON.stringify({question:'music',requestId:'content-find-002'})});
  assert.equal(r.status,202);const j=await r.json();
  assert.equal((await os.tasks.runNext()).status,'completed');
  const saved=(await (await fetch(base+'/v1/aura/jobs/'+j.jobId,{headers:headers()})).json()).result;
  assert.equal(saved.sources[0].id,'c1');
  assert.equal(saved.modelUsed,false);
 });
});
test('missing auth, origin denial, unknown scopes and client role forgery fail closed',async()=>{
 await usingServer(async({base,headers,models})=>{
  assert.equal((await fetch(base+'/v1/aura/consent')).status,401);
  assert.equal((await fetch(base+'/v1/aura/consent',{headers:headers(aliceToken,'https://evil.test')})).status,403);
  const bad=await fetch(base+'/v1/aura/consent',{method:'POST',headers:headers(),
   body:JSON.stringify({scope:'ai:owner',subject:'admin'})});
  assert.equal(bad.status,400);
  assert.equal((await fetch(base+'/v1/aura/guide',{method:'POST',headers:headers(),
   body:JSON.stringify({workflow:'wallet.pay',prompt:'send money',requestId:'guide-request-0003'})})).status,400);
  assert.equal(models.length,0);
 });
});
