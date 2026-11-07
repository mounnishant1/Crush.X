/* Crush.X Story API client. Explicit opt-in only: no demo auto-publish and no token storage.
 * Must be configured with the account-scoped Cognito ACCESS token provider, HTTPS API
 * endpoint and an authenticated user action. Not wired to sample Story UI by default.
 */
(function (root, factory) {
  'use strict';
  const api=factory();
  if (typeof module==='object'&&module.exports) module.exports=api;
  else root.CrushXStoryAPI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function () {
  'use strict';
  const ID=/^[0-9a-f]{40}$/;
  function createClient({baseUrl,getAccessToken,fetchImpl=typeof fetch==='function'?fetch:null}={}){
    let url;
    try{url=new URL(baseUrl);}catch{throw TypeError('STORY_API_HTTPS_REQUIRED');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
      url.pathname!=='/'||typeof getAccessToken!=='function'||typeof fetchImpl!=='function')
      throw TypeError('STORY_API_HTTPS_REQUIRED');
    const origin=url.origin;
    const endpoint='/v1/stories';
    async function call(method,path,body){
      // Never expose internal credential-provider errors to UI or telemetry.
      let token;
      try{token=await getAccessToken();}catch{throw Error('STORY_AUTH_REQUIRED');}
      if(typeof token!=='string'||!/^[A-Za-z0-9._-]{32,8192}$/.test(token))
        throw Error('STORY_AUTH_REQUIRED');
      let response;
      try{
        response=await fetchImpl(origin+path,{
          method,
          headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
          credentials:'omit',
          cache:'no-store',
          redirect:'error',
          ...(body===undefined?{}:{body:JSON.stringify(body)})
        });
      }catch{throw Error('STORY_NETWORK_UNAVAILABLE');}
      let result;
      try{result=await response.json();}catch{throw Error('STORY_INVALID_RESPONSE');}
      if(!result||typeof result!=='object'||Array.isArray(result))
        throw Error('STORY_INVALID_RESPONSE');
      if(!response.ok){
        const reason=result&&typeof result.error==='string'&&/^[A-Z_]{3,60}$/.test(result.error)?
          result.error:'STORY_REQUEST_FAILED';
        throw Error(reason);
      }
      return result;
    }
    function path(id,suffix=''){
      if(typeof id!=='string'||!ID.test(id))throw TypeError('INVALID_STORY_ID');
      return endpoint+'/'+id+suffix;
    }
    return Object.freeze({
      publish:input=>call('POST',endpoint,input),
      read:id=>call('GET',path(id)),
      markViewed:id=>call('POST',path(id,'/view')),
      react:(id,emoji)=>call('PUT',path(id,'/reaction'),{emoji}),
      reply:(id,text,requestId)=>call('POST',path(id,'/replies'),{text,requestId}),
      remove:id=>call('DELETE',path(id)),
      insights:id=>call('GET',path(id,'/insights'))
    });
  }
  return Object.freeze({createClient});
});
