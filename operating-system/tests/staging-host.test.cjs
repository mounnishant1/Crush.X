'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
const {createStagingHost}=require('../host/staging-host.cjs');
test('loopback staging host actually executes authenticated consented AI jobs',async()=>{
 const token='x'.repeat(48),entries=new Map(),calls=[];
 const verifyCredential=async bearer=>({verified:bearer===token,
  subject:bearer===token?'alice':'',expiresAt:Date.now()+600000});
 const os=createOperatingSystem({
  verifyCredential,getRoles:async()=>['user'],ownerSubject:'owner',
  auditSink:async()=>true,
  consentOptions:{store:{
   get:async({subject,scope})=>entries.get(subject+scope)||null,
   put:async value=>{entries.set(value.subject+value.scope,value);return true;},
   delete:async({subject,scope})=>{entries.delete(subject+scope);return true;}
  }},
  modelProvider:{suggest:async data=>{calls.push(data);return 'Caption suggestion';}}
 });
 const host=createStagingHost({system:os,verifyCredential,allowedOrigins:['https://crushx.in'],pollMs:20});
 const started=await host.start();
 assert.equal(started.stagingOnly,true);
 assert.equal(started.durableQueue,false);
 const h={authorization:'Bearer '+token,'content-type':'application/json',origin:'https://crushx.in'};
 try{
  const consent=await fetch(started.url+'/v1/aura/consent',{method:'POST',headers:h,
   body:JSON.stringify({scope:'ai:reels'})});
  assert.equal(consent.status,200);
  const q=await fetch(started.url+'/v1/aura/guide',{method:'POST',headers:h,
   body:JSON.stringify({workflow:'reels',prompt:'Help with hook',requestId:'staging-req-001'})});
  assert.equal(q.status,202);const {jobId}=await q.json();
  let result=null;
  for(let i=0;i<50;i++){
   const r=await fetch(started.url+'/v1/aura/jobs/'+jobId,{headers:h});
   result=await r.json();
   if(result.status==='completed')break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(result.status,'completed');
  assert.equal(result.result.executed,false);
  assert.equal(result.result.suggestion,'Caption suggestion');
  assert.equal(calls.length,1);
 }finally{await host.stop();}
});
test('staging host refuses public listener to prevent unauthenticated exposure',()=>{
 const os={start:async()=>{},stop:async()=>{},tasks:{runNext:async()=>{}},
  aura:{invoke:async()=>{}},};
 assert.throws(()=>createStagingHost({system:os,verifyCredential:async()=>({}),host:'0.0.0.0'}),/STAGING_HOST_CONFIG_REQUIRED/);
});
