/* Crush.X OS Step 7: full-screen feature navigation, NOT a second AI assistant.
 * Existing sample app and AURA-X remain the only user experience. This module
 * makes no requests and never reports draft/sending/publishing as live. */
(function(root){
 'use strict';
 if(!root || !root.document) return;
 const FEATURES=Object.freeze([
  Object.freeze({id:'account',name:'Account & Profile',route:'profile',mode:'local_preview',note:'Sample profile. Backend account tools are not connected.'}),
  Object.freeze({id:'camera',name:'Camera & AR',route:'create',mode:'local_preview',note:'Open Create for local media selection; live AR requires the Android engine.'}),
  Object.freeze({id:'editor',name:'Story / Reel Editor',route:'create',mode:'local_preview',note:'Local editing and export only. No verified remote publishing.'}),
  Object.freeze({id:'stories',name:'Stories',route:'create',mode:'local_preview',note:'Story Studio supports local previews and draft editing.'}),
  Object.freeze({id:'reels',name:'Reels',route:'reels',mode:'local_preview',note:'Sample feed and local editing; live creator analytics unavailable.'}),
  Object.freeze({id:'posts',name:'Posts',route:'home',mode:'local_preview',note:'Home feed uses sample posts; uploads are not connected.'}),
  Object.freeze({id:'messages',name:'Messages & Groups',route:'messages',mode:'local_preview',note:'Only local drafts. This does not deliver direct messages.'}),
  Object.freeze({id:'calls',name:'Voice / Video Calls',route:'messages',mode:'unavailable',note:'Signalling, call permissions and native calling are not connected.'})
 ]);
 const find=id=>FEATURES.find(f=>f.id===id)||null;
 const aiTopics=()=>root.CrushXAIWorkflows
  ?root.CrushXAIWorkflows.list().filter(t=>t.id!=='owner'):[];
 let panel=null, trigger=null, lastFocus=null, previousOverflow='';
 let observing=false;
 const isAuthenticated=()=>{
  const overlay=root.document.getElementById('authOverlay');
  return !overlay||overlay.style.display==='none';
 };
 function featureStatus(id){
  const feature=find(id);
  if(!feature)return null;
  // Static, truthful source inspection status; NOT backend health or auth.
  return Object.freeze({id:feature.id,name:feature.name,route:feature.route,mode:feature.mode,
   remoteReady:false,publishingReady:false,messagingReady:false,callingReady:false});
 }
 function close(){
  if(!panel)return;
  panel.remove();panel=null;
  root.document.body.style.overflow=previousOverflow;
  try{if(lastFocus&&lastFocus.isConnected)lastFocus.focus();}catch{}
  lastFocus=null;
 }
 function navigateFeature(id){
  const feature=find(id);
  if(!feature||!isAuthenticated())return false;
  close();
  if(typeof root.navigate!=='function')return false;
  // Navigation is existing local app routing, not OS tool execution.
  root.navigate(feature.route);
  return true;
 }
 function open(){
  if(!isAuthenticated())return false;
  if(panel){panel.querySelector('[data-os-close]')?.focus();return true;}
  lastFocus=root.document.activeElement;
  panel=root.document.createElement('section');
  panel.id='cxOsFeatures';
  panel.className='cx-os-feature-page';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Crush.X app feature controls');
  panel.innerHTML =
   '<header class="cx-os-feature-head">'+
     '<button type="button" data-os-close aria-label="Back to app" class="cx-os-back">← Back</button>'+
     '<strong>Crush.X App Controls</strong>'+
   '</header>'+
   '<main class="cx-os-feature-main">'+
     '<p class="cx-os-feature-disclaimer" role="status">Browser-local preview. OS backend, live publishing, message delivery and calls are not connected here.</p>'+
     '<div class="cx-os-feature-grid">'+FEATURES.map(f=>
       '<button type="button" data-os-feature="'+f.id+'" class="cx-os-feature-tile" aria-label="Open '+f.name+'">'+
         '<strong>'+f.name+'</strong><span>'+f.note+'</span>'+
         '<em>'+(f.mode==='unavailable'?'Navigation only · Live service unavailable':'Open local screen')+'</em>'+
       '</button>').join('')+'</div>'+
     '<section class="cx-os-ai-section" aria-label="AURA-X whole app guidance">'+
       '<h2>AURA-X across the whole app</h2>'+
       '<p>Choose a module for local, consent-based checklists. These do not run a model or change the app.</p>'+
       '<div class="cx-os-ai-grid">'+aiTopics().map(t=>
         '<button type="button" class="cx-os-ai-tile" data-os-ai="'+t.id+'">'+
         '✦ '+t.title+'</button>').join('')+'</div>'+
     '</section>'+
     '<section class="cx-os-account-control"><button type="button" data-os-account>Account suspend / reactivate & appeals</button><p>Verified server connection required to change account state.</p></section>'+ 
     '<div class="cx-os-aura-zone"><p>AURA-X stays the single AI assistant. It currently gives only local, rule-based help.</p>'+
       '<button type="button" data-os-aura>Open AURA-X</button></div>'+
   '</main>';
  panel.addEventListener('click',event=>{
   const back=event.target.closest('[data-os-close]');
   if(back){close();return;}
   const tile=event.target.closest('[data-os-feature]');
   if(tile){navigateFeature(tile.dataset.osFeature);return;}
   if(event.target.closest('[data-os-account]')){
    close();if(root.CrushXAccountLifecycle?.open)root.CrushXAccountLifecycle.open();return;
   }
   const aiTile=event.target.closest('[data-os-ai]');
   if(aiTile){
    close();
    if(root.CrushXAura&&typeof root.CrushXAura.openFeature==='function')
     root.CrushXAura.openFeature(aiTile.dataset.osAi);
    return;
   }
   if(event.target.closest('[data-os-aura]')){
    close();
    if(root.CrushXAura&&typeof root.CrushXAura.open==='function')root.CrushXAura.open();
   }
  });
  panel.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key!=='Tab')return;
   const focus=[...panel.querySelectorAll('button:not([disabled])')];
   if(!focus.length)return;
   const first=focus[0],last=focus[focus.length-1];
   if(event.shiftKey&&root.document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&root.document.activeElement===last){event.preventDefault();first.focus();}
  });
  previousOverflow=root.document.body.style.overflow;
  root.document.body.style.overflow='hidden';
  root.document.body.append(panel);
  panel.querySelector('[data-os-close]')?.focus();
  return true;
 }
 function attach(){
  const app=root.document.getElementById('app');
  if(!app)return;
  const hint=app.querySelector('.sample-hint');
  if(!hint){if(trigger&&!trigger.isConnected)trigger=null;return;}
  if(!app.querySelector('[data-os-open]')){
   const btn=root.document.createElement('button');
   btn.type='button';btn.dataset.osOpen='1';
   btn.textContent='App controls';
   btn.className='cx-os-open';
   btn.setAttribute('aria-label','Open Crush.X app feature controls');
   btn.addEventListener('click',open);
   hint.append(btn);
  }
  trigger=app.querySelector('[data-os-open]');
  if(panel&&!isAuthenticated())close();
 }
 function start(){
  if(observing)return;observing=true;
  attach();
  const app=root.document.getElementById('app');
  if(app&&typeof root.MutationObserver==='function'){
   // The existing app reconstructs its DOM on navigation and sample changes.
   // Observe top-level rerenders and reattach the single navigation entry.
   const observer=new root.MutationObserver(()=>attach());
   observer.observe(app,{childList:true});
  }
  root.document.addEventListener('crushx:session-ended',close);
  root.addEventListener('popstate',()=>{if(panel)close();});
  root.addEventListener('hashchange',()=>{if(panel)close();});
 }
 root.CrushXAppOS=Object.freeze({
  open,close,openFeature:navigateFeature,status:featureStatus,
  list:()=>FEATURES.map(f=>featureStatus(f.id))
 });
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(typeof window!=='undefined'?window:null);
