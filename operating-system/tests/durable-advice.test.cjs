'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createDurableAdvisoryQueue}=require('../durable/advice-queue.cjs');
const nowRef={now:1900000000000};
function store(now=()=>nowRef.now){
 const rows=new Map();
 const clone=x=>x?structuredClone(x):null;
 return {
  rows,
  async insert(job){if(rows.has(job.id))return false;rows.set(job.id,clone(job));return true;},
  async get(id){return clone(rows.get(id));},
  async claim({now:at,leaseMs}){
   const job=[...rows.values()].sort((a,b)=>a.nextRunAt-b.nextRunAt)
    .find(j=>['queued','running'].includes(j.status)&&
     (j.dueAt??j.nextRunAt)<=at&&j.expiresAt>at);
   if(!job)return null;
   job.status='running';job.attempts++;job.leaseToken='lease-'+job.attempts;
   job.dueAt=at+leaseMs;
   return clone(job);
  },
  async settle({id,leaseToken,status,code,sealedResult}){
   const j=rows.get(id);
   if(j.status!=='running'||j.leaseToken!==leaseToken)return false;
   j.status=status;j.code=code;j.sealedResult=sealedResult;delete j.sealed;
   delete j.leaseToken;delete j.dueAt;return true;
  },
  async cancel({id,subject}){
   const j=rows.get(id);if(!j||j.subject!==subject||j.status!=='queued')return false;
   j.status='cancelled';delete j.sealed;return true;
  },
  async purge({id,subject}){
   const j=rows.get(id);if(!j||j.subject!==subject||j.status==='running')return false;
   rows.delete(id);return true;
  }
 };
}
function fixture(){
 nowRef.now=1900000000000;
 const events=[],models=[],consent=new Set(['alice:reels']),active=new Set(['alice','bob']);
 const db=store(),keys={hmacKey:randomBytes(32),encryptionKey:randomBytes(32)};
 let deferred=null;
 const permissions={
  issue:async({credential,capability,resourceOwner})=>{
   if(!active.has(credential)||capability!=='aura:use'||credential!==resourceOwner)
    throw Error('ACCESS_DENIED');
   return {subject:credential,capability,resourceOwner};
  },
  check:async grant=>grant
 };
 const deps={
  store:db,permissions,audit:{record:async e=>{events.push(e);return e;}},
  consents:{check:async({subject,scope})=>consent.has(subject+':'+scope.slice(3))},
  modelProvider:{suggest:async args=>{models.push(args);
   if(deferred)await deferred;return 'Explain Reel pacing only';}},
  getRoles:async subject=>active.has(subject)?['user']:[],
  isAccountActive:async subject=>active.has(subject),
  now:()=>nowRef.now,...keys
 };
 const queue=createDurableAdvisoryQueue(deps);
 return {queue,db,consent,active,models,events,deps,setDeferred:p=>deferred=p};
}
function args(key='request-0001'){
 return {credential:'alice',subject:'alice',workflow:'reels',
  prompt:'Help with caption hooks',context:'short clip',requestId:key};
}
test('stored prompts and responses are encrypted; duplicate submissions idempotent',async()=>{
 const f=fixture();
 const first=await f.queue.submit(args());
 const duplicate=await f.queue.submit(args());
 assert.equal(first.jobId,duplicate.jobId);
 assert.equal(f.db.rows.size,1);
 const raw=JSON.stringify([...f.db.rows.values()]);
 assert.doesNotMatch(raw,/Help with caption hooks|short clip/);
 const receipt=await f.queue.inspect({credential:'alice',subject:'alice',jobId:first.jobId});
 assert.equal(receipt.status,'queued');
 const result=await f.queue.runOne();
 assert.equal(result.status,'completed');
 assert.equal(f.models.length,1);
 const saved=JSON.stringify([...f.db.rows.values()]);
 assert.doesNotMatch(saved,/Explain Reel pacing only|Help with caption hooks/);
 const finished=await f.queue.inspect({credential:'alice',subject:'alice',jobId:first.jobId});
 assert.equal(finished.result.suggestion,'Explain Reel pacing only');
 assert.equal(finished.result.executed,false);
 await assert.rejects(f.queue.submit({...args(),prompt:'changed'}),/IDEMPOTENCY_CONFLICT/);
});
test('user-to-user cross access and missing consent are blocked',async()=>{
 const f=fixture();
 await assert.rejects(f.queue.submit({...args(),credential:'bob'}),/ACCESS_DENIED/);
 await assert.rejects(f.queue.submit({...args(),subject:'bob'}),/ACCESS_DENIED/);
 f.consent.clear();
 await assert.rejects(f.queue.submit(args()),/AI_CONSENT_REQUIRED/);
 assert.equal(f.db.rows.size,0);
});
test('consent revoked after enqueue blocks model inference',async()=>{
 const f=fixture();
 const receipt=await f.queue.submit(args());
 f.consent.clear();
 const run=await f.queue.runOne();
 assert.equal(run.status,'blocked');
 assert.equal(f.models.length,0);
 const result=await f.queue.inspect({credential:'alice',subject:'alice',jobId:receipt.jobId});
 assert.equal(result.result,null);
});
test('in-flight revocation never publishes model response',async()=>{
 const f=fixture();
 let release;const hold=new Promise(r=>release=r);
 f.setDeferred(hold);
 const receipt=await f.queue.submit(args());
 const pending=f.queue.runOne();
 while(f.models.length===0)await new Promise(r=>setImmediate(r));
 f.consent.clear();release();
 const run=await pending;
 assert.equal(run.status,'failed');
 const result=await f.queue.inspect({credential:'alice',subject:'alice',jobId:receipt.jobId});
 assert.equal(result.result,null);
});
test('expired worker lease is reclaimed and stale worker cannot settle',async()=>{
 const f=fixture();
 await f.queue.submit(args());
 const first=await f.db.claim({now:nowRef.now,leaseMs:120000});
 assert.equal(first.attempts,1);
 nowRef.now+=121000;
 const recovered=await f.queue.runOne();
 assert.equal(recovered.status,'completed');
 assert.equal(f.models.length,1);
 assert.equal(await f.db.settle({id:first.id,leaseToken:first.leaseToken,status:'completed'}),false);
});
test('queued cancellation, erase and disabled account',async()=>{
 const f=fixture();
 const r=await f.queue.submit(args());
 assert.equal((await f.queue.cancel({credential:'alice',subject:'alice',jobId:r.jobId})).status,'cancelled');
 assert.equal(await f.queue.runOne(),null);
 assert.equal((await f.queue.purge({credential:'alice',subject:'alice',jobId:r.jobId})).erased,true);
 assert.equal(f.db.rows.size,0);
 const second=await f.queue.submit(args('request-0002'));
 f.active.delete('alice');
 const result=await f.queue.runOne();
 assert.equal(result.status,'blocked');
 assert.equal(f.models.length,0);
 // Auth can no longer view the job for this disabled account.
 await assert.rejects(f.queue.inspect({credential:'alice',subject:'alice',jobId:second.jobId}),/ACCESS_DENIED/);
});
test('completed advice becomes unreadable at expiry even without TTL cleanup',async()=>{
 const f=fixture();
 const r=await f.queue.submit(args());
 assert.equal((await f.queue.runOne()).status,'completed');
 assert.equal((await f.queue.inspect({credential:'alice',subject:'alice',jobId:r.jobId})).result.suggestion,
  'Explain Reel pacing only');
 nowRef.now+=86400001;
 assert.equal((await f.queue.inspect({credential:'alice',subject:'alice',jobId:r.jobId})).result,null);
});
test('queue rejects missing atomic adapters or weak secrets',()=>{
 assert.throws(()=>createDurableAdvisoryQueue({}),/DURABLE_ADVISORY_TRUSTED_CONFIG_REQUIRED/);
});
