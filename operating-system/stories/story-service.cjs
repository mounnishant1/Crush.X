'use strict';
// Story domain service: persistent adapter is mandatory; never trusts client owner/audience relations.
// Requires a verified uploaded-media receipt plus server-owned moderation decision before publication.
// Replies live in the Story inbox; they are NOT claimed as delivered DMs or notifications.
const {createHash}=require('node:crypto');

const VALID_ID=/^[a-f0-9]{40}$/;
const REQUEST_ID=/^[A-Za-z0-9_-]{8,80}$/;
const MEDIA_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{4,160}$/;
const SUBJECT=/^[A-Za-z0-9._:@-]{2,160}$/;
const AUDIENCES=new Set(['public','followers','close_friends']);
const REACTIONS=new Set(['❤️','😂','🔥','😍','👏','😮','😢']);
const MAX_LIFETIME_MS=24*60*60*1000;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const validKeys=(v,allowed,required)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>own(v,k));
const assertSubject=s=>{if(typeof s!=='string'||!SUBJECT.test(s))throw Error('INVALID_IDENTITY');};
const assertStoryId=id=>{if(typeof id!=='string'||!VALID_ID.test(id))throw Error('INVALID_STORY_ID');};
const storyId=(subject,key)=>createHash('sha256').update('crushx-story-v1\0'+subject+'\0'+key).digest('hex').slice(0,40);
const replyId=(story,subject,key)=>createHash('sha256').update('crushx-reply-v1\0'+story+'\0'+subject+'\0'+key).digest('hex').slice(0,40);

function createStoryService({store,verifyMedia,relationship,verifyRelated,verifyMentions,reviewText,now=Date.now}={}){
 if(!store||!['get','create','recordView','recordReaction','recordReply','softDelete','countByType']
   .every(k=>typeof store[k]==='function')||typeof verifyMedia!=='function'||
   typeof relationship!=='function'||typeof verifyRelated!=='function'||
   typeof verifyMentions!=='function'||typeof reviewText!=='function'||
   typeof now!=='function')
  throw TypeError('STORY_TRUSTED_ADAPTERS_REQUIRED');

 async function visible(story,subject){
  if(!story||story.deletedAt||story.expiresAt<=now())throw Error('STORY_UNAVAILABLE');
  if(story.ownerId===subject)return story;
  // The relationship adapter MUST query live server state including reciprocal blocks,
  // restricted accounts, private profiles, follower edge and close-friends membership.
  const gate=await relationship({ownerId:story.ownerId,viewerId:subject});
  if(!gate||gate.checked!==true||gate.blocked!==false||gate.accountAllowed!==true)
   throw Error('STORY_UNAVAILABLE');
  if(story.audience==='followers'&&gate.follows!==true||
     story.audience==='close_friends'&&gate.closeFriend!==true)
   throw Error('STORY_UNAVAILABLE');
  return story;
 }
 async function read({subject,id}){
  assertSubject(subject);assertStoryId(id);
  const story=await visible(await store.get(id),subject);
  return Object.freeze({id:story.id,ownerId:story.ownerId,mediaId:story.mediaId,
   mediaType:story.mediaType,caption:story.caption,mentions:[...story.mentions],
   createdAt:story.createdAt,expiresAt:story.expiresAt,related:story.related||null});
 }
 async function publish({subject,input}){
  assertSubject(subject);
  if(!validKeys(input,['requestId','mediaId','audience','caption','mentions','related'],
    ['requestId','mediaId','audience'])||
    typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId)||
    typeof input.mediaId!=='string'||!MEDIA_ID.test(input.mediaId)||
    !AUDIENCES.has(input.audience)||
    (own(input,'caption')&&(typeof input.caption!=='string'||input.caption.length>2200))||
    (own(input,'mentions')&&(!Array.isArray(input.mentions)||input.mentions.length>10||
      input.mentions.some(x=>typeof x!=='string'||!SUBJECT.test(x))||
      new Set(input.mentions).size!==input.mentions.length))||
    (own(input,'related')&&(
      !validKeys(input.related,['type','id'],['type','id'])||
      !['reel','post'].includes(input.related.type)||typeof input.related.id!=='string'||
      input.related.id.length>120||!MEDIA_ID.test(input.related.id))))
   throw Error('INVALID_STORY_REQUEST');
  // Sensitive cross-content links, mention permissions and caption moderation are
  // verified by protected server adapters. Never trust client-provided matches.
  if(input.related){
   const linked=await verifyRelated({ownerId:subject,type:input.related.type,id:input.related.id});
   if(linked?.allowed!==true)throw Error('STORY_NOT_APPROVED');
  }
  if(input.mentions?.length){
   const mentions=await verifyMentions({ownerId:subject,subjectIds:input.mentions});
   if(mentions?.allowed!==true)throw Error('STORY_NOT_APPROVED');
  }
  const reviewed=await reviewText({ownerId:subject,caption:input.caption||''});
  if(reviewed?.approved!==true)throw Error('STORY_NOT_APPROVED');
  const media=await verifyMedia({ownerId:subject,mediaId:input.mediaId});
  if(!media||media.ready!==true||media.ownerId!==subject||
     media.mediaId!==input.mediaId||!['image','video'].includes(media.kind)||
     media.moderationStatus!=='approved')
   throw Error('MEDIA_NOT_APPROVED');
  const createdAt=now();
  if(!Number.isSafeInteger(createdAt)||createdAt<0)throw Error('INVALID_SERVER_CLOCK');
  const record=Object.freeze({
   id:storyId(subject,input.requestId),ownerId:subject,requestId:input.requestId,
   mediaId:input.mediaId,mediaType:media.kind,audience:input.audience,
   caption:input.caption||'',mentions:input.mentions||[],related:input.related||null,
   createdAt,expiresAt:createdAt+MAX_LIFETIME_MS,deletedAt:null
  });
  const receipt=await store.create(record);
  if(!receipt||receipt.ownerId!==subject||receipt.id!==record.id||
     receipt.mediaId!==record.mediaId||receipt.audience!==record.audience||
     receipt.requestId!==record.requestId||receipt.expiresAt<=now())
    throw Error('STORY_WRITE_FAILED');
  return {id:receipt.id,createdAt:receipt.createdAt,expiresAt:receipt.expiresAt,
   published:true,deliveryConfirmed:false};
 }
 async function view({subject,id}){
  assertSubject(subject);assertStoryId(id);
  const story=await visible(await store.get(id),subject);
  if(story.ownerId===subject)return {recorded:false,reason:'OWN_STORY'};
  const recorded=await store.recordView({storyId:id,viewerId:subject,expiresAt:story.expiresAt});
  return {recorded:recorded===true,duplicate:recorded===false};
 }
 async function react({subject,id,emoji}){
  assertSubject(subject);assertStoryId(id);
  if(!REACTIONS.has(emoji))throw Error('INVALID_REACTION');
  const story=await visible(await store.get(id),subject);
  if(story.ownerId===subject)throw Error('SELF_INTERACTION');
  await store.recordReaction({storyId:id,viewerId:subject,emoji,expiresAt:story.expiresAt});
  return {saved:true,emoji,deliveredAsDM:false};
 }
 async function reply({subject,id,requestId,text}){
  assertSubject(subject);assertStoryId(id);
  if(!REQUEST_ID.test(requestId||'')||typeof text!=='string'||
    !text.trim()||text.length>1000)throw Error('INVALID_REPLY');
  const story=await visible(await store.get(id),subject);
  if(story.ownerId===subject)throw Error('SELF_INTERACTION');
  const idempotencyId=replyId(id,subject,requestId);
  const receipt=await store.recordReply({storyId:id,replyId:idempotencyId,
   viewerId:subject,text:text.trim(),createdAt:now(),expiresAt:story.expiresAt});
  if(!receipt||receipt.id!==idempotencyId||receipt.viewerId!==subject)
   throw Error('STORY_WRITE_FAILED');
  return {id:idempotencyId,saved:true,deliveredAsDM:false,notificationSent:false};
 }
 async function remove({subject,id}){
  assertSubject(subject);assertStoryId(id);
  const story=await store.get(id);
  if(!story||story.deletedAt||story.expiresAt<=now())throw Error('STORY_UNAVAILABLE');
  if(story.ownerId!==subject)throw Error('ACCESS_DENIED');
  const deleted=await store.softDelete({storyId:id,ownerId:subject,deletedAt:now()});
  if(deleted!==true)throw Error('STORY_WRITE_FAILED');
  return {deleted:true};
 }
 async function insights({subject,id}){
  assertSubject(subject);assertStoryId(id);
  const story=await store.get(id);
  if(!story||story.ownerId!==subject)throw Error('STORY_UNAVAILABLE');
  const counts=await Promise.all(['VIEW','REACTION','REPLY'].map(type=>store.countByType({storyId:id,type})));
  if(counts.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('INSIGHTS_UNAVAILABLE');
  return {views:counts[0],reactions:counts[1],replies:counts[2],expired:story.expiresAt<=now()};
 }
 return Object.freeze({publish,read,view,react,reply,remove,insights});
}
module.exports=Object.freeze({createStoryService,storyId,replyId});
