'use strict';
// AWS DynamoDB document-client adapter. Table keys: pk (string), sk (string).
// Requires @aws-sdk/lib-dynamodb in the server deployment; never bundle in browser.
const {newAccount}=require('./account-service.cjs');
const SUBJECT=/^[A-Za-z0-9._:@-]{2,160}$/;
function createDynamoAccountStore({client,tableName,commands}={}){
 if(!client||typeof client.send!=='function'||typeof tableName!=='string'||
 !/^[A-Za-z0-9_.-]{3,255}$/.test(tableName))throw TypeError('DYNAMO_ACCOUNT_CONFIG_REQUIRED');
 const cmd=commands||require('@aws-sdk/lib-dynamodb');
 const {GetCommand,PutCommand,TransactWriteCommand}=cmd;
 if(![GetCommand,PutCommand,TransactWriteCommand].every(x=>typeof x==='function'))
  throw TypeError('DYNAMO_COMMANDS_REQUIRED');
 const key=(subject,sk)=>({pk:'ACCOUNT#'+subject,sk});
 async function provision(subject,at=Date.now()){
  if(!SUBJECT.test(subject))throw Error('INVALID_ACCOUNT');
  const state=newAccount(subject,at);
  try{
   await client.send(new PutCommand({TableName:tableName,Item:{...key(subject,'STATE'),
    version:1,state},ConditionExpression:'attribute_not_exists(pk)'}));
   return true;
  }catch(e){
   if(e?.name==='ConditionalCheckFailedException')return false;
   throw e;
  }
 }
 async function get(subject){
  const r=await client.send(new GetCommand({TableName:tableName,
   Key:key(subject,'STATE'),ConsistentRead:true}));
  return r.Item?.state||null;
 }
 async function getReceipt(subject,idempotencyKey){
  const r=await client.send(new GetCommand({TableName:tableName,
   Key:key(subject,'IDEMP#'+idempotencyKey),ConsistentRead:true}));
  return r.Item?{fingerprint:r.Item.fingerprint,response:r.Item.response}:null;
 }
 async function commit({target,expectedVersion,next,audit,outbox,idempotencyKey,fingerprint,response}){
  if(next.version!==expectedVersion+1)throw Error('INVALID_VERSION');
  const items=[
   {Update:{TableName:tableName,Key:key(target,'STATE'),
    UpdateExpression:'SET #v = :newVersion, #s = :newState',
    ConditionExpression:'#v = :oldVersion',
    ExpressionAttributeNames:{'#v':'version','#s':'state'},
    ExpressionAttributeValues:{':oldVersion':expectedVersion,
     ':newVersion':next.version,':newState':next}}},
   {Put:{TableName:tableName,Item:{...key(target,'AUDIT#'+String(audit.at).padStart(13,'0')+'#'+audit.eventId),
    ...audit},ConditionExpression:'attribute_not_exists(pk)'}},
   {Put:{TableName:tableName,Item:{...key(target,'OUTBOX#'+outbox.eventId),
    ...outbox,deliveryState:'pending',attempts:0},
    ConditionExpression:'attribute_not_exists(pk)'}},
   {Put:{TableName:tableName,Item:{...key(target,'IDEMP#'+idempotencyKey),
    fingerprint,response,createdAt:audit.at,ttl:Math.floor(audit.at/1000)+30*86400},
    ConditionExpression:'attribute_not_exists(pk)'}}
  ];
  try{
   await client.send(new TransactWriteCommand({TransactItems:items}));
  }catch(e){
   const reasons=e?.CancellationReasons||e?.cancellationReasons||[];
   if(e?.name==='TransactionCanceledException'&&
    reasons.some(r=>r.Code==='ConditionalCheckFailed')){
    throw Object.assign(new Error('VERSION_CONFLICT'),{code:'VERSION_CONFLICT'});
   }
   if(e?.name==='ConditionalCheckFailedException')
    throw Object.assign(new Error('VERSION_CONFLICT'),{code:'VERSION_CONFLICT'});
   throw e;
  }
 }
 return Object.freeze({provision,get,getReceipt,commit});
}
module.exports=Object.freeze({createDynamoAccountStore});
