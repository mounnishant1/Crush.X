'use strict';
// Server-only Crush.X OS lifecycle and internal event routing. No browser globals.
const NAME=/^[a-z][a-z0-9.-]{0,63}$/;
function createKernel(){
 const modules=new Map(), started=[], states=new Map();
 let phase='idle';
 function register(def){
  if(phase!=='idle')throw Error('KERNEL_LOCKED');
  if(!def||!NAME.test(def.name||'')||modules.has(def.name))throw Error('INVALID_OR_DUPLICATE_MODULE');
  const dependencies=def.dependencies||[];
  if(!Array.isArray(dependencies)||dependencies.some(d=>!NAME.test(d))||new Set(dependencies).size!==dependencies.length)throw Error('INVALID_DEPENDENCIES');
  if(typeof def.start!=='function'||typeof def.stop!=='function'||typeof def.health!=='function')throw Error('MODULE_CONTRACT_REQUIRED');
  modules.set(def.name,{name:def.name,dependencies:[...dependencies],start:def.start,stop:def.stop,health:def.health});
  states.set(def.name,'registered');
 }
 function resolve(){
  const visiting=new Set(),visited=new Set(),ordered=[];
  function walk(name){
   if(visiting.has(name))throw Error('CYCLIC_MODULE_DEPENDENCY');
   if(visited.has(name))return;
   const m=modules.get(name);
   if(!m)throw Error('MISSING_MODULE_DEPENDENCY');
   visiting.add(name);
   for(const dep of m.dependencies)walk(dep);
   visiting.delete(name);visited.add(name);ordered.push(name);
  }
  for(const name of modules.keys())walk(name);
  return ordered;
 }
 async function start(){
  if(phase!=='idle')throw Error('KERNEL_ALREADY_STARTED');
  const order=resolve();
  phase='starting';
  try{
   for(const name of order){
    await modules.get(name).start();
    started.push(name);states.set(name,'running');
   }
   phase='running';
  }catch(error){
   for(const name of [...started].reverse()){
    try{await modules.get(name).stop();}catch{}
    states.set(name,'stopped');
   }
   started.length=0;phase='failed';
   throw error;
  }
 }
 async function stop(){
  if(phase==='stopped')return;
  if(phase!=='running'&&phase!=='failed')throw Error('KERNEL_NOT_RUNNING');
  phase='stopping';
  const failures=[];
  for(const name of [...started].reverse()){
   try{await modules.get(name).stop();}catch(e){failures.push(name);}
   states.set(name,'stopped');
  }
  started.length=0;phase='stopped';
  if(failures.length)throw Error('MODULE_STOP_FAILED');
 }
 async function health(){
  const results=[];
  for(const [name,m] of modules){
   const state=states.get(name);
   if(state!=='running'){results.push({name,state,healthy:false});continue;}
   try{
    const h=await m.health();
    results.push({name,state,healthy:h===true||(h&&h.ok===true)});
   }catch{results.push({name,state,healthy:false});}
  }
  return {phase,modules:results};
 }
 return Object.freeze({register,start,stop,health,phase:()=>phase});
}
function createEventBus({maxListeners=32}={}){
 if(!Number.isSafeInteger(maxListeners)||maxListeners<1||maxListeners>256)throw TypeError('INVALID_LISTENER_LIMIT');
 const handlers=new Map();
 function subscribe(event,handler){
  if(!NAME.test(event||'')||typeof handler!=='function')throw Error('INVALID_EVENT_HANDLER');
  const set=handlers.get(event)||new Set();
  if(set.size>=maxListeners)throw Error('TOO_MANY_LISTENERS');
  set.add(handler);handlers.set(event,set);
  return ()=>{set.delete(handler);if(set.size===0)handlers.delete(event);};
 }
 async function publish(event,details){
  if(!NAME.test(event||''))throw Error('INVALID_EVENT');
  // This channel is internal; only pass non-sensitive job identifiers/status.
  const callbacks=[...(handlers.get(event)||[])],errors=[];
  for(const fn of callbacks)try{await fn(details);}catch{errors.push('HANDLER_FAILED');}
  return Object.freeze({delivered:callbacks.length,errors:Object.freeze(errors)});
 }
 return Object.freeze({subscribe,publish});
}
module.exports=Object.freeze({createKernel,createEventBus});
