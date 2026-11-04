/* Crush.X Content Intelligence: deterministic, consent-gated local foundation.
 * Trusted server must filter authorized content before calling these functions.
 * No model inference, server ACL, network, private messages or sensitive profiling.
 */
(function(root,factory) {
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CrushXContentIntelligence=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const TOPICS=Object.freeze(['art','beauty','books','cars','comedy','cooking','dance','design','education','fashion','fitness','food','football','gaming','gardening','music','nature','pets','photography','science','sports','technology','travel','movies','animation','diy','business','history','languages','lifestyle']);
 const allowed=new Set(TOPICS);
 const actions=Object.freeze({view:.5,complete:1.5,rewatch:1.4,like:2,save:3,share:2,follow:2.5,skip:-1.8,not_interested:-6,hide:-8});
 const str=(s,n=2400)=>typeof s==='string'?s.slice(0,n):'';
 const id=s=>typeof s==='string'&&/^[\w.-]{1,96}$/.test(s)?s:'';
 const array=(x,n)=>Array.isArray(x)?x.slice(0,n):[];
 const tokens=s=>(str(s,8000).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(x=>x.length>1).slice(0,1200);
 const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:0;
 const round=x=>Math.round(x*1000)/1000;
 function topicsOf(item) {
  const v=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
  const raw=[...array(v.topics,40),...array(v.tags,40)].flatMap(x=>tokens(String(x).replace(/^#/,'')));
  const words=tokens([v.title,v.caption,v.transcript].map(x=>str(x)).join(' '));
  return [...new Set([...raw,...words].filter(x=>allowed.has(x)))].slice(0,15);
 }
 function visible(item,{viewerId,now=Date.now(),blockedCreators=[]}={}) {
  if(!item||typeof item!=='object'||Array.isArray(item))return false;
  const creator=id(item.creatorId||item.userId);
  if(!id(item.id)||!creator||!id(viewerId)||!['reel','post','story','video'].includes(item.kind))return false;
  if(item.status!=='published'||item.moderation!=='approved')return false;
  if(item.visibility!=='public'&&!(item.visibility==='self'&&creator===viewerId))return false;
  if(array(blockedCreators,500).includes(creator))return false;
  if(item.kind==='story'&&(!Number.isFinite(item.expiresAt)||item.expiresAt<=now))return false;
  if(Number.isFinite(item.expiresAt)&&item.expiresAt<=now)return false;
  return true;
 }
 function userProfile({viewerId,events=[],explicitInterests=[],consented=false}={}) {
  if(!id(viewerId)||consented!==true)return {enabled:false,weights:Object.freeze({})};
  const weights=Object.create(null);
  for(const interest of array(explicitInterests,30))if(typeof interest==='string'&&allowed.has(interest.toLowerCase()))weights[interest.toLowerCase()]=4;
  for(const event of array(events,1000)){
   if(!event||event.viewerId!==viewerId||!Object.hasOwn(actions,event.action))continue;
   const fraction=event.action==='view'?Math.max(0,Math.min(1,finite(event.watchFraction))):1;
   for(const topic of array(event.topics,15)){
    if(typeof topic!=='string'||!allowed.has(topic.toLowerCase()))continue;
    const key=topic.toLowerCase();
    weights[key]=Math.max(-12,Math.min(24,(weights[key]||0)+actions[event.action]*fraction));
   }
  }
  return {enabled:true,weights:Object.freeze({...weights})};
 }
 function rankContent({viewerId,items=[],events=[],explicitInterests=[],consented=false,
   blockedCreators=[],mutedCreators=[],followedCreators=[],now=Date.now(),kind=null,limit=50}={}) {
  if(!id(viewerId)||!Number.isFinite(now))return [];
  const profile=userProfile({viewerId,events,explicitInterests,consented});
  const excluded=new Set();
  if(consented===true)for(const event of array(events,1000))
   if(event?.viewerId===viewerId&&['hide','not_interested'].includes(event.action)&&id(event.contentId))excluded.add(event.contentId);
  const seen=new Set(),sorted=[];
  for(const item of array(items,1500)){
   if(!visible(item,{viewerId,now,blockedCreators})||seen.has(item.id)||excluded.has(item.id))continue;
   if(kind!==null&&item.kind!==kind)continue;
   const creator=item.creatorId||item.userId;
   if(array(mutedCreators,500).includes(creator))continue;
   seen.add(item.id);
   const topics=topicsOf(item),ageDays=Number.isFinite(item.publishedAt)?Math.max(0,(now-item.publishedAt)/86400000):30;
   const freshness=1.4/(1+ageDays/7);
   const affinity=profile.enabled?topics.reduce((s,t)=>s+Math.max(-5,Math.min(8,profile.weights[t]||0)),0):0;
   const following=array(followedCreators,500).includes(creator)?0.8:0;
   const skips=profile.enabled&&array(events,1000).some(e=>e?.viewerId===viewerId&&e?.action==='skip'&&e?.creatorId===creator)?0.75:0;
   const why=profile.enabled&&affinity>0?'Matches your selected or engaged topics: '+topics.filter(t=>(profile.weights[t]||0)>0).join(', '):
     following?'From a creator you follow':'Recent eligible content';
   sorted.push({item,score:round(freshness+affinity+following-skips),why,topics});
  }
  sorted.sort((a,b)=>b.score-a.score||String(a.item.id).localeCompare(String(b.item.id)));
  const cap=Math.max(0,Math.min(100,Number.isInteger(limit)?limit:50));
  if(!cap)return [];
  const output=[],held=[],counts=new Map();
  for(const result of sorted){
   const creator=result.item.creatorId||result.item.userId;
   if((counts.get(creator)||0)>=2){held.push(result);continue;}
   counts.set(creator,(counts.get(creator)||0)+1);output.push(result);
   if(output.length>=cap)break;
  }
  if(output.length<cap)output.push(...held.slice(0,cap-output.length));
  return output.slice(0,cap);
 }
 const stopwords=new Set(['the','and','are','was','were','this','that','what','which','about','from','with','have','how','does','in','my','a','is','of','to','for','on','me','tell','show','find','where','कौन','क्या','कैसे','की','का','में','पर','और','मुझे']);
 function answerQuestion({viewerId,question,items=[],now=Date.now(),analysisConsent=false,blockedCreators=[],limit=4}={}){
  if(analysisConsent!==true||!id(viewerId))return {ok:false,answer:'Content analysis permission is required.',sources:[],modelUsed:false};
  const query=[...new Set(tokens(str(question,500).trim()).filter(w=>!stopwords.has(w)))].slice(0,20);
  if(!query.length)return {ok:false,answer:'Please ask a specific question about a Reel, Post or Story.',sources:[],modelUsed:false};
  const candidates=[];
  for(const item of array(items,1500)){
   if(!visible(item,{viewerId,now,blockedCreators}))continue;
   const text=[item.title,item.caption,item.transcript].map(x=>str(x)).filter(Boolean).join('. ');
   if(!text)continue;
   const words=new Set(tokens(text+' '+topicsOf(item).join(' ')));
   const matches=query.filter(w=>words.has(w));
   if(!matches.length)continue;
   const parts=text.split(/(?<=[.!?।])\s+|\n+/u).map(s=>s.trim()).filter(Boolean);
   const excerpt=(parts.find(s=>matches.some(w=>tokens(s).includes(w)))||text).slice(0,200);
   candidates.push({id:item.id,kind:item.kind,creatorId:item.creatorId||item.userId,excerpt,
    matchCount:matches.length,score:round(matches.length/query.length)});
  }
  candidates.sort((a,b)=>b.score-a.score||b.matchCount-a.matchCount||a.id.localeCompare(b.id));
  const sources=candidates.slice(0,Math.max(1,Math.min(8,Number.isInteger(limit)?limit:4)));
  return {ok:true,answer:sources.length?'Found '+sources.length+' relevant sample content item(s). Excerpts are user content, not independently verified facts.':
    'No matching authorized content was found in the provided Feed, Reels or Stories.',sources,modelUsed:false};
 }
 function createSession({viewerId,now=Date.now}={}){
  if(!id(viewerId)||typeof now!=='function')throw new TypeError('VALID_ACCOUNT_REQUIRED');
  let consented=false,events=[],interests=[];
  return Object.freeze({
   setConsent(approved){if(approved!==true){consented=false;events=[];interests=[];return false;}consented=true;return true;},
   setInterests(values){if(!consented)return false;interests=array(values,30).filter(v=>typeof v==='string'&&allowed.has(v.toLowerCase())).map(v=>v.toLowerCase());return true;},
   record(action,item,{watchFraction=0}={}){
    if(!consented||!Object.hasOwn(actions,action)||!visible(item,{viewerId,now:now()}))return false;
    events.push({viewerId,action,contentId:item.id,creatorId:item.creatorId||item.userId,topics:topicsOf(item),
      watchFraction:Math.max(0,Math.min(1,finite(watchFraction)))});
    if(events.length>1000)events.shift();return true;
   },
   rank(items,options={}){return rankContent({...options,viewerId,items,events,consented,explicitInterests:interests,now:now()});},
   ask(question,items,options={}){return answerQuestion({...options,viewerId,question,items,analysisConsent:consented,now:now()});},
   reset(){events=[];interests=[];return true;},
   status(){return {consented,signalCount:events.length,interests:[...interests]};}
  });
 }
 return Object.freeze({TOPICS,topicsOf,visible,userProfile,rankContent,answerQuestion,createSession});
});