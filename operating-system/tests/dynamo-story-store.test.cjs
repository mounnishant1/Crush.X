'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDynamoStoryStore}=require('../stories/dynamo-story-store.cjs');
test('Dynamo adapter conditionally persists one Story plus atomic view/reaction/reply records',async()=>{
 let time=1000;
 const items=new Map(),commands={};
 for(const type of ['GetCommand','PutCommand','UpdateCommand','QueryCommand','TransactWriteCommand']){
  commands[type]=class {constructor(input){this.type=type;this.input=input;}};
 }
 const key=x=>x.PK+'|'+x.SK;
 const clash=()=>{const e=new Error('conditional');e.name='ConditionalCheckFailedException';throw e;};
 const transactionError=()=>{const e=new Error('transaction');e.name='TransactionCanceledException';throw e;};
 const client={async send(command){
  const input=command.input;
  if(command.type==='GetCommand')return {Item:items.get(key(input.Key))};
  if(command.type==='PutCommand'){
   if(input.ConditionExpression&&items.has(key(input.Item)))clash();
   items.set(key(input.Item),{...input.Item});return {};
  }
  if(command.type==='TransactWriteCommand'){
   const check=input.TransactItems[0].ConditionCheck;
   const meta=items.get(key(check.Key));
   if(!meta||meta.deletedAt||meta.expiresAt!==check.ExpressionAttributeValues[':ex']||
    meta.expiresAt<=time)transactionError();
   const put=input.TransactItems[1].Put;
   if(put.ConditionExpression&&items.has(key(put.Item)))transactionError();
   items.set(key(put.Item),{...put.Item});return {};
  }
  if(command.type==='UpdateCommand'){
   const meta=items.get(key(input.Key));
   if(!meta||meta.deletedAt||meta.ownerId!==input.ExpressionAttributeValues[':owner']||
    meta.expiresAt<=time)clash();
   meta.deletedAt=input.ExpressionAttributeValues[':deleted'];
   return {Attributes:{deletedAt:meta.deletedAt}};
  }
  if(command.type==='QueryCommand'){
   const prefix=input.ExpressionAttributeValues[':sk'];
   const count=[...items.values()].filter(v=>
    v.PK===input.ExpressionAttributeValues[':pk']&&v.SK.startsWith(prefix)).length;
   return {Count:count};
  }
  throw Error('Unexpected '+command.type);
 }};
 const store=createDynamoStoryStore({client,commands,tableName:'CrushXStoryTest',now:()=>time});
 const id='a'.repeat(40),record={id,ownerId:'alice',requestId:'request-01',
  mediaId:'asset-123',mediaType:'image',audience:'followers',caption:'hello',
  mentions:[],related:null,createdAt:time,expiresAt:100000};
 assert.equal((await store.create(record)).ownerId,'alice');
 assert.equal((await store.create(record)).requestId,'request-01');
 await assert.rejects(store.create({...record,audience:'public'}),/IDEMPOTENCY_CONFLICT/);
 assert.equal((await store.get(id)).expiresAt,100000);
 assert.equal(await store.recordView({storyId:id,viewerId:'bob',expiresAt:record.expiresAt}),true);
 assert.equal(await store.recordView({storyId:id,viewerId:'bob',expiresAt:record.expiresAt}),false);
 assert.equal(await store.countByType({storyId:id,type:'VIEW'}),1);
 assert.equal(await store.recordReaction({storyId:id,viewerId:'bob',emoji:'❤️',expiresAt:record.expiresAt}),true);
 assert.equal(await store.recordReaction({storyId:id,viewerId:'bob',emoji:'🔥',expiresAt:record.expiresAt}),true);
 assert.equal(await store.countByType({storyId:id,type:'REACTION'}),1);
 const reply={storyId:id,replyId:'b'.repeat(40),viewerId:'bob',text:'hello',createdAt:time,expiresAt:record.expiresAt};
 assert.equal((await store.recordReply(reply)).text,'hello');
 assert.equal((await store.recordReply(reply)).text,'hello');
 await assert.rejects(store.recordReply({...reply,text:'changed'}),/IDEMPOTENCY_CONFLICT/);
 assert.equal(await store.countByType({storyId:id,type:'REPLY'}),1);
 assert.equal(await store.softDelete({storyId:id,ownerId:'alice',deletedAt:time+1}),true);
 await assert.rejects(store.recordReaction({storyId:id,viewerId:'new',emoji:'❤️',expiresAt:record.expiresAt}),/STORY_UNAVAILABLE/);
 await assert.rejects(store.softDelete({storyId:id,ownerId:'bob',deletedAt:time+2}),/STORY_UNAVAILABLE/);
});
