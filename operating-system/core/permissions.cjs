'use strict';
// Trust boundary: verifyCredential and getRoles are trusted server-side adapters.
// Never trust a user-supplied 'owner', 'roles' or 'scopes' request field.
const {randomUUID}=require('node:crypto');
const POLICY=Object.freeze({
 'os:health':'owner',
 'os:operate':'owner',
 'code:read':'owner',
 'code:propose':'owner',
 'code:approve':'owner',
 'account:read':'self',
 'content:draft':'self',
 'aura:use':'self'
});
function createPermissionEngine({verifyCredential,getRoles,ownerSubject,now=Date.now,grantTtlMs=60000}={}){
 if(typeof verifyCredential!=='function'||typeof getRoles!=='function'||typeof ownerSubject!=='string'||!ownerSubject||typeof now!=='function'||!Number.isSafeInteger(grantTtlMs)||grantTtlMs<1000||grantTtlMs>300000)throw TypeError('TRUSTED_PERMISSION_ADAPTERS_REQUIRED');
 const grants=new WeakMap(),revocations=new Map();
 function roleAllowed(subject,roles,capability,resourceOwner){
  const policy=POLICY[capability];
  if(!policy||!Array.isArray(roles))return false;
  if(policy==='owner')return subject===ownerSubject&&roles.includes('owner');
  if(policy==='self')return typeof resourceOwner==='string'&&resourceOwner===subject&&(roles.includes('user')||(subject===ownerSubject&&roles.includes('owner')));
  return false;
 }
 async function issue({credential,capability,resourceOwner}={}){
  if(typeof credential!=='string'||!credential||credential.length>8192||!Object.hasOwn(POLICY,capability))throw Error('ACCESS_DENIED');
  const p=await verifyCredential(credential);
  const at=now();
  if(!p||p.verified!==true||typeof p.subject!=='string'||!p.subject||p.subject.length>128||!Number.isFinite(p.expiresAt)||p.expiresAt<=at)throw Error('ACCESS_DENIED');
  const roles=await getRoles(p.subject);
  if(!roleAllowed(p.subject,roles,capability,resourceOwner))throw Error('ACCESS_DENIED');
  const g=Object.freeze({id:randomUUID(),subject:p.subject,capability,resourceOwner:resourceOwner||null,expiresAt:Math.min(p.expiresAt,at+grantTtlMs)});
  grants.set(g,{subject:p.subject,capability,resourceOwner:resourceOwner||null,version:revocations.get(p.subject)||0});
  return g;
 }
 async function check(g,capability,resourceOwner){
  const info=g&&typeof g==='object'?grants.get(g):null;
  if(!info||g.capability!==info.capability||g.subject!==info.subject||g.resourceOwner!==info.resourceOwner||g.expiresAt<=now())throw Error('GRANT_INVALID');
  if(capability&&capability!==info.capability)throw Error('GRANT_INVALID');
  if(resourceOwner!==undefined&&resourceOwner!==info.resourceOwner)throw Error('GRANT_INVALID');
  if((revocations.get(info.subject)||0)!==info.version)throw Error('GRANT_REVOKED');
  const roles=await getRoles(info.subject);
  if(!roleAllowed(info.subject,roles,info.capability,info.resourceOwner))throw Error('GRANT_REVOKED');
  return Object.freeze({subject:info.subject,capability:info.capability,resourceOwner:info.resourceOwner});
 }
 function revokeSubject(subject){
  if(typeof subject!=='string'||!subject)throw Error('INVALID_SUBJECT');
  revocations.set(subject,(revocations.get(subject)||0)+1);
 }
 return Object.freeze({issue,check,revokeSubject,capabilities:Object.freeze(Object.keys(POLICY))});
}
module.exports=Object.freeze({createPermissionEngine,POLICY});
