'use strict';
// Non-sensitive, coarse topic labels only. Never infer protected traits.
const TOPICS=Object.freeze(['art','beauty','books','cars','comedy','dance','diy','education','fashion',
 'film','food','gaming','music','nature','pets','photography','science','sports','technology','travel']);
const TOPIC_SET=new Set(TOPICS);
const ACTIONS=Object.freeze({view:0.2,complete:1.4,like:2,save:3,share:2.5,not_interested:-6,skip:-0.7});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(x);
const cleanTopics=x=>Array.isArray(x)&&x.length<=8&&
 x.every(t=>typeof t==='string'&&TOPIC_SET.has(t))?Array.from(new Set(x)) : null;
function scoreTopics(history,now){
 const sums=Object.create(null);
 for(const e of history){
  const age=Math.max(0,now-e.at)/(7*86400000);
  const weight=e.weight*Math.pow(0.5,age);
  for(const t of e.topics)sums[t]=(sums[t]||0)+weight;
 }
 return sums;
}
function createInterestEngine({checkConsent,now=Date.now,maxEvents=300}={}){
 if(typeof checkConsent!=='function'||typeof now!=='function'||!Number.isInteger(maxEvents)||
  maxEvents<10||maxEvents>2000)throw TypeError('INTEREST_CONFIG_REQUIRED');
 const history=new Map();
 async function record(subject,event){
  if(!validId(subject)||!event||!validId(event.contentId)||!
    Object.hasOwn(ACTIONS,event.action)||cleanTopics(event.topics)===null||
    !Number.isFinite(event.at)||Math.abs(event.at-now())>86400000)
   throw Error('INTEREST_EVENT_INVALID');
  if(await checkConsent(subject)!==true)throw Error('INTEREST_CONSENT_REQUIRED');
  const topics=cleanTopics(event.topics);
  const weight=ACTIONS[event.action];
  const items=history.get(subject)||[];
  items.push(Object.freeze({topics,weight,at:event.at,contentId:event.contentId}));
  history.set(subject,items.slice(-maxEvents));
  return {recorded:true,count:history.get(subject).length};
 }
 async function rank(subject,candidates,{blockedCreators=[],hiddenIds=[],limit=20}={}){
  if(!validId(subject)||!Array.isArray(candidates)||candidates.length>500||
    !Array.isArray(blockedCreators)||!Array.isArray(hiddenIds)||
    !Number.isInteger(limit)||limit<1||limit>50)throw Error('RANK_INPUT_INVALID');
  const consent=await checkConsent(subject)===true;
  const affinity=consent?scoreTopics(history.get(subject)||[],now()):Object.create(null);
  const blocked=new Set(blockedCreators.filter(validId)),hidden=new Set(hiddenIds.filter(validId));
  const seen=new Set(),scored=[];
  for(const c of candidates){
   if(!c||!validId(c.id)||!validId(c.creatorId)||seen.has(c.id)||
     blocked.has(c.creatorId)||hidden.has(c.id)||c.visible!==true)continue;
   const topics=cleanTopics(c.topics);
   if(topics===null||!Number.isFinite(c.createdAt)||c.createdAt>now()+60000||
     !Number.isFinite(c.quality)||c.quality<0||c.quality>1)continue;
   seen.add(c.id);
   const ageDays=Math.max(0,now()-c.createdAt)/86400000;
   const base=c.quality*2+2/(1+ageDays/3);
   const interests=consent?topics.reduce((a,t)=>a+Math.max(-6,Math.min(6,affinity[t]||0)),0):0;
   scored.push({id:c.id,creatorId:c.creatorId,score:base+interests,base,
     reason:consent&&interests>0.2?'recent_interests':'recent_content'});
  }
  const ordered=scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const result=[],perCreator=new Map();
  // Prevent one creator from dominating and add exploration from otherwise eligible items.
  while(result.length<limit&&ordered.length){
   const exploration=(result.length+1)%4===0;
   const eligible=ordered.filter(c=>(perCreator.get(c.creatorId)||0)<2);
   if(!eligible.length)break;
   const choice=exploration?[...eligible].sort((a,b)=>b.base-a.base||a.id.localeCompare(b.id))[0]:eligible[0];
   ordered.splice(ordered.indexOf(choice),1);
   perCreator.set(choice.creatorId,(perCreator.get(choice.creatorId)||0)+1);
   result.push(Object.freeze({contentId:choice.id,reason:exploration?'discover_more':choice.reason}));
  }
  return Object.freeze({personalized:consent&&history.has(subject),items:Object.freeze(result)});
 }
 function erase(subject){if(!validId(subject))throw Error('INVALID_SUBJECT');history.delete(subject);return {erased:true};}
 function count(subject){return validId(subject)?(history.get(subject)||[]).length:0;}
 return Object.freeze({record,rank,erase,count});
}
module.exports=Object.freeze({TOPICS,ACTIONS,createInterestEngine});