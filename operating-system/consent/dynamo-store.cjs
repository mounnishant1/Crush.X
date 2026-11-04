'use strict';
// Adapter for a provisioned DynamoDB table with partition key PK, sort key SK
// and TTL attribute ttl (seconds). AWS SDK v3 client/commands supplied by host.
function createDynamoConsentStore({client,tableName,commands}={}){
 if(typeof client?.send!=='function'||!commands||
   !['GetCommand','PutCommand','DeleteCommand'].every(k=>typeof commands[k]==='function')||
   typeof tableName!=='string'||!/^[-A-Za-z0-9_.]{3,255}$/.test(tableName))
  throw TypeError('DYNAMO_CONSENT_CONFIG_REQUIRED');
 const key=({subject,scope})=>{
  if(typeof subject!=='string'||!subject||typeof scope!=='string'||!scope)
   throw Error('INVALID_STORE_KEY');
  return {PK:'USER#'+subject,SK:'AURA-CONSENT#'+scope};
 };
 const get=async({subject,scope})=>{
  const result=await client.send(new commands.GetCommand({
   TableName:tableName,Key:key({subject,scope}),ConsistentRead:true
  }));
  const v=result?.Item;
  return v?.subject===subject&&v.scope===scope&&Number.isFinite(v.expiresAt)?
   {subject:v.subject,scope:v.scope,expiresAt:v.expiresAt}:null;
 };
 const put=async({subject,scope,expiresAt})=>{
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=0)throw Error('INVALID_EXPIRY');
  await client.send(new commands.PutCommand({
   TableName:tableName,Item:{...key({subject,scope}),subject,scope,expiresAt,
    ttl:Math.ceil(expiresAt/1000)}
  }));
  return true;
 };
 const del=async({subject,scope})=>{
  await client.send(new commands.DeleteCommand({TableName:tableName,
    Key:key({subject,scope})}));return true;
 };
 return Object.freeze({get,put,delete:del});
}
module.exports=Object.freeze({createDynamoConsentStore});