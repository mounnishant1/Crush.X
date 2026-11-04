'use strict';
// DynamoDB DocumentClient transactional lease implementation for AI advice.
// Table: PK (string) primary key, GSI1 on GSI1PK + GSI1SK (strings), TTL ttl.
// Queue visibility from a GSI is eventually consistent; conditional updates
// are authoritative, so duplicate workers cannot own a lease concurrently.
const {randomUUID}=require('node:crypto');
const QUEUE='AURA_READY_V1',pad=t=>String(t).padStart(16,'0');
function createDynamoAdviceStore({client,tableName,commands,gsi='GSI1'}={}){
 const required=['GetCommand','PutCommand','UpdateCommand','DeleteCommand','QueryCommand'];
 if(typeof client?.send!=='function'||!commands||required.some(k=>typeof commands[k]!=='function')||
  typeof tableName!=='string'||!/^[A-Za-z0-9_.-]{3,255}$/.test(tableName)||
  typeof gsi!=='string'||!/^[A-Za-z0-9_.-]{2,64}$/.test(gsi))
  throw TypeError('DYNAMO_ADVICE_CONFIG_REQUIRED');
 const key=id=>({PK:'AURA_JOB#'+id});
 const dueKey=(at,id)=>pad(at)+'#'+id;
 const conditional=e=>e?.name==='ConditionalCheckFailedException'||e?.name==='TransactionCanceledException'&&
   Array.isArray(e.CancellationReasons)&&e.CancellationReasons.some(r=>r?.Code==='ConditionalCheckFailed');
 const send=cmd=>client.send(new cmd.constructor(cmd.input)); // never used; commands are instantiated below
 async function get(id){
  if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id))return null;
  const result=await client.send(new commands.GetCommand({TableName:tableName,Key:key(id),ConsistentRead:true}));
  const item=result?.Item;
  return item?.id===id?item:null;
 }
 async function insert(job){
  const item={...job,...key(job.id),GSI1PK:QUEUE,
   GSI1SK:dueKey(job.nextRunAt,job.id),
   dueAt:job.nextRunAt,ttl:Math.ceil(job.expiresAt/1000)};
  try{
   await client.send(new commands.PutCommand({TableName:tableName,Item:item,
    ConditionExpression:'attribute_not_exists(PK)'}));return true;
  }catch(e){if(conditional(e))return false;throw e;}
 }
 async function claim({now,leaseMs}){
  // Scan only a bounded indexed prefix. All candidate ownership transitions
  // are conditional on the current status + dueAt, not on stale GSI results.
  const results=await client.send(new commands.QueryCommand({TableName:tableName,IndexName:gsi,
   KeyConditionExpression:'GSI1PK = :pk AND GSI1SK <= :max',
   ExpressionAttributeValues:{':pk':QUEUE,':max':dueKey(now,'~')},
   ScanIndexForward:true,Limit:40}));
  for(const item of results?.Items||[]){
   if(!item?.id||!['queued','running'].includes(item.status)||item.dueAt>now||
     item.expiresAt<=now)continue;
   const leaseToken=randomUUID(),leaseUntil=now+leaseMs;
   try{
    const result=await client.send(new commands.UpdateCommand({
     TableName:tableName,Key:key(item.id),
     UpdateExpression:'SET #s = :running, leaseToken = :token, leaseUntil = :until, dueAt = :until, GSI1SK = :sort ADD attempts :one',
     ConditionExpression:'(#s = :queued OR #s = :running) AND dueAt <= :now AND expiresAt > :now',
     ExpressionAttributeNames:{'#s':'status'},
     ExpressionAttributeValues:{
      ':running':'running',':queued':'queued',':token':leaseToken,':until':leaseUntil,
      ':sort':dueKey(leaseUntil,item.id),':now':now,':one':1
     },ReturnValues:'ALL_NEW'
    }));
    return result?.Attributes?.leaseToken===leaseToken?result.Attributes:null;
   }catch(e){if(conditional(e))continue;throw e;}
  }
  return null;
 }
 async function settle({id,leaseToken,status,code,suggestion,now}){
  if(!['completed','failed','blocked'].includes(status)||typeof leaseToken!=='string'||
    typeof id!=='string')throw Error('DYNAMO_SETTLE_INVALID');
  try{
   await client.send(new commands.UpdateCommand({
    TableName:tableName,Key:key(id),
    UpdateExpression:'SET #s = :status, #code = :code, suggestion = :suggestion, finishedAt = :now REMOVE leaseToken, leaseUntil, GSI1PK, GSI1SK, dueAt, sealed',
    ConditionExpression:'#s = :running AND leaseToken = :lease',
    ExpressionAttributeNames:{'#s':'status','#code':'code'},
    ExpressionAttributeValues:{':status':status,':code':code||null,
     ':suggestion':suggestion||null,':now':now,':running':'running',':lease':leaseToken}
   }));return true;
  }catch(e){if(conditional(e))return false;throw e;}
 }
 async function cancel({id,subject,now}){
  try{
   await client.send(new commands.UpdateCommand({
    TableName:tableName,Key:key(id),
    UpdateExpression:'SET #s = :cancelled, finishedAt = :now REMOVE GSI1PK, GSI1SK, dueAt, sealed',
    ConditionExpression:'#s = :queued AND #subject = :subject',
    ExpressionAttributeNames:{'#s':'status','#subject':'subject'},
    ExpressionAttributeValues:{':queued':'queued',':cancelled':'cancelled',
     ':now':now,':subject':subject}
   }));return true;
  }catch(e){if(conditional(e))return false;throw e;}
 }
 async function purge({id,subject}){
  try{
   await client.send(new commands.DeleteCommand({TableName:tableName,Key:key(id),
    ConditionExpression:'#subject = :subject AND #s <> :running',
    ExpressionAttributeNames:{'#subject':'subject','#s':'status'},
    ExpressionAttributeValues:{':subject':subject,':running':'running'}}));
   return true;
  }catch(e){if(conditional(e))return false;throw e;}
 }
 return Object.freeze({insert,get,claim,settle,cancel,purge});
}
module.exports=Object.freeze({createDynamoAdviceStore});
