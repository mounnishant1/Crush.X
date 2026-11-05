'use strict';
// Privileged ingestion worker; NOT a public HTTP event endpoint.
// Raw watch data from a phone is not an authoritative event.
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const validId=x=>typeof x==='string'&&ID.test(x);
const ACTIONS=new Set(['view','complete','rewatch','like','save','share','follow','skip','not_interested','hide']);
function createVerifiedEngagementIngestor({authenticateWorker,readAttestedEvent,
 verifyAttestation,checkActiveAccount,consumeRateLimit,receiptService,
 receiptStore,contentStore,audit,now=Date.now}={}){
 if([authenticateWorker,readAttestedEvent,verifyAttestation,checkActiveAccount,
  consumeRateLimit,now].some(x=>typeof x!=='function')||
  typeof receiptService?.signTrustedEvent!=='function'||
  typeof receiptStore?.save!=='function'||typeof contentStore?.recordTrustedEvent!=='function'||
  typeof audit?.record!=='function')throw TypeError('ENGAGEMENT_INGESTOR_CONFIG_REQUIRED');
 async function ingest({workerCredential,eventId}={}){
  if(typeof workerCredential!=='string'||workerCredential.length<32||workerCredential.length>8192||
   !validId(eventId)||eventId.length<8)throw Error('INGEST_REQUEST_INVALID');
  // Never derive the account or watch duration from caller-supplied input.
  const identity=await authenticateWorker(workerCredential);
  if(!identity||identity.authorized!==true||identity.scope!=='engagement:ingest')
   throw Error('INGEST_WORKER_DENIED');
  const stored=await readAttestedEvent({eventId});
  if(!stored||stored.eventId!==eventId||!validId(stored.subject)||
   !validId(stored.contentId)||!ACTIONS.has(stored.action)||
   !Number.isSafeInteger(stored.at)||Math.abs(stored.at-now())>300000||
   (stored.watchFraction!==undefined&&(!Number.isFinite(stored.watchFraction)||
    stored.watchFraction<0||stored.watchFraction>1)))
   throw Error('INGEST_ATTESTATION_INVALID');
  // The adapter must independently validate the provenance and authenticated
  // playback session / first-party action receipt in protected server storage.
  if(await verifyAttestation({event:stored})!==true)
   throw Error('INGEST_ATTESTATION_DENIED');
  const subject=stored.subject;
  if(await checkActiveAccount(subject)!==true)throw Error('INGEST_ACCOUNT_INACTIVE');
  if(await consumeRateLimit({subject,action:stored.action})!==true)
   throw Error('INGEST_RATE_LIMITED');
  const event=Object.freeze({eventId,contentId:stored.contentId,
   action:stored.action,at:stored.at,
   ...(stored.watchFraction===undefined?{}:{watchFraction:stored.watchFraction})});
  // Consent and catalog visibility are independently checked in both
  // receiptStore.save and contentStore.recordTrustedEvent.
  const signed=receiptService.signTrustedEvent({subject,event});
  await receiptStore.save({receipt:signed});
  const result=await contentStore.recordTrustedEvent({subject,event});
  // Audit metadata only. Never audit credentials, user messages or raw media.
  await audit.record({event:'engagement.ingested',subject,capability:'feed:personalize'});
  return Object.freeze({recorded:result.recorded===true,duplicate:result.duplicate===true,
   eventId,subject});
 }
 return Object.freeze({ingest});
}
module.exports=Object.freeze({createVerifiedEngagementIngestor});
