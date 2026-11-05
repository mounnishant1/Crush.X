'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTrustedReceiptService}=require('../engagement/trusted-receipts.cjs');
const {createVerifiedEngagementIngestor}=require('../engagement/verified-ingestor.cjs');
const now=1800000000000;
function setup(){
 const all=new Map(),signed=new Map(),audits=[];
 const event={eventId:'receipt_0001',subject:'alice',contentId:'reel_01',
  action:'complete',at:now-1200,watchFraction:1,serverVerified:true};
 all.set(event.eventId,event);
 const svc=createTrustedReceiptService({key:Buffer.alloc(32,93),now:()=>now,
  readSignedReceipt:async({subject,eventId})=>signed.get(subject+':'+eventId)});
 let active=true,limited=false;
 const ingestor=createVerifiedEngagementIngestor({
  authenticateWorker:async token=>({authorized:token==='s'.repeat(40),scope:'engagement:ingest'}),
  readAttestedEvent:async({eventId})=>all.get(eventId),
  verifyAttestation:async({event:e})=>e.serverVerified===true,
  checkActiveAccount:async subject=>active&&subject==='alice',
  consumeRateLimit:async()=>!limited,
  receiptService:svc,receiptStore:{save:async({receipt})=>{
   const k=receipt.subject+':'+receipt.eventId;
   if(signed.has(k)&&signed.get(k).signature!==receipt.signature)throw Error('RECEIPT_CONFLICT');
   signed.set(k,receipt);return {stored:true};}},
  contentStore:{recordTrustedEvent:async({subject,event:e})=>{
   assert.equal(await svc.verifyTrustedEvent({subject,event:e}),true);
   return {recorded:true,duplicate:false};
  }},
  audit:{record:async e=>{audits.push(e);return true;}},now:()=>now
 });
 return {ingestor,event,all,signed,audits,setActive:v=>{active=v;},
  setLimited:v=>{limited=v;}};
}
test('ingests server-stored attested event only and audits metadata',async()=>{
 const t=setup();
 const r=await t.ingestor.ingest({workerCredential:'s'.repeat(40),eventId:t.event.eventId});
 assert.deepEqual({subject:r.subject,recorded:r.recorded},{subject:'alice',recorded:true});
 assert.equal(t.signed.size,1);
 assert.equal(JSON.stringify(t.audits).includes('serverVerified'),false);
 assert.equal(JSON.stringify(t.audits).includes('watchFraction'),false);
});
test('no direct phone event or client-selected account, invalid worker denied',async()=>{
 const t=setup();
 await assert.rejects(t.ingestor.ingest({workerCredential:'bad',eventId:t.event.eventId}),/INGEST_REQUEST_INVALID/);
 await assert.rejects(t.ingestor.ingest({workerCredential:'x'.repeat(40),eventId:t.event.eventId}),/INGEST_WORKER_DENIED/);
 const r=await t.ingestor.ingest({workerCredential:'s'.repeat(40),eventId:t.event.eventId,
  subject:'admin',watchFraction:100,action:'save'});
 assert.equal(r.subject,'alice');
 assert.equal(t.signed.size,1);
});
test('refuses missing attestation, untrusted event, inactive account and limiter outage',async()=>{
 const t=setup();const creds={workerCredential:'s'.repeat(40),eventId:t.event.eventId};
 await assert.rejects(t.ingestor.ingest({...creds,eventId:'notfound00'}),/INGEST_ATTESTATION_INVALID/);
 t.all.set(t.event.eventId,{...t.event,serverVerified:false});
 await assert.rejects(t.ingestor.ingest(creds),/INGEST_ATTESTATION_DENIED/);
 t.all.set(t.event.eventId,t.event);
 t.setActive(false);await assert.rejects(t.ingestor.ingest(creds),/INGEST_ACCOUNT_INACTIVE/);
 t.setActive(true);t.setLimited(true);
 await assert.rejects(t.ingestor.ingest(creds),/INGEST_RATE_LIMITED/);
 assert.equal(t.signed.size,0);
});
test('no first-party stored event attestation means zero new engagements',async()=>{
 const t=setup();t.all.set(t.event.eventId,{...t.event,at:now-400000});
 await assert.rejects(t.ingestor.ingest({workerCredential:'s'.repeat(40),eventId:t.event.eventId}),/INGEST_ATTESTATION_INVALID/);
 assert.equal(t.signed.size,0);
});
