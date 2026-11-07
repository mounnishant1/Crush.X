/* Crush.X Content API SDK.
 * Optional authenticated HTTPS client. Does not auto-connect, scrape the app,
 * read storage, retain tokens, or send any event until an explicit caller action.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CrushXContentApiClient=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const TOPICS=new Set(['art','beauty','books','cars','comedy','cooking','dance','design','education',
  'fashion','fitness','food','football','gaming','gardening','music','nature','pets',
  'photography','science','sports','technology','travel','movies','animation',
  'diy','business','history','languages','lifestyle']);
 const validJob=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
 const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
 function createContentApiClient({apiOrigin,approvedOrigins,getAccessToken,fetchImpl,
   timeoutMs=10000}={}){
  if(!Array.isArray(approvedOrigins)||!approvedOrigins.length||
    typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
   throw TypeError('CONTENT_API_CONFIG_REQUIRED');
  let url;
  try{url=new URL(apiOrigin);}catch{throw TypeError('CONTENT_API_ORIGIN_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||
    url.search||url.hash||!approvedOrigins.includes(url.origin))
   throw TypeError('CONTENT_API_ORIGIN_NOT_APPROVED');
  const base=url.origin;
  async function request(method,path,body){
   // Credential adapters may fail while refreshing or reading session state.
   // Never expose their internal exception text to callers or logs.
   let token;
   try{token=await getAccessToken();}catch{throw Error('CONTENT_AUTH_REQUIRED');}
   // A Cognito ACCESS JWT is provided by the host app, verified on the server.
   if(typeof token!=='string'||token.length>8192||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw Error('CONTENT_AUTH_REQUIRED');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const res=await fetchImpl(base+path,{method,redirect:'error',cache:'no-store',
     credentials:'omit',mode:'cors',signal:controller.signal,
     headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},
     ...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!res||typeof res.status!=='number'||typeof res.text!=='function')
     throw Error('CONTENT_RESPONSE_INVALID');
    if(res.status===204)return null;
    const content=await res.text();
    if(content.length>32768)throw Error('CONTENT_RESPONSE_TOO_LARGE');
    let parsed;
    try{parsed=JSON.parse(content);}catch{throw Error('CONTENT_RESPONSE_INVALID');}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
     throw Error('CONTENT_RESPONSE_INVALID');
    if(!res.ok){
     // Don't leak server diagnostics or body; only limited error codes.
     const acceptable=new Set(['AUTH_REQUIRED','ACCESS_DENIED','ORIGIN_DENIED',
      'RATE_LIMITED','INVALID_REQUEST','SERVICE_UNAVAILABLE','IDEMPOTENCY_CONFLICT']);
     const code=acceptable.has(parsed.error)?parsed.error:'CONTENT_REQUEST_FAILED';
     throw Error(code);
    }
    return parsed;
   }finally{clearTimeout(timeout);}
  }
  const getPreferences=()=>request('GET','/v1/content/privacy');
  const setPreferences=({read,analyze,personalize,topics=[]}={})=>{
   if([read,analyze,personalize].some(v=>typeof v!=='boolean')||
     !Array.isArray(topics)||topics.length>30||
     topics.some(topic=>typeof topic!=='string'||!TOPICS.has(topic))||
     (!read&&(analyze||personalize))||(!personalize&&topics.length))
    throw Error('CONTENT_PREFERENCES_INVALID');
   return request('PUT','/v1/content/privacy',{read,analyze,personalize,topics});
  };
  const eraseHistory=()=>request('DELETE','/v1/content/history');
  const ask=(question,requestId)=>{
   if(typeof question!=='string'||question.trim().length<2||question.length>500||!validId(requestId))
    throw Error('CONTENT_QUESTION_INVALID');
   return request('POST','/v1/content/questions',{question,requestId});
  };
  const rank=({kind,limit=20,requestId}={})=>{
   if(!['reel','post','story'].includes(kind)||!Number.isInteger(limit)||limit<1||limit>40||!validId(requestId))
    throw Error('CONTENT_RANK_INVALID');
   return request('POST','/v1/content/feed/rank',{kind,limit,requestId});
  };
  const getJob=jobId=>{
   if(!validJob(jobId))throw Error('CONTENT_JOB_ID_INVALID');
   return request('GET','/v1/content/jobs/'+jobId);
  };
  return Object.freeze({getPreferences,setPreferences,eraseHistory,ask,rank,getJob,
   configured:true,apiOrigin:base});
 }
 return Object.freeze({createContentApiClient});
});