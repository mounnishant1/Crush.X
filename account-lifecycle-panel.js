/* Crush.X Account Lifecycle panel: no fake account state or client-side moderation.
   Wire only to verified backend + step-up provider via configure(). */
(function(root){
 'use strict';
 if(!root||!root.document)return;
 let config=null,panel=null,previousFocus=null,previousOverflow='';
 const $=(tag,cls,text)=>{
  const e=root.document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
 };
 function message(msg){const p=$('p','cx-account-notice',msg);p.setAttribute('role','status');return p;}
 function close(){
  if(!panel)return;
  panel.remove();panel=null;
  root.document.body.style.overflow=previousOverflow;
  if(previousFocus?.isConnected)previousFocus.focus();
 }
 function button(text,fn){
  const b=$('button','cx-account-action',text);b.type='button';
  b.addEventListener('click',fn);return b;
 }
 function show(node){if(!panel)return;const main=panel.querySelector('[data-account-body]');
  main.replaceChildren(node);panel.querySelector('[data-account-close]')?.focus();}
 function section(title){
  const s=$('section','cx-account-section');
  s.append($('h2',null,title));return s;
 }
 async function request(path,body,idempotencyKey){
  if(!config)throw Error('Backend not connected');
  const token=await config.getAccessToken();
  if(typeof token!=='string'||token.length<20)throw Error('Please sign in again');
  const url=(config.baseUrl||'')+path;
  const r=await (config.fetchImpl||root.fetch).call(root,url,{
   method:body===undefined?'GET':'POST',cache:'no-store',credentials:'omit',
   headers:{'authorization':'Bearer '+token,
    ...(body===undefined?{}:{'content-type':'application/json','idempotency-key':idempotencyKey})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data=await r.json().catch(()=>({error:'Invalid server response'}));
  if(!r.ok)throw Error(data.error||'Request failed');
  return data;
 }
 function errorUI(err){
  const p=$('p','cx-account-error',String(err?.message||'Request failed'));
  p.setAttribute('role','alert');return p;
 }
 async function fresh(){
  if(!config)return;
  show(message('Checking verified account status…'));
  try{render(await request('/v1/account/status'));}
  catch(e){const s=section('Account unavailable');
   s.append(errorUI(e),button('Retry',fresh));show(s);}
 }
 async function performAction(path,body){
  if(typeof config?.performStepUp!=='function')throw Error('Recent verification is required');
  const ok=await config.performStepUp();
  if(ok!==true)throw Error('Verification not completed');
  const id=root.crypto?.randomUUID?.();
  if(!id)throw Error('Secure request ID unavailable');
  return request(path,body,id);
 }
 function render(data){
  const s=section('Account status');
  const status=$('p','cx-account-status',String(data.status||'UNKNOWN'));
  s.append(status);
  if(data.status==='ACTIVE'){
   s.append(message('Temporarily deactivate your account. Your profile may be hidden; account data is retained under the app retention policy.'));
   const confirm=$('label','cx-account-confirm');
   const check=$('input');check.type='checkbox';
   confirm.append(check,root.document.createTextNode(' I understand I will be signed out.'));
   s.append(confirm);
   const b=button('Deactivate account',async()=>{
    if(!check.checked){s.append(errorUI(Error('Please confirm first')));return;}
    b.disabled=true;
    try{
     await performAction('/v1/account/deactivate',{});
     if(typeof config?.onRequireFreshLogin==='function')config.onRequireFreshLogin();
     show(message('Account deactivated. Sign in again if you want to reactivate.'));
    }catch(e){s.append(errorUI(e));b.disabled=false;}
   });
   s.append(b);
  }else if(data.status==='DEACTIVATED'){
   s.append(message('Your account is deactivated. Verify your identity to reactivate it.'));
   const b=button('Verify & reactivate account',async()=>{
    b.disabled=true;
    try{
     await performAction('/v1/account/reactivate',{});
     if(typeof config?.onRequireFreshLogin==='function')config.onRequireFreshLogin();
     show(message('Reactivation complete. A fresh sign-in is required.'));
    }catch(e){s.append(errorUI(e));b.disabled=false;}
   });
   s.append(b);
  }else if(data.status==='SUSPENDED'||data.status==='BANNED'){
   const m=data.suspension||{};
   s.append(message('Your account is restricted. You can review the reason and submit one appeal per case.'));
   s.append($('p',null,'Reason: '+String(m.reasonCode||'Policy review')));
   if(m.expiresAt)s.append($('p',null,'Scheduled restriction end: '+new Date(m.expiresAt).toLocaleString()));
   s.append($('p',null,'Appeal: '+String(m.appealStatus||'not_submitted')));
   if(m.appealStatus==='not_submitted'&&Date.now()<Number(m.appealDeadline||0)){
    const label=$('label','cx-account-appeal-label','Tell us why the decision should be reviewed');
    const field=$('textarea','cx-account-appeal');field.maxLength=1500;field.minLength=20;field.rows=5;
    field.placeholder='Include relevant context without sharing passwords or private information.';
    label.append(field);s.append(label);
    const b=button('Submit appeal',async()=>{
     b.disabled=true;
     try{await request('/v1/account/appeals',{text:field.value.trim()},root.crypto.randomUUID());await fresh();}
     catch(e){s.append(errorUI(e));b.disabled=false;}
    });s.append(b);
   }
   s.append(message('Only authorized moderation can overturn an active suspension or ban.'));
  }else{
   s.append(message('Account state is not available. Contact support if this persists.'));
  }
  s.append(button('Refresh status',fresh));
  show(s);
 }
 function open(){
  if(panel)return true;
  previousFocus=root.document.activeElement;
  previousOverflow=root.document.body.style.overflow;
  panel=$('div','cx-account-overlay');panel.id='cxAccountLifecycle';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Crush.X account security');
  const head=$('header','cx-account-head');
  const back=button('← Back',close);back.setAttribute('data-account-close','');
  head.append(back,$('strong',null,'Crush.X Account & Security'));
  const body=$('main','cx-account-body');body.setAttribute('data-account-body','');
  panel.append(head,body);
  panel.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();close();return;}
   if(e.key!=='Tab')return;
   const focus=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];
   if(!focus.length)return;const first=focus[0],last=focus[focus.length-1];
   if(e.shiftKey&&root.document.activeElement===first){e.preventDefault();last.focus();}
   if(!e.shiftKey&&root.document.activeElement===last){e.preventDefault();first.focus();}
  });
  root.document.body.append(panel);
  root.document.body.style.overflow='hidden';
  if(!config){show(message('Live account management is not connected in this preview. No account is changed.'));}
  else fresh();
  back.focus();
  return true;
 }
 function configure(options){
  if(!options||typeof options.getAccessToken!=='function'||
   typeof options.performStepUp!=='function')throw TypeError('VERIFIED_ACCOUNT_ADAPTER_REQUIRED');
  const base=options.baseUrl||'';
  if(base&&!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[A-Za-z0-9/_-]*)?$/.test(base))
   throw TypeError('HTTPS_BACKEND_REQUIRED');
  config=Object.freeze({...options,baseUrl:base});
 }
 root.CrushXAccountLifecycle=Object.freeze({open,close,configure,
  isConnected:()=>config!==null});
 root.document.addEventListener('crushx:session-ended',close);
})(typeof window!=='undefined'?window:null);
