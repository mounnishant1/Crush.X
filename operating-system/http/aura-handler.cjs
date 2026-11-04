'use strict';
// HTTP integration contract: authenticated POST guidance, GET receipt, cancel.
// Use only behind TLS reverse proxy; authenticated worker executes queued jobs.
const {MODULES,OWNER_MODULES}=require('../features/ai-workflows.cjs');
const ALLOWED=new Set([...MODULES,...OWNER_MODULES]);
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
function createAuraHttpHandler({system,verifyCredential,allowedOrigins=[],now=Date.now}={}){
 if(!system?.aura?.invoke||!system?.tasks?.inspect||!system?.tasks?.cancel||
  typeof verifyCredential!=='function'||!Array.isArray(allowedOrigins)||
  allowedOrigins.some(x=>typeof x!=='string'||!/^https:\/\//.test(x))||
  typeof now!=='function')throw TypeError('AURA_HTTP_CONFIG_REQUIRED');
 const origins=new Set(allowedOrigins),hits=new Map();
 const send=(res,code,data)=>{
  res.writeHead(code,{'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store','x-content-type-options':'nosniff',
   'referrer-policy':'no-referrer'});
  res.end(JSON.stringify(data));
 };
 async function readJson(req){
  let input='',bytes=0;
  for await(const chunk of req){
   bytes+=chunk.length;if(bytes>8192)throw Error('BODY_TOO_LARGE');
   input+=chunk.toString('utf8');
  }
  let result;
  try{result=JSON.parse(input)}catch{throw Error('INVALID_JSON');}
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('INVALID_JSON');
  return result;
 }
 return async function handler(req,res){
  try{
   const origin=req.headers.origin;
   if(origin&&!origins.has(origin))return send(res,403,{error:'ORIGIN_DENIED'});
   if(origin){
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-methods','GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers','Authorization, Content-Type');
   }
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]{32,8192}$/.test(auth))
    return send(res,401,{error:'AUTH_REQUIRED'});
   const credential=auth.slice(7);
   const identity=await verifyCredential(credential);
   if(!identity?.verified||!identity.subject||identity.expiresAt<=now())
    return send(res,401,{error:'AUTH_REQUIRED'});
   const subject=identity.subject;
   // A single-process abuse limit; a production gateway needs distributed limits.
   const window=hits.get(subject)||{start:now(),count:0};
   if(now()-window.start>=60000){window.start=now();window.count=0;}
   if(++window.count>60)return send(res,429,{error:'RATE_LIMITED'});
   hits.set(subject,window);
   const url=new URL(req.url,'http://backend.internal');
   if(req.method==='POST'&&url.pathname==='/v1/aura/guide'){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(res,415,{error:'JSON_REQUIRED'});
    const input=await readJson(req);
    if(Object.keys(input).some(k=>!['workflow','prompt','context','requestId'].includes(k))||
     typeof input.workflow!=='string'||!ALLOWED.has(input.workflow)||
     typeof input.requestId!=='string'||!/^[-\w]{8,128}$/.test(input.requestId)||
     typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>1000||
     (input.context!==undefined&&(typeof input.context!=='string'||input.context.length>1000)))
     return send(res,400,{error:'INVALID_REQUEST'});
    const args={prompt:input.prompt};
    if(input.context!==undefined)args.context=input.context;
    const job=await system.aura.invoke({credential,toolName:'ai.'+input.workflow+'.guide',
     args,resourceOwner:input.workflow==='owner'?undefined:subject,idempotencyKey:input.requestId});
    return send(res,202,job);
   }
   // Client telemetry cannot directly invent watch events: a trusted
   // backend collector must validate and submit interest signals.
   if(req.method==='GET'&&/^\/v1\/feed\/(home|reels|explore|stories|posts)$/.test(url.pathname)){
    if(!system.feed)return send(res,503,{error:'SERVICE_UNAVAILABLE'});
    const feed=url.pathname.split('/')[3];
    const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):20;
    if(!Number.isInteger(limit)||limit<1||limit>50)return send(res,400,{error:'INVALID_REQUEST'});
    return send(res,200,await system.feed.recommend({credential,subject,feed,limit}));
   }
   if(req.method==='DELETE'&&url.pathname==='/v1/feed/history'){
    if(!system.feed)return send(res,503,{error:'SERVICE_UNAVAILABLE'});
    return send(res,200,await system.feed.erase({credential,subject}));
   }
   if(req.method==='POST'&&url.pathname==='/v1/media/analyze'){
    if(!system.media)return send(res,503,{error:'SERVICE_UNAVAILABLE'});
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
     return send(res,415,{error:'JSON_REQUIRED'});
    const input=await readJson(req);
    if(Object.keys(input).length!==1||typeof input.mediaId!=='string')
     return send(res,400,{error:'INVALID_REQUEST'});
    return send(res,200,await system.media.analyze({credential,subject,mediaId:input.mediaId}));
   }
   const match=/^\/v1\/aura\/jobs\/([0-9a-f-]{36})(\/cancel)?$/i.exec(url.pathname);
   if(match&&uuid.test(match[1])){
    const opts={credential,jobId:match[1]};
    if(req.method==='GET'&&!match[2])return send(res,200,await system.tasks.inspect(opts));
    if(req.method==='POST'&&match[2])return send(res,200,await system.tasks.cancel(opts));
   }
   return send(res,404,{error:'NOT_FOUND'});
  }catch(error){
   const code=String(error?.message||'');
   if(['BODY_TOO_LARGE','INVALID_JSON','INVALID_TOOL_ARGUMENTS','INVALID_PAYLOAD',
     'IDEMPOTENCY_KEY_REQUIRED','IDEMPOTENCY_CONFLICT'].includes(code))
    return send(res,400,{error:'INVALID_REQUEST'});
   if(['ACCESS_DENIED','GRANT_INVALID','GRANT_REVOKED','MEDIA_CONSENT_REQUIRED','INTEREST_CONSENT_REQUIRED'].includes(code))
    return send(res,403,{error:'ACCESS_DENIED'});
   if(code==='JOB_NOT_FOUND'||code==='UNKNOWN_TOOL'||code==='MEDIA_NOT_OWNED_OR_READY')
    return send(res,404,{error:'NOT_FOUND'});
   return send(res,503,{error:'SERVICE_UNAVAILABLE'});
  }
 };
}
module.exports=Object.freeze({createAuraHttpHandler});