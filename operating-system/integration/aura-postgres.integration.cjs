'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {createPostgresAdviceStore}=require('../durable/postgres-advice-store.cjs');
const {createPostgresRateLimiter}=require('../http/postgres-rate-limiter.cjs');
const {createDurableAdvisoryQueue}=require('../durable/advice-queue.cjs');
test('real PostgreSQL: durable encrypted AURA advice, fenced leases, cross-account limiter',
 {skip:!process.env.POSTGRES_TEST_URL},async()=>{
 const {Pool}=require(process.env.PG_MODULE||'pg');
 const pool=new Pool({connectionString:process.env.POSTGRES_TEST_URL,max:4});
 const now=Date.now(),subject='qa_'+randomUUID().replaceAll('-','').slice(0,16);
 const secret=randomBytes(32),jobs=new Set();
 const db=createPostgresAdviceStore({pool});
 const limiter=createPostgresRateLimiter({pool,secret,limit:2,windowMs:60000});
 const models=[];
 const perms={issue:async({credential,resourceOwner})=>{
  if(credential!==resourceOwner)throw Error('ACCESS_DENIED');
  return {subject:credential};},check:async grant=>grant};
 const queue=createDurableAdvisoryQueue({
  store:db,permissions:perms,audit:{record:async()=>true},
  consents:{check:async({subject:who})=>who===subject},
  modelProvider:{suggest:async({prompt})=>{models.push(prompt);return 'Consider a concise caption';}},
  getRoles:async who=>who===subject?['user']:[],
  isAccountActive:async who=>who===subject,
  now:()=>now,hmacKey:randomBytes(32),encryptionKey:randomBytes(32)
 });
 const args={credential:subject,subject,workflow:'reels',requestId:'qa-request-001',
  prompt:'Give tips for my own Reel',context:'safe short clip'};
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'..','storage','migrations',
   '003_local_aura_advice.sql'),'utf8'));
  const one=await queue.submit(args);jobs.add(one.jobId);
  const dup=await queue.submit(args);assert.equal(dup.jobId,one.jobId);
  const raw=await db.get(one.jobId);
  assert.equal(raw.status,'queued');
  assert.equal(JSON.stringify(raw).includes(args.prompt),false);
  const completed=await Promise.all([queue.runOne(),queue.runOne()]);
  assert.equal(completed.filter(x=>x?.status==='completed').length,1);
  assert.equal(models.length,1);
  const out=await queue.inspect({credential:subject,subject,jobId:one.jobId});
  assert.equal(out.status,'completed');
  assert.equal(out.result.suggestion,'Consider a concise caption');
  assert.equal(out.result.sent,false);assert.equal(out.result.executed,false);
  await assert.rejects(queue.inspect({credential:'intruder',subject,jobId:one.jobId}),/ACCESS_DENIED/);
  const two=await queue.submit({...args,requestId:'qa-request-002'});jobs.add(two.jobId);
  const oldLease=await db.claim({now,leaseMs:120000});
  assert.equal(oldLease.id,two.jobId);
  const newLease=await db.claim({now:now+120001,leaseMs:120000});
  assert.equal(newLease.id,two.jobId);
  assert.notEqual(newLease.leaseToken,oldLease.leaseToken);
  assert.equal(await db.settle({id:oldLease.id,leaseToken:oldLease.leaseToken,
   status:'completed',now:now+120002}),false);
  assert.equal(await db.settle({id:newLease.id,leaseToken:newLease.leaseToken,
   status:'failed',code:'TEST',now:now+120003}),true);
  assert.equal(await db.purge({id:one.jobId,subject:'intruder'}),false);
  const p=(who,time)=>limiter.allow({subject:who,now:time,bucket:'aura'});
  assert.equal(await p(subject,now),true);assert.equal(await p(subject,now),true);
  assert.equal(await p(subject,now),false);
  assert.equal(await p(subject+'_other',now),true);
  assert.equal(await p(subject,now+60000),true);
  const rateBucketRows=await pool.query('SELECT hits FROM cx_aura_rate_buckets');
  assert.equal(rateBucketRows.rows.length>=3,true);
 }finally{
  try{
   await pool.query('DELETE FROM cx_aura_advice_jobs WHERE subject=$1',[subject]);
   for(const who of [subject,subject+'_other']){
    for(const instant of [now,now+60000]){
     const window=Math.floor(instant/60000);
     const key=createHmac('sha256',secret).update(JSON.stringify([who,'aura',window])).digest('hex');
     await pool.query('DELETE FROM cx_aura_rate_buckets WHERE bucket_key=$1',[key]);
    }
   }
  }finally{await pool.end();}
 }
});
