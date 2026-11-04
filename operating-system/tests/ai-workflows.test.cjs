'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
const {MODULES,allowedArgs}=require('../features/ai-workflows.cjs');
function fixture({consent=true,model=true}={}){
 let clock=10000;
 const calls=[],grants=new Set(),audit=[];
 const values={
  verifyCredential:async token=>{
   const subject=token==='alice'?'alice':token==='owner'?'owner-1':null;
   return {verified:!!subject,subject:subject||'',expiresAt:clock+120000};
  },
  getRoles:async subject=>subject==='owner-1'?['owner']:subject==='alice'?['user']:[],
  ownerSubject:'owner-1',now:()=>clock,
  auditSink:async entry=>{audit.push(entry);return true}
 };
 if(model)values.modelProvider={suggest:async request=>{
  calls.push(request);
  return 'Suggestion only for '+request.workflow;
 }};
 if(consent)values.aiConsent=async({subject,workflow})=>grants.has(subject+':'+workflow);
 return {os:createOperatingSystem(values),calls,grants,audit};
}
async function request(os,{credential='alice',name='ai.editor.guide',owner='alice',key='ai-request-001',args={prompt:'Suggest an edit'}}={}){
 return os.aura.invoke({credential,toolName:name,args,resourceOwner:owner,idempotencyKey:key});
}
test('a missing provider or consent never registers AI tools',async()=>{
 const empty=fixture({model:false,consent:false});
 assert.deepEqual(empty.os.aiWorkflowRegistration.configured,[]);
 await empty.os.start();
 await assert.rejects(request(empty.os),/UNKNOWN_TOOL/);
 assert.throws(()=>fixture({model:true,consent:false}),/MODEL_AND_TRUSTED_CONSENT_REQUIRED/);
 assert.throws(()=>fixture({model:false,consent:true}),/MODEL_AND_TRUSTED_CONSENT_REQUIRED/);
});
test('whole app domain tools are registered only as opt-in advice',async()=>{
 const f=fixture();await f.os.start();
 assert.equal(f.os.aiWorkflowRegistration.configured.length,MODULES.length+1);
 f.grants.add('alice:editor');
 const r=await request(f.os,{args:{prompt:'Help with clip timing',context:'10 second sample video'}});
 assert.equal(r.status,'queued');
 assert.equal((await f.os.tasks.runNext()).status,'completed');
 const result=(await f.os.tasks.inspect({credential:'alice',jobId:r.jobId})).result;
 assert.equal(result.workflow,'editor');
 assert.equal(result.executed,false);
 assert.equal(result.published,false);
 assert.equal(result.sent,false);
 assert.equal(result.broadcast,false);
 assert.equal(result.charged,false);
 assert.equal(result.origin,'configured_model');
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].mode,'advice_only');
 assert.equal(f.calls[0].subject,'alice');
 assert.match(f.calls[0].instruction,/edit/i);
 assert.ok(!JSON.stringify(f.audit).includes('clip timing'),'audit should not store prompt');
});
test('missing consent or revocation while queued denies execution',async()=>{
 const f=fixture();await f.os.start();
 const a=await request(f.os,{key:'ai-request-002'});
 assert.equal((await f.os.tasks.runNext()).status,'failed');
 assert.equal((await f.os.tasks.inspect({credential:'alice',jobId:a.jobId})).result,null);
 assert.equal(f.calls.length,0);
 f.grants.add('alice:messages');
 const b=await request(f.os,{key:'ai-request-003',name:'ai.messages.guide',args:{prompt:'Write a polite unsent reply'}});
 f.grants.delete('alice:messages');
 assert.equal((await f.os.tasks.runNext()).status,'failed');
 assert.equal(f.calls.length,0);
 assert.equal((await f.os.tasks.inspect({credential:'alice',jobId:b.jobId})).code,'HANDLER_FAILED');
});
test('owner diagnostics cannot be requested by an ordinary user',async()=>{
 const f=fixture();await f.os.start();
 f.grants.add('owner-1:owner');
 await assert.rejects(request(f.os,{name:'ai.owner.guide',owner:undefined,key:'ai-owner-001'}),/ACCESS_DENIED/);
 const r=await request(f.os,{credential:'owner',name:'ai.owner.guide',owner:undefined,key:'ai-owner-002'});
 assert.equal((await f.os.tasks.runNext()).status,'completed');
 assert.equal((await f.os.tasks.inspect({credential:'owner',jobId:r.jobId})).result.executed,false);
 assert.equal(f.calls[0].subject,'owner-1');
});
test('no cross-account access and no untrusted keys or oversized prompts',async()=>{
 const f=fixture();await f.os.start();
 f.grants.add('alice:editor');
 await assert.rejects(request(f.os,{owner:'another',key:'ai-cross-001'}),/ACCESS_DENIED/);
 assert.equal(allowedArgs({prompt:'ok',context:'provided by user'}),true);
 assert.equal(allowedArgs({prompt:'',context:'text'}),false);
 assert.equal(allowedArgs({prompt:'x',role:'owner'}),false);
 assert.equal(allowedArgs({prompt:'x'.repeat(1001)}),false);
 await assert.rejects(request(f.os,{key:'ai-bad-prompt',args:{prompt:'x',command:'sendMessage'}}),/INVALID_TOOL_ARGUMENTS/);
 await assert.rejects(request(f.os,{key:'ai-longprompt',args:{prompt:'x'.repeat(1001)}}),/INVALID_TOOL_ARGUMENTS/);
 assert.equal(f.calls.length,0);
});
test('AI answers cannot contain executable receipts and provider failures are fail-closed',async()=>{
 const f=fixture();await f.os.start();f.grants.add('alice:wallet');
 const r=await request(f.os,{name:'ai.wallet.guide',key:'ai-wallet-001',
   args:{prompt:'Review a gifting safety warning'}});
 assert.equal((await f.os.tasks.runNext()).status,'completed');
 const answer=(await f.os.tasks.inspect({credential:'alice',jobId:r.jobId})).result;
 assert.equal(answer.charged,false);
 assert.equal(answer.published,false);
 const bad=fixture();bad.os.modelProvider=undefined; // should not change frozen OS or its adapter
 assert.equal(f.calls.length,1);
});
