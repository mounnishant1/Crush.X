'use strict';
// Authenticated Story API. Deploy ONLY behind TLS proxy + distributed rate limiting.
// This handler never accepts client-supplied ownerId or unsigned media URLs.
const STORY_PATH=/^\/v1\/stories\/([0-9a-f]{40})(?:\/(view|reaction|replies|insights))?$/;
function createStoryHttpHandler({service,verifyCredential,allowedOrigins=[],now=Date.now}={}){
 if(!service||!['publish','read','view','react','reply','remove','insights']
   .every(k=>typeof service[k]==='function')||
   typeof verifyCredential!=='function'||typeof now!=='function'||
   !Array.isArray(allowedOrigins)||allowedOrigins.some(s=>
    typeof s!=='string'||!/^https:\/\/[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(s)))
  throw TypeError('STORY_HTTP_TRUSTED_ADAPTERS_REQUIRED');
 const origins=new Set(allowedOrigins),rates=new Map();
 function respond(res,status,data){
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.writeHead(status,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
 }
 async function parseJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   throw Error('UNSUPPORTED_MEDIA_TYPE');
  const chunks=[];let n=0;
  for await(const chunk of req){
   n+=chunk.length;
   if(n>8192)throw Error('INVALID_BODY');
   chunks.push(chunk);
  }
  let value;
  try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Error('INVALID_BODY');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>8)
   throw Error('INVALID_BODY');
  return value;
 }
 return async function handle(req,res){
  try{
   const origin=req.headers.origin;
   if(origin&&!origins.has(origin))return respond(res,403,{error:'ORIGIN_DENIED'});
   if(origin){
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-methods','GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers','Authorization, Content-Type');
    res.setHeader('access-control-max-age','120');
   }
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!/^Bearer [A-Za-z0-9._-]{32,8192}$/.test(auth))
    return respond(res,401,{error:'AUTH_REQUIRED'});
   const credential=auth.slice(7);
   const verified=await verifyCredential(credential);
   if(verified?.verified!==true||typeof verified.subject!=='string'||
    !Number.isFinite(verified.expiresAt)||verified.expiresAt<=now())
    return respond(res,401,{error:'AUTH_REQUIRED'});
   const subject=verified.subject;
   const time=now();
   const previous=rates.get(subject);
   const rate=previous&&time-previous.at<60000?previous:{at:time,count:0};
   rate.count++;rates.set(subject,rate);
   if(rate.count>60)return respond(res,429,{error:'RATE_LIMITED'});
   const route=new URL(req.url,'http://internal.invalid');
   if(route.search)return respond(res,400,{error:'INVALID_REQUEST'});
   const path=route.pathname;
   if(req.method==='POST'&&path==='/v1/stories')
    return respond(res,201,await service.publish({subject,input:await parseJson(req)}));
   const match=STORY_PATH.exec(path);
   if(!match)return respond(res,404,{error:'NOT_FOUND'});
   const [,id,verb]=match;
   if(req.method==='GET'&&!verb)return respond(res,200,await service.read({subject,id}));
   if(req.method==='DELETE'&&!verb)return respond(res,200,await service.remove({subject,id}));
   if(req.method==='POST'&&verb==='view'){
    // Reject unexpected payloads. An empty body is allowed for an explicit view receipt.
    if(Number(req.headers['content-length']||0)>0)throw Error('INVALID_BODY');
    return respond(res,200,await service.view({subject,id}));
   }
   if(req.method==='PUT'&&verb==='reaction'){
    const body=await parseJson(req);
    if(Object.keys(body).length!==1||!Object.hasOwn(body,'emoji'))throw Error('INVALID_BODY');
    return respond(res,200,await service.react({subject,id,emoji:body.emoji}));
   }
   if(req.method==='POST'&&verb==='replies'){
    const body=await parseJson(req);
    if(Object.keys(body).length!==2||!Object.hasOwn(body,'requestId')||!Object.hasOwn(body,'text'))
     throw Error('INVALID_BODY');
    return respond(res,201,await service.reply({subject,id,...body}));
   }
   if(req.method==='GET'&&verb==='insights')return respond(res,200,await service.insights({subject,id}));
   return respond(res,405,{error:'METHOD_NOT_ALLOWED'});
  }catch(error){
   const code=String(error?.message||'');
   if(code==='UNSUPPORTED_MEDIA_TYPE')return respond(res,415,{error:'JSON_REQUIRED'});
   if(['INVALID_BODY','INVALID_STORY_REQUEST','INVALID_STORY_ID',
       'INVALID_REACTION','INVALID_REPLY','IDEMPOTENCY_CONFLICT'].includes(code))
    return respond(res,400,{error:'INVALID_REQUEST'});
   if(['ACCESS_DENIED','SELF_INTERACTION'].includes(code))
    return respond(res,403,{error:'ACCESS_DENIED'});
   if(code==='MEDIA_NOT_APPROVED')return respond(res,409,{error:'MEDIA_NOT_APPROVED'});
   if(code==='STORY_NOT_APPROVED')return respond(res,409,{error:'STORY_NOT_APPROVED'});
   if(['STORY_UNAVAILABLE','NOT_FOUND'].includes(code))
    return respond(res,404,{error:'NOT_FOUND'});
   return respond(res,503,{error:'SERVICE_UNAVAILABLE'});
  }
 };
}
module.exports=Object.freeze({createStoryHttpHandler});
