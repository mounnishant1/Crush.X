'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOperatingSystem}=require('../index.cjs');
const {contentArgs,editorArgs,messageArgs}=require('../features/user-features.cjs');
function make(options={}){
 let time=1000, writes=[],preflights=[];
 const os=createOperatingSystem({
  now:()=>time,ownerSubject:'owner-sub',
  verifyCredential:async token=>
   ['alice','bob','owner'].includes(token)?{verified:true,subject:token==='owner'?'owner-sub':token,expiresAt:time+100000}:
   {verified:false,subject:'alice',expiresAt:time+100000},
  getRoles:async subject=>subject==='owner-sub'?['owner']:['user'],
  auditSink:async()=>true,
  userFeatures:options.features===undefined?{
   cameraPreflight:async context=>{preflights.push(['camera',context.subject]);return {enabled:true};},
   callPreflight:async context=>{preflights.push(['call',context.subject]);return {enabled:false};},
   saveContentDraft:async context=>{writes.push(['content',context]);return {saved:true,draftId:'content-1'};},
   saveMessageDraft:async context=>{writes.push(['message',context]);return {saved:true,draftId:'message-1'};},
   saveEditorDraft:async context=>{writes.push(['editor',context]);return {saved:true,draftId:'editor-1'};}
  }:options.features
 });
 return {os,writes,preflights,tick:n=>time+=n};
}
async function dispatch(os,credential,toolName,args,resourceOwner,idempotencyKey){
 const receipt=await os.aura.invoke({credential,toolName,args,resourceOwner,idempotencyKey});
 const result=await os.tasks.runNext();
 assert.equal(result.jobId,receipt.jobId);
 return os.tasks.inspect({credential,jobId:receipt.jobId});
}
test('features register only when explicitly backed by server adapters',async()=>{
 const a=make({features:{}});await a.os.start();
 assert.deepEqual(a.os.userFeatureRegistration.configured,[]);
 await assert.rejects(a.os.aura.invoke({credential:'alice',toolName:'messages.save-draft',args:{recipientId:'bob',text:'Hi'},resourceOwner:'alice',idempotencyKey:'missing-0001'}),/UNKNOWN_TOOL/);
});
test('Story Reel Post draft metadata uses the same account-scoped backend action',async()=>{
 const x=make();await x.os.start();
 for(const kind of ['story','reel','post']){
  const r=await dispatch(x.os,'alice','content.save-draft',{kind,caption:'A local '+kind},'alice','draft-'+kind+'-001');
  assert.equal(r.status,'completed');
  assert.deepEqual(r.result,{saved:true,draftId:'content-1',published:false,sent:false,kind});
 }
 assert.equal(x.writes.filter(w=>w[0]==='content').length,3);
 assert.ok(x.writes.every(([,c])=>c.subject==='alice'&&c.resourceOwner==='alice'));
});
test('Video editor metadata can be saved but no export or publish is performed',async()=>{
 const x=make();await x.os.start();
 const r=await dispatch(x.os,'alice','editor.save-draft',
  {kind:'reel',draftId:'reel-1',operations:[{type:'trim',value:'0:10'},{type:'text',value:'Hello'}]},
  'alice','edit-00001');
 assert.equal(r.result.kind,'reel');
 assert.equal(r.result.published,false);
 assert.equal(x.writes[0][0],'editor');
});
test('message drafts are never sent and recipient is explicitly chosen',async()=>{
 const x=make();await x.os.start();
 const r=await dispatch(x.os,'alice','messages.save-draft',{recipientId:'bob',text:'Hello'},'alice','message-0001');
 assert.equal(r.result.saved,true);assert.equal(r.result.sent,false);
 assert.equal(x.writes[0][1].request.recipientId,'bob');
});
test('preflight returns policy status without claiming camera permission or initiating calls',async()=>{
 const x=make();await x.os.start();
 const camera=await dispatch(x.os,'alice','camera.preflight',{},'alice','camera-0001');
 const call=await dispatch(x.os,'alice','calls.preflight',{},'alice','calls-00001');
 assert.deepEqual(camera.result,{enabled:true,reason:'READY_FOR_CLIENT_PERMISSION_CHECK',executed:false});
 assert.deepEqual(call.result,{enabled:false,reason:'DISABLED_BY_POLICY',executed:false});
 assert.equal(x.preflights.length,2);
});
test('cross-account writes, unauthenticated users and owner bypass all fail closed',async()=>{
 const x=make();await x.os.start();
 for(const [credential,resourceOwner] of [['alice','bob'],['owner','alice'],['invalid','alice']])
  await assert.rejects(x.os.aura.invoke({
   credential,toolName:'messages.save-draft',
   args:{recipientId:'bob',text:'private'},resourceOwner,idempotencyKey:'deny-00001'
  }),/ACCESS_DENIED/);
 assert.equal(x.writes.length,0);
});
test('invalid media types, editor operations and excessive text never reach persistence',async()=>{
 assert.equal(contentArgs({kind:'live',caption:'hi'}),false);
 assert.equal(editorArgs({kind:'reel',draftId:'r1',operations:[{type:'shell',value:'rm'}]}),false);
 assert.equal(messageArgs({recipientId:'bob',text:'x'.repeat(4001)}),false);
 const x=make();await x.os.start();
 await assert.rejects(x.os.aura.invoke({credential:'alice',toolName:'content.save-draft',
  args:{kind:'video',caption:'not allowed'},resourceOwner:'alice',idempotencyKey:'badkind-1'}),/INVALID_TOOL_ARGUMENTS/);
 await assert.rejects(x.os.aura.invoke({credential:'alice',toolName:'editor.save-draft',
  args:{kind:'reel',draftId:'one',operations:[{type:'execute',value:'go'}]},resourceOwner:'alice',idempotencyKey:'badedit-1'}),/INVALID_TOOL_ARGUMENTS/);
 assert.equal(x.writes.length,0);
});
test('failed/lying storage adapter is not reported as a saved draft',async()=>{
 const x=make({features:{saveContentDraft:async()=>({saved:false,draftId:'maybe'})}});
 await x.os.start();
 const receipt=await x.os.aura.invoke({credential:'alice',toolName:'content.save-draft',
  args:{kind:'post'},resourceOwner:'alice',idempotencyKey:'failed-0001'});
 assert.equal((await x.os.tasks.runNext()).status,'failed');
 const value=await x.os.tasks.inspect({credential:'alice',jobId:receipt.jobId});
 assert.equal(value.result,null);
 assert.equal(value.code,'HANDLER_FAILED');
});
test('same idempotency key never creates duplicate content drafts',async()=>{
 const x=make();await x.os.start();
 const options={credential:'alice',toolName:'content.save-draft',args:{kind:'story',caption:'one'},resourceOwner:'alice',idempotencyKey:'unique-0001'};
 const a=await x.os.aura.invoke(options),b=await x.os.aura.invoke(options);
 assert.equal(a.jobId,b.jobId);
 await x.os.tasks.runNext();
 assert.equal(x.writes.length,1);
 await assert.rejects(x.os.aura.invoke({...options,args:{kind:'story',caption:'different'}}),/IDEMPOTENCY_CONFLICT/);
});
test('OS registration refuses invalid feature adapter',()=>{
 assert.throws(()=>make({features:{saveMessageDraft:true}}),/INVALID_USER_FEATURE_ADAPTER/);
});
