'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createOperatingSystem}=require('../index.cjs');
const {createAuraHttpHandler}=require('../http/aura-handler.cjs');
const now=1700000000000,token='t'.repeat(40);
test('feed and media HTTP routes enforce server identity, consent and safe output',async()=>{
 let consent=true,inferred=0;
 const verifyCredential=async t=>({verified:t===token,subject:t===token?'alice':'',expiresAt:now+600000});
 const system=createOperatingSystem({
  now:()=>now,verifyCredential,getRoles:async()=>['user'],ownerSubject:'owner-1',
  auditSink:async()=>true,
  feedOptions:{
   checkConsent:async sub=>sub==='alice'&&consent,
   readCatalog:async()=>[
    {id:'one',creatorId:'a',topics:['music'],visible:true,quality:.7,createdAt:now-1000},
    {id:'hidden',creatorId:'b',topics:['travel'],visible:true,quality:1,createdAt:now-1000}
   ],
   readExclusions:async()=>({blockedCreators:[],hiddenIds:['hidden']})
  },
  mediaOptions:{
   checkConsent:async({subject})=>subject==='alice'&&consent,
   resolveMedia:async({subject,mediaId})=>({ownerSubject:subject,id:mediaId,ready:true,kind:'reel'}),
   inferMedia:async()=>{inferred++;return {summary:'A music clip',topics:['music','sensitive_trait'],captions:'Hello'};}
  }
 });
 await system.start();
 const server=createServer(createAuraHttpHandler({system,verifyCredential,
  allowedOrigins:['https://crushx.in'],now:()=>now}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={authorization:'Bearer '+token,origin:'https://crushx.in',
  'content-type':'application/json'};
 try{
  const preflight=await fetch(base+'/v1/media/analyze',{method:'OPTIONS',headers:{origin:'https://crushx.in'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'https://crushx.in');
  const list=await fetch(base+'/v1/feed/reels?limit=5',{headers});
  assert.equal(list.status,200);
  assert.deepEqual((await list.json()).items.map(x=>x.contentId),['one']);
  assert.equal((await fetch(base+'/v1/feed/reels?limit=999',{headers})).status,400);
  const media=await fetch(base+'/v1/media/analyze',{method:'POST',headers,
   body:JSON.stringify({mediaId:'owned-1'})});
  assert.equal(media.status,200);
  const result=await media.json();
  assert.deepEqual(result.topics,['music']);
  assert.equal(result.trainingAllowed,false);
  assert.equal(inferred,1);
  consent=false;
  const denied=await fetch(base+'/v1/media/analyze',{method:'POST',headers,
   body:JSON.stringify({mediaId:'owned-1'})});
  assert.equal(denied.status,403);
  assert.equal(inferred,1);
  assert.equal((await fetch(base+'/v1/feed/history',{method:'DELETE',headers})).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
