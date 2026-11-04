'use strict';
// Server-only Cognito ACCESS JWT verification. Never trust browser role claims.
// Session revocation/account disabling must be enforced by the caller's role store.
const {createPublicKey,verify}=require('node:crypto');
const b64=s=>Buffer.from(s,'base64url');
function createCognitoVerifier({issuer,clientId,fetchImpl=globalThis.fetch,
 now=Date.now,cacheTtlMs=300000}={}){
 if(typeof issuer!=='string'||!/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[A-Za-z0-9_-]{4,128}$/.test(issuer)||
 typeof clientId!=='string'||!/^[A-Za-z0-9]{8,128}$/.test(clientId)||
 typeof fetchImpl!=='function'||typeof now!=='function'||!Number.isInteger(cacheTtlMs)||
 cacheTtlMs<10000||cacheTtlMs>600000)throw TypeError('COGNITO_CONFIG_REQUIRED');
 let keys=[],validUntil=0;
 async function refresh(){
  let response;
  try{response=await fetchImpl(issuer+'/.well-known/jwks.json',{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(7000)
  });}catch{throw Error('AUTH_PROVIDER_UNAVAILABLE');}
  if(!response?.ok)throw Error('AUTH_PROVIDER_UNAVAILABLE');
  let data;
  try{data=await response.json();}catch{throw Error('AUTH_PROVIDER_UNAVAILABLE');}
  if(!Array.isArray(data?.keys)||data.keys.length<1||data.keys.length>20)
   throw Error('AUTH_PROVIDER_UNAVAILABLE');
  keys=data.keys.filter(k=>k&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig'&&
   typeof k.kid==='string'&&k.kid.length<=128&&typeof k.n==='string'&&typeof k.e==='string');
  validUntil=now()+cacheTtlMs;
 }
 async function verifyCredential(token){
  try{
   if(typeof token!=='string'||token.length<32||token.length>8192)return {verified:false};
   const parts=token.split('.');if(parts.length!==3)return {verified:false};
   const header=JSON.parse(b64(parts[0]).toString('utf8'));
   const body=JSON.parse(b64(parts[1]).toString('utf8'));
   if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||
    body.iss!==issuer||body.token_use!=='access'||body.client_id!==clientId||
    typeof body.sub!=='string'||body.sub.length<3||body.sub.length>128||
    !Number.isSafeInteger(body.exp)||body.exp*1000<=now()||
    (body.nbf!==undefined&&(!Number.isSafeInteger(body.nbf)||body.nbf*1000>now()+30000))||
    (body.iat!==undefined&&(!Number.isSafeInteger(body.iat)||body.iat*1000>now()+30000)))
    return {verified:false};
   if(now()>=validUntil||!keys.some(k=>k.kid===header.kid))await refresh();
   const key=keys.find(k=>k.kid===header.kid);if(!key)return {verified:false};
   const valid=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),
    createPublicKey({key,format:'jwk'}),b64(parts[2]));
   if(!valid)return {verified:false};
   return Object.freeze({verified:true,subject:body.sub,expiresAt:body.exp*1000});
  }catch{return {verified:false};}
 }
 return Object.freeze({verifyCredential});
}
module.exports=Object.freeze({createCognitoVerifier});