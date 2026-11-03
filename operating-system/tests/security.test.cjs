'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPermissionEngine}=require('../core/permissions.cjs');
const {createAuditLedger}=require('../core/audit.cjs');
const {createEventBus}=require('../core/kernel.cjs');
const {createTaskEngine}=require('../core/task-engine.cjs');
const {createAuraGateway}=require('../core/aura-gateway.cjs');

function fixture({sinkFailsFor='',maxJobs=20}={}){
 let time=10000,handled=0;
 const roles=new Map([['owner-1',['owner']],['alice',['user']],['bob',['user']]]);
 const verifyCredential=async credential=>{
  if(credential==='owner')return {verified:true,subject:'owner-1',expiresAt:time+100000};
  if(credential==='alice')return {verified:true,subject:'alice',expiresAt:time+100000};
  if(credential==='bob')return {verified:true,subject:'bob',expiresAt:time+100000};
  return {verified:false,subject:'owner-1',expiresAt:time+100000};
 };
 const p=createPermissionEngine({verifyCredential,getRoles:async sub=>roles.get(sub)||[],
  ownerSubject:'owner-1',now:()=>time,grantTtlMs:60000});
 const stored=[],audit=createAuditLedger({now:()=>time,sink:async entry=>{
  if(entry.event.event===sinkFailsFor)return false;
  stored.push(entry);return true;
 }});
 const events=createEventBus();
 const tasks=createTaskEngine({permissions:p,audit,events,now:()=>time,maxJobs,backoffMs:1000});
 tasks.registerAction({name:'account.preview',capability:'account:read',maxAttempts:2,
  handler:async payload=>{handled++;if(payload.failOnce&&handled===1)throw Error('private backend secret');return {ok:true,value:payload.value||''};}});
 tasks.registerAction({name:'os.health',capability:'os:health',
  handler:async()=>{handled++;return {ok:true};}});
 tasks.seal();
 const aura=createAuraGateway({tasks,audit});
 aura.registerTool({name:'account.preview',action:'account.preview',risk:'low',
  validateArgs:a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['value','failOnce'].includes(k))});
 aura.registerTool({name:'admin.delete',action:'os.health',risk:'high',validateArgs:()=>true});
 aura.seal();
 return {p,tasks,aura,stored,roles,get handled(){return handled;},tick:n=>time+=n};
}
test('forged client role cannot obtain owner capability',async()=>{
 const x=fixture();
 await assert.rejects(x.p.issue({credential:'{"role":"owner"}',capability:'os:health'}),/ACCESS_DENIED/);
 await assert.rejects(x.p.issue({credential:'alice',capability:'os:health'}),/ACCESS_DENIED/);
 const g=await x.p.issue({credential:'owner',capability:'os:health'});
 assert.equal((await x.p.check(g,'os:health')).subject,'owner-1');
});

test('account access always requires matching subject even for owner',async()=>{
 const x=fixture();
 await assert.rejects(x.p.issue({credential:'alice',capability:'account:read'}),/ACCESS_DENIED/);
 await assert.rejects(x.p.issue({credential:'alice',capability:'account:read',resourceOwner:'bob'}),/ACCESS_DENIED/);
 await assert.rejects(x.p.issue({credential:'owner',capability:'account:read',resourceOwner:'alice'}),/ACCESS_DENIED/);
 const self=await x.p.issue({credential:'alice',capability:'account:read',resourceOwner:'alice'});
 assert.equal((await x.p.check(self,'account:read','alice')).resourceOwner,'alice');
});

test('grants are opaque, revocable and short-lived',async()=>{
 const x=fixture();
 const g=await x.p.issue({credential:'alice',capability:'aura:use',resourceOwner:'alice'});
 await assert.rejects(x.p.check({...g},'aura:use'),/GRANT_INVALID/);
 await assert.rejects(x.p.check(g,'os:health'),/GRANT_INVALID/);
 x.p.revokeSubject('alice');
 await assert.rejects(x.p.check(g,'aura:use','alice'),/GRANT_REVOKED/);
 const fresh=await x.p.issue({credential:'alice',capability:'aura:use',resourceOwner:'alice'});
 x.tick(60000);
 await assert.rejects(x.p.check(fresh,'aura:use','alice'),/GRANT_INVALID/);
});

test('server role revocation immediately blocks an existing grant',async()=>{
 const x=fixture();
 const g=await x.p.issue({credential:'owner',capability:'os:health'});
 x.roles.set('owner-1',['user']);
 await assert.rejects(x.p.check(g,'os:health'),/GRANT_REVOKED/);
});

test('idempotent replay does not execute twice and conflicts are rejected',async()=>{
 const x=fixture();
 const first=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:'one'},resourceOwner:'alice',idempotencyKey:'replay-0001'});
 const again=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:'one'},resourceOwner:'alice',idempotencyKey:'replay-0001'});
 assert.equal(again.jobId,first.jobId);
 await assert.rejects(x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:'other'},resourceOwner:'alice',idempotencyKey:'replay-0001'}),/IDEMPOTENCY_CONFLICT/);
 await x.tasks.runNext();
 assert.equal(x.handled,1);
 assert.equal((await x.tasks.inspect({credential:'alice',jobId:first.jobId})).status,'completed');
});

test('task retry backs off and completes without leaking backend exceptions',async()=>{
 const x=fixture();
 const r=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{failOnce:true},resourceOwner:'alice',idempotencyKey:'retry-00001'});
 assert.equal((await x.tasks.runNext()).status,'retry');
 assert.equal((await x.tasks.inspect({credential:'alice',jobId:r.jobId})).code,'HANDLER_FAILED');
 assert.equal(await x.tasks.runNext(),null);
 x.tick(1000);
 assert.equal((await x.tasks.runNext()).status,'completed');
 assert.equal(x.handled,2);
 assert.equal(JSON.stringify(x.stored).includes('private backend secret'),false);
});

test('worker checks role again and blocks a queued task after revocation',async()=>{
 const x=fixture();
 const r=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:'a'},resourceOwner:'alice',idempotencyKey:'revoke-0001'});
 x.p.revokeSubject('alice');
 assert.equal((await x.tasks.runNext()).status,'blocked');
 assert.equal(x.handled,0);
 assert.equal((await x.tasks.inspect({credential:'alice',jobId:r.jobId})).status,'blocked');
});

test('user can cancel queued work, but cannot cancel another user job',async()=>{
 const x=fixture();
 const r=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:'a'},resourceOwner:'alice',idempotencyKey:'cancel-0001'});
 await assert.rejects(x.tasks.cancel({credential:'bob',jobId:r.jobId}),/ACCESS_DENIED/);
 const cancelled=await x.tasks.cancel({credential:'alice',jobId:r.jobId});
 assert.equal(cancelled.status,'cancelled');
 assert.equal(await x.tasks.runNext(),null);
 assert.equal(x.handled,0);
});

test('untrusted payload rejects prototype pollution and unsupported values',async()=>{
 const x=fixture();
 const evil=JSON.parse('{"__proto__":{"admin":true}}');
 await assert.rejects(x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:evil,resourceOwner:'alice',idempotencyKey:'pollute-0001'}),/INVALID_PAYLOAD/);
 await assert.rejects(x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{value:()=>0},resourceOwner:'alice',idempotencyKey:'pollute-0002'}),/INVALID_PAYLOAD/);
 assert.equal(({}).admin,undefined);
});

test('high-risk tools cannot be invoked by owner or user',async()=>{
 const x=fixture();
 for(const credential of ['alice','owner'])
  await assert.rejects(x.aura.invoke({credential,toolName:'admin.delete',args:{},
   idempotencyKey:'riskkey-0001'}),/HIGH_RISK_REQUIRES_SEPARATE_OWNER_APPROVAL/);
 assert.equal(x.handled,0);
});

test('failed start audit prevents handler execution',async()=>{
 const x=fixture({sinkFailsFor:'task.started'});
 const r=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{},resourceOwner:'alice',idempotencyKey:'audit-00001'});
 assert.equal((await x.tasks.runNext()).status,'blocked');
 assert.equal(x.handled,0);
 assert.equal((await x.tasks.inspect({credential:'alice',jobId:r.jobId})).code,'PERMISSION_OR_AUDIT_DENIED');
});

test('completion audit failure does not automatically retry side effects',async()=>{
 const x=fixture({sinkFailsFor:'task.completed'});
 const r=await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{},resourceOwner:'alice',idempotencyKey:'audit-00002'});
 assert.equal((await x.tasks.runNext()).status,'audit_error');
 assert.equal(x.handled,1);
 assert.equal(await x.tasks.runNext(),null);
 assert.equal((await x.tasks.inspect({credential:'alice',jobId:r.jobId})).status,'audit_error');
});

test('bounded in-memory queue refuses excess jobs',async()=>{
 const x=fixture({maxJobs:1});
 await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{},resourceOwner:'alice',idempotencyKey:'cap-00001'});
 await assert.rejects(x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{},resourceOwner:'alice',idempotencyKey:'cap-00002'}),/TASK_CAPACITY_REACHED/);
});

test('parallel workers cannot both select the same job',async()=>{
 const x=fixture();
 await x.aura.invoke({credential:'alice',toolName:'account.preview',
  args:{},resourceOwner:'alice',idempotencyKey:'parallel-1'});
 const results=await Promise.all([x.tasks.runNext(),x.tasks.runNext()]);
 assert.equal(results.filter(Boolean).length,1);
 assert.equal(x.handled,1);
});
