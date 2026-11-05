'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {createPostgresContentStore}=require('../storage/postgres-content-store.cjs');
const {createTrustedReceiptService}=require('../engagement/trusted-receipts.cjs');
const {createPostgresReceiptStore}=require('../storage/postgres-trusted-receipts.cjs');
test('real PostgreSQL: consent, ACL, idempotency, negative feedback, erasure', {skip:!process.env.POSTGRES_TEST_URL},async()=>{
 const {Pool}=require(process.env.PG_MODULE||'pg');
 const pool=new Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1,connectionTimeoutMillis:1800});
 const suffix=randomUUID().replaceAll('-','').slice(0,16),subject='qa_'+suffix;
 const ids=['recipe_','hidden_','other_'].map(x=>x+suffix),now=Date.now();
 let receiptStore;
 const receiptService=createTrustedReceiptService({key:Buffer.alloc(32,64),now:()=>now,
  readSignedReceipt:({subject:who,eventId,db})=>receiptStore.read({subject:who,eventId,db})});
 receiptStore=createPostgresReceiptStore({pool,now:()=>now,
  validateReceipt:receiptService.verifyIssuedReceipt});
 const store=createPostgresContentStore({pool,now:()=>now,
  verifyTrustedEvent:receiptService.verifyTrustedEvent});
 const record=async event=>{
  await receiptStore.save({receipt:receiptService.signTrustedEvent({subject,event})});
  return store.recordTrustedEvent({subject,event});
 };
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'..','storage','migrations','001_content_intelligence.sql'),'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname,'..','storage','migrations','002_trusted_engagement_receipts.sql'),'utf8'));
  assert.equal(await store.checkConsent({subject,scope:'content:read'}),false);
  const add=async(id,visibility,creator)=>pool.query('INSERT INTO cx_content_catalog '+
   '(content_id,creator_subject,kind,status,moderation,visibility,caption,topics,published_at) '+
   "VALUES($1,$2,'reel','published','approved',$3,'Cooking pasta',ARRAY['cooking'],NOW())",
   [id,creator,visibility]);
  await add(ids[0],'public','creator_1');
  await add(ids[1],'private','creator_1');
  await add(ids[2],'self',subject);
  await store.setPreferences({subject,read:true,analyze:true,personalize:true,topics:['cooking']});
  assert.deepEqual(new Set((await store.loadAuthorizedContent({subject})).map(x=>x.id)),new Set([ids[0],ids[2]]));
  assert.equal(await store.authorizeContent({subject,id:ids[1],kind:'reel'}),false);
  const like={eventId:'like_evt_'+suffix,contentId:ids[0],action:'like',at:now};
  assert.equal((await record(like)).recorded,true);
  await assert.rejects(store.recordTrustedEvent({subject,event:{...like,eventId:'spoof_evt_'+suffix}}),/TRUSTED_EVENT_PROOF_REQUIRED/);
  assert.equal((await record(like)).duplicate,true);
  await assert.rejects(record({...like,action:'save'}),/RECEIPT_ID_CONFLICT/);
  assert.deepEqual((await store.readEngagementEvents({subject}))[0].topics,['cooking']);
  const hide={eventId:'hide_evt_'+suffix,contentId:ids[0],action:'not_interested',at:now};
  assert.equal((await record(hide)).recorded,true);
  assert.equal((await record(hide)).duplicate,true);
  assert.equal(await store.authorizeContent({subject,id:ids[0],kind:'reel'}),false);
  assert.equal((await store.readEngagementEvents({subject})).some(x=>x.action==='not_interested'),true);
  await store.eraseHistory({subject});
  assert.equal(await receiptStore.read({subject,eventId:like.eventId}),null);
  await assert.rejects(store.recordTrustedEvent({subject,event:like}),/TRUSTED_EVENT_PROOF_REQUIRED/);
  assert.equal((await store.readEngagementEvents({subject})).length,0);
  assert.deepEqual(await store.readExplicitInterests({subject}),[]);
  assert.equal(await store.authorizeContent({subject,id:ids[0],kind:'reel'}),true);
  await record({...like,eventId:'extra_evt_'+suffix});
  assert.equal(await receiptStore.read({subject,eventId:'extra_evt_'+suffix})!==null,true);
  // Use a separate historic, valid signing clock for an actually expired
  // test fixture; do not mutate an active receipt into an impossible lifetime.
  const oldTime=now-600000,expiredId='expired_evt_'+suffix;
  const oldSvc=createTrustedReceiptService({key:Buffer.alloc(32,64),now:()=>oldTime,
   readSignedReceipt:async()=>null});
  const oldStore=createPostgresReceiptStore({pool,now:()=>oldTime,
   validateReceipt:oldSvc.verifyIssuedReceipt});
  await oldStore.save({receipt:oldSvc.signTrustedEvent({subject,event:{
   eventId:expiredId,contentId:ids[0],action:'view',at:oldTime}})});
  assert.equal(await receiptStore.read({subject,eventId:expiredId}),null);
  assert.equal((await receiptStore.purgeExpired({limit:10})).deleted>=1,true);
  await store.setPreferences({subject,read:true,analyze:false,personalize:false,topics:[]});
  assert.equal(await receiptStore.read({subject,eventId:'extra_evt_'+suffix}),null);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cx_content_events WHERE subject=$1',[subject])).rows[0].n,0);
  await assert.rejects(record({...like,eventId:'third_evt_'+suffix}),/PERSONALIZATION_CONSENT_REQUIRED/);
  await assert.rejects(store.setPreferences({subject,read:true,analyze:true,personalize:true,topics:['religion']}),/TOPICS_INVALID/);
 }finally{
  try{
   await pool.query('DELETE FROM cx_content_events WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_trusted_event_receipts WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_hides WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_preferences WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_catalog WHERE content_id=ANY($1::text[])',[ids]);
  }finally{await pool.end();}
 }
});
