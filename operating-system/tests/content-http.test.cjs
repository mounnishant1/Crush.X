'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createOperatingSystem}=require('../index.cjs');
const {createContentHttpHandler}=require('../http/content-handler.cjs');
const now=1800000000000;
const tokens={alice:'a'.repeat(36),bob:'b'.repeat(36)};
async function setup(){
 const preferences=new Map(),audits=[];
 const defaults=()=>({read:false,analyze:false,personalize:false,topics:[]});
 const store={
  getPreferences:async({subject})=>preferences.get(subject)||defaults(),
  setPreferences:async({subject,...next})=>{preferences.set(subject,next);return next;},
  eraseHistory:async({subject})=>{const p=preferences.get(subject)||defaults();preferences.set(subject,{...p,topics:[]});return {erased:true};},
  checkConsent:async({subject,scope})=>{
   const p=preferences.get(subject)||defaults();
   return ({'content:read':p.read,'content:analyze':p.analyze,'content:personalize':p.personalize})[scope]===true;
  },
  loadAuthorizedContent:async()=>[{id:'reel_1',kind:'reel',creatorId:'creator_1',status:'published',
   moderation:'approved',visibility:'public',caption:'Cooking pasta on the stove'}],
  authorizeContent:async()=>true,
  readEngagementEvents:async()=>[],
  readExplicitInterests:async()=>[]
 };
 const verifyCredential=async token=>({verified:Object.values(tokens).includes(token),
  subject:token===tokens.alice?'alice':'bob',expiresAt:now+120000});
 const system=createOperatingSystem({
  verifyCredential,getRoles:async()=>['user'],ownerSubject:'owner',now:()=>now,
  auditSink:async entry=>{audits.push(entry);return true;},contentIntelligence:store
 });
 await system.start();
 const handler=createContentHttpHandler({
  system,verifyCredential,checkActiveAccount:async subject=>subject==='alice'||subject==='bob',
  contentStore:store,allowedOrigins:['https://crushx.in'],
  consumeRateLimit:async()=>true,now:()=>now
 });
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 async function call(path,{method='GET',user='alice',body,origin='https://crushx.in'}={}){
  const headers={origin,authorization:'Bearer '+tokens[user]};
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {code:res.status,data:res.status===204?null:await res.json(),headers:res.headers};
 }
 return {system,server,call,audits,store,preferences,close:async()=>{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  await system.stop();
 }};
}
test('privacy is opt-in, jobs return source IDs, and other accounts cannot read receipts',async()=>{
 const t=await setup();
 try{
  const empty=await t.call('/v1/content/privacy');
  assert.equal(empty.code,200);assert.equal(empty.data.personalize,false);
  const consent=await t.call('/v1/content/privacy',{method:'PUT',body:{
   read:true,analyze:true,personalize:true,topics:['cooking']}});
  assert.equal(consent.code,200);
  const queued=await t.call('/v1/content/questions',{method:'POST',body:{
   requestId:'request-000001',question:'Where is pasta?'}});
  assert.equal(queued.code,202);
  assert.equal((await t.system.tasks.runNext()).status,'completed');
  const result=await t.call('/v1/content/jobs/'+queued.data.jobId);
  assert.equal(result.code,200);assert.equal(result.data.result.sources[0].id,'reel_1');
  const cross=await t.call('/v1/content/jobs/'+queued.data.jobId,{user:'bob'});
  assert.equal(cross.code,403);
  const ranked=await t.call('/v1/content/feed/rank',{method:'POST',body:{
   requestId:'request-000002',kind:'reel',limit:5}});
  assert.equal(ranked.code,202);
  assert.equal((await t.system.tasks.runNext()).status,'completed');
  const rankResult=await t.call('/v1/content/jobs/'+ranked.data.jobId);
  assert.equal(rankResult.data.result.items[0].id,'reel_1');
  assert.equal(t.audits.some(e=>JSON.stringify(e).includes('Where is pasta?')),false);
 }finally{await t.close();}
});
test('invalid requests, origin denial, revoke and erasure are fail-closed',async()=>{
 const t=await setup();
 try{
  assert.equal((await t.call('/v1/content/privacy',{origin:'https://evil.example'})).code,403);
  assert.equal((await t.call('/v1/content/privacy',{method:'PUT',body:{read:false,analyze:true,personalize:true,topics:[]}})).code,400);
  assert.equal((await t.call('/v1/content/questions',{method:'POST',body:{question:'hello',requestId:'bad'}})).code,400);
  assert.equal((await t.call('/v1/content/privacy',{method:'PUT',body:{read:true,analyze:true,personalize:true,topics:['religion']}})).code,400);
  assert.equal((await t.call('/v1/content/privacy',{method:'PUT',body:{
   read:true,analyze:true,personalize:true,topics:['gaming']}})).code,200);
  assert.equal((await t.call('/v1/content/history',{method:'DELETE'})).data.erased,true);
  assert.deepEqual((await t.call('/v1/content/privacy')).data.topics,[]);
  assert.equal((await t.call('/v1/content/privacy',{method:'PUT',body:{
   read:false,analyze:false,personalize:false,topics:[]}})).code,200);
  const job=await t.call('/v1/content/questions',{method:'POST',body:{requestId:'request-000006',question:'cooking'}});
  assert.equal(job.code,202);
  assert.equal((await t.system.tasks.runNext()).status,'failed');
  assert.equal((await t.call('/v1/content/jobs/'+job.data.jobId)).data.result,null);
 }finally{await t.close();}
});
test('rate limit adapter is mandatory, privacy queries have safe response headers',async()=>{
 const t=await setup();
 try{
  const response=await t.call('/v1/content/privacy');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://crushx.in');
  assert.throws(()=>createContentHttpHandler({
   system:t.system,verifyCredential:async()=>({verified:true}),contentStore:t.store,
   allowedOrigins:['https://crushx.in'],checkActiveAccount:async()=>true
  }),/CONTENT_HTTP_TRUSTED_ADAPTERS_REQUIRED/);
 }finally{await t.close();}
});
