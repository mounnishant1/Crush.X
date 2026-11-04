'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createOperatingSystem}=require('../index.cjs');
const {createAuraHttpHandler}=require('../http/aura-handler.cjs');
const now=1700000000000;
const alice='a'.repeat(40),bob='b'.repeat(40);
function fixture(){
 const subjects=new Map([[alice,'alice'],[bob,'bob']]);const calls=[],grant=new Set(['alice:editor']);
 const verifyCredential=async token=>({verified:subjects.has(token),
  subject:subjects.get(token)||'',expiresAt:now+600000});
 const system=createOperatingSystem({verifyCredential,now:()=>now,
  getRoles:async()=>['user'],ownerSubject:'owner-1',
  auditSink:async()=>true,aiConsent:async({subject,workflow})=>grant.has(subject+':'+workflow),
  modelProvider:{suggest:async args=>{calls.push(args);return 'Check timing and captions';}}});
 const handler=createAuraHttpHandler({system,verifyCredential,now:()=>now,
  allowedOrigins:['https://crushx.in']});
 return {system,handler,calls,grant};
}
async function withServer(handler,fn){
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(r=>server.close(r));}
}
function headers(token=alice,origin='https://crushx.in'){return {
 authorization:'Bearer '+token,origin,'content-type':'application/json'};}
test('API queues only authenticated, user-owned guidance and returns receipt',async()=>{
 const f=fixture();await f.system.start();
 await withServer(f.handler,async url=>{
  const r=await fetch(url+'/v1/aura/guide',{method:'POST',headers:headers(),
   body:JSON.stringify({workflow:'editor',prompt:'Improve this reel',requestId:'request-0001'})});
  assert.equal(r.status,202);
  const receipt=await r.json();
  assert.equal(receipt.status,'queued');
  assert.equal(f.calls.length,0);
  assert.equal((await f.system.tasks.runNext()).status,'completed');
  const inspect=await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers:headers()});
  assert.equal(inspect.status,200);
  const job=await inspect.json();
  assert.equal(job.status,'completed');
  assert.equal(job.result.executed,false);
  assert.equal(job.result.suggestion,'Check timing and captions');
  assert.equal((await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers:headers(bob)})).status,403);
 });
});
test('forgery, untrusted origins, owner elevation and absent bearer fail closed',async()=>{
 const f=fixture();await f.system.start();
 await withServer(f.handler,async url=>{
  const doPost=(h,body)=>fetch(url+'/v1/aura/guide',{method:'POST',headers:h,body:JSON.stringify(body)});
  const base={workflow:'editor',prompt:'review',requestId:'request-0002'};
  assert.equal((await doPost({'content-type':'application/json'},base)).status,401);
  assert.equal((await doPost(headers(alice,'https://evil.example'),base)).status,403);
  assert.equal((await doPost(headers(),{...base,subject:'owner-1'})).status,400);
  assert.equal((await doPost(headers(),{...base,workflow:'owner'})).status,403);
  assert.equal((await doPost(headers(),{...base,workflow:'wallet.execute'})).status,400);
  assert.equal(f.calls.length,0);
 });
});
test('queued inference is blocked if trusted consent is withdrawn before worker execution',async()=>{
 const f=fixture();await f.system.start();
 await withServer(f.handler,async url=>{
  const r=await fetch(url+'/v1/aura/guide',{method:'POST',headers:headers(),
   body:JSON.stringify({workflow:'editor',prompt:'review',requestId:'request-0003'})});
  assert.equal(r.status,202);
  const receipt=await r.json();
  f.grant.delete('alice:editor');
  assert.equal((await f.system.tasks.runNext()).status,'failed');
  const data=await (await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers:headers()})).json();
  assert.equal(data.result,null);
  assert.equal(f.calls.length,0);
 });
});
