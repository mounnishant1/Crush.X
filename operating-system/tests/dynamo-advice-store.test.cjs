'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDynamoAdviceStore}=require('../durable/dynamo-advice-store.cjs');
const commands={};
for(const n of ['Get','Put','Update','Delete','Query'])
 commands[n+'Command']=class{constructor(input){this.input=input;}};
function fakeStore(){
 const rows=new Map();
 const failure=()=>{const e=Error('conflict');e.name='ConditionalCheckFailedException';throw e;};
 const client={send:async c=>{
  const a=c.input,kind=c.constructor.name;
  // The local constructors are anonymous; match the normalized inputs instead.
  if(Object.hasOwn(a,'ConditionExpression')&&a.Item){
   if(rows.has(a.Item.PK))failure();rows.set(a.Item.PK,{...a.Item});return {};
  }
  if(a.ConsistentRead){
   return {Item:rows.get(a.Key.PK)?{...rows.get(a.Key.PK)}:undefined};
  }
  if(a.IndexName){
   return {Items:[...rows.values()].filter(j=>j.GSI1PK===a.ExpressionAttributeValues[':pk']&&
    j.GSI1SK<=a.ExpressionAttributeValues[':max']).map(j=>({...j}))};
  }
  if(a.UpdateExpression?.includes('ADD attempts')){
   const j=rows.get(a.Key.PK),v=a.ExpressionAttributeValues;
   if(!j||!['queued','running'].includes(j.status)||j.dueAt>v[':now']||j.expiresAt<=v[':now'])failure();
   j.status='running';j.leaseToken=v[':token'];j.leaseUntil=v[':until'];
   j.dueAt=v[':until'];j.GSI1SK=v[':sort'];j.attempts+=1;
   return {Attributes:{...j}};
  }
  if(a.UpdateExpression?.includes('sealedResult')){
   const j=rows.get(a.Key.PK),v=a.ExpressionAttributeValues;
   if(!j||j.status!=='running'||j.leaseToken!==v[':lease'])failure();
   j.status=v[':status'];j.code=v[':code'];j.sealedResult=v[':sealedResult'];
   delete j.leaseToken;delete j.leaseUntil;delete j.GSI1PK;
   delete j.GSI1SK;delete j.dueAt;delete j.sealed;
   return {};
  }
  if(a.UpdateExpression?.includes(':cancelled')){
   const j=rows.get(a.Key.PK),v=a.ExpressionAttributeValues;
   if(!j||j.status!=='queued'||j.subject!==v[':subject'])failure();
   j.status='cancelled';delete j.sealed;delete j.GSI1PK;delete j.GSI1SK;
   return {};
  }
  if(a.Key&&a.ConditionExpression?.includes('AND #s <>')){
   const j=rows.get(a.Key.PK),v=a.ExpressionAttributeValues;
   if(!j||j.status==='running'||j.subject!==v[':subject'])failure();
   rows.delete(a.Key.PK);return {};
  }
  throw Error('Unexpected Dynamo command: '+JSON.stringify(a));
 }};
 return {store:createDynamoAdviceStore({client,tableName:'CrushX-Jobs',commands}),rows};
}
const id='00000000-0000-4000-8000-000000000001';
const job=(x=id)=>({id:x,subject:'alice',workflow:'reels',inputHash:'a'.repeat(64),
 status:'queued',attempts:0,createdAt:1000,nextRunAt:1000,expiresAt:500000,
 sealed:{iv:'secret',tag:'tag',data:'ciphertext'}});
test('Dynamo conditional inserts, exclusive leases and crash recovery',async()=>{
 const f=fakeStore();
 assert.equal(await f.store.insert(job()),true);
 assert.equal(await f.store.insert(job()),false);
 assert.equal((await f.store.get(id)).subject,'alice');
 const first=await f.store.claim({now:1000,leaseMs:30000});
 assert.equal(first.status,'running');
 assert.equal(await f.store.claim({now:1001,leaseMs:30000}),null);
 const second=await f.store.claim({now:31001,leaseMs:30000});
 assert.equal(second.attempts,2);
 assert.notEqual(second.leaseToken,first.leaseToken);
 assert.equal(await f.store.settle({id,leaseToken:first.leaseToken,
  status:'completed',sealedResult:null,now:31001}),false);
 assert.equal(await f.store.settle({id,leaseToken:second.leaseToken,
  status:'completed',sealedResult:{iv:'a',tag:'b',data:'cipher'},now:31002}),true);
 const stored=await f.store.get(id);
 assert.equal(stored.status,'completed');
 assert.equal(stored.sealed,undefined,'queued payload erased');
 assert.equal(stored.GSI1PK,undefined,'completed task removed from ready index');
 assert.equal(await f.store.purge({id,subject:'bob'}),false);
 assert.equal(await f.store.purge({id,subject:'alice'}),true);
 assert.equal(await f.store.get(id),null);
});
test('queued cancellation is atomic and prevents dispatch',async()=>{
 const f=fakeStore(),j=job();
 await f.store.insert(j);
 assert.equal(await f.store.cancel({id,subject:'bob',now:1001}),false);
 assert.equal(await f.store.cancel({id,subject:'alice',now:1001}),true);
 assert.equal(await f.store.claim({now:1002,leaseMs:30000}),null);
});
