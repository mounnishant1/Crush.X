'use strict';
// PostgreSQL storage for trusted AURA-X content workflows. Migration required.
// Account-scoped parameterized queries; no direct client-side DB or event API.
const {TOPICS}=require('../../content-intelligence.js');
const SAFE=new Set(TOPICS);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(x);
const scopes=Object.freeze({'content:read':'read','content:analyze':'analyze','content:personalize':'personalize'});
const actions=new Set(['view','complete','rewatch','like','save','share','follow','skip','not_interested','hide']);
const kinds=new Set(['reel','post','story','video']);
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const checkSubject=x=>{if(!id(x))throw Error('SUBJECT_INVALID');return x;};
function cap(v,min,max,label) {
 if(!Number.isInteger(v)||v<min||v>max)throw Error(label+'_INVALID');return v;
}
function cleanTopics(value) {
 if(!Array.isArray(value)||value.length>30||value.some(t=>typeof t!=='string'||!SAFE.has(t)))
  throw Error('TOPICS_INVALID');
 return [...new Set(value)];
}
const EVENT_ELIGIBLE="c.status='published' AND c.moderation='approved' AND "+
 "(c.visibility='public' OR (c.visibility='self' AND c.creator_subject=$1)) "+
 "AND (c.expires_at IS NULL OR c.expires_at>NOW()) "+
 "AND NOT EXISTS(SELECT 1 FROM cx_content_blocks b WHERE b.subject=$1 AND b.blocked_creator=c.creator_subject)";
const ELIGIBLE=EVENT_ELIGIBLE+
 " AND NOT EXISTS(SELECT 1 FROM cx_content_hides h WHERE h.subject=$1 AND h.content_id=c.content_id)";
const PROJECT="c.content_id,c.creator_subject,c.kind,c.status,c.moderation,c.visibility,"+
 "c.title,c.caption,c.transcript,c.topics,"+
 "EXTRACT(EPOCH FROM c.published_at)*1000 AS published_ms,"+
 "EXTRACT(EPOCH FROM c.expires_at)*1000 AS expires_ms";
function toItem(row){
 return {id:row.content_id,creatorId:row.creator_subject,kind:row.kind,
  status:row.status,moderation:row.moderation,visibility:row.visibility,
  title:row.title,caption:row.caption,transcript:row.transcript,
  topics:Array.isArray(row.topics)?row.topics:[],
  publishedAt:row.published_ms==null?null:Number(row.published_ms),
  expiresAt:row.expires_ms==null?null:Number(row.expires_ms)};
}
function createPostgresContentStore({pool,verifyTrustedEvent,now=Date.now}={}){
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function'||
   typeof verifyTrustedEvent!=='function'||typeof now!=='function')
  throw TypeError('CONTENT_STORAGE_ADAPTERS_REQUIRED');
 async function transaction(work){
  const client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function')
   throw Error('DB_CLIENT_UNAVAILABLE');
  try{
   await client.query('BEGIN');
   const result=await work(client);
   await client.query('COMMIT');
   return result;
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
  finally{client.release();}
 }
 async function getPreferences({subject}={}){
  checkSubject(subject);
  const result=await pool.query(
   'SELECT can_read,can_analyze,can_personalize,topics FROM cx_content_preferences WHERE subject=$1',[subject]);
  const row=result.rows?.[0];
  return Object.freeze({read:row?.can_read===true,analyze:row?.can_analyze===true,
   personalize:row?.can_personalize===true,
   topics:Array.isArray(row?.topics)?row.topics.filter(t=>SAFE.has(t)):[]});
 }
 async function checkConsent({subject,scope}={}){
  checkSubject(subject);
  if(!Object.hasOwn(scopes,scope))return false;
  const p=await getPreferences({subject});
  return p[scopes[scope]]===true;
 }
 async function setPreferences({subject,read,analyze,personalize,topics=[]}={}){
  checkSubject(subject);
  if([read,analyze,personalize].some(x=>typeof x!=='boolean')||
   (!read&&(analyze||personalize))||(!personalize&&Array.isArray(topics)&&topics.length!==0))
   throw Error('PREFERENCES_INVALID');
  const interests=cleanTopics(topics);
  return transaction(async client=>{
   await client.query('INSERT INTO cx_content_preferences '+
    '(subject,can_read,can_analyze,can_personalize,topics,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) '+
    'ON CONFLICT (subject) DO UPDATE SET can_read=EXCLUDED.can_read,'+
    'can_analyze=EXCLUDED.can_analyze,can_personalize=EXCLUDED.can_personalize,'+
    'topics=EXCLUDED.topics,updated_at=NOW()', [subject,read,analyze,personalize,interests]);
   if(!personalize)await client.query('DELETE FROM cx_content_events WHERE subject=$1',[subject]);
   if(!read)await client.query('DELETE FROM cx_content_hides WHERE subject=$1',[subject]);
   return Object.freeze({read,analyze,personalize,topics:interests});
  });
 }
 async function eraseHistory({subject}={}){
  checkSubject(subject);
  return transaction(async client=>{
   await client.query('DELETE FROM cx_content_events WHERE subject=$1',[subject]);
   await client.query('DELETE FROM cx_content_hides WHERE subject=$1',[subject]);
   await client.query("UPDATE cx_content_preferences SET topics='{}'::TEXT[],updated_at=NOW() WHERE subject=$1",[subject]);
   return Object.freeze({erased:true});
  });
 }
 async function loadAuthorizedContent({subject,kind,limit=300}={}){
  checkSubject(subject);
  if(kind!==undefined&&kind!==null&&!kinds.has(kind))throw Error('CONTENT_KIND_INVALID');
  cap(limit,1,300,'CONTENT_LIMIT');
  const result=await pool.query('SELECT '+PROJECT+' FROM cx_content_catalog c '+
   'JOIN cx_content_preferences p ON p.subject=$1 AND p.can_read=TRUE '+
   'WHERE '+ELIGIBLE+' AND ($2::text IS NULL OR c.kind=$2) '+
   'ORDER BY c.published_at DESC NULLS LAST,c.content_id LIMIT $3',
   [subject,kind||null,limit]);
  return (result.rows||[]).map(toItem);
 }
 async function authorizeContent({subject,id:contentId,kind}={}){
  checkSubject(subject);
  if(!id(contentId)||!kinds.has(kind))return false;
  const result=await pool.query('SELECT 1 FROM cx_content_catalog c '+
   'JOIN cx_content_preferences p ON p.subject=$1 AND p.can_read=TRUE '+
   'WHERE '+ELIGIBLE+' AND c.content_id=$2 AND c.kind=$3 LIMIT 1',
   [subject,contentId,kind]);
  return (result.rows||[]).length===1;
 }
 async function readEngagementEvents({subject,limit=1000}={}){
  checkSubject(subject);cap(limit,1,1000,'EVENT_LIMIT');
  const result=await pool.query('SELECT e.action,e.content_id,e.creator_subject,e.topics,e.watch_fraction,'+
   'EXTRACT(EPOCH FROM e.occurred_at)*1000 AS at_ms FROM cx_content_events e '+
   'JOIN cx_content_catalog c ON c.content_id=e.content_id '+
   'JOIN cx_content_preferences p ON p.subject=$1 AND p.can_read AND p.can_personalize '+
   'WHERE e.subject=$1 AND '+EVENT_ELIGIBLE+
   ' ORDER BY e.occurred_at DESC,e.event_id LIMIT $2',[subject,limit]);
  return (result.rows||[]).map(row=>({viewerId:subject,action:row.action,contentId:row.content_id,
   creatorId:row.creator_subject,topics:Array.isArray(row.topics)?row.topics.filter(t=>SAFE.has(t)):[],
   watchFraction:Number(row.watch_fraction)||0,at:Number(row.at_ms)||0}));
 }
 async function readExplicitInterests({subject}={}){
  const pref=await getPreferences({subject});
  return pref.read&&pref.personalize?pref.topics:[];
 }
 // Not publicly routed. Caller must provide a trusted independent proof.
 // Topics and creator are read from approved server catalog, NOT event payload.
 async function recordTrustedEvent({subject,event}={}){
  checkSubject(subject);
  if(!plain(event)||Object.keys(event).some(k=>!['eventId','contentId','action','at','watchFraction'].includes(k))||
    !id(event.eventId)||event.eventId.length<8||!id(event.contentId)||
    !actions.has(event.action)||!Number.isFinite(event.at)||Math.abs(event.at-now())>300000||
    (event.watchFraction!==undefined&&(!Number.isFinite(event.watchFraction)||
     event.watchFraction<0||event.watchFraction>1)))
   throw Error('ENGAGEMENT_EVENT_INVALID');
  if(await verifyTrustedEvent({subject,event})!==true)throw Error('TRUSTED_EVENT_PROOF_REQUIRED');
  return transaction(async client=>{
   const prefs=await client.query('SELECT can_read,can_personalize FROM cx_content_preferences WHERE subject=$1 FOR UPDATE',[subject]);
   if(prefs.rows?.[0]?.can_read!==true||prefs.rows?.[0]?.can_personalize!==true)
    throw Error('PERSONALIZATION_CONSENT_REQUIRED');
   const prior=await client.query(
    'SELECT content_id,action FROM cx_content_events WHERE subject=$1 AND event_id=$2',
    [subject,event.eventId]);
   if(prior.rows?.[0]){
    if(prior.rows[0].content_id!==event.contentId||prior.rows[0].action!==event.action)
     throw Error('ENGAGEMENT_EVENT_CONFLICT');
    return Object.freeze({recorded:false,duplicate:true});
   }
   const media=await client.query('SELECT c.content_id,c.creator_subject,c.topics,c.kind FROM cx_content_catalog c '+
    'WHERE '+ELIGIBLE+' AND c.content_id=$2 LIMIT 1',[subject,event.contentId]);
   const source=media.rows?.[0];
   if(!source||!kinds.has(source.kind))throw Error('CONTENT_ACCESS_DENIED');
   const interests=Array.isArray(source.topics)?source.topics.filter(t=>SAFE.has(t)).slice(0,15):[];
   const result=await client.query('INSERT INTO cx_content_events '+
    '(subject,event_id,content_id,creator_subject,action,topics,watch_fraction,occurred_at) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(subject,event_id) DO NOTHING RETURNING event_id',
    [subject,event.eventId,event.contentId,source.creator_subject,event.action,interests,
     event.action==='view'?(event.watchFraction||0):0,new Date(event.at)]);
   const recorded=(result.rows||[]).length===1;
   if(recorded&&['hide','not_interested'].includes(event.action))
    await client.query('INSERT INTO cx_content_hides(subject,content_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
     [subject,event.contentId]);
   return Object.freeze({recorded,duplicate:!recorded});
  });
 }
 // Operator-only deletion; FK cascade removes all event and hide references.
 async function deleteContent({contentId}={}){
  if(!id(contentId))throw Error('CONTENT_ID_INVALID');
  return transaction(async client=>{
   const result=await client.query('DELETE FROM cx_content_catalog WHERE content_id=$1 RETURNING content_id',[contentId]);
   return Object.freeze({deleted:(result.rows||[]).length===1});
  });
 }
 return Object.freeze({getPreferences,checkConsent,setPreferences,eraseHistory,loadAuthorizedContent,
  authorizeContent,readEngagementEvents,readExplicitInterests,recordTrustedEvent,deleteContent});
}
module.exports=Object.freeze({createPostgresContentStore});
