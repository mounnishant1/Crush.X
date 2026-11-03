'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createKernel,createEventBus}=require('../core/kernel.cjs');
const {createAuditLedger,verifyChain}=require('../core/audit.cjs');
const {createOperatingSystem}=require('../index.cjs');

test('kernel starts in dependency order and stops reverse order',async()=>{
 const k=createKernel(),calls=[];
 for(const [name,deps] of [['aura',['tasks']],['tasks',['permissions']],['permissions',[]]]){
  k.register({name,dependencies:deps,start:async()=>calls.push('start:'+name),
   stop:async()=>calls.push('stop:'+name),health:async()=>({ok:true})});
 }
 await k.start();
 assert.deepEqual(calls,['start:permissions','start:tasks','start:aura']);
 assert.equal((await k.health()).modules.every(m=>m.healthy),true);
 await k.stop();
 assert.deepEqual(calls.slice(3),['stop:aura','stop:tasks','stop:permissions']);
 assert.equal(k.phase(),'stopped');
});

test('kernel catches cyclic dependencies without partial startup',async()=>{
 const k=createKernel();
 for(const [name,deps] of [['first',['second']],['second',['first']]])
  k.register({name,dependencies:deps,start:async()=>{},stop:async()=>{},health:()=>true});
 await assert.rejects(k.start(),/CYCLIC_MODULE_DEPENDENCY/);
 assert.equal(k.phase(),'idle');
});

test('kernel rolls back previously started modules on failure',async()=>{
 const k=createKernel(),calls=[];
 k.register({name:'first',start:async()=>calls.push('first'),stop:async()=>calls.push('rollback'),health:()=>true});
 k.register({name:'second',dependencies:['first'],start:async()=>{throw Error('boom');},stop:async()=>{},health:()=>true});
 await assert.rejects(k.start(),/boom/);
 assert.deepEqual(calls,['first','rollback']);
 assert.equal(k.phase(),'failed');
});

test('event bus isolates failed subscribers and unsubscribe works',async()=>{
 const bus=createEventBus(),calls=[];
 const off=bus.subscribe('task.updated',async()=>calls.push(1));
 bus.subscribe('task.updated',async()=>{throw Error('failure');});
 const first=await bus.publish('task.updated',{jobId:'a'});
 assert.equal(first.delivered,2);
 assert.equal(first.errors.length,1);
 off();
 assert.equal((await bus.publish('task.updated',{})).delivered,1);
 assert.deepEqual(calls,[1]);
});

test('audit entries hash-chain and detect tampering',async()=>{
 const saved=[],audit=createAuditLedger({now:()=>1234,sink:async entry=>{saved.push(entry);return true;}});
 await Promise.all([audit.record({event:'task.accepted',subject:'user-a'}),
  audit.record({event:'task.started',subject:'user-a'}),
  audit.record({event:'task.completed',subject:'user-a'})]);
 assert.equal(audit.head().sequence,3);
 assert.equal(verifyChain(saved),true);
 const changed=saved.map(x=>({...x,event:{...x.event}}));
 changed[1].event.subject='another';
 assert.equal(verifyChain(changed),false);
});

test('audit sink failure denies commit and does not advance chain',async()=>{
 const entries=[],audit=createAuditLedger({sink:async x=>{
  if(x.event.event==='task.started')return false;
  entries.push(x);return true;
 }});
 await audit.record({event:'task.accepted'});
 await assert.rejects(audit.record({event:'task.started'}),/AUDIT_SINK_FAILED/);
 assert.equal(audit.head().sequence,1);
 await audit.record({event:'task.completed'});
 assert.equal(verifyChain(entries),true);
});

test('audit rejects accidental secrets or user payloads',async()=>{
 const audit=createAuditLedger({sink:async()=>true});
 assert.throws(()=>audit.record({event:'task.accepted',prompt:'my secret'}),/UNSAFE_AUDIT_FIELD/);
 assert.throws(()=>audit.record({event:'task.accepted',status:'my password'}),/UNSAFE_AUDIT_FIELD/);
 assert.equal(audit.head().sequence,0);
});

function runtimeFixture({auditSink,modelProvider}={}){
 let time=1000,reads=0,models=0;
 const events=[];
 const getRoles=async subject=>subject==='owner-1'?['owner']:['user'];
 const verifyCredential=async token=>{
  if(token==='owner')return {verified:true,subject:'owner-1',expiresAt:time+900000};
  if(token==='alice')return {verified:true,subject:'alice',expiresAt:time+900000};
  if(token==='bob')return {verified:true,subject:'bob',expiresAt:time+900000};
  return {verified:false,subject:'owner-1',expiresAt:time+900000};
 };
 const system=createOperatingSystem({verifyCredential,getRoles,ownerSubject:'owner-1',
  now:()=>time,auditSink:auditSink|| (async entry=>{events.push(entry);return true;}),
  readOwnProfile:async subject=>{reads++;return {username:subject,displayName:'Test name',bio:'sample',secret:'DO NOT EXPOSE'};},
  modelProvider:modelProvider||{async suggest({prompt}){models++;return 'Suggestion for '+prompt;}}
 });
 return {system,events,get reads(){return reads;},get models(){return models;},tick:ms=>time+=ms};
}

test('runtime exposes owner OS health through a safe audited task',async()=>{
 const x=runtimeFixture();
 await x.system.start();
 const r=await x.system.aura.invoke({credential:'owner',toolName:'owner.os.health',args:{},idempotencyKey:'health-00001'});
 assert.equal(r.status,'queued');
 assert.equal((await x.system.tasks.runNext()).status,'completed');
 const actual=await x.system.tasks.inspect({credential:'owner',jobId:r.jobId});
 assert.equal(actual.result.kernel.phase,'running');
 assert.equal(actual.result.kernel.modules.length,4);
 assert.equal(actual.result.tasks.completed,0); // sampled while health handler itself is running
 assert.equal(x.events.some(e=>e.event.event==='task.completed'),true);
 await x.system.stop();
});

test('self profile uses injected data, filtering secrets and requiring account ownership',async()=>{
 const x=runtimeFixture();await x.system.start();
 const r=await x.system.aura.invoke({credential:'alice',toolName:'account.self',args:{},
  resourceOwner:'alice',idempotencyKey:'profile-00001'});
 await x.system.tasks.runNext();
 const report=await x.system.tasks.inspect({credential:'alice',jobId:r.jobId});
 assert.equal(report.result.username,'alice');
 assert.equal(report.result.secret,undefined);
 assert.equal(x.reads,1);
 await assert.rejects(x.system.tasks.inspect({credential:'bob',jobId:r.jobId}),/ACCESS_DENIED/);
 await assert.rejects(x.system.aura.invoke({credential:'bob',toolName:'account.self',
  args:{},resourceOwner:'alice',idempotencyKey:'profile-00002'}),/ACCESS_DENIED/);
});

test('assistant provider only suggests text; does not execute autonomous actions',async()=>{
 const x=runtimeFixture();await x.system.start();
 const r=await x.system.aura.invoke({credential:'alice',toolName:'assistant.suggest',
  args:{prompt:'Help me write a caption'},resourceOwner:'alice',idempotencyKey:'suggest-00001'});
 assert.equal(x.models,0);
 await x.system.tasks.runNext();
 const result=await x.system.tasks.inspect({credential:'alice',jobId:r.jobId});
 assert.match(result.result.suggestion,/caption/);
 assert.equal(result.result.executed,false);
 assert.equal(x.models,1);
});

test('runtime does not falsely provide unconfigured model tooling',async()=>{
 const system=createOperatingSystem({
  verifyCredential:async()=>({verified:true,subject:'user',expiresAt:9999999}),
  getRoles:async()=>['user'],ownerSubject:'owner',
  auditSink:async()=>true,now:()=>100,
 });
 await system.start();
 await assert.rejects(system.aura.invoke({credential:'x',toolName:'assistant.suggest',
  args:{prompt:'hello'},resourceOwner:'user',idempotencyKey:'suggest-00002'}),/UNKNOWN_TOOL/);
});
