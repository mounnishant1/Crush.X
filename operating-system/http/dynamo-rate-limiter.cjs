'use strict';
// Atomic DynamoDB per-account rate guard. Requires PK table with TTL 'ttl'.
// Use at API edge in addition to WAF/per-IP throttles (never as their replacement).
const {createHmac}=require('node:crypto');
function createDynamoRateLimiter({client,tableName,UpdateCommand,secret,limit=60,
 windowMs=60000}={}){
 if(typeof client?.send!=='function'||typeof UpdateCommand!=='function'||
  typeof tableName!=='string'||!/^[A-Za-z0-9_.-]{3,255}$/.test(tableName)||
  !Buffer.isBuffer(secret)||secret.length!==32||
  !Number.isSafeInteger(limit)||limit<1||limit>1000||
  !Number.isSafeInteger(windowMs)||windowMs<1000||windowMs>3600000)
  throw TypeError('RATE_LIMITER_CONFIG_REQUIRED');
 async function allow({subject,now=Date.now(),bucket='aura'}={}){
  if(typeof subject!=='string'||!subject||subject.length>128||
   !/^[a-z]{2,32}$/.test(bucket)||!Number.isSafeInteger(now))
   throw Error('RATE_LIMIT_INPUT_INVALID');
  const window=Math.floor(now/windowMs);
  const digest=createHmac('sha256',secret)
   .update(JSON.stringify([subject,bucket,window])).digest('hex');
  try{
   await client.send(new UpdateCommand({
    TableName:tableName,Key:{PK:'AURA_RATE#'+digest},
    UpdateExpression:'SET #ttl = :ttl ADD #hits :one',
    ConditionExpression:'attribute_not_exists(#hits) OR #hits < :limit',
    ExpressionAttributeNames:{'#ttl':'ttl','#hits':'hits'},
    ExpressionAttributeValues:{':ttl':Math.ceil((window+2)*windowMs/1000),
     ':one':1,':limit':limit}
   }));
   return true;
  }catch(e){
   if(e?.name==='ConditionalCheckFailedException')return false;
   throw e;
  }
 }
 return Object.freeze({allow});
}
module.exports=Object.freeze({createDynamoRateLimiter});
