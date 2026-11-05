'use strict';
// Server-only receipt verification for the authorized content recommender.
// A client must NEVER be allowed to call signTrustedEvent or write receipt records.
const {createHmac,timingSafeEqual}=require('node:crypto');
const ACTIONS=new Set(['view','complete','rewatch','like','save','share','follow','skip','not_interested','hide']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const SIGNATURE=/^[a-f0-9]{64}$/;
const RECEIPT_FIELDS=['version','issuer','audience','subject','eventId','contentId',
  'action','at','watchFraction','issuedAt','signature'];
const validId=x=>typeof x==='string'&&ID.test(x);
const validEvent=e=>!!e&&typeof e==='object'&&!Array.isArray(e)&&
  validId(e.eventId)&&e.eventId.length>=8&&validId(e.contentId)&&
  ACTIONS.has(e.action)&&Number.isFinite(e.at)&&
  (e.watchFraction===undefined||(Number.isFinite(e.watchFraction)&&e.watchFraction>=0&&e.watchFraction<=1));
function payload(subject,event,issuer,audience,issuedAt){
 return [1,issuer,audience,subject,event.eventId,event.contentId,event.action,
   event.at,event.watchFraction===undefined?0:event.watchFraction,issuedAt];
}
function createTrustedReceiptService({key,readSignedReceipt,now=Date.now,
  issuer='crushx-engagement-collector',audience='crushx-content-v1',maxAgeMs=300000}={}){
 if(!Buffer.isBuffer(key)||key.length<32||typeof readSignedReceipt!=='function'||
   typeof now!=='function'||!validId(issuer)||!validId(audience)||
   !Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300000)
  throw TypeError('TRUSTED_RECEIPT_CONFIG_REQUIRED');
 const privateKey=Buffer.from(key);
 const mac=value=>createHmac('sha256',privateKey).update(JSON.stringify(value)).digest();
 const ageOkay=(eventAt,issuedAt)=>{
  const time=now();
  return Number.isFinite(time)&&Number.isSafeInteger(issuedAt)&&
   Math.abs(time-issuedAt)<=maxAgeMs&&Math.abs(issuedAt-eventAt)<=maxAgeMs;
 };
 // Only a trusted server-side collector may issue receipts after verifying
 // authenticated playback/action provenance; never expose this in HTTP/UI.
 function signTrustedEvent({subject,event,issuedAt=now()}={}){
  if(!validId(subject)||!validEvent(event)||!ageOkay(event.at,issuedAt))
   throw Error('TRUSTED_RECEIPT_INPUT_INVALID');
  const watchFraction=event.watchFraction===undefined?0:event.watchFraction;
  const receipt={version:1,issuer,audience,subject,eventId:event.eventId,
   contentId:event.contentId,action:event.action,at:event.at,watchFraction,issuedAt};
  return Object.freeze({...receipt,
   signature:mac(payload(subject,event,issuer,audience,issuedAt)).toString('hex')});
 }
 // Validate a previously minted receipt without fetching it from storage.
 // This is only a cryptographic check; a protected DB + collector are still required.
 function verifyIssuedReceipt(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
     Object.keys(receipt).length!==RECEIPT_FIELDS.length||
     RECEIPT_FIELDS.some(k=>!Object.hasOwn(receipt,k))||
     receipt.version!==1||receipt.issuer!==issuer||receipt.audience!==audience||
     !validId(receipt.subject)||!validEvent(receipt)||
     !Number.isSafeInteger(receipt.at)||!Number.isSafeInteger(receipt.issuedAt)||
     !ageOkay(receipt.at,receipt.issuedAt)||
     typeof receipt.watchFraction!=='number'||
     typeof receipt.signature!=='string'||!SIGNATURE.test(receipt.signature))
   return false;
  const supplied=Buffer.from(receipt.signature,'hex');
  const expected=mac(payload(receipt.subject,receipt,issuer,audience,receipt.issuedAt));
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
 }
 // The receipt must be retrieved from an independent protected store, not from
 // client input; cryptographic verification is only one authorization layer.
 async function verifyTrustedEvent({subject,event,db}={}){
  if(!validId(subject)||!validEvent(event))return false;
  const receipt=await readSignedReceipt({subject,eventId:event.eventId,db});
  return verifyIssuedReceipt(receipt)&&receipt.subject===subject&&
    receipt.eventId===event.eventId&&receipt.contentId===event.contentId&&
    receipt.action===event.action&&receipt.at===event.at&&
    receipt.watchFraction===(event.watchFraction===undefined?0:event.watchFraction);
 }
 return Object.freeze({signTrustedEvent,verifyIssuedReceipt,verifyTrustedEvent});
}
module.exports=Object.freeze({createTrustedReceiptService});
