'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('../../story-api-client.js');
const token='x'.repeat(48),storyId='a'.repeat(40);
test('Story client accepts only verified HTTPS origin and an explicit access token provider',()=>{
 for(const baseUrl of ['http://example.com','https://user:pass@example.com',
  'https://example.com/path','https://example.com?token=bad']){
  assert.throws(()=>createClient({baseUrl,getAccessToken:()=>token,fetchImpl:()=>{}}),
   /STORY_API_HTTPS_REQUIRED/);
 }
 assert.throws(()=>createClient({baseUrl:'https://crushx.in'}),/STORY_API_HTTPS_REQUIRED/);
});
test('Story client uses per-request token, never stores it, routes operations correctly',async()=>{
 let tokens=0;const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true})};};
 const client=createClient({baseUrl:'https://api.crushx.in',
  getAccessToken:async()=>{tokens++;return token;},fetchImpl});
 await client.publish({requestId:'story-new-001',mediaId:'asset-123',audience:'followers'});
 await client.read(storyId);
 await client.markViewed(storyId);
 await client.react(storyId,'🔥');
 await client.reply(storyId,'Hello','reply-001');
 await client.insights(storyId);
 await client.remove(storyId);
 assert.equal(tokens,7);
 assert.deepEqual(calls.map(v=>[v.options.method,v.url.replace('https://api.crushx.in','')]),[
  ['POST','/v1/stories'],
  ['GET','/v1/stories/'+storyId],
  ['POST','/v1/stories/'+storyId+'/view'],
  ['PUT','/v1/stories/'+storyId+'/reaction'],
  ['POST','/v1/stories/'+storyId+'/replies'],
  ['GET','/v1/stories/'+storyId+'/insights'],
  ['DELETE','/v1/stories/'+storyId]
 ]);
 assert.ok(calls.every(v=>v.options.headers.Authorization==='Bearer '+token));
 assert.ok(calls.every(v=>v.options.credentials==='omit'&&v.options.cache==='no-store'));
 assert.deepEqual(JSON.parse(calls[3].options.body),{emoji:'🔥'});
 assert.deepEqual(JSON.parse(calls[4].options.body),{text:'Hello',requestId:'reply-001'});
 assert.throws(()=>client.read('../bad'),/INVALID_STORY_ID/);
});
test('Story client fails closed with no credentials, no backend, or explicit API rejection',async()=>{
 const noToken=createClient({baseUrl:'https://api.crushx.in',getAccessToken:()=>'',fetchImpl:async()=>{throw Error('should not call');}});
 await assert.rejects(noToken.read(storyId),/STORY_AUTH_REQUIRED/);
 const offline=createClient({baseUrl:'https://api.crushx.in',getAccessToken:()=>token,
  fetchImpl:async()=>{throw Error('network');}});
 await assert.rejects(offline.read(storyId),/STORY_NETWORK_UNAVAILABLE/);
 const denied=createClient({baseUrl:'https://api.crushx.in',getAccessToken:()=>token,
  fetchImpl:async()=>({ok:false,json:async()=>({error:'ACCESS_DENIED'})})});
 await assert.rejects(denied.read(storyId),/ACCESS_DENIED/);
});

test('Story client rejects malformed successful responses and masks credential provider failures',async()=>{
 const bad=createClient({baseUrl:'https://api.crushx.in',getAccessToken:()=>token,
  fetchImpl:async()=>({ok:true,json:async()=>null})});
 await assert.rejects(bad.read(storyId),/STORY_INVALID_RESPONSE/);
 const array=createClient({baseUrl:'https://api.crushx.in',getAccessToken:()=>token,
  fetchImpl:async()=>({ok:true,json:async()=>([])})});
 await assert.rejects(array.markViewed(storyId),/STORY_INVALID_RESPONSE/);
 let sent=false;
 const throwing=createClient({baseUrl:'https://api.crushx.in',
  getAccessToken:()=>{throw Error('PRIVATE_CREDENTIAL_PROVIDER_DETAIL');},
  fetchImpl:async()=>{sent=true;}});
 await assert.rejects(throwing.read(storyId),err=>{
  assert.equal(err.message,'STORY_AUTH_REQUIRED');
  return true;
 });
 assert.equal(sent,false);
});
