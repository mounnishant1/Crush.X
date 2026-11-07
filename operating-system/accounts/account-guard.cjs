'use strict';
// Apply to EVERY private Crush.X API, websocket upgrade, media URL signer and AURA-X action.
// A valid JWT alone is not enough after suspension; Cognito revocation is not a local JWT check.
const {AccountError}=require('./account-service.cjs');
function createAccountAccessGuard({verifyCredential,accountService}={}){
 if(typeof verifyCredential!=='function'||typeof accountService?.requireActive!=='function')
  throw TypeError('ACCOUNT_ACCESS_GUARD_ADAPTERS_REQUIRED');
 async function authorize({authorization}={}){
  const match=/^Bearer ([A-Za-z0-9_.-]{32,8192})$/.exec(authorization||'');
  if(!match)throw new AccountError('UNAUTHENTICATED',401);
  const principal=await verifyCredential(match[1]);
  if(principal?.verified!==true||typeof principal.subject!=='string')
   throw new AccountError('UNAUTHENTICATED',401);
  const components=match[1].split('.');
  let claims;
  try{
   if(components.length!==3)throw Error('invalid JWT');
   claims=JSON.parse(Buffer.from(components[1],'base64url').toString('utf8'));
  }catch{throw new AccountError('UNAUTHENTICATED',401);}
  // Claim is safe ONLY because verifyCredential authenticated this exact JWT first.
  if(claims.sub!==principal.subject||!Number.isSafeInteger(claims.iat)||
   claims.iat<1000000000||claims.iat*1000>Date.now()+30000)
   throw new AccountError('UNAUTHENTICATED',401);
  await accountService.requireActive({subject:principal.subject,issuedAt:claims.iat*1000});
  return Object.freeze({subject:principal.subject,expiresAt:principal.expiresAt});
 }
 return Object.freeze({authorize});
}
module.exports=Object.freeze({createAccountAccessGuard});
