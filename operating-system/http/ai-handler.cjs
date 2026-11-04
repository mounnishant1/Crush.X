'use strict';
// Authenticated, allowlisted AURA-X API. No server auto-start or model tools.
// Host MUST supply HTTPS reverse proxy, Cognito verifier, durable job workers,
// distributed rate-limits and audited consent persistence for production.
const {MODULES}=require('../features/ai-workflows.cjs');
const allowed=new Set(MODULES);
const validKey=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
const validUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function createAIHttpHandler({system,verifyCredential,allowedOrigins=[],now=Date.now}={}){
 if(!system?.aura?.invoke||!system?.tasks?.inspect||!system?.tasks?.cancel||
  typeof verifyCredential!=='function'||typeof now!=='function'||
  !Array.isArray(allowedOrigins)||allowedOrigins.some(x=>typeof x!=='string'||
   !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{2,5})?$/.test(x)))
  throw TypeError('AI_HTTP_TRUSTED_ADAPTERS_REQUIRED');
 const origins=new Set(allowedOrigins),rates=new Map();
 function respond(res,status,data){
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.writeHead(status,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
 }
 async function json(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   throw Error('UNSUPPORTED_MEDIA_TYPE');
  let size=0,parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('INVALID_BODY');
   parts.push(chunk);}
  let v;
  try{v=JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch{throw Error('INVALID_BODY');}
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>8)
   throw Error('INVALID_BODY');
  return v;
 }
 function exact(v,keys,required){
  return Object.keys(v).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(v,k));
 }
 return async function handle(req,res){
  try{
   const origin=req.headers.origin;
   if(origin&&!origins.has(origin))return respond(res,403,{error:'ORIGIN_DENIED'});
   if(origin){
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-methods','GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers','Authorization, Content-Type');
   }
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]{32,8192}$/.test(auth))
    return respond(res,401,{error:'AUTH_REQUIRED'});
   const credential=auth.slice(7);
   const verified=await verifyCredential(credential);
   if(verified?.verified!==true||typeof verified.subject!=='string'||!verified.subject||
    !Number.isFinite(verified.expiresAt)||verified.expiresAt<=now())
    return respond(res,401,{error:'AUTH_REQUIRED'});
   const subject=verified.subject;
   const time=now(),prior=rates.get(subject);
   const current=prior&&time-prior.at<60000?prior:{at:time,count:0};
   current.count++;rates.set(subject,current);
   if(current.count>60)return respond(res,429,{error:'RATE_LIMITED'});
   const pathname=new URL(req.url,'http://internal.invalid').pathname;
   const route=new URL(req.url,'http://internal.invalid');
   if(pathname==='/v1/aura/consent'&&['POST','GET','DELETE'].includes(req.method)){
    if(!system.consents)return respond(res,503,{error:'CONSENT_NOT_CONFIGURED'});
    const input=req.method==='POST'?await json(req):{scope:route.searchParams.get('scope')};
    if(!exact(input,req.method==='POST'?['scope','ttlMs']:['scope'],['scope'])||
      typeof input.scope!=='string'||!system.consents.scopes.includes(input.scope))
     return respond(res,400,{error:'INVALID_REQUEST'});
    const args={credential,subject,scope:input.scope};
    if(req.method==='POST'){
     if(input.ttlMs!==undefined)args.ttlMs=input.ttlMs;
     return respond(res,200,await system.consents.grant(args));
    }
    if(req.method==='GET')return respond(res,200,await system.consents.status(args));
    return respond(res,200,await system.consents.revoke(args));
   }
   if(req.method==='POST'&&pathname==='/v1/aura/guide'){
    const data=await json(req);
    if(!exact(data,['workflow','prompt','context','requestId'],['workflow','prompt','requestId'])||
     !allowed.has(data.workflow)||!validKey(data.requestId)||
     typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>1000||
     (data.context!==undefined&&(typeof data.context!=='string'||data.context.length>1000)))
     return respond(res,400,{error:'INVALID_REQUEST'});
    const args={prompt:data.prompt};if(data.context!==undefined)args.context=data.context;
    const receipt=await system.aura.invoke({
     credential,toolName:'ai.'+data.workflow+'.guide',
     args,resourceOwner:subject,idempotencyKey:data.requestId
    });
    return respond(res,202,receipt);
   }
   if(req.method==='POST'&&['/v1/aura/content-find','/v1/aura/content-rank'].includes(pathname)){
    const data=await json(req),find=pathname.endsWith('find');
    if(!validKey(data.requestId))return respond(res,400,{error:'INVALID_REQUEST'});
    const args={...data};delete args.requestId;
    if(!exact(data,find?['question','requestId']:['kind','limit','requestId'],
      find?['question','requestId']:['requestId']))
     return respond(res,400,{error:'INVALID_REQUEST'});
    // The registered content workflows own validation and ACL checks.
    const receipt=await system.aura.invoke({
     credential,toolName:find?'content.find':'content.feed.rank',
     args,resourceOwner:subject,idempotencyKey:data.requestId
    });
    return respond(res,202,receipt);
   }
   const match=/^\/v1\/aura\/jobs\/([0-9a-f-]{36})(\/cancel)?$/i.exec(pathname);
   if(match&&validUuid(match[1])){
    const options={credential,jobId:match[1]};
    if(req.method==='GET'&&!match[2])return respond(res,200,await system.tasks.inspect(options));
    if(req.method==='POST'&&match[2])return respond(res,200,await system.tasks.cancel(options));
   }
   return respond(res,404,{error:'NOT_FOUND'});
  }catch(e){
   const code=String(e?.message||'');
   if(code==='UNSUPPORTED_MEDIA_TYPE')return respond(res,415,{error:'JSON_REQUIRED'});
   if(['INVALID_BODY','INVALID_CONSENT_TTL','INVALID_TOOL_ARGUMENTS','INVALID_PAYLOAD',
       'IDEMPOTENCY_KEY_REQUIRED','IDEMPOTENCY_CONFLICT'].includes(code))
    return respond(res,400,{error:'INVALID_REQUEST'});
   if(['ACCESS_DENIED','GRANT_INVALID','GRANT_REVOKED'].includes(code))
    return respond(res,403,{error:'ACCESS_DENIED'});
   if(['JOB_NOT_FOUND','UNKNOWN_TOOL'].includes(code))
    return respond(res,404,{error:'NOT_FOUND'});
   return respond(res,503,{error:'SERVICE_UNAVAILABLE'});
  }
 };
}
module.exports=Object.freeze({createAIHttpHandler});