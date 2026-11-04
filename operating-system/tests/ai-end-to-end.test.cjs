'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createCognitoVerifier}=require('../auth/cognito-verifier.cjs');
const {createProvider}=require('../providers/openai-responses.cjs');
const {createOperatingSystem}=require('../index.cjs');
const {createAuraHttpHandler}=require('../http/aura-handler.cjs');
test('signed Cognito JWT -> AURA job -> consent -> provider -> authenticated receipt',async()=>{
 const now=1700000000000,issuer='https://cognito-idp.us-west-2.amazonaws.com/us-west-2_testpool';
 const clientId='testclient123456';
 const kp=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...kp.publicKey.export({format:'jwk'}),kid:'trusted-1',alg:'RS256',use:'sig'};
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const claims={iss:issuer,client_id:clientId,token_use:'access',sub:'alice',
  exp:Math.floor(now/1000)+3600};
 const raw=encode({alg:'RS256',kid:jwk.kid})+'.'+encode(claims);
 const jwt=raw+'.'+sign('RSA-SHA256',Buffer.from(raw),kp.privateKey).toString('base64url');
 let models=0;
 const verifier=createCognitoVerifier({issuer,clientId,now:()=>now,
  fetchImpl:async()=>({ok:true,json:async()=>({keys:[jwk]})})});
 const modelProvider=createProvider({apiKey:'test-secret-placeholder',model:'test-model',
  fetchImpl:async(_url,init)=>{
   models++;const body=JSON.parse(init.body);
   assert.equal(body.store,false);assert.deepEqual(body.tools,[]);
   assert.equal(body.input[0].role,'user');
   return {ok:true,text:async()=>JSON.stringify({output_text:'Make the first two seconds clear.'})};
  }});
 const system=createOperatingSystem({
  verifyCredential:verifier.verifyCredential,now:()=>now,modelProvider,
  getRoles:async s=>s==='alice'?['user']:[],ownerSubject:'owner',
  auditSink:async()=>true,
  aiConsent:async({subject,workflow})=>subject==='alice'&&workflow==='reels'
 });
 await system.start();
 const server=createServer(createAuraHttpHandler({system,
  verifyCredential:verifier.verifyCredential,now:()=>now,
  allowedOrigins:['https://crushx.in']}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const headers={authorization:'Bearer '+jwt,origin:'https://crushx.in',
  'content-type':'application/json'};
 try{
  const queued=await fetch(url+'/v1/aura/guide',{method:'POST',headers,
   body:JSON.stringify({workflow:'reels',prompt:'Improve my reel',requestId:'integration-0001'})});
  assert.equal(queued.status,202);
  assert.equal(models,0);
  const receipt=await queued.json();
  assert.equal((await system.tasks.runNext()).status,'completed');
  const task=await (await fetch(url+'/v1/aura/jobs/'+receipt.jobId,{headers})).json();
  assert.equal(task.result.suggestion,'Make the first two seconds clear.');
  assert.equal(task.result.executed,false);
  assert.equal(models,1);
  const invalid=await fetch(url+'/v1/aura/guide',{method:'POST',
   headers:{...headers,authorization:'Bearer '+jwt.slice(0,-3)+'xxx'},
   body:JSON.stringify({workflow:'reels',prompt:'no',requestId:'integration-0002'})});
  assert.equal(invalid.status,401);
  assert.equal(models,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
