'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvider}=require('../providers/openai-responses.cjs');
const key='test-token-with-length';
const req={subject:'alice',workflow:'reels',prompt:'Improve my caption',
 context:'Only this user-provided caption',instruction:'Help write a caption.',mode:'advice_only'};
test('Responses request is bounded, private and contains no tools',async()=>{
 let call;
 const provider=createProvider({apiKey:key,model:'test-model',fetchImpl:async(url,init)=>{
  call={url,init};return {ok:true,text:async()=>JSON.stringify({
   status:'completed',output:[{type:'message',role:'assistant',
     content:[{type:'output_text',text:'Try a clear opening hook.'}]}]
  })};
 }});
 const result=await provider.suggest(req);
 assert.match(result,/opening hook/);
 assert.equal(call.url,'https://api.openai.com/v1/responses');
 const body=JSON.parse(call.init.body);
 assert.equal(body.store,false);
 assert.deepEqual(body.tools,[]);
 assert.equal(body.max_output_tokens,550);
 assert.equal(body.input[0].role,'user');
 assert.doesNotMatch(JSON.stringify(body),/alice/);
 assert.equal(call.init.headers.authorization,'Bearer '+key);
 assert.equal(call.init.redirect,'error');
});
test('provider config and inputs fail closed without network',async()=>{
 assert.throws(()=>createProvider({apiKey:'short',model:'model'}),/PROVIDER_CONFIG_REQUIRED/);
 let calls=0;const p=createProvider({apiKey:key,model:'test-model',
  fetchImpl:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({output_text:'fine'})}}});
 for(const obj of [{...req,mode:'execute'},{...req,prompt:''},
  {...req,context:'x'.repeat(1001)},{...req,workflow:'../wallet'},
  {...req,prompt:'x'.repeat(1001)}])
  await assert.rejects(p.suggest(obj),/PROVIDER_INPUT_INVALID/);
 assert.equal(calls,0);
});
test('invalid upstream, failed response, request rejection and huge outputs never succeed',async()=>{
 const cases=[
  async()=>{throw Error('private key exposed in error')},
  async()=>({ok:false,text:async()=>'{"error":"secret"}'}),
  async()=>({ok:true,text:async()=>'not-json'}),
  async()=>({ok:true,text:async()=>JSON.stringify({status:'incomplete',output_text:'partial'})}),
  async()=>({ok:true,text:async()=>JSON.stringify({output_text:'x'.repeat(2501)})}),
  async()=>({ok:true,text:async()=>JSON.stringify({status:'completed'})})
 ];
 for(const fetchImpl of cases){
  const provider=createProvider({apiKey:key,model:'test-model',fetchImpl});
  await assert.rejects(provider.suggest(req),/AI_PROVIDER_(UNAVAILABLE|INVALID_RESPONSE)/);
 }
});
