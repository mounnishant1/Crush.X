/* Optional live AURA-X controls reuse the existing dialog, not a new agent.
 * A trusted HTTPS deployment must add the 'crushx-aura-api' meta opt-in.
 * All model requests transmit ONLY the user's typed prompt after consent.
 */
(function(root){
 'use strict';
 if(!root?.document||!root.CrushXAuraRemote||!root.MutationObserver)return;
 const client=root.CrushXAuraRemote.browserClient(root);
 if(!client)return;
 let observer=null;
 function currentWorkflow(dialog){
  const ctx=dialog.querySelector('[data-ax-context]')?.textContent||'';
  if(ctx.startsWith('Local guidance: ')){
   const title=ctx.slice('Local guidance: '.length);
   const item=root.CrushXAIWorkflows?.list().find(x=>x.title===title);
   if(item)return item.id;
  }
  const tab=typeof root.getState==='function'?root.getState()?.activeTab:'home';
  return ({home:'home',discover:'explore',create:'editor',reels:'reels',
   messages:'messages',profile:'profile'})[tab]||'home';
 }
 function mount(dialog){
  if(dialog.dataset.auraRemoteMounted==='true'||!client.configured())return;
  const workflow=currentWorkflow(dialog);
  if(!root.CrushXAIWorkflows?.lookup(workflow))return;
  dialog.dataset.auraRemoteMounted='true';
  const section=root.document.createElement('section');
  section.className='cx-aura-remote';
  section.setAttribute('aria-label','Optional verified AI model');
  section.innerHTML='<h3>Verified AURA-X model · optional</h3>'+
   '<p>Only the prompt you type is sent to the configured AI provider. No inbox, reel, photo or personal feed is automatically transmitted.</p>'+
   '<div class="cx-aura-remote-actions">'+
   '<button type="button" data-remote-allow>Allow AI model for 15 minutes</button>'+
   '<button type="button" data-remote-ask disabled>Ask AI model</button>'+
   '<button type="button" data-remote-revoke>Revoke AI consent</button></div>'+
   '<p data-remote-status role="status">Explicit server-side consent required.</p>'+
   '<pre data-remote-answer></pre>';
  const form=dialog.querySelector('[data-ax-form]');
  if(form)form.after(section);else dialog.append(section);
  const allow=section.querySelector('[data-remote-allow]');
  const ask=section.querySelector('[data-remote-ask]');
  const revoke=section.querySelector('[data-remote-revoke]');
  const status=section.querySelector('[data-remote-status]');
  const answer=section.querySelector('[data-remote-answer]');
  const ctrl=new AbortController();
  let active=false,busy=false;
  const account=typeof root.getState==='function'?root.getState()?.currentUserId:null;
  const canShow=()=>!ctrl.signal.aborted&&dialog.open&&
   account===(typeof root.getState==='function'?root.getState()?.currentUserId:null);
  const show=message=>{if(canShow())status.textContent=message;};
  dialog.addEventListener('close',()=>ctrl.abort(),{once:true});
  allow.addEventListener('click',async()=>{
   if(busy)return;busy=true;allow.disabled=true;show('Checking secure consent…');
   try{await client.grant(workflow,{signal:ctrl.signal});
    if(canShow()){active=true;ask.disabled=false;show('Model consent active, up to 15 minutes.');}
   }catch(e){active=false;show('Consent unavailable: '+String(e?.message||'SERVICE_UNAVAILABLE'));}
   finally{busy=false;if(canShow())allow.disabled=false;}
  });
  ask.addEventListener('click',async()=>{
   if(busy||!active)return;
   const prompt=dialog.querySelector('#axPrompt')?.value||'';
   if(!prompt.trim()){show('Type your question first.');return;}
   busy=true;ask.disabled=true;answer.textContent='';show('Requesting model guidance…');
   try{const result=await client.ask({workflow,prompt,signal:ctrl.signal});
    if(canShow()){answer.textContent=result.suggestion;
     show('AI suggestion received. No app action executed.');}
   }catch(e){show('AI unavailable: '+String(e?.message||'SERVICE_UNAVAILABLE'));}
   finally{busy=false;if(canShow())ask.disabled=!active;}
  });
  revoke.addEventListener('click',async()=>{
   if(busy)return;busy=true;active=false;ask.disabled=true;answer.textContent='';
   try{await client.revoke(workflow,{signal:ctrl.signal});show('Model consent revoked.');}
   catch(e){show('Could not verify revocation: '+String(e?.message||'SERVICE_UNAVAILABLE'));}
   finally{busy=false;}
  });
 }
 function scan(){root.document.querySelectorAll('dialog[aria-label="AURA-X"]').forEach(mount);}
 function start(){
  if(observer)return;
  observer=new MutationObserver(scan);
  observer.observe(root.document.body,{childList:true,subtree:true});
  scan();
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(typeof window!=='undefined'?window:null);