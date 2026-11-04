'use strict';
// Authoritative server-side consent service. Storage must persist grants and
// support read-after-write consistency. Browser checkbox is never authorization.
const {MODULES,OWNER_MODULES}=require('../features/ai-workflows.cjs');
const SCOPES=Object.freeze([
 ...MODULES.map(x=>'ai:'+x),...OWNER_MODULES.map(x=>'ai:'+x),
 'content:read','content:analyze','content:personalize','media:analyze'
]);
const SCOPED=new Set(SCOPES);
const isId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
function createConsentService({permissions,audit,store,now=Date.now,maxTtlMs=15*60000}={}){
 if(!permissions?.issue||!permissions?.check||!audit?.record||!store||
  typeof store.get!=='function'||typeof store.put!=='function'||
  typeof store.delete!=='function'||typeof now!=='function'||
  !Number.isSafeInteger(maxTtlMs)||maxTtlMs<60000||maxTtlMs>3600000)
   throw TypeError('CONSENT_TRUSTED_ADAPTERS_REQUIRED');
 const validScope=scope=>typeof scope==='string'&&SCOPED.has(scope);
 function capability(scope){return scope==='ai:owner'?'os:health':'aura:use';}
 // The API derives the subject from a cryptographically verified access token;
 // this method also validates subject-bound permission at the backend.
 async function authorize(credential,subject,scope){
  if(!isId(subject)||!validScope(scope))throw Error('ACCESS_DENIED');
  const owner=scope==='ai:owner';
  const permission=owner?'os:health':'aura:use';
  const grant=await permissions.issue({credential,capability:permission,
   resourceOwner:owner?undefined:subject});
  const verified=await permissions.check(grant,permission,owner?undefined:subject);
  if(verified.subject!==subject)throw Error('ACCESS_DENIED');
  return grant;
 }
 async function grant({credential,subject,scope,ttlMs=15*60000}={}){
  const permit=await authorize(credential,subject,scope);
  if(!Number.isSafeInteger(ttlMs)||ttlMs<60000||ttlMs>maxTtlMs)
   throw Error('INVALID_CONSENT_TTL');
  const expiresAt=now()+ttlMs;
  // Write is audited before persistence; the store is the authority.
  await audit.record({event:'consent.requested',subject,capability:capability(scope)});
  await permissions.check(permit,capability(scope),scope==='ai:owner'?undefined:subject);
  const reply=await store.put({subject,scope,expiresAt});
  if(reply!==true)throw Error('CONSENT_STORE_UNAVAILABLE');
  return Object.freeze({scope,expiresAt,granted:true});
 }
 async function check({subject,scope}={}){
  if(!isId(subject)||!validScope(scope))return false;
  const saved=await store.get({subject,scope});
  return saved?.subject===subject&&saved?.scope===scope&&
   Number.isFinite(saved.expiresAt)&&saved.expiresAt>now();
 }
 async function status({credential,subject,scope}={}){
  await authorize(credential,subject,scope);
  return Object.freeze({scope,active:await check({subject,scope})});
 }
 async function revoke({credential,subject,scope}={}){
  await authorize(credential,subject,scope);
  const done=await store.delete({subject,scope});
  if(done!==true)throw Error('CONSENT_STORE_UNAVAILABLE');
  // Even if audit is unavailable, consent has already been removed.
  await audit.record({event:'consent.revoked',subject,capability:capability(scope)});
  return Object.freeze({scope,active:false,revoked:true});
 }
 return Object.freeze({grant,check,status,revoke,scopes:SCOPES});
}
module.exports=Object.freeze({SCOPES,createConsentService});