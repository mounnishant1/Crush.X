'use strict';
// Test/local-only adapter. Do NOT use this for multi-instance or production accounts.
const {newAccount}=require('./account-service.cjs');
const copy=x=>structuredClone(x);
const conflict=code=>Object.assign(new Error(code),{code});
function createMemoryAccountStore(){
 const accounts=new Map(),receipts=new Map(),events=[],outbox=[];
 const k=(subject,key)=>subject+'\0'+key;
 async function provision(subject,at=Date.now()){
  if(accounts.has(subject))return false;
  accounts.set(subject,newAccount(subject,at));return true;
 }
 async function get(subject){const a=accounts.get(subject);return a?copy(a):null;}
 async function getReceipt(subject,key){
  const r=receipts.get(k(subject,key));return r?copy(r):null;
 }
 async function commit({target,expectedVersion,next,audit,outbox:box,idempotencyKey,fingerprint,response}){
  const a=accounts.get(target);
  if(receipts.has(k(target,idempotencyKey)))throw conflict('IDEMPOTENCY_EXISTS');
  if(!a||a.version!==expectedVersion||next.version!==expectedVersion+1)
   throw conflict('VERSION_CONFLICT');
  accounts.set(target,copy(next));
  receipts.set(k(target,idempotencyKey),copy({fingerprint,response}));
  events.push(copy(audit));outbox.push(copy(box));
 }
 function evidence(){return copy({accounts:[...accounts.values()],events,outbox,receipts:[...receipts.values()]});}
 return Object.freeze({provision,get,getReceipt,commit,evidence});
}
module.exports=Object.freeze({createMemoryAccountStore});
