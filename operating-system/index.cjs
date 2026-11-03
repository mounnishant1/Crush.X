'use strict';
// Composition root for Steps 2–6. Hosting API, Cognito verification, persistent
// jobs, AWS monitoring and client UI are separate deployment integrations.
const {createKernel,createEventBus}=require('./core/kernel.cjs');
const {createAuditLedger}=require('./core/audit.cjs');
const {createPermissionEngine}=require('./core/permissions.cjs');
const {createTaskEngine}=require('./core/task-engine.cjs');
const {createAuraGateway}=require('./core/aura-gateway.cjs');
const {registerUserFeatures}=require('./features/user-features.cjs');
function createOperatingSystem({verifyCredential,getRoles,ownerSubject,auditSink,now=Date.now,
 readOwnProfile,modelProvider,userFeatures}={}){
 const kernel=createKernel(),events=createEventBus();
 const audit=createAuditLedger({sink:auditSink,now});
 const permissions=createPermissionEngine({verifyCredential,getRoles,ownerSubject,now});
 const tasks=createTaskEngine({permissions,audit,events,now});
 const aura=createAuraGateway({tasks,audit});
 const lifecycle=(name,dependencies=[])=>kernel.register({
  name,dependencies,
  start:async()=>{},stop:async()=>{},
  health:async()=>({ok:true})
 });
 lifecycle('audit');
 lifecycle('permissions',['audit']);
 lifecycle('task-engine',['permissions']);
 lifecycle('aura',['task-engine']);
 tasks.registerAction({name:'os.health',capability:'os:health',handler:async()=>({
  kernel:await kernel.health(),tasks:tasks.metrics(),audit:audit.head()
 })});
 aura.registerTool({name:'owner.os.health',action:'os.health',risk:'low',
  validateArgs:a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===0});
 if(readOwnProfile!==undefined){
  if(typeof readOwnProfile!=='function')throw TypeError('INVALID_PROFILE_ADAPTER');
  tasks.registerAction({name:'account.self',capability:'account:read',handler:async(_,context)=>{
   const data=await readOwnProfile(context.subject);
   if(!data||typeof data!=='object')throw Error('PROFILE_UNAVAILABLE');
   // Explicit safe projection; no private auth, contacts or billing fields.
   return {username:typeof data.username==='string'?data.username.slice(0,64):'',
    displayName:typeof data.displayName==='string'?data.displayName.slice(0,128):'',
    bio:typeof data.bio==='string'?data.bio.slice(0,500):''};
  }});
  aura.registerTool({name:'account.self',action:'account.self',risk:'low',
   validateArgs:a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===0});
 }
 if(modelProvider!==undefined){
  if(!modelProvider||typeof modelProvider.suggest!=='function')throw TypeError('INVALID_MODEL_PROVIDER');
  tasks.registerAction({name:'aura.suggest',capability:'aura:use',handler:async(payload,context)=>{
   const suggestion=await modelProvider.suggest({prompt:payload.prompt,subject:context.subject});
   if(typeof suggestion!=='string'||suggestion.length>2500)throw Error('MODEL_OUTPUT_INVALID');
   return {suggestion,executed:false};
  },maxAttempts:2});
  aura.registerTool({name:'assistant.suggest',action:'aura.suggest',risk:'low',
   validateArgs:a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===1&&
    typeof a.prompt==='string'&&a.prompt.trim().length>=1&&a.prompt.length<=1000});
 }
 const userFeatureRegistration=userFeatures===undefined?Object.freeze({configured:Object.freeze([])}):
  registerUserFeatures({tasks,aura,adapters:userFeatures});
 let started=false;
 async function start(){
  if(started)throw Error('OS_ALREADY_STARTED');
  tasks.seal();aura.seal();await kernel.start();started=true;
 }
 async function stop(){if(!started)return;await kernel.stop();started=false;}
 // Return the backend service object. Never serialize it or expose it to clients.
 return Object.freeze({start,stop,kernel,permissions,tasks,aura,audit,events,userFeatureRegistration});
}
module.exports=Object.freeze({createOperatingSystem});
