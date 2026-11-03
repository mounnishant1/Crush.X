'use strict';
// In-process task queue; dispatch must be invoked by a trusted backend worker.
// Replace with transactional queue+durable idempotency store for production.
const {randomUUID,createHash}=require('node:crypto');
const ACTION=/^[a-z][a-z0-9.-]{1,63}$/, KEY=/^[A-Za-z0-9_-]{8,128}$/;
function cloneSafe(v,depth=0){
 if(depth>8)throw Error('INVALID_PAYLOAD');
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'&&v.length<=4096)return v;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(Array.isArray(v)){
  if(v.length>64)throw Error('INVALID_PAYLOAD');
  return v.map(x=>cloneSafe(x,depth+1));
 }
 if(typeof v==='object'&&v&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){
  const out=Object.create(null),keys=Object.keys(v).sort();
  if(keys.length>64)throw Error('INVALID_PAYLOAD');
  for(const key of keys){
   if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)||['constructor','prototype','__proto__'].includes(key))throw Error('INVALID_PAYLOAD');
   out[key]=cloneSafe(v[key],depth+1);
  }
  return out;
 }
 throw Error('INVALID_PAYLOAD');
}
function safeJson(value){
 const v=cloneSafe(value);
 if(Buffer.byteLength(JSON.stringify(v))>16384)throw Error('PAYLOAD_TOO_LARGE');
 return JSON.parse(JSON.stringify(v));
}
function createTaskEngine({permissions,audit,events,now=Date.now,maxJobs=256,backoffMs=1000}={}){
 if(!permissions||typeof permissions.issue!=='function'||typeof permissions.check!=='function'||!audit||typeof audit.record!=='function'||!events||typeof events.publish!=='function'||typeof now!=='function'||!Number.isSafeInteger(maxJobs)||maxJobs<1||!Number.isSafeInteger(backoffMs)||backoffMs<1)throw TypeError('TASK_ENGINE_DEPENDENCIES_REQUIRED');
 const actions=new Map(),jobs=new Map(),keys=new Map();
 let sealed=false;
 function registerAction({name,capability,handler,maxAttempts=1}={}){
  if(sealed)throw Error('TASK_REGISTRY_SEALED');
  if(!ACTION.test(name||'')||actions.has(name)||!permissions.capabilities.includes(capability)||typeof handler!=='function'||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('INVALID_TASK_ACTION');
  actions.set(name,Object.freeze({name,capability,handler,maxAttempts}));
 }
 function seal(){sealed=true;}
 function receipt(job){
  return Object.freeze({jobId:job.id,status:job.status,attempts:job.attempts,nextRunAt:job.nextRunAt});
 }
 function keyOf(subject,action,resourceOwner,key){
  return JSON.stringify([subject,action,resourceOwner||null,key]);
 }
 function fingerprint(input){
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
 }
 async function submit({credential,action,payload={},resourceOwner,idempotencyKey}={}){
  if(!sealed)throw Error('TASK_REGISTRY_OPEN');
  const def=actions.get(action);
  if(!def)throw Error('UNKNOWN_ACTION');
  if(typeof idempotencyKey!=='string'||!KEY.test(idempotencyKey))throw Error('IDEMPOTENCY_KEY_REQUIRED');
  const copy=safeJson(payload);
  const grant=await permissions.issue({credential,capability:def.capability,resourceOwner});
  const k=keyOf(grant.subject,action,resourceOwner,idempotencyKey);
  const fp=fingerprint({action,resourceOwner:resourceOwner||null,payload:copy});
  const existing=keys.get(k);
  if(existing){
   if(existing.fingerprint!==fp)throw Error('IDEMPOTENCY_CONFLICT');
   return receipt(jobs.get(existing.jobId));
  }
  if(jobs.size>=maxJobs)throw Error('TASK_CAPACITY_REACHED');
  const job={id:randomUUID(),action,status:'queued',attempts:0,nextRunAt:now(),payload:copy,
   subject:grant.subject,resourceOwner:resourceOwner||null,grant,def,result:null,code:null};
  // Deny submission if the audit cannot persist the receipt.
  await audit.record({event:'task.accepted',jobId:job.id,subject:job.subject,capability:def.capability});
  jobs.set(job.id,job);keys.set(k,{jobId:job.id,fingerprint:fp});
  await events.publish('task.accepted',{jobId:job.id,status:'queued'});
  return receipt(job);
 }
 async function inspect({credential,jobId}={}){
  const job=jobs.get(jobId);
  if(!job)throw Error('JOB_NOT_FOUND');
  const grant=await permissions.issue({credential,capability:job.def.capability,resourceOwner:job.resourceOwner||undefined});
  if(grant.subject!==job.subject)throw Error('ACCESS_DENIED');
  return Object.freeze({...receipt(job),result:job.status==='completed'?job.result:null,code:job.code});
 }
 async function cancel({credential,jobId}={}){
  const job=jobs.get(jobId);
  if(!job)throw Error('JOB_NOT_FOUND');
  const grant=await permissions.issue({credential,capability:job.def.capability,resourceOwner:job.resourceOwner||undefined});
  if(grant.subject!==job.subject)throw Error('ACCESS_DENIED');
  if(job.status==='running')throw Error('TASK_RUNNING');
  if(job.status!=='queued'&&job.status!=='retry')throw Error('TASK_NOT_CANCELABLE');
  await audit.record({event:'task.cancelled',jobId:job.id,subject:job.subject});
  job.status='cancelled';
  await events.publish('task.cancelled',{jobId:job.id,status:'cancelled'});
  return receipt(job);
 }
 async function runNext(){
  if(!sealed)throw Error('TASK_REGISTRY_OPEN');
  const job=[...jobs.values()].find(j=>(j.status==='queued'||j.status==='retry')&&j.nextRunAt<=now());
  if(!job)return null;
  // Synchronous state change prevents simultaneous workers selecting same job.
  job.status='running';
  try{
   await permissions.check(job.grant,job.def.capability,job.resourceOwner);
   await audit.record({event:'task.started',jobId:job.id,subject:job.subject,capability:job.def.capability});
  }catch{
   // Handler has not run: fail closed.
   job.status='blocked';job.code='PERMISSION_OR_AUDIT_DENIED';
   return receipt(job);
  }
  job.attempts++;
  let result;
  try{
   result=safeJson(await job.def.handler(job.payload,Object.freeze({subject:job.subject,resourceOwner:job.resourceOwner,jobId:job.id})));
  }catch{
   const retry=job.attempts<job.def.maxAttempts;
   try{
    await audit.record({event:retry?'task.retry':'task.failed',jobId:job.id,subject:job.subject,code:'HANDLER_FAILED'});
    job.status=retry?'retry':'failed';
    job.code='HANDLER_FAILED';
    if(retry)job.nextRunAt=now()+backoffMs*2**(job.attempts-1);
   }catch{
    job.status='audit_error';job.code='AUDIT_FAILURE';
   }
   await events.publish('task.updated',{jobId:job.id,status:job.status});
   return receipt(job);
  }
  try{
   await audit.record({event:'task.completed',jobId:job.id,subject:job.subject});
   job.result=result;job.status='completed';job.code=null;
  }catch{
   // Handler may have executed; NEVER retry an action with a missing audit receipt.
   job.status='audit_error';job.code='AUDIT_FAILURE';
  }
  await events.publish('task.updated',{jobId:job.id,status:job.status});
  return receipt(job);
 }
 function metrics(){
  const counts={queued:0,running:0,retry:0,completed:0,failed:0,blocked:0,audit_error:0,cancelled:0};
  for(const job of jobs.values())counts[job.status]++;
  return Object.freeze({...counts,capacity:maxJobs});
 }
 return Object.freeze({registerAction,seal,submit,inspect,cancel,runNext,metrics});
}
module.exports=Object.freeze({createTaskEngine,cloneSafe,safeJson});
