/* AURA-X local authorization boundary.
 * No network/model access, autonomous execution, real messages, purchases or backend memory.
 * In-memory only. User action must explicitly grant each local scope.
 */
(function(root,factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.CrushXAuraPolicy=Object.freeze(api);
})(typeof window!=='undefined' ? window : null,function(){
  'use strict';
  const SCOPES=Object.freeze([
    'analyse:reel','draft:message','apply:local-draft','memory:read','memory:write'
  ]);
  const MAX_TTL=60*60*1000,MIN_TTL=60*1000,MAX_NOTE=500;
  const forbidden=/\b(otp|password|passphrase|recovery.?code|private.?key|api.?key|access.?token|credit.?card|cvv|bank.?account)\b|ओटीपी|पासवर्ड|बैंक खाता/iu;
  const validOwner=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(value);
  function createSession({now=Date.now}={}){
    if(typeof now!=='function') throw new TypeError('Invalid clock');
    let owner=null, grants=new Map(),memory=new Map();
    function clear(){owner=null;grants.clear();memory.clear();}
    function bindOwner(ownerId){
      if(!validOwner(ownerId)) return false;
      if(owner!==ownerId){clear();owner=ownerId;}
      return true;
    }
    function consent({ownerId,scopes,ttlMs=15*60*1000,approved}={}){
      if(approved!==true || !bindOwner(ownerId)) return Object.freeze({ok:false,reason:'Explicit account-scoped approval required'});
      if(!Array.isArray(scopes)||!scopes.length || !Number.isSafeInteger(ttlMs)||ttlMs<MIN_TTL||ttlMs>MAX_TTL)
        return Object.freeze({ok:false,reason:'Invalid permission scope or expiry'});
      const unique=[...new Set(scopes)];
      if(unique.some(scope=>!SCOPES.includes(scope))) return Object.freeze({ok:false,reason:'Scope not permitted'});
      const at=now();
      if(!Number.isFinite(at)||at<0) return Object.freeze({ok:false,reason:'Invalid time'});
      const expiresAt=at+ttlMs;
      unique.forEach(scope=>grants.set(scope,expiresAt));
      return Object.freeze({ok:true,scopes:Object.freeze(unique.slice()),expiresAt});
    }
    function authorized(ownerId,scope){
      if(!validOwner(ownerId)||ownerId!==owner||!SCOPES.includes(scope)) return false;
      const expiresAt=grants.get(scope);
      if(!Number.isFinite(expiresAt))return false;
      if(now()>=expiresAt){grants.delete(scope);return false;}
      return true;
    }
    function revoke(scope){
      if(typeof scope==='undefined'){grants.clear();return true;}
      if(!SCOPES.includes(scope))return false;
      return grants.delete(scope);
    }
    function note(ownerId){
      if(!authorized(ownerId,'memory:read'))return Object.freeze({ok:false,reason:'Memory read permission not granted'});
      return Object.freeze({ok:true,text:memory.get(ownerId)||''});
    }
    function writeNote(ownerId,value){
      if(!authorized(ownerId,'memory:write'))return Object.freeze({ok:false,reason:'Memory write permission not granted'});
      if(typeof value!=='string' || value.trim().length>MAX_NOTE || forbidden.test(value))
        return Object.freeze({ok:false,reason:'Invalid or potentially sensitive note; no secrets may be stored'});
      memory.set(ownerId,value.trim());
      return Object.freeze({ok:true});
    }
    function deleteNote(ownerId){
      if(!validOwner(ownerId)||ownerId!==owner)return false;
      memory.delete(ownerId);return true; // Revocation/deletion must remain possible without additional consent.
    }
    function classify(task){
      // Never execute actions based on assistant text; this classifier is advisory only.
      if(!task||typeof task!=='object')return Object.freeze({decision:'DENY',reason:'Invalid task'});
      if(typeof task.type!=='string'||!SCOPES.includes(task.type))
        return Object.freeze({decision:'DENY',reason:'Remote publishing, calls, financial and agent actions are unavailable'});
      return Object.freeze({decision:'LOCAL_ONLY',reason:'Requires an explicit permission grant and interactive user action'});
    }
    function status(ownerId){
      return Object.freeze({bound:ownerId===owner && validOwner(ownerId),
        permissions:Object.freeze(SCOPES.filter(scope=>authorized(ownerId,scope))),
        memoryPresent:ownerId===owner && memory.has(ownerId),
        remoteEnabled:false,autopilotEnabled:false});
    }
    return Object.freeze({consent,authorized,revoke,note,writeNote,deleteNote,classify,status,clear,bindOwner});
  }
  return Object.freeze({createSession,SCOPES});
});
