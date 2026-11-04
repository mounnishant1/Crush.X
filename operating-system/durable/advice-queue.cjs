'use strict';
// Encrypted, durable AURA-X advisory queue. A store must provide conditional
// atomic writes/leases; a KMS-managed random AES key stays server-side only.
// Results are suggestions, never operations. Leases are at-least-once.
const {createCipheriv,createDecipheriv,randomBytes,createHmac}=require('node:crypto');
const {MODULES,descriptions}=require('../features/ai-workflows.cjs');
const ALLOWED=new Set(MODULES);
const VALID_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID=/^[A-Za-z0-9_-]{8,128}$/;
const HEX=/^[a-f0-9]{64}$/;
function createDurableAdvisoryQueue({store,permissions,audit,consents,modelProvider,
 getRoles,isAccountActive,now=Date.now,hmacKey,encryptionKey,leaseMs=120000,
 retentionMs=86400000}={}){
 if(!store||['insert','get','claim','settle','cancel','purge'].some(k=>typeof store[k]!=='function')||
 !permissions?.issue||!permissions?.check||typeof audit?.record!=='function'||
 typeof consents?.check!=='function'||typeof modelProvider?.suggest!=='function'||
 typeof getRoles!=='function'||typeof isAccountActive!=='function'||typeof now!=='function'||
 !Buffer.isBuffer(hmacKey)||hmacKey.length!==32||
 !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||
 !Number.isSafeInteger(leaseMs)||leaseMs<30000||leaseMs>300000||
 !Number.isSafeInteger(retentionMs)||retentionMs<3600000||retentionMs>7*86400000)
  throw TypeError('DURABLE_ADVISORY_TRUSTED_CONFIG_REQUIRED');
 const digest=v=>createHmac('sha256',hmacKey).update(JSON.stringify(v)).digest('hex');
 const isId=v=>typeof v==='string'&&VALID_ID.test(v);
 const label=({subject,workflow,requestId})=>{
  const h=createHmac('sha256',hmacKey).update(JSON.stringify([subject,workflow,requestId])).digest('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
 };
 function encrypt(jobId,subject,workflow,value){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
  cipher.setAAD(Buffer.from(JSON.stringify([jobId,subject,workflow])));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),
   data:encrypted.toString('base64url')};
 }
 function decrypt(job){
  try{
   const envelope=job.sealed,iv=Buffer.from(envelope.iv,'base64url'),
    tag=Buffer.from(envelope.tag,'base64url');
   if(iv.length!==12||tag.length!==16||!envelope.data||envelope.data.length>10000)throw Error();
   const c=createDecipheriv('aes-256-gcm',encryptionKey,iv);
   c.setAAD(Buffer.from(JSON.stringify([job.id,job.subject,job.workflow])));
   c.setAuthTag(tag);
   const value=JSON.parse(Buffer.concat([c.update(Buffer.from(envelope.data,'base64url')),c.final()]).toString('utf8'));
   if(typeof value.prompt!=='string'||typeof value.context!=='string')throw Error();
   return value;
  }catch{throw Error('ENCRYPTED_PAYLOAD_INVALID');}
 }
 async function account(subject){
  if(!isId(subject)||await isAccountActive(subject)!==true)return false;
  const roles=await getRoles(subject);
  return Array.isArray(roles)&&(roles.includes('user')||roles.includes('owner'));
 }
 async function authorize(credential,subject){
  if(!isId(subject))throw Error('ACCESS_DENIED');
  const grant=await permissions.issue({credential,capability:'aura:use',resourceOwner:subject});
  const claim=await permissions.check(grant,'aura:use',subject);
  if(claim.subject!==subject||!await account(subject))throw Error('ACCESS_DENIED');
 }
 const receipt=j=>Object.freeze({jobId:j.id,status:j.status,
  attempts:j.attempts,createdAt:j.createdAt});
 function decryptResult(job){
  if(!job.sealedResult)throw Error('ENCRYPTED_RESULT_UNAVAILABLE');
  const value=decrypt({...job,sealed:job.sealedResult});
  if(typeof value.suggestion!=='string'||value.suggestion.length>2500)throw Error('ENCRYPTED_RESULT_INVALID');
  return value.suggestion;
 }
 async function submit({credential,subject,workflow,prompt,context='',requestId}={}){
  if(!ALLOWED.has(workflow)||!REQUEST_ID.test(requestId||'')||
   typeof prompt!=='string'||!prompt.trim()||prompt.length>1000||
   typeof context!=='string'||context.length>1000)throw Error('INVALID_ADVICE_REQUEST');
  await authorize(credential,subject);
  if(await consents.check({subject,scope:'ai:'+workflow})!==true)throw Error('AI_CONSENT_REQUIRED');
  const id=label({subject,workflow,requestId});
  const hash=digest({subject,workflow,prompt,context});
  const current=await store.get(id);
  if(current){
   if(current.subject!==subject||current.inputHash!==hash||current.workflow!==workflow)
    throw Error('IDEMPOTENCY_CONFLICT');
   return receipt(current);
  }
  const createdAt=now();
  const job={id,subject,workflow,inputHash:hash,status:'queued',attempts:0,createdAt,
   nextRunAt:createdAt,expiresAt:createdAt+retentionMs,
   sealed:encrypt(id,subject,workflow,{prompt,context})};
  // A missing audit receipt blocks new work.
  await audit.record({event:'advice.accepted',subject,capability:'aura:use',jobId:id});
  const inserted=await store.insert(job);
  if(inserted!==true){
   const existing=await store.get(id);
   if(!existing||existing.subject!==subject||existing.inputHash!==hash||existing.workflow!==workflow)
    throw Error('IDEMPOTENCY_CONFLICT');
   return receipt(existing);
  }
  return receipt(job);
 }
 async function inspect({credential,subject,jobId}={}){
  await authorize(credential,subject);
  if(typeof jobId!=='string'||!/^[-a-f0-9]{36}$/.test(jobId))throw Error('JOB_NOT_FOUND');
  const job=await store.get(jobId);
  if(!job||job.subject!==subject)throw Error('JOB_NOT_FOUND');
  // A previously finished suggestion must also disappear from API responses
  // after consent withdrawal, even before its TTL-based deletion.
  const mayRead=job.status==='completed'&&
    await consents.check({subject,scope:'ai:'+job.workflow})===true;
  return Object.freeze({...receipt(job),
   result:mayRead?{suggestion:decryptResult(job),workflow:job.workflow,
    executed:false,published:false,sent:false,charged:false}:null,
   code:job.status==='failed'||job.status==='blocked'?job.code:null});
 }
 async function cancel({credential,subject,jobId}={}){
  await authorize(credential,subject);
  const job=await store.get(jobId);
  if(!job||job.subject!==subject)throw Error('JOB_NOT_FOUND');
  const updated=await store.cancel({id:jobId,subject,now:now()});
  if(updated!==true)throw Error('TASK_NOT_CANCELABLE');
  await audit.record({event:'advice.cancelled',subject,capability:'aura:use',jobId});
  return Object.freeze({jobId,status:'cancelled'});
 }
 async function purge({credential,subject,jobId}={}){
  await authorize(credential,subject);
  const job=await store.get(jobId);
  if(!job||job.subject!==subject)throw Error('JOB_NOT_FOUND');
  if(job.status==='running')throw Error('TASK_RUNNING');
  if(await store.purge({id:jobId,subject})!==true)throw Error('PURGE_FAILED');
  await audit.record({event:'advice.purged',subject,capability:'aura:use',jobId});
  return {erased:true};
 }
 async function runOne(){
  const job=await store.claim({now:now(),leaseMs});
  if(!job)return null;
  if(!isId(job.subject)||!ALLOWED.has(job.workflow)||typeof job.leaseToken!=='string')
   throw Error('INVALID_CLAIM');
  let status='blocked',code='PERMISSION_OR_CONSENT_DENIED',suggestion=null;
  try{
   if(await account(job.subject)&&
    await consents.check({subject:job.subject,scope:'ai:'+job.workflow})===true&&
    now()<job.expiresAt){
    const args=decrypt(job);
    await audit.record({event:'advice.started',subject:job.subject,capability:'aura:use',jobId:job.id});
    const reply=await modelProvider.suggest({subject:job.subject,workflow:job.workflow,
     prompt:args.prompt,context:args.context,instruction:descriptions[job.workflow],
     mode:'advice_only',jobId:job.id});
    if(typeof reply!=='string'||!reply.trim()||reply.length>2500)throw Error('OUTPUT_INVALID');
    // Consent may have been withdrawn while inference was in flight; never
    // expose a result if the permission is no longer valid.
    if(!await account(job.subject)||
       await consents.check({subject:job.subject,scope:'ai:'+job.workflow})!==true)
      throw Error('CONSENT_REVOKED_DURING_INFERENCE');
    await audit.record({event:'advice.completed',subject:job.subject,capability:'aura:use',jobId:job.id});
    status='completed';code=null;suggestion=reply.trim();
   }
  }catch{
   status='failed';code='AI_EXECUTION_FAILED';
   try{await audit.record({event:'advice.failed',subject:job.subject,capability:'aura:use',jobId:job.id});}
   catch{status='blocked';code='AUDIT_FAILURE';}
  }
  const ok=await store.settle({id:job.id,leaseToken:job.leaseToken,
   status,code,sealedResult:suggestion?encrypt(job.id,job.subject,job.workflow,{prompt:'',context:'',suggestion}):null,now:now()});
  if(ok!==true)throw Error('LOST_LEASE_NO_RESULT_PUBLISHED');
  return Object.freeze({jobId:job.id,status});
 }
 return Object.freeze({submit,inspect,cancel,purge,runOne,mode:'durable-advice'});
}
module.exports=Object.freeze({createDurableAdvisoryQueue});
