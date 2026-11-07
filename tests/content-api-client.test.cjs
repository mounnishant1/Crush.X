'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createContentApiClient}=require('../content-api-client.js');
const token='header.payload.signature',origin='https://api.crushx.in';
test('explicit client actions use HTTPS only and send token in header, never URL',async()=>{
 const requests=[];
 const client=createContentApiClient({apiOrigin:origin,approvedOrigins:[origin],
  getAccessToken:async()=>token,
  fetchImpl:async(url,opts)=>{
   requests.push({url,opts});
   return {status:202,ok:true,text:async()=>JSON.stringify({jobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'queued'})};
  }});
 assert.equal(requests.length,0,'constructing client performs no network requests');
 const job=await client.ask('Find cooking reels','request-000001');
 assert.equal(job.status,'queued');
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,origin+'/v1/content/questions');
 assert.equal(requests[0].opts.headers.authorization,'Bearer '+token);
 assert.equal(requests[0].opts.credentials,'omit');
 assert.equal(requests[0].opts.redirect,'error');
 assert.equal(requests[0].url.includes(token),false);
 assert.deepEqual(JSON.parse(requests[0].opts.body),{question:'Find cooking reels',requestId:'request-000001'});
 await client.rank({kind:'reel',limit:5,requestId:'request-000002'});
 assert.equal(requests[1].url,origin+'/v1/content/feed/rank');
 await client.getJob('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(requests[2].url,origin+'/v1/content/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});
test('client requires approved fixed TLS origin and valid access token',async()=>{
 assert.throws(()=>createContentApiClient({apiOrigin:'http://api.crushx.in',approvedOrigins:[origin],
  getAccessToken:async()=>token,fetchImpl:async()=>{}}),/CONTENT_API_ORIGIN_NOT_APPROVED/);
 assert.throws(()=>createContentApiClient({apiOrigin:'https://other.example',approvedOrigins:[origin],
  getAccessToken:async()=>token,fetchImpl:async()=>{}}),/CONTENT_API_ORIGIN_NOT_APPROVED/);
 let called=false;
 const client=createContentApiClient({apiOrigin:origin,approvedOrigins:[origin],
  getAccessToken:async()=>null,fetchImpl:async()=>{called=true;}});
 await assert.rejects(client.getPreferences(),/CONTENT_AUTH_REQUIRED/);
 assert.equal(called,false);
 assert.throws(()=>client.ask('x','request-000003'),/CONTENT_QUESTION_INVALID/);
 assert.throws(()=>client.getJob('fake'),/CONTENT_JOB_ID_INVALID/);
});
test('client rejects sensitive interest labels and preserves explicit consent',async()=>{
 let payload;
 const client=createContentApiClient({apiOrigin:origin,approvedOrigins:[origin],
  getAccessToken:()=>token,fetchImpl:async(url,options)=>{
   payload=JSON.parse(options.body);
   return {ok:true,status:200,text:async()=>JSON.stringify({read:true,analyze:true,personalize:true,topics:['cooking']})};
  }});
 assert.throws(()=>client.setPreferences({read:true,analyze:true,personalize:true,topics:['religion']}),/CONTENT_PREFERENCES_INVALID/);
 assert.throws(()=>client.setPreferences({read:false,analyze:true,personalize:true,topics:[]}),/CONTENT_PREFERENCES_INVALID/);
 const result=await client.setPreferences({read:true,analyze:true,personalize:true,topics:['cooking']});
 assert.deepEqual(payload.topics,['cooking']);
 assert.equal(result.personalize,true);
});
test('client masks unexpected server errors and does not leak raw bodies',async()=>{
 const client=createContentApiClient({apiOrigin:origin,approvedOrigins:[origin],
  getAccessToken:()=>token,fetchImpl:async()=>({
   status:500,ok:false,text:async()=>JSON.stringify({error:'SECRET_INTERNAL_ERROR',details:'do not disclose'})})});
 await assert.rejects(client.getPreferences(),/CONTENT_REQUEST_FAILED/);
});

test('credential-provider errors are masked and no API request is attempted',async()=>{
 let called=false;
 const client=createContentApiClient({apiOrigin:origin,approvedOrigins:[origin],
  getAccessToken:()=>{throw Error('PRIVATE_REFRESH_TOKEN_DETAILS');},
  fetchImpl:async()=>{called=true;}});
 await assert.rejects(client.getPreferences(),err=>{
  assert.equal(err.message,'CONTENT_AUTH_REQUIRED');
  return true;
 });
 assert.equal(called,false);
});
