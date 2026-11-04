'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createDynamoRateLimiter}=require('../http/dynamo-rate-limiter.cjs');
class UpdateCommand{constructor(input){this.input=input;}}
test('shared atomic rate limits, anonymized account keys, distinct windows',async()=>{
 const rows=new Map();
 const client={send:async ({input})=>{
  const id=input.Key.PK,n=rows.get(id)||0;
  if(n>=input.ExpressionAttributeValues[':limit']){
   const e=Error('limit');e.name='ConditionalCheckFailedException';throw e;
  }
  rows.set(id,n+1);return {};
 }};
 const options={client,tableName:'CrushX-AIRate',UpdateCommand,secret:randomBytes(32),limit:2};
 const a=createDynamoRateLimiter(options),b=createDynamoRateLimiter(options);
 const now=1900000000000;
 assert.equal(await a.allow({subject:'alice',now}),true);
 assert.equal(await b.allow({subject:'alice',now}),true);
 assert.equal(await a.allow({subject:'alice',now}),false);
 assert.equal(await b.allow({subject:'bob',now}),true);
 assert.equal(await a.allow({subject:'alice',now:now+60000}),true);
 assert.ok([...rows.keys()].every(k=>!k.includes('alice')));
});
test('Dynamo outage denies rather than bypassing the limiter',async()=>{
 const client={send:async()=>{throw Error('AWS_UNAVAILABLE')}};
 const limiter=createDynamoRateLimiter({client,tableName:'CrushX-AIRate',
  UpdateCommand,secret:randomBytes(32)});
 await assert.rejects(limiter.allow({subject:'alice',now:1900000000000}),/AWS_UNAVAILABLE/);
});
test('invalid config is denied',()=>assert.throws(
 ()=>createDynamoRateLimiter({}),/RATE_LIMITER_CONFIG_REQUIRED/));
