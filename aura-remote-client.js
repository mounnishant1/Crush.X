/* Optional authenticated client for one AURA-X dialog. Never auto-enable:
 * production HTML must explicitly mark <meta name="crushx-aura-api" content="same-origin">
 * and a valid Cognito access token must exist in session storage. No prompts,
 * content, contacts, IDs or telemetry are transmitted without user action.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CrushXAuraRemote=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const modules=new Set(['home','explore','stories','reels','posts','camera','editor','stickers',
  'messages','groups','calls','live','profile','notifications','settings','creator',
  'moderation','ads','wallet','offline','music','avatar','account','search']);
 function createClient({fetchImpl,getToken,enabled=()=>false,basePath='/v1/aura',now=Date.now,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(typeof fetchImpl!=='function'||typeof getToken!=='function'||typeof enabled!=='function'||
   typeof now!=='function'||typeof sleep!=='function'||basePath!=='/v1/aura')
   throw TypeError('REMOTE_CLIENT_TRUSTED_CONFIG_REQUIRED');
  function configured(){
   try{return enabled()===true&&typeof getToken()==='string'&&getToken().length>=32;}
   catch{return false;}
  }
  async function request(path,{method='GET',data,signal}={}){
   if(!configured())throw Error('AURA_BACKEND_NOT_CONFIGURED');
   const token=getToken();
   if(typeof token!=='string'||!/^[A-Za-z0-9._-]{32,8192}$/.test(token))
    throw Error('AURA_SESSION_REQUIRED');
   const headers={authorization:'Bearer '+token};
   if(data!==undefined)headers['content-type']='application/json';
   let response;
   try{response=await fetchImpl(basePath+path,{
    method,headers,credentials:'omit',cache:'no-store',
    ...(data===undefined?{}:{body:JSON.stringify(data)}),signal
   });}catch{throw Error('AURA_API_UNAVAILABLE');}
   let body;
   try{body=await response.json();}catch{throw Error('AURA_API_INVALID_RESPONSE');}
   if(!response.ok){
    const safe=['AUTH_REQUIRED','ACCESS_DENIED','CONSENT_NOT_CONFIGURED','RATE_LIMITED',
     'SERVICE_UNAVAILABLE','INVALID_REQUEST','NOT_FOUND','ORIGIN_DENIED'];
    const reason=safe.includes(body?.error)?body.error:'AURA_API_UNAVAILABLE';
    throw Error(reason);
   }
   return body;
  }
  async function grant(workflow,{signal}={}){
   if(!modules.has(workflow))throw Error('INVALID_WORKFLOW');
   const result=await request('/consent',{method:'POST',data:{
    scope:'ai:'+workflow,ttlMs:15*60000},signal});
   if(result.granted!==true||result.scope!=='ai:'+workflow||
    !Number.isFinite(result.expiresAt)||result.expiresAt<=now())
    throw Error('AURA_CONSENT_NOT_CONFIRMED');
   return result;
  }
  async function revoke(workflow,{signal}={}){
   if(!modules.has(workflow))throw Error('INVALID_WORKFLOW');
   return request('/consent?scope='+encodeURIComponent('ai:'+workflow),{method:'DELETE',signal});
  }
  async function status(workflow,{signal}={}){
   if(!modules.has(workflow))throw Error('INVALID_WORKFLOW');
   return request('/consent?scope='+encodeURIComponent('ai:'+workflow),{signal});
  }
  async function ask({workflow,prompt,context='',signal}={}){
   if(!modules.has(workflow)||typeof prompt!=='string'||!prompt.trim()||prompt.length>1000||
    typeof context!=='string'||context.length>1000)throw Error('INVALID_AI_REQUEST');
   const id=(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')?
    crypto.randomUUID():null;
   if(!id)throw Error('SECURE_RANDOM_UNAVAILABLE');
   const receipt=await request('/guide',{method:'POST',data:{
    workflow,prompt,context,requestId:id},signal
   });
   if(typeof receipt.jobId!=='string'||!receipt.jobId||receipt.status!=='queued')
    throw Error('AURA_API_INVALID_RESPONSE');
   // Only read an authorized receipt, never attempt actions from model text.
   for(let attempt=0;attempt<10;attempt++){
    if(signal?.aborted)throw Error('AURA_REQUEST_CANCELLED');
    await sleep(800);
    const job=await request('/jobs/'+encodeURIComponent(receipt.jobId),{signal});
    if(job.status==='completed'){
     if(job.result?.executed!==false||job.result?.workflow!==workflow||
      typeof job.result.suggestion!=='string'||job.result.suggestion.length>2500)
      throw Error('AURA_API_INVALID_RESPONSE');
     return Object.freeze({suggestion:job.result.suggestion,source:'configured_model',executed:false});
    }
    if(['failed','blocked','cancelled','audit_error'].includes(job.status))
     throw Error('AURA_TASK_FAILED');
   }
   throw Error('AURA_TASK_PENDING');
  }
  return Object.freeze({configured,grant,revoke,status,ask});
 }
 function browserClient(root){
  if(!root?.document||!root.fetch||!root.sessionStorage)return null;
  const supported=()=>root.location?.protocol==='https:'||
   (root.location?.protocol==='http:'&&['127.0.0.1','localhost'].includes(root.location.hostname));
  const enabled=()=>supported()&&root.document.querySelector(
   'meta[name="crushx-aura-api"][content="same-origin"]')!==null;
  return createClient({fetchImpl:root.fetch.bind(root),getToken:()=>{
   try{return root.sessionStorage.getItem('crushx_access_token')||'';}catch{return '';}
  },enabled});
 }
 return Object.freeze({createClient,browserClient});
});