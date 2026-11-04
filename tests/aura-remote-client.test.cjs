'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClient}=require('../aura-remote-client.js');
const token='t'.repeat(48);
function setup(){
 const requests=[];let allowed=false;
 const client=createClient({
  getToken:()=>token,enabled:()=>true,now:()=>1900000000000,sleep:async()=>{},
  fetchImpl:async(url,init)=>{
   const data=init.body?JSON.parse(init.body):null;
   requests.push({url,method:init.method,data,headers:init.headers});
   let reply={};
   if(url==='/v1/aura/consent'){
    allowed=true;reply={granted:true,scope:'ai:editor',expiresAt:1900000900000};
   }else if(url==='/v1/aura/guide'){
    if(!allowed)return {ok:false,json:async()=>({error:'ACCESS_DENIED'})};
    reply={jobId:'00000000-0000-4000-8000-000000000001',status:'queued'};
   }else if(url.includes('/jobs/')){
    reply={status:'completed',result:{workflow:'editor',suggestion:'Trim safely',executed:false}};
   }else if(url.startsWith('/v1/aura/consent?')){
    allowed=false;reply={revoked:true};
   }
   return {ok:true,json:async()=>reply};
  }
 });
 return {client,requests};
}
test('client only sends typed prompt after explicit consent and never app state',async()=>{
 const x=setup();assert.equal(x.client.configured(),true);
 await x.client.grant('editor');
 const done=await x.client.ask({workflow:'editor',prompt:'Trim the Reel'});
 assert.equal(done.executed,false);
 assert.equal(done.suggestion,'Trim safely');
 const p=x.requests.find(r=>r.url==='/v1/aura/guide');
 assert.equal(p.data.workflow,'editor');
 assert.equal(p.data.prompt,'Trim the Reel');
 assert.equal(p.data.context,'');
 assert.ok(/^[A-Za-z0-9_-]{8,128}$/.test(p.data.requestId));
 assert.equal(p.headers.authorization,'Bearer '+token);
 assert.equal(p.headers.cookie,undefined);
 await x.client.revoke('editor');
 assert.equal(x.requests.some(r=>r.method==='DELETE'),true);
});
test('default mode is unavailable and malicious endpoints cannot be chosen',async()=>{
 const unavailable=createClient({fetchImpl:async()=>{throw Error('must not call');},
  getToken:()=>token});
 assert.equal(unavailable.configured(),false);
 await assert.rejects(unavailable.grant('reels'),/AURA_BACKEND_NOT_CONFIGURED/);
 assert.throws(()=>createClient({getToken:()=>token,fetchImpl:async()=>{},enabled:()=>true,
   basePath:'https://evil.example'}),/REMOTE_CLIENT_TRUSTED_CONFIG_REQUIRED/);
 const x=setup();
 await assert.rejects(x.client.ask({workflow:'wallet.execute',prompt:'Pay me'}),/INVALID_AI_REQUEST/);
 await assert.rejects(x.client.ask({workflow:'editor',prompt:''}),/INVALID_AI_REQUEST/);
 assert.equal(x.requests.length,0);
});
test('server errors are sanitized and cannot inject confidential exception text',async()=>{
 const client=createClient({getToken:()=>token,enabled:()=>true,
  fetchImpl:async()=>({ok:false,json:async()=>({error:'secret user prompt and token'})})});
 await assert.rejects(client.grant('editor'),/AURA_API_UNAVAILABLE/);
});
