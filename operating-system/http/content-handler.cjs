'use strict';
// Authenticated AURA-X content HTTP contract; NO listener or cloud deployment.
// Produces queued jobs; a trusted worker must runNext(). Never accepts raw
// client engagement/watch events or account IDs in request bodies.
const {randomUUID}=require('node:crypto');
const requestId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
const isRecord=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(x,keys)=>isRecord(x)&&Object.keys(x).every(k=>keys.includes(k));
function createContentHttpHandler({system,verifyCredential,checkActiveAccount,
 contentStore,allowedOrigins,consumeRateLimit,now=Date.now}={}){
 if(typeof system?.aura?.invoke!=='function'||typeof system?.tasks?.inspect!=='function'||
    typeof system?.audit?.record!=='function'||typeof verifyCredential!=='function'||
    typeof checkActiveAccount!=='function'||typeof contentStore?.getPreferences!=='function'||
    typeof contentStore?.setPreferences!=='function'||typeof contentStore?.eraseHistory!=='function'||
    typeof consumeRateLimit!=='function'||typeof now!=='function'||
    !Array.isArray(allowedOrigins)||!allowedOrigins.length||
    allowedOrigins.some(x=>typeof x!=='string'||!/^https:\/\/[^/]+$/.test(x)))
  throw TypeError('CONTENT_HTTP_TRUSTED_ADAPTERS_REQUIRED');
 const origins=new Set(allowedOrigins);
 function send(res,status,data) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'x-frame-options':'DENY'});
  res.end(JSON.stringify(data));
 }
 async function readJson(req) {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
   throw Error('JSON_REQUIRED');
  if(Number(req.headers['content-length'])>4096)throw Error('BODY_TOO_LARGE');
  let bytes=0,buffer='';
  for await(const chunk of req) {
   bytes+=chunk.length;
   if(bytes>4096)throw Error('BODY_TOO_LARGE');
   buffer+=chunk.toString('utf8');
  }
  let input;
  try{input=JSON.parse(buffer);}catch{throw Error('INVALID_JSON');}
  if(!isRecord(input))throw Error('INVALID_JSON');
  return input;
 }
 return async function contentHandler(req,res){
  try {
   const origin=req.headers.origin;
   if(origin&&!origins.has(origin))return send(res,403,{error:'ORIGIN_DENIED'});
   if(origin){
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('access-control-allow-methods','GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers','Authorization,Content-Type');
    res.setHeader('vary','Origin');
   }
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const authorization=req.headers.authorization;
   if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9._-]{32,8192}$/.test(authorization))
    return send(res,401,{error:'AUTH_REQUIRED'});
   const credential=authorization.slice(7);
   const identity=await verifyCredential(credential);
   if(identity?.verified!==true||typeof identity.subject!=='string'||!identity.subject||
      !Number.isFinite(identity.expiresAt)||identity.expiresAt<=now())
    return send(res,401,{error:'AUTH_REQUIRED'});
   const subject=identity.subject;
   if(await checkActiveAccount(subject)!==true)return send(res,403,{error:'ACCESS_DENIED'});
   const url=new URL(req.url,'http://content.internal');
   if(!url.pathname.startsWith('/v1/content/'))return send(res,404,{error:'NOT_FOUND'});
   if(await consumeRateLimit({subject,method:req.method,path:url.pathname})!==true)
    return send(res,429,{error:'RATE_LIMITED'});
   if(req.method==='GET'&&url.pathname==='/v1/content/privacy') {
    return send(res,200,await contentStore.getPreferences({subject}));
   }
   if(req.method==='PUT'&&url.pathname==='/v1/content/privacy') {
    const body=await readJson(req);
    if(!exact(body,['read','analyze','personalize','topics'])||
      !['read','analyze','personalize'].every(k=>typeof body[k]==='boolean')||
      (body.topics!==undefined&&!Array.isArray(body.topics))||
      (body.topics?.length||0)>30)
     return send(res,400,{error:'INVALID_REQUEST'});
    await system.audit.record({event:'content.preferences.requested',subject,capability:'aura:use'});
    const result=await contentStore.setPreferences({subject,read:body.read,analyze:body.analyze,
     personalize:body.personalize,topics:body.topics||[]});
    return send(res,200,result);
   }
   if(req.method==='DELETE'&&url.pathname==='/v1/content/history') {
    await system.audit.record({event:'content.history.reset',subject,capability:'aura:use'});
    return send(res,200,await contentStore.eraseHistory({subject}));
   }
   if(req.method==='POST'&&url.pathname==='/v1/content/feed/rank') {
    const body=await readJson(req);
    if(!exact(body,['requestId','kind','limit'])||!requestId(body.requestId)||
       (body.kind!==undefined&&!['reel','post','story'].includes(body.kind))||
       (body.limit!==undefined&&(!Number.isInteger(body.limit)||body.limit<1||body.limit>40)))
     return send(res,400,{error:'INVALID_REQUEST'});
    const args={};
    if(body.kind!==undefined)args.kind=body.kind;
    if(body.limit!==undefined)args.limit=body.limit;
    return send(res,202,await system.aura.invoke({credential,toolName:'content.feed.rank',
     args,resourceOwner:subject,idempotencyKey:body.requestId}));
   }
   if(req.method==='POST'&&url.pathname==='/v1/content/questions') {
    const body=await readJson(req);
    if(!exact(body,['requestId','question'])||!requestId(body.requestId)||
       typeof body.question!=='string'||body.question.trim().length<2||body.question.length>500)
     return send(res,400,{error:'INVALID_REQUEST'});
    return send(res,202,await system.aura.invoke({credential,toolName:'content.find',
     args:{question:body.question},resourceOwner:subject,idempotencyKey:body.requestId}));
   }
   const match=/^\/v1\/content\/jobs\/([0-9a-f-]{36})$/i.exec(url.pathname);
   if(req.method==='GET'&&match)
    return send(res,200,await system.tasks.inspect({credential,jobId:match[1]}));
   return send(res,404,{error:'NOT_FOUND'});
  }catch(error){
   const code=String(error?.message||'');
   if(['JSON_REQUIRED'].includes(code))return send(res,415,{error:'JSON_REQUIRED'});
   if(['INVALID_JSON','BODY_TOO_LARGE','PREFERENCES_INVALID','TOPICS_INVALID',
      'INVALID_PAYLOAD','INVALID_TOOL_ARGUMENTS','INVALID_REQUEST',
      'CONTENT_KIND_INVALID'].includes(code))
    return send(res,400,{error:'INVALID_REQUEST'});
   if(['ACCESS_DENIED','GRANT_INVALID','GRANT_REVOKED','CONTENT_CONSENT_REQUIRED'].includes(code))
    return send(res,403,{error:'ACCESS_DENIED'});
   if(['JOB_NOT_FOUND','UNKNOWN_TOOL'].includes(code))
    return send(res,404,{error:'NOT_FOUND'});
   if(['IDEMPOTENCY_CONFLICT'].includes(code))
    return send(res,409,{error:'IDEMPOTENCY_CONFLICT'});
   // Internal errors and DB failures remain private; no user data in logs.
   return send(res,503,{error:'SERVICE_UNAVAILABLE'});
  }
 };
}
module.exports=Object.freeze({createContentHttpHandler});
