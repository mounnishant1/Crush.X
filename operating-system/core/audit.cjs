'use strict';
// Server-side tamper-evident audit chain. Sink must persist atomically and ack true.
// Never include prompts, messages, source code, credentials or task payloads.
const {createHash}=require('node:crypto');
const FIELDS=new Set(['event','subject','capability','jobId','tool','resourceOwner','status','code','module']);
const SAFE=/^[A-Za-z0-9:_.\/-]{1,128}$/;
const ZERO='0'.repeat(64);
function normalize(input){
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('AUDIT_EVENT_REQUIRED');
 const out={};
 for(const key of Object.keys(input).sort()){
  if(!FIELDS.has(key)||typeof input[key]!=='string'||!SAFE.test(input[key]))throw Error('UNSAFE_AUDIT_FIELD');
  out[key]=input[key];
 }
 if(!out.event)throw Error('AUDIT_EVENT_REQUIRED');
 return out;
}
function digest(prev,sequence,at,event){
 return createHash('sha256').update(JSON.stringify({prev,sequence,at,event})).digest('hex');
}
function verifyChain(entries){
 if(!Array.isArray(entries))return false;
 let prev=ZERO;
 for(let i=0;i<entries.length;i++){
  const x=entries[i];
  if(!x||x.sequence!==i+1||x.prevHash!==prev||typeof x.at!=='string')return false;
  let event;
  try{event=normalize(x.event);}catch{return false;}
  if(x.hash!==digest(prev,x.sequence,x.at,event))return false;
  prev=x.hash;
 }
 return true;
}
function createAuditLedger({sink,now=Date.now}={}){
 if(typeof sink!=='function'||typeof now!=='function')throw TypeError('PERSISTENT_AUDIT_SINK_REQUIRED');
 let sequence=0,prevHash=ZERO,chain=Promise.resolve();
 function record(input){
  const event=normalize(input);
  const attempt=chain.then(async()=>{
   const at=new Date(now()).toISOString();
   const next=Object.freeze({sequence:sequence+1,at,event:Object.freeze({...event}),
    prevHash,hash:digest(prevHash,sequence+1,at,event)});
   if(await sink(next)!==true)throw Error('AUDIT_SINK_FAILED');
   sequence=next.sequence;prevHash=next.hash;
   return next;
  });
  // A failed append does not poison future audit attempts or advance the chain.
  chain=attempt.then(()=>undefined,()=>undefined);
  return attempt;
 }
 return Object.freeze({record,head:()=>Object.freeze({sequence,hash:prevHash})});
}
module.exports=Object.freeze({createAuditLedger,verifyChain,normalize});
