'use strict';
// Single AURA-X server gateway: model text is untrusted, NOT an authorization grant.
// Tool definitions are registered only in trusted backend setup.
const {safeJson}=require('./task-engine.cjs');
const NAME=/^[a-z][a-z0-9.-]{1,63}$/;
function createAuraGateway({tasks,audit}={}){
 if(!tasks||typeof tasks.submit!=='function'||!audit||typeof audit.record!=='function')throw TypeError('AURA_GATEWAY_DEPENDENCIES_REQUIRED');
 const tools=new Map();
 let sealed=false;
 function registerTool({name,action,risk='low',validateArgs}={}){
  if(sealed)throw Error('AURA_REGISTRY_SEALED');
  if(!NAME.test(name||'')||!NAME.test(action||'')||tools.has(name)||!['low','high'].includes(risk)||typeof validateArgs!=='function')throw Error('INVALID_TOOL');
  tools.set(name,Object.freeze({name,action,risk,validateArgs}));
 }
 function seal(){sealed=true;}
 async function invoke({credential,toolName,args={},resourceOwner,idempotencyKey}={}){
  if(!sealed)throw Error('AURA_REGISTRY_OPEN');
  const tool=tools.get(toolName);
  if(!tool)throw Error('UNKNOWN_TOOL');
  if(tool.risk==='high'){
   await audit.record({event:'aura.denied',tool:toolName,code:'HIGH_RISK_REQUIRES_REVIEW'});
   throw Error('HIGH_RISK_REQUIRES_SEPARATE_OWNER_APPROVAL');
  }
  const payload=safeJson(args);
  if(tool.validateArgs(payload)!==true)throw Error('INVALID_TOOL_ARGUMENTS');
  // Audit must persist before task submission. No prompt/content is logged.
  await audit.record({event:'aura.requested',tool:toolName});
  return tasks.submit({credential,action:tool.action,payload,resourceOwner,idempotencyKey});
 }
 return Object.freeze({registerTool,seal,invoke});
}
module.exports=Object.freeze({createAuraGateway});
