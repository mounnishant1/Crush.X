'use strict';
// AWS HTTP API v2 Lambda handler factory; credentials and step-up evidence are server-derived.
// This file does not deploy routes or change Cognito settings.
const {AccountError}=require('./account-service.cjs');
const {createAccountAccessGuard}=require('./account-guard.cjs');
const ID=/^[A-Za-z0-9._:@-]{2,160}$/;
function createAccountLambdaHandler({service,verifyCredential,getSecurityContext,rateLimit,allowedOrigins=[]}={}){
 if(!service||typeof verifyCredential!=='function'||typeof getSecurityContext!=='function'||
 typeof rateLimit!=='function'||!Array.isArray(allowedOrigins))
  throw TypeError('ACCOUNT_HTTP_ADAPTERS_REQUIRED');
 const methods='GET,POST,OPTIONS',allowHeaders='authorization,content-type,idempotency-key';
 const accessGuard=createAccountAccessGuard({verifyCredential,accountService:service});
 const respond=(status,data,origin)=>({
  statusCode:status,headers:{'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store','x-content-type-options':'nosniff',
   ...(origin&&allowedOrigins.includes(origin)?{'access-control-allow-origin':origin,
    'vary':'Origin','access-control-allow-methods':methods,
    'access-control-allow-headers':allowHeaders}:{} )},
  body:status===204?'':JSON.stringify(data)
 });
 async function handle(event){
  const hdr={};
  for(const [key,value] of Object.entries(event?.headers||{}))
   hdr[key.toLowerCase()]=String(value);
  const origin=hdr.origin||null;
  const response=(status,data)=>respond(status,data,origin);
  if(origin&&!allowedOrigins.includes(origin))return response(403,{error:'ORIGIN_FORBIDDEN'});
  const method=event?.requestContext?.http?.method||event?.httpMethod||'';
  const path=event?.rawPath||event?.path||'';
  if(method==='OPTIONS')return response(204,null);
  try{
   if(!['GET','POST'].includes(method))throw new AccountError('METHOD_NOT_ALLOWED',405);
   if(!path.startsWith('/v1/account/')&&!path.startsWith('/v1/moderation/accounts/'))
    throw new AccountError('NOT_FOUND',404);
   const auth=/^Bearer ([A-Za-z0-9_.-]{32,8192})$/.exec(hdr.authorization||'');
   if(!auth)throw new AccountError('UNAUTHENTICATED',401);
   const verified=await verifyCredential(auth[1]);
   if(verified?.verified!==true||!ID.test(verified.subject||''))
    throw new AccountError('UNAUTHENTICATED',401);
   // Restricted moderators and stale pre-restriction JWTs cannot use admin routes.
   if(path.startsWith('/v1/moderation/accounts/'))
    await accessGuard.authorize({authorization:hdr.authorization});
   const security=await getSecurityContext({subject:verified.subject,principal:verified});
   // This adapter MUST use server-stored session/MFA challenge results, not request fields.
   const actor={subject:verified.subject,roles:security?.roles||[],
    stepUpAt:security?.stepUpAt,mfaAt:security?.mfaAt};
   if(method==='POST'){
    const limited=await rateLimit({subject:actor.subject,path,method});
    if(limited!==true)throw new AccountError('RATE_LIMITED',429);
    if(!/^application\/json(?:\s*;|$)/i.test(hdr['content-type']||''))
     throw new AccountError('JSON_REQUIRED',415);
    if(typeof event.body!=='string'||event.body.length>8192||
     Buffer.byteLength(event.body,'utf8')>8192)
     throw new AccountError('INVALID_BODY',400);
   }
   let data={};
   if(method==='POST'){
    try{data=JSON.parse(event.isBase64Encoded?
     Buffer.from(event.body,'base64').toString('utf8'):event.body);}
    catch{throw new AccountError('INVALID_JSON',400);}
    if(!data||typeof data!=='object'||Array.isArray(data))
     throw new AccountError('INVALID_JSON',400);
   }
   const idempotencyKey=hdr['idempotency-key'];
   const own=path.startsWith('/v1/account/');
   if(own){
    if(method==='GET'&&path==='/v1/account/status')
     return response(200,await service.status({actor}));
    if(method==='POST'&&path==='/v1/account/deactivate')
     return response(200,await service.deactivate({actor,idempotencyKey}));
    if(method==='POST'&&path==='/v1/account/reactivate')
     return response(200,await service.reactivate({actor,idempotencyKey}));
    if(method==='POST'&&path==='/v1/account/appeals')
     return response(200,await service.appeal({actor,text:data.text,idempotencyKey}));
    throw new AccountError('NOT_FOUND',404);
   }
   const match=/^\/v1\/moderation\/accounts\/([A-Za-z0-9._:@-]{2,160})\/(status|review|suspend|reinstate|reject-appeal)$/.exec(path);
   if(!match)throw new AccountError('NOT_FOUND',404);
   const target=match[1],action=match[2];
   if(method==='GET'&&action==='status')
    return response(200,await service.status({actor,target}));
   if(method==='GET'&&action==='review')
    return response(200,await service.reviewCase({actor,target}));
   if(method!=='POST')throw new AccountError('METHOD_NOT_ALLOWED',405);
   if(action==='suspend')
    return response(200,await service.suspend({actor,target,kind:data.kind,
     reasonCode:data.reasonCode,durationHours:data.durationHours,
     approvalId:data.approvalId,idempotencyKey}));
   if(action==='reinstate')
    return response(200,await service.reinstate({actor,target,caseId:data.caseId,
     decision:data.decision,idempotencyKey}));
   if(action==='reject-appeal')
    return response(200,await service.rejectAppeal({actor,target,caseId:data.caseId,idempotencyKey}));
   throw new AccountError('NOT_FOUND',404);
  }catch(error){
   if(error instanceof AccountError)return response(error.status,{error:error.code});
   // Unknown failures are masked; log with server trace ID, never leak exception details.
   return response(503,{error:'ACCOUNT_SERVICE_UNAVAILABLE'});
  }
 }
 return Object.freeze({handle});
}
module.exports=Object.freeze({createAccountLambdaHandler});
