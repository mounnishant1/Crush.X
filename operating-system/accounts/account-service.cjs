'use strict';
// Server-only domain. Never take actor roles, MFA claims or target from unverified browser input.
const {createHash,randomUUID}=require('node:crypto');
const SUBJECT=/^[A-Za-z0-9._:@-]{2,160}$/;
const KEY=/^[A-Za-z0-9_-]{12,96}$/;
const REASONS=new Set(['spam','harassment','impersonation','fraud','unsafe_content','policy_other']);
const DAY=86400000, STEP_UP_MS=5*60000, APPEAL_MS=30*DAY;
class AccountError extends Error{
 constructor(code,status=400){super(code);this.name='AccountError';this.code=code;this.status=status;}
}
const err=(code,status)=>{throw new AccountError(code,status);};
const validSubject=s=>typeof s==='string'&&SUBJECT.test(s);
const validKey=k=>typeof k==='string'&&KEY.test(k);
const isObject=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const sha=s=>createHash('sha256').update(s).digest('hex');
const clone=x=>structuredClone(x);
const clearModeration=()=>({kind:'none',caseId:null,reasonCode:null,appliedAt:null,expiresAt:null,appeal:null});
function newAccount(subject,now=Date.now()){
 if(!validSubject(subject)||!Number.isSafeInteger(now))err('INVALID_ACCOUNT');
 return {subject,version:1,deactivatedAt:null,moderation:clearModeration(),
  lastCase:null,sessionValidAfter:0,createdAt:now,updatedAt:now};
}
function moderationActive(account,at=Date.now()){
 const m=account.moderation;
 return m.kind==='permanent'||(m.kind==='temporary'&&at<m.expiresAt);
}
function effectiveStatus(account,at=Date.now()){
 if(moderationActive(account,at))return account.moderation.kind==='permanent'?'BANNED':'SUSPENDED';
 return account.deactivatedAt!==null?'DEACTIVATED':'ACTIVE';
}
function publicStatus(account,at=Date.now()){
 if(!account)err('ACCOUNT_NOT_FOUND',404);
 const m=account.moderation,active=moderationActive(account,at);
 return Object.freeze({
  status:effectiveStatus(account,at),
  deactivatedAt:account.deactivatedAt,
  suspension:active?{caseId:m.caseId,reasonCode:m.reasonCode,
   expiresAt:m.kind==='temporary'?m.expiresAt:null,appealStatus:m.appeal?.status||'not_submitted',
   appealDeadline:m.appliedAt+APPEAL_MS}:null,
  lastCase:account.lastCase?{caseId:account.lastCase.caseId,decision:account.lastCase.decision,
   resolvedAt:account.lastCase.resolvedAt}:null
 });
}
function validateActor(actor,at,{mfa=false}={}){
 if(!isObject(actor)||!validSubject(actor.subject)||!Number.isFinite(actor.stepUpAt)||
  actor.stepUpAt>at+5000||at-actor.stepUpAt>STEP_UP_MS)
  err('RECENT_VERIFICATION_REQUIRED',403);
 if(mfa&&(!Number.isFinite(actor.mfaAt)||actor.mfaAt>at+5000||at-actor.mfaAt>STEP_UP_MS))
  err('MODERATOR_MFA_REQUIRED',403);
}
function createAccountService({store,now=Date.now,verifySecondApproval}={}){
 if(!store||!['get','getReceipt','commit'].every(k=>typeof store[k]==='function')||
 typeof now!=='function')throw TypeError('PERSISTENT_ACCOUNT_STORE_REQUIRED');
 if(verifySecondApproval!==undefined&&typeof verifySecondApproval!=='function')
  throw TypeError('INVALID_SECOND_APPROVAL_ADAPTER');
 async function read(subject){
  if(!validSubject(subject))err('INVALID_ACCOUNT');
  return store.get(subject);
 }
 async function requireModerator(actor,{mfa=false}={}){
  if(!isObject(actor)||!validSubject(actor.subject)||!Array.isArray(actor.roles)||
   !actor.roles.some(r=>['moderator','safety_admin'].includes(r)))err('ACCESS_DENIED',403);
  if(mfa)validateActor(actor,now(),{mfa:true});
  const account=await read(actor.subject);
  if(!account||effectiveStatus(account,now())!=='ACTIVE')
   err('MODERATOR_ACCOUNT_RESTRICTED',403);
 }
 async function status({actor,target}){
  if(!isObject(actor)||!validSubject(actor.subject))err('UNAUTHENTICATED',401);
  const who=target||actor.subject;
  if(who!==actor.subject)await requireModerator(actor);
  return publicStatus(await read(who),now());
 }
 async function reviewCase({actor,target}){
  await requireModerator(actor,{mfa:true});
  if(!validSubject(target))err('INVALID_ACCOUNT');
  const account=await read(target);
  if(!account)err('ACCOUNT_NOT_FOUND',404);
  const m=account.moderation;
  return {subject:target,status:effectiveStatus(account,now()),caseId:m.caseId,
   kind:m.kind,reasonCode:m.reasonCode,appliedAt:m.appliedAt,expiresAt:m.expiresAt,
   appeal:m.appeal?{id:m.appeal.id,text:m.appeal.text,submittedAt:m.appeal.submittedAt,
    status:m.appeal.status,reviewedAt:m.appeal.reviewedAt||null}:null};
 }
 async function requireActive({subject,issuedAt}){
  const account=await read(subject);
  if(!account||effectiveStatus(account,now())!=='ACTIVE')err('ACCOUNT_RESTRICTED',403);
  // Tokens minted before a restriction cannot regain access after it is lifted.
  if(!Number.isSafeInteger(issuedAt)||issuedAt<account.sessionValidAfter)
   err('FRESH_LOGIN_REQUIRED',401);
  return {subject,status:'ACTIVE'};
 }
 async function mutate({target,actor,idempotencyKey,operation,payload,plan}){
  if(!validSubject(target)||!validKey(idempotencyKey)||!isObject(actor)||
   !validSubject(actor.subject))err('INVALID_REQUEST');
  const fingerprint=sha(JSON.stringify({operation,target,payload}));
  for(let attempt=0;attempt<4;attempt++){
   const prior=await store.getReceipt(target,idempotencyKey);
   if(prior){
    if(prior.fingerprint!==fingerprint)err('IDEMPOTENCY_CONFLICT',409);
    return clone(prior.response);
   }
   const original=await read(target);
   if(!original)err('ACCOUNT_NOT_FOUND',404);
   const at=now();
   const next=clone(original);
   const outcome=await plan(next,at);
   next.version=original.version+1;
   next.updatedAt=at;
   const response={...publicStatus(next,at),eventId:randomUUID()};
   const audit={eventId:response.eventId,at,subject:target,actor:actor.subject,
    action:operation,caseId:outcome.caseId||null,reasonCode:outcome.reasonCode||null,
    version:next.version,requestHash:fingerprint};
   const outbox={eventId:response.eventId,at,subject:target,
    actions:outcome.revoke?['REVOKE_SESSIONS','ACCOUNT_STATUS_NOTICE']:['ACCOUNT_STATUS_NOTICE'],
    status:response.status,version:next.version};
   try{
    await store.commit({target,expectedVersion:original.version,next,audit,outbox,
     idempotencyKey,fingerprint,response});
    return response;
   }catch(e){
    if(e?.code!=='VERSION_CONFLICT'&&e?.code!=='IDEMPOTENCY_EXISTS')throw e;
   }
  }
  err('CONCURRENT_CHANGE_RETRY',409);
 }
 async function deactivate({actor,idempotencyKey}){
  validateActor(actor,now());
  return mutate({target:actor.subject,actor,idempotencyKey,operation:'user.deactivate',payload:{},
   plan:(a,at)=>{
    if(moderationActive(a,at))err('ACCOUNT_RESTRICTED',403);
    if(a.deactivatedAt!==null)err('ALREADY_DEACTIVATED',409);
    a.deactivatedAt=at;a.sessionValidAfter=at;
    return {revoke:true};
   }});
 }
 async function reactivate({actor,idempotencyKey}){
  validateActor(actor,now());
  return mutate({target:actor.subject,actor,idempotencyKey,operation:'user.reactivate',payload:{},
   plan:(a,at)=>{
    if(moderationActive(a,at))err('MODERATOR_REINSTATEMENT_REQUIRED',403);
    if(a.deactivatedAt===null)err('NOT_DEACTIVATED',409);
    a.deactivatedAt=null;a.sessionValidAfter=at;
    return {revoke:false};
   }});
 }
 async function suspend({actor,target,kind,reasonCode,durationHours,idempotencyKey,approvalId}){
  if(!isObject(actor)||target===actor.subject)err('SELF_MODERATION_DENIED',403);
  await requireModerator(actor,{mfa:true});
  if(!REASONS.has(reasonCode)||!['temporary','permanent'].includes(kind))err('INVALID_SUSPENSION');
  if(kind==='temporary'&&(!Number.isInteger(durationHours)||durationHours<1||durationHours>720))
   err('INVALID_DURATION');
  if(kind==='permanent'){
   if(!actor.roles.includes('safety_admin'))err('SAFETY_ADMIN_REQUIRED',403);
   if(typeof verifySecondApproval!=='function'||typeof approvalId!=='string'||
    !(await verifySecondApproval({approvalId,actor:actor.subject,target,action:'permanent_ban'})))
    err('SECOND_APPROVAL_REQUIRED',403);
  }
  return mutate({target,actor,idempotencyKey,operation:'moderation.suspend',
   payload:{kind,reasonCode,durationHours:kind==='temporary'?durationHours:null,approvalId:approvalId||null},
   plan:(a,at)=>{
    if(moderationActive(a,at))err('ALREADY_RESTRICTED',409);
    const caseId=randomUUID();
    a.moderation={kind,caseId,reasonCode,appliedAt:at,
     expiresAt:kind==='temporary'?at+durationHours*3600000:null,appeal:null};
    a.sessionValidAfter=at;
    return {revoke:true,caseId,reasonCode};
   }});
 }
 async function appeal({actor,text,idempotencyKey}){
  if(!isObject(actor)||!validSubject(actor.subject))err('UNAUTHENTICATED',401);
  if(typeof text!=='string'||text.trim().length<20||text.length>1500)
   err('INVALID_APPEAL_TEXT');
  return mutate({target:actor.subject,actor,idempotencyKey,operation:'user.appeal',
   payload:{text:text.trim()},plan:(a,at)=>{
    const m=a.moderation;
    if(m.kind==='none'||at-m.appliedAt>APPEAL_MS)err('APPEAL_WINDOW_CLOSED',403);
    if(m.appeal!==null)err('APPEAL_ALREADY_SUBMITTED',409);
    // Only stored in restricted account record, not in audit or notification events.
    m.appeal={id:randomUUID(),text:text.trim(),submittedAt:at,status:'pending'};
    return {revoke:false,caseId:m.caseId};
   }});
 }
 async function reinstate({actor,target,caseId,decision,idempotencyKey}){
  if(target===actor?.subject)err('SELF_MODERATION_DENIED',403);
  await requireModerator(actor,{mfa:true});
  if(!['appeal_accepted','moderator_reversal'].includes(decision)||typeof caseId!=='string')
   err('INVALID_REINSTATEMENT');
  return mutate({target,actor,idempotencyKey,operation:'moderation.reinstate',
   payload:{caseId,decision},plan:(a,at)=>{
    if(a.moderation.kind==='none'||a.moderation.caseId!==caseId)
     err('CASE_NOT_FOUND',409);
    if(a.moderation.kind==='permanent'&&!actor.roles.includes('safety_admin'))
     err('SAFETY_ADMIN_REQUIRED',403);
    if(decision==='appeal_accepted'&&a.moderation.appeal?.status!=='pending')
     err('PENDING_APPEAL_REQUIRED',409);
    a.lastCase={caseId,decision,resolvedAt:at};
    a.moderation=clearModeration();
    a.sessionValidAfter=at; // A fresh login is required after reinstatement.
    return {revoke:false,caseId};
   }});
 }
 async function rejectAppeal({actor,target,caseId,idempotencyKey}){
  if(target===actor?.subject)err('ACCESS_DENIED',403);
  await requireModerator(actor,{mfa:true});
  return mutate({target,actor,idempotencyKey,operation:'moderation.reject_appeal',payload:{caseId},
   plan:(a,at)=>{
    if(a.moderation.caseId!==caseId||a.moderation.appeal?.status!=='pending')
     err('PENDING_APPEAL_REQUIRED',409);
    a.moderation.appeal.status='rejected';
    a.moderation.appeal.reviewedAt=at;
    return {revoke:false,caseId};
   }});
 }
 return Object.freeze({status,reviewCase,requireActive,deactivate,reactivate,suspend,appeal,reinstate,
  rejectAppeal,newAccount,publicStatus});
}
module.exports=Object.freeze({createAccountService,newAccount,publicStatus,effectiveStatus,AccountError});
