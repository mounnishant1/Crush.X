'use strict';
// Step 7: server-side, user-scoped feature adapters.
// These contracts save DRAFT metadata and check policy readiness only.
// They do NOT publish, call, transmit a message, record camera or mutate accounts.
const KINDS=new Set(['post','reel','story']);
const text=(v,max)=>typeof v==='string'&&v.length<=max;
const exactKeys=(obj,allowed)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>allowed.includes(k));
const draftId=x=>text(x,96)&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const contentArgs=x=>exactKeys(x,['kind','draftId','caption','title'])&&KINDS.has(x.kind)&&
 (!Object.hasOwn(x,'draftId')||draftId(x.draftId))&&
 (!Object.hasOwn(x,'caption')||text(x.caption,2200))&&
 (!Object.hasOwn(x,'title')||text(x.title,120));
const editorArgs=x=>exactKeys(x,['kind','draftId','operations'])&&KINDS.has(x.kind)&&draftId(x.draftId)&&
 Array.isArray(x.operations)&&x.operations.length<=25&&x.operations.every(op=>
  exactKeys(op,['type','value'])&&['text','filter','crop','trim','sticker'].includes(op.type)&&text(op.value,320));
const messageArgs=x=>exactKeys(x,['recipientId','draftId','text'])&&draftId(x.recipientId)&&
 (!Object.hasOwn(x,'draftId')||draftId(x.draftId))&&text(x.text,4000);
const empty=x=>exactKeys(x,[])&&Object.keys(x).length===0;
function assertSaved(reply){
 if(!reply||reply.saved!==true||!draftId(reply.draftId))throw Error('DRAFT_NOT_ACKNOWLEDGED');
 return {saved:true,draftId:reply.draftId,published:false,sent:false};
}
function assertPreflight(reply){
 if(!reply||typeof reply.enabled!=='boolean')throw Error('PREFLIGHT_UNAVAILABLE');
 return {enabled:reply.enabled,reason:reply.enabled?'READY_FOR_CLIENT_PERMISSION_CHECK':'DISABLED_BY_POLICY',
  executed:false};
}
function registerUserFeatures({tasks,aura,adapters={}}={}){
 if(!tasks||typeof tasks.registerAction!=='function'||!aura||typeof aura.registerTool!=='function'||
  !adapters||typeof adapters!=='object'||Array.isArray(adapters))throw TypeError('USER_FEATURE_ADAPTERS_REQUIRED');
 const configured=[];
 function bind(name,action,capability,adapter,check,handler){
  if(adapter===undefined)return;
  if(typeof adapter!=='function')throw TypeError('INVALID_USER_FEATURE_ADAPTER');
  tasks.registerAction({name:action,capability,maxAttempts:1,handler:async (payload,ctx)=>handler(await adapter({
   subject:ctx.subject,resourceOwner:ctx.resourceOwner,request:payload,jobId:ctx.jobId
  }),payload)});
  aura.registerTool({name,action,risk:'low',validateArgs:check});
  configured.push(name);
 }
 bind('camera.preflight','camera.preflight','camera:preflight',adapters.cameraPreflight,empty,assertPreflight);
 bind('calls.preflight','calls.preflight','call:preflight',adapters.callPreflight,empty,assertPreflight);
 bind('editor.save-draft','editor.save-draft','editor:draft',adapters.saveEditorDraft,editorArgs,
  (reply,req)=>({...assertSaved(reply),kind:req.kind}));
 bind('content.save-draft','content.save-draft','content:draft',adapters.saveContentDraft,contentArgs,
  (reply,req)=>({...assertSaved(reply),kind:req.kind}));
 bind('messages.save-draft','messages.save-draft','message:draft',adapters.saveMessageDraft,messageArgs,assertSaved);
 return Object.freeze({configured:Object.freeze(configured)});
}
module.exports=Object.freeze({registerUserFeatures,contentArgs,editorArgs,messageArgs,assertSaved,assertPreflight});
