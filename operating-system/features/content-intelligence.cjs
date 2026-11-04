'use strict';
// Trusted-server AURA-X content tools. Only registered when ALL adapters exist.
// They return metadata and authorized excerpts, never run autonomous actions.
// No routes, user tracking, inference provider or persistence are installed here.
const core=require('../../content-intelligence.js');
const KIND=new Set(['reel','post','story']);
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const validQuery=a=>plain(a)&&Object.keys(a).length===1&&
 typeof a.question==='string'&&a.question.trim().length>=2&&a.question.length<=500;
const validRank=a=>plain(a)&&Object.keys(a).every(k=>['kind','limit'].includes(k))&&
 (a.kind===undefined||KIND.has(a.kind))&&
 (a.limit===undefined||(Number.isInteger(a.limit)&&a.limit>=1&&a.limit<=40));
function registerContentWorkflows({tasks,aura,adapters,now=Date.now}={}){
 if(!tasks||typeof tasks.registerAction!=='function'||!aura||typeof aura.registerTool!=='function'||typeof now!=='function')
  throw TypeError('CONTENT_WORKFLOW_DEPENDENCIES_REQUIRED');
 if(adapters===undefined)return Object.freeze({configured:[],reason:'TRUSTED_CONTENT_ADAPTERS_NOT_CONFIGURED'});
 const required=['checkConsent','loadAuthorizedContent','authorizeContent','readEngagementEvents','readExplicitInterests'];
 if(!plain(adapters)||required.some(k=>typeof adapters[k]!=='function'))
  throw TypeError('TRUSTED_CONTENT_ADAPTERS_REQUIRED');
 async function allowed(subject,scope) {
  if(typeof subject!=='string'||!subject)throw Error('CONTENT_IDENTITY_REQUIRED');
  const yes=await adapters.checkConsent({subject,scope});
  if(yes!==true)throw Error('CONTENT_CONSENT_REQUIRED');
 }
 async function visibleFor(subject,kind) {
  const items=await adapters.loadAuthorizedContent({subject,kind,limit:300});
  if(!Array.isArray(items)||items.length>300)throw Error('CONTENT_SOURCE_INVALID');
  const good=[],seen=new Set();
  for(const item of items){
   if(!plain(item)||seen.has(item.id)||!core.visible(item,{viewerId:subject,now:now()}))continue;
   if(kind && item.kind!==kind)continue;
   // A mandatory independent ACL check; a caller-controlled visibility flag
   // or a stale recommendation index must never be sufficient authorization.
   const permitted=await adapters.authorizeContent({subject,id:item.id,kind:item.kind});
   if(permitted!==true)continue;
   seen.add(item.id);good.push(item);
  }
  return good;
 }
 async function stillAllowed(subject,item){
  return core.visible(item,{viewerId:subject,now:now()})&&
   await adapters.authorizeContent({subject,id:item.id,kind:item.kind})===true;
 }
 tasks.registerAction({name:'content.rank',capability:'aura:use',maxAttempts:1,
  handler:async(payload,ctx)=>{
   await allowed(ctx.subject,'content:read');
   const personalization=await adapters.checkConsent({subject:ctx.subject,scope:'content:personalize'})===true;
   const items=await visibleFor(ctx.subject,payload.kind);
   let events=[],interests=[];
   if(personalization){
    events=await adapters.readEngagementEvents({subject:ctx.subject,limit:1000});
    interests=await adapters.readExplicitInterests({subject:ctx.subject});
    if(!Array.isArray(events)||events.length>1000||!Array.isArray(interests)||interests.length>30)
     throw Error('CONTENT_SIGNALS_INVALID');
   }
   const ranked=core.rankContent({viewerId:ctx.subject,items,events,explicitInterests:interests,
    consented:personalization,kind:payload.kind||null,limit:payload.limit||25,now:now()});
   const verified=[];
   for(const entry of ranked){
    if(await stillAllowed(ctx.subject,entry.item))
     verified.push({id:entry.item.id,kind:entry.item.kind,why:entry.why,score:entry.score});
   }
   await allowed(ctx.subject,'content:read');
   if(personalization)await allowed(ctx.subject,'content:personalize');
   return {items:verified,personalized:personalization,modelUsed:false,origin:'authorized_content',
    executed:false,published:false,sent:false};
  }
 });
 aura.registerTool({name:'content.feed.rank',action:'content.rank',risk:'low',validateArgs:validRank});
 tasks.registerAction({name:'content.find',capability:'aura:use',maxAttempts:1,
  handler:async(payload,ctx)=>{
   await allowed(ctx.subject,'content:read');
   await allowed(ctx.subject,'content:analyze');
   const items=await visibleFor(ctx.subject);
   const answer=core.answerQuestion({viewerId:ctx.subject,question:payload.question,
    items,analysisConsent:true,now:now(),limit:5});
   const byId=new Map(items.map(item=>[item.id,item]));
   const verified=[];
   for(const source of answer.sources){
    const item=byId.get(source.id);
    if(item&&await stillAllowed(ctx.subject,item))
     verified.push({id:source.id,kind:source.kind,excerpt:source.excerpt});
   }
   await allowed(ctx.subject,'content:read');
   await allowed(ctx.subject,'content:analyze');
   return {answer:verified.length?'Matching authorized content excerpts (not independent factual verification).':
     'No matching authorized content found.',sources:verified,modelUsed:false,
     executed:false,published:false,sent:false};
  }
 });
 aura.registerTool({name:'content.find',action:'content.find',risk:'low',validateArgs:validQuery});
 return Object.freeze({configured:Object.freeze(['content.feed.rank','content.find']),reason:'TRUSTED_ADAPTERS_CONFIGURED'});
}
module.exports=Object.freeze({registerContentWorkflows,validQuery,validRank});
