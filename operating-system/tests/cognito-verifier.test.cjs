'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createCognitoVerifier}=require('../auth/cognito-verifier.cjs');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const issuer='https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example1';
const clientId='testclient123456';
const now=1700000000000;
const jwk={...publicKey.export({format:'jwk'}),kid:'key-1',alg:'RS256',use:'sig'};
const header={alg:'RS256',kid:jwk.kid,typ:'JWT'};
const body={iss:issuer,client_id:clientId,token_use:'access',sub:'alice',
 iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+3600};
function token(claims=body,h=header){
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const raw=encode(h)+'.'+encode(claims);
 return raw+'.'+sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url');
}
function fixture(){
 let fetches=0;
 const verifier=createCognitoVerifier({issuer,clientId,now:()=>now,
 fetchImpl:async()=>{fetches++;return {ok:true,json:async()=>({keys:[jwk]})}}});
 return {verifier,get fetches(){return fetches;}};
}
test('signed matching access token authorizes only its verified subject',async()=>{
 const f=fixture();
 assert.deepEqual(await f.verifier.verifyCredential(token()),{
  verified:true,subject:'alice',expiresAt:body.exp*1000
 });
 assert.equal((await f.verifier.verifyCredential(token())).verified,true);
 assert.equal(f.fetches,1,'JWKS is cached');
});
test('reject tampered JWT, incorrect audience, id token, expired token and wrong issuer',async()=>{
 const f=fixture();
 for(const t of [
  token({...body,client_id:'different-app'}),
  token({...body,token_use:'id'}),
  token({...body,exp:Math.floor(now/1000)-1}),
  token({...body,iss:issuer+'/other'}),
  token(body,{...header,alg:'none'}),
  token().slice(0,-4)+'abcd',
  'not-a-jwt'
 ])assert.equal((await f.verifier.verifyCredential(t)).verified,false);
});
test('Cognito verifier never accepts arbitrary issuer or malformed configuration',()=>{
 assert.throws(()=>createCognitoVerifier({issuer:'http://127.0.0.1/jwks',clientId}),/COGNITO_CONFIG_REQUIRED/);
 assert.throws(()=>createCognitoVerifier({issuer,clientId:'not valid'}),/COGNITO_CONFIG_REQUIRED/);
});
test('network failure denies, no fallback to unsigned claims',async()=>{
 const verifier=createCognitoVerifier({issuer,clientId,now:()=>now,
  fetchImpl:async()=>{throw Error('offline')}});
 assert.equal((await verifier.verifyCredential(token())).verified,false);
});
