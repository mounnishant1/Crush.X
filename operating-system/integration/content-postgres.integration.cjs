'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {createPostgresContentStore}=require('../storage/postgres-content-store.cjs');
test('real PostgreSQL: consent, ACL, idempotency, negative feedback, erasure', {skip:!process.env.POSTGRES_TEST_URL},async()=>{
 const {Pool}=require(process.env.PG_MODULE||'pg');
 const pool=new Pool({connectionString:process.env.POSTGRES_TEST_URL,max:2});
 const suffix=randomUUID().replaceAll('-','').slice(0,16),subject='qa_'+suffix;
 const ids=['recipe_','hidden_','other_'].map(x=>x+suffix),now=Date.now();
 const store=createPostgresContentStore({pool,now:()=>now,
  verifyTrustedEvent:async({subject:who,event})=>who===subject&&event.eventId!=='spoof_evt'});
 try{
  await pool.query(fs.readFileSync(path.join(__dirname,'..','storage','migrations','001_content_intelligence.sql'),'utf8'));
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
  assert.equal((await store.recordTrustedEvent({subject,event:like})).recorded,true);
  assert.equal((await store.recordTrustedEvent({subject,event:like})).duplicate,true);
  await assert.rejects(store.recordTrustedEvent({subject,event:{...like,action:'save'}}),/ENGAGEMENT_EVENT_CONFLICT/);
  assert.deepEqual((await store.readEngagementEvents({subject}))[0].topics,['cooking']);
  const hide={eventId:'hide_evt_'+suffix,contentId:ids[0],action:'not_interested',at:now};
  assert.equal((await store.recordTrustedEvent({subject,event:hide})).recorded,true);
  assert.equal((await store.recordTrustedEvent({subject,event:hide})).duplicate,true);
  assert.equal(await store.authorizeContent({subject,id:ids[0],kind:'reel'}),false);
  assert.equal((await store.readEngagementEvents({subject})).some(x=>x.action==='not_interested'),true);
  await store.eraseHistory({subject});
  assert.equal((await store.readEngagementEvents({subject})).length,0);
  assert.deepEqual(await store.readExplicitInterests({subject}),[]);
  assert.equal(await store.authorizeContent({subject,id:ids[0],kind:'reel'}),true);
  await store.recordTrustedEvent({subject,event:{...like,eventId:'extra_evt_'+suffix}});
  await store.setPreferences({subject,read:true,analyze:false,personalize:false,topics:[]});
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cx_content_events WHERE subject=$1',[subject])).rows[0].n,0);
  await assert.rejects(store.recordTrustedEvent({subject,event:{...like,eventId:'third_evt_'+suffix}}),/PERSONALIZATION_CONSENT_REQUIRED/);
  await assert.rejects(store.setPreferences({subject,read:true,analyze:true,personalize:true,topics:['religion']}),/TOPICS_INVALID/);
 }finally{
  try{
   await pool.query('DELETE FROM cx_content_events WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_hides WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_preferences WHERE subject=$1',[subject]);
   await pool.query('DELETE FROM cx_content_catalog WHERE content_id=ANY($1::text[])',[ids]);
  }finally{await pool.end();}
 }
});
