'use strict';
// AWS SDK v3 DocumentClient adapter, injected by trusted server.
// Table: PK (String), SK (String), TTL attribute "ttl" (epoch seconds).
// TransactWriteCommand performs the expiry/deletion check at interaction commit.
// Restrict IAM access and encrypt stored Story replies; never expose table directly.
function createDynamoStoryStore({client,tableName,commands,now=Date.now}={}){
 const required=['GetCommand','PutCommand','UpdateCommand','QueryCommand','TransactWriteCommand'];
 if(!client||typeof client.send!=='function'||!commands||
  required.some(k=>typeof commands[k]!=='function')||
  typeof tableName!=='string'||!/^[-A-Za-z0-9_.]{3,255}$/.test(tableName)||
  typeof now!=='function')throw TypeError('DYNAMO_STORY_CONFIG_REQUIRED');
 const pk=storyId=>'STORY#'+storyId;
 const storyKey=id=>({PK:pk(id),SK:'META'});
 const stateCheck=(storyId,expiresAt)=>({
  TableName:tableName,Key:storyKey(storyId),
  ConditionExpression:'attribute_exists(PK) AND attribute_not_exists(deletedAt) AND expiresAt = :ex AND expiresAt > :now',
  ExpressionAttributeValues:{':ex':expiresAt,':now':now()}
 });
 const code=e=>e?.name||e?.code||'';
 const conditional=e=>['ConditionalCheckFailedException','TransactionCanceledException'].includes(code(e));
 const get=async id=>{
  const data=await client.send(new commands.GetCommand({
   TableName:tableName,Key:storyKey(id),ConsistentRead:true
  }));
  return data.Item||null;
 };
 async function create(story){
  const item={...story,PK:pk(story.id),SK:'META',ttl:Math.ceil(story.expiresAt/1000)};
  if(item.deletedAt===null)delete item.deletedAt;
  try{
   await client.send(new commands.PutCommand({
    TableName:tableName,Item:item,
    ConditionExpression:'attribute_not_exists(PK)'
   }));
   return story;
  }catch(e){
   if(!conditional(e))throw e;
   const existing=await get(story.id);
   if(existing&&existing.ownerId===story.ownerId&&existing.requestId===story.requestId&&
    existing.mediaId===story.mediaId&&existing.audience===story.audience&&
    existing.caption===story.caption&&JSON.stringify(existing.mentions)===JSON.stringify(story.mentions)&&
    JSON.stringify(existing.related||null)===JSON.stringify(story.related||null)&&
    !existing.deletedAt)
    return existing;
   throw Error('IDEMPOTENCY_CONFLICT');
  }
 }
 async function transactCheckAndPut(storyId,expiresAt,item,condition){
  await client.send(new commands.TransactWriteCommand({TransactItems:[
   {ConditionCheck:stateCheck(storyId,expiresAt)},
   {Put:{TableName:tableName,Item:item,...condition}}
  ]}));
 }
 async function recordView({storyId,viewerId,expiresAt}){
  const key={PK:pk(storyId),SK:'VIEW#'+viewerId};
  const item={...key,viewerId,ttl:Math.ceil(expiresAt/1000)};
  try{
   await transactCheckAndPut(storyId,expiresAt,item,
    {ConditionExpression:'attribute_not_exists(PK)'});
   return true;
  }catch(e){
   if(!conditional(e))throw e;
   const old=await client.send(new commands.GetCommand({
    TableName:tableName,Key:key,ConsistentRead:true
   }));
   if(old.Item?.viewerId===viewerId)return false;
   throw Error('STORY_UNAVAILABLE');
  }
 }
 async function recordReaction({storyId,viewerId,emoji,expiresAt}){
  const item={PK:pk(storyId),SK:'REACTION#'+viewerId,
   viewerId,emoji,ttl:Math.ceil(expiresAt/1000)};
  try{
   await transactCheckAndPut(storyId,expiresAt,item,{});
   return true;
  }catch(e){if(conditional(e))throw Error('STORY_UNAVAILABLE');throw e;}
 }
 async function recordReply({storyId,replyId,viewerId,text,createdAt,expiresAt}){
  const key={PK:pk(storyId),SK:'REPLY#'+replyId};
  const item={...key,id:replyId,viewerId,text,createdAt,ttl:Math.ceil(expiresAt/1000)};
  try{
   await transactCheckAndPut(storyId,expiresAt,item,
    {ConditionExpression:'attribute_not_exists(PK)'});
   return item;
  }catch(e){
   if(!conditional(e))throw e;
   const old=await client.send(new commands.GetCommand({
    TableName:tableName,Key:key,ConsistentRead:true
   }));
   if(old.Item?.viewerId===viewerId&&old.Item?.id===replyId&&old.Item?.text===text)
    return old.Item;
   if(old.Item)throw Error('IDEMPOTENCY_CONFLICT');
   throw Error('STORY_UNAVAILABLE');
  }
 }
 async function softDelete({storyId,ownerId,deletedAt}){
  try{
   const result=await client.send(new commands.UpdateCommand({
    TableName:tableName,Key:storyKey(storyId),
    UpdateExpression:'SET deletedAt=:deleted',
    ConditionExpression:'ownerId=:owner AND attribute_not_exists(deletedAt) AND expiresAt > :now',
    ExpressionAttributeValues:{':owner':ownerId,':deleted':deletedAt,':now':now()},
    ReturnValues:'UPDATED_NEW'
   }));
   return Boolean(result.Attributes);
  }catch(e){if(conditional(e))throw Error('STORY_UNAVAILABLE');throw e;}
 }
 async function countByType({storyId,type}){
  if(!['VIEW','REACTION','REPLY'].includes(type))throw Error('INVALID_METRIC');
  let total=0,cursor;
  do {
   const response=await client.send(new commands.QueryCommand({
    TableName:tableName,KeyConditionExpression:'PK=:pk AND begins_with(SK,:sk)',
    ExpressionAttributeValues:{':pk':pk(storyId),':sk':type+'#'},
    Select:'COUNT',ExclusiveStartKey:cursor
   }));
   if(!Number.isSafeInteger(response.Count)||response.Count<0)
    throw Error('INVALID_METRIC_RESULT');
   total+=response.Count;
   cursor=response.LastEvaluatedKey;
  }while(cursor&&total<=1000000);
  if(cursor)throw Error('INSIGHTS_CAP_EXCEEDED');
  return total;
 }
 return Object.freeze({get,create,recordView,recordReaction,recordReply,softDelete,countByType});
}
module.exports=Object.freeze({createDynamoStoryStore});
