'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStoryService}=require('../stories/story-service.cjs');
const {createStoryHttpHandler}=require('../http/story-handler.cjs');
const {createServer}=require('node:http');

function fixture(){
 let clock=1_790_000_000_000;
 const stories=new Map(),views=new Map(),reactions=new Map(),replies=new Map();
 const metrics=(map,id)=>[...map.keys()].filter(k=>k.startsWith(id+'|')).length;
 const store={
  async get(id){return stories.get(id)||null;},
  async create(item){
   const old=stories.get(item.id);
   if(old){
    if(old.requestId!==item.requestId||old.mediaId!==item.mediaId||old.audience!==item.audience||
     old.caption!==item.caption)throw Error('IDEMPOTENCY_CONFLICT');
    return old;
   }
   stories.set(item.id,{...item});return item;
  },
  async recordView({storyId,viewerId}){
   const key=storyId+'|'+viewerId;
   if(views.has(key))return false;
   views.set(key,true);return true;
  },
  async recordReaction({storyId,viewerId,emoji}){
   reactions.set(storyId+'|'+viewerId,emoji);return true;
  },
  async recordReply({storyId,replyId,viewerId,text}){
   const key=storyId+'|'+replyId,old=replies.get(key);
   if(old){
    if(old.text!==text)throw Error('IDEMPOTENCY_CONFLICT');
    return old;
   }
   const item={id:replyId,viewerId,text};replies.set(key,item);return item;
  },
  async softDelete({storyId,ownerId,deletedAt}){
   const value=stories.get(storyId);
   if(!value||value.ownerId!==ownerId)return false;
   value.deletedAt=deletedAt;return true;
  },
  async countByType({storyId,type}){
   return metrics({VIEW:views,REACTION:reactions,REPLY:replies}[type],storyId);
  }
 };
 const relationship=async({viewerId})=>({
  checked:true,blocked:viewerId==='blocked',accountAllowed:viewerId!=='suspended',
  follows:['bob','close'].includes(viewerId),closeFriend:viewerId==='close'
 });
 const verifyMedia=async({ownerId,mediaId})=>({
  ready:mediaId!=='pending',ownerId,mediaId,kind:'video',moderationStatus:mediaId==='unsafe'?'rejected':'approved'
 });
 const service=createStoryService({store,relationship,verifyMedia,now:()=>clock});
 const publish=(audience='public',extra={})=>service.publish({subject:'alice',input:{
  mediaId:'asset-123',requestId:'unique-request-001',audience,...extra
 }});
 return {service,publish,store,setClock(value){clock=value;},now:()=>clock};
}
test('Story publish requires trusted media approval and idempotent owner',async()=>{
 const {service,publish}=fixture();
 const first=await publish('public',{caption:'hello',mentions:['bob'],related:{type:'reel',id:'reel-42'}});
 assert.equal(first.published,true);
 assert.equal(first.deliveryConfirmed,false);
 assert.equal(first.expiresAt-first.createdAt,24*60*60*1000);
 assert.deepEqual(await publish('public',{caption:'hello',mentions:['bob'],related:{type:'reel',id:'reel-42'}}),first);
 await assert.rejects(publish('followers',{caption:'hello'}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(service.publish({subject:'alice',input:{mediaId:'unsafe',requestId:'unique-request-123',audience:'public'}}),/MEDIA_NOT_APPROVED/);
 await assert.rejects(service.publish({subject:'alice',input:{mediaId:'pending',requestId:'unique-request-123',audience:'public'}}),/MEDIA_NOT_APPROVED/);
 await assert.rejects(service.publish({subject:'alice',input:{mediaId:'asset-123',requestId:'unique-request-123',audience:'bogus'}}),/INVALID_STORY_REQUEST/);
 await assert.rejects(service.publish({subject:'alice',input:{mediaId:'asset-123',requestId:'unique-request-123',audience:'public',ownerId:'bob'}}),/INVALID_STORY_REQUEST/);
});
test('Audience, blocks, expiry, deletion and owner insights always checked',async()=>{
 const {service,publish,setClock,now}=fixture();
 let {id}=await publish('close_friends');
 await assert.rejects(service.read({subject:'bob',id}),/STORY_UNAVAILABLE/);
 await assert.rejects(service.view({subject:'blocked',id}),/STORY_UNAVAILABLE/);
 await assert.rejects(service.react({subject:'suspended',id,emoji:'❤️'}),/STORY_UNAVAILABLE/);
 assert.equal((await service.read({subject:'close',id})).ownerId,'alice');
 assert.deepEqual(await service.view({subject:'alice',id}),{recorded:false,reason:'OWN_STORY'});
 assert.equal((await service.view({subject:'close',id})).recorded,true);
 assert.equal((await service.view({subject:'close',id})).duplicate,true);
 assert.equal((await service.react({subject:'close',id,emoji:'🔥'})).saved,true);
 await assert.rejects(service.react({subject:'close',id,emoji:'<script>'}),/INVALID_REACTION/);
 const rep=await service.reply({subject:'close',id,requestId:'reply-unique-001',text:'Hello!'});
 assert.equal(rep.deliveredAsDM,false);
 assert.deepEqual(await service.reply({subject:'close',id,requestId:'reply-unique-001',text:'Hello!'}),rep);
 await assert.rejects(service.reply({subject:'close',id,requestId:'reply-unique-001',text:'Different'}),/IDEMPOTENCY_CONFLICT/);
 assert.deepEqual(await service.insights({subject:'alice',id}),{views:1,reactions:1,replies:1,expired:false});
 await assert.rejects(service.insights({subject:'close',id}),/STORY_UNAVAILABLE/);
 await assert.rejects(service.remove({subject:'close',id}),/ACCESS_DENIED/);
 assert.equal((await service.remove({subject:'alice',id})).deleted,true);
 await assert.rejects(service.read({subject:'close',id}),/STORY_UNAVAILABLE/);
 let other=await service.publish({subject:'alice',input:{requestId:'next-story-001',mediaId:'asset-123',audience:'public'}});
 setClock(now()+24*60*60*1000+1);
 await assert.rejects(service.read({subject:'bob',id:other.id}),/STORY_UNAVAILABLE/);
});
test('Authenticated Story HTTP routes reject bad identity, origins and spoofed owner',async()=>{
 const f=fixture();
 const verifyCredential=async token=>({verified:token==='a'.repeat(40)||token==='b'.repeat(40),
  subject:token==='a'.repeat(40)?'alice':'bob',expiresAt:f.now()+60000});
 const handler=createStoryHttpHandler({
  service:f.service,verifyCredential,allowedOrigins:['https://crushx.in'],now:f.now
 });
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const a={authorization:'Bearer '+'a'.repeat(40),origin:'https://crushx.in',
  'content-type':'application/json'};
 const b={...a,authorization:'Bearer '+'b'.repeat(40)};
 const send=async(url,method='GET',headers=a,body)=>fetch(base+url,{method,headers,
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await send('/v1/stories','POST',{},{})).status,401);
  assert.equal((await send('/v1/stories','POST',{...a,origin:'https://evil.example'},{})).status,403);
  assert.equal((await send('/v1/stories','POST',a,{ownerId:'bob',mediaId:'asset-123',requestId:'newrequest-01',audience:'public'})).status,400);
  const response=await send('/v1/stories','POST',a,{requestId:'newrequest-01',mediaId:'asset-123',audience:'followers'});
  assert.equal(response.status,201);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const {id}=await response.json();
  assert.match(id,/^[0-9a-f]{40}$/);
  assert.equal((await send('/v1/stories/'+id,'GET',b)).status,200);
  assert.equal((await send('/v1/stories/'+id+'/view','POST',b)).status,200);
  assert.equal((await send('/v1/stories/'+id+'/reaction','PUT',b,{emoji:'❤️'})).status,200);
  assert.equal((await send('/v1/stories/'+id+'/replies','POST',b,{requestId:'reply-0001',text:'Hey!'})).status,201);
  assert.equal((await send('/v1/stories/'+id+'/insights','GET',b)).status,404);
  assert.deepEqual(await (await send('/v1/stories/'+id+'/insights')).json(),
   {views:1,reactions:1,replies:1,expired:false});
  assert.equal((await send('/v1/stories/'+id,'DELETE',b)).status,403);
  assert.equal((await send('/v1/stories/'+id,'DELETE',a)).status,200);
  assert.equal((await send('/v1/stories/'+id,'GET',b)).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
