'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createOperatingSystem}=require('../index.cjs');
const {createDurableAdvisoryQueue}=require('../durable/advice-queue.cjs');
const {createStagingHost}=require('../host/staging-host.cjs');
test('authenticated HTTP -> durable encrypted queue -> worker -> receipt -> revoke -> purge',async()=>{
 const clock=()=>Date.now(),token='a'.repeat(48),rows=new Map(),calls=[];
 const verifyCredential=async c=>({verified:c===token,subject:'alice',expiresAt:clock()+300000});
 const consentStore=new Map();
 const os=createOperatingSystem({
  verifyCredential,getRoles:async()=>['user'],ownerSubject:'owner',
  auditSink:async()=>true,now:clock,
  consentOptions:{store:{
   get:async({subject,scope})=>consentStore.get(subject+'|'+scope)||null,
   put:async v=>{consentStore.set(v.subject+'|'+v.scope,{...v});return true;},
   delete:async({subject,scope})=>{consentStore.delete(subject+'|'+scope);return true;}
  }}
 });
 const queueStore={
  async get(id){return rows.has(id)?{...rows.get(id)}:null;},
  async insert(j){if(rows.has(j.id))return false;rows.set(j.id,{...j});return true;},
  async claim({now,leaseMs}){
   const j=[...rows.values()].find(j=>j.status==='queued'&&(j.nextRunAt<=now));
   if(!j)return null;j.status='running';j.leaseToken='lease-001';j.dueAt=now+leaseMs;
   j.attempts++;return {...j};
  },
  async settle({id,leaseToken,status,code,sealedResult}){
   const j=rows.get(id);if(!j||j.leaseToken!==leaseToken||j.status!=='running')return false;
   j.status=status;j.code=code;j.sealedResult=sealedResult;
   delete j.sealed;delete j.leaseToken;return true;
  },
  async cancel({id,subject}){const j=rows.get(id);if(!j||j.subject!==subject||
   j.status!=='queued')return false;j.status='cancelled';return true;},
  async purge({id,subject}){const j=rows.get(id);if(!j||j.subject!==subject||
   j.status==='running')return false;rows.delete(id);return true;}
 };
 const durableAdvice=createDurableAdvisoryQueue({
  store:queueStore,permissions:os.permissions,audit:os.audit,consents:os.consents,
  modelProvider:{suggest:async v=>{calls.push(v);return 'Better rhythm and captions';}},
  getRoles:async()=>['user'],isAccountActive:async()=>true,now:clock,
  encryptionKey:randomBytes(32),hmacKey:randomBytes(32)
 });
 const rateLimiter={allow:async()=>true};
 const host=createStagingHost({system:os,verifyCredential,
  allowedOrigins:['https://crushx.in'],durableAdvice,rateLimiter,pollMs:20});
 const {url,durableQueueConfigured}=await host.start();
 assert.equal(durableQueueConfigured,true);
 const headers={authorization:'Bearer '+token,origin:'https://crushx.in',
  'content-type':'application/json'};
 try{
  const allow=await fetch(url+'/v1/aura/consent',{method:'POST',headers,
   body:JSON.stringify({scope:'ai:editor'})});
  assert.equal(allow.status,200);
  const input={workflow:'editor',prompt:'Help with this reel',requestId:'durable-job-0001'};
  const first=await fetch(url+'/v1/aura/guide',{method:'POST',headers,body:JSON.stringify(input)});
  assert.equal(first.status,202);const receipt=await first.json();
  const duplicate=await fetch(url+'/v1/aura/guide',{method:'POST',headers,body:JSON.stringify(input)});
  assert.equal((await duplicate.json()).jobId,receipt.jobId);
  let last=null;
  for(let i=0;i<50;i++){
   const response=await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers});
   last=await response.json();
   if(last.status==='completed')break;
   await new Promise(r=>setTimeout(r,20));
  }
  assert.equal(last.status,'completed');
  assert.equal(last.result.suggestion,'Better rhythm and captions');
  assert.equal(last.result.executed,false);
  assert.equal(calls.length,1);
  assert.doesNotMatch(JSON.stringify([...rows.values()]),/Help with this reel|Better rhythm and captions/);
  const revoke=await fetch(url+'/v1/aura/consent?scope=ai%3Aeditor',{method:'DELETE',headers});
  assert.equal(revoke.status,200);
  const hidden=await (await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers})).json();
  assert.equal(hidden.result,null,'withdrawal hides previously completed advice');
  const del=await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{method:'DELETE',headers});
  assert.equal(del.status,200);
  assert.equal(rows.size,0);
  assert.equal((await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers})).status,404);
 }finally{await host.stop();}
});
test('production guard requires distributed limiter when opted in',()=>{
 const {createAIHttpHandler}=require('../http/ai-handler.cjs');
 const system={aura:{invoke:async()=>{}},tasks:{inspect:async()=>{},cancel:async()=>{}}};
 assert.throws(()=>createAIHttpHandler({
  system,verifyCredential:async()=>({}),requireDistributedLimiter:true
 }),/DISTRIBUTED_RATE_LIMITER_REQUIRED/);
});
