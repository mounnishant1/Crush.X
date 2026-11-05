'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTrustedReceiptService}=require('../engagement/trusted-receipts.cjs');
const now=1800000000000;
function setup(){
 const receipts=new Map();
 const service=createTrustedReceiptService({
  key:Buffer.alloc(32,73),readSignedReceipt:async({subject,eventId})=>receipts.get(subject+':'+eventId),
  now:()=>now
 });
 const event={eventId:'evt_a123456',contentId:'reel_001',action:'view',at:now-1000,watchFraction:0.75};
 const save=(subject='alice',e=event)=>{
  const signed=service.signTrustedEvent({subject,event:e});
  receipts.set(subject+':'+e.eventId,signed);
  return signed;
 };
 return {service,receipts,event,save};
}
test('signed trusted playback is verifiable and not a client-supplied flag',async()=>{
 const {service,event,save}=setup();
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),false);
 const receipt=save();
 assert.equal(receipt.subject,'alice');
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),true);
 assert.equal(await service.verifyTrustedEvent({subject:'bob',event}),false);
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event:{...event,watchFraction:1}}),false);
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event:{...event,contentId:'other_reel'}}),false);
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event:{...event,action:'like'}}),false);
});
test('tampering, stale timestamps and extra fields fail closed',async()=>{
 const {service,receipts,event,save}=setup();
 const signed=save();
 const k='alice:'+event.eventId;
 receipts.set(k,{...signed,signature:'0'.repeat(64)});
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),false);
 receipts.set(k,{...signed,extra:'injected'});
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),false);
 receipts.set(k,{...signed,issuedAt:now-301000});
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),false);
 receipts.set(k,{...signed,signature:'malformed'});
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event}),false);
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event:{...event,eventId:'bad'}}),false);
});
test('reject invalid receipt requests and invalid or missing signing keys',async()=>{
 const {service,event}=setup();
 assert.throws(()=>createTrustedReceiptService({key:Buffer.alloc(12),readSignedReceipt:async()=>null}),/CONFIG_REQUIRED/);
 assert.throws(()=>createTrustedReceiptService({key:Buffer.alloc(32)}),/CONFIG_REQUIRED/);
 assert.throws(()=>service.signTrustedEvent({subject:'alice',event:{...event,at:now-400000}}),/INPUT_INVALID/);
 assert.throws(()=>service.signTrustedEvent({subject:'alice',event:{...event,watchFraction:100}}),/INPUT_INVALID/);
 assert.equal(await service.verifyTrustedEvent({subject:'alice',event:{...event,action:'unknown'}}),false);
});
test('verification rejects a different HMAC key or signed context',async()=>{
 const {service,event,save,receipts}=setup();save();
 const wrong=createTrustedReceiptService({key:Buffer.alloc(32,91),
  readSignedReceipt:async({subject,eventId})=>receipts.get(subject+':'+eventId),now:()=>now});
 assert.equal(await wrong.verifyTrustedEvent({subject:'alice',event}),false);
 const wrongAudience=createTrustedReceiptService({key:Buffer.alloc(32,73),audience:'other-environment',
  readSignedReceipt:async({subject,eventId})=>receipts.get(subject+':'+eventId),now:()=>now});
 assert.equal(await wrongAudience.verifyTrustedEvent({subject:'alice',event}),false);
});
