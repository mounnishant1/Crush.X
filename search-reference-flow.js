/* Step261 Search / Explore reference: local browser preview. No remote search or fake counts. */
(function(){
 'use strict';
 if(typeof renderDiscover!=='function'||typeof bindRepairEvents!=='function')return;
 const baseDiscover=renderDiscover,baseBind=bindRepairEvents,baseLogout=logout;
 let mode='idle',tab='for-you',lastInput='';
 const recent=new Map(),cats=[['for-you','For you'],['accounts','Accounts'],['audio','Audio'],['tags','Tags']];
 const clean=q=>String(q??'').trim().replace(/\s+/g,' ').slice(0,200);
 const match=(value,q)=>clean(q).toLowerCase().split(' ').filter(Boolean).every(word=>String(value??'').toLowerCase().includes(word));
 const historyFor=state=>{if(!recent.has(state.currentUserId))recent.set(state.currentUserId,[]);return recent.get(state.currentUserId);};
 function commit(q){
  q=clean(q);if(!q){mode='editing';renderApp();return;}
  const state=getState(),h=historyFor(state);
  recent.set(state.currentUserId,[q,...h.filter(v=>v.toLowerCase()!==q.toLowerCase())].slice(0,10));
  state.searchQuery=q;lastInput=q;saveState(state);tab='for-you';mode='results';renderApp();
 }
 function suggested(state){
  const q=clean(state.searchQuery),items=[...(q?[q]:[]),...historyFor(state),
   ...state.users.map(u=>u.username),...state.reels.map(r=>r.caption),...state.posts.map(p=>p.caption)];
  const seen=new Set();
  return items.map(clean).filter(v=>v&&(!q||match(v,q))).filter(v=>{const k=v.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,10);
 }
 function suggestions(state){
  const history=historyFor(state),isRecent=s=>history.some(h=>h.toLowerCase()===s.toLowerCase());
  return '<div class="cx261-history"><header><strong>'+ (clean(state.searchQuery)?'Suggestions':'Recent')+
   '</strong><button data-cx261-clear-history>Clear all</button></header>'+suggested(state).map(term=>
   '<div class="cx261-term"><button data-cx261-term="'+escapeHTML(term)+'"><span aria-hidden="true">'+(isRecent(term)?'◷':'⌕')+'</span>'+escapeHTML(term)+'</button>'+
   (isRecent(term)?'<button data-cx261-remove="'+escapeHTML(term)+'" aria-label="Remove recent term">×</button>':'')+'</div>').join('')+
   '<p class="cx261-hint">Local search preview — no queries sent to other accounts.</p></div>';
 }
 function peopleView(people){
  return people.length?'<div class="cx261-people">'+people.slice(0,40).map(u=>
   '<article><button data-profile-user="'+escapeHTML(u.id)+'" aria-label="Open '+escapeHTML(u.username)+' profile">'+
   '<img src="'+safeMediaUrl(u.avatar)+'" alt="" loading="lazy"><span><strong>@'+escapeHTML(u.username)+
   (u.verified?' <span aria-label="Verified">✓</span>':'')+'</strong><small>'+escapeHTML(u.fullName||'')+
   '</small></span></button></article>').join('')+'</div>':
   '<p class="cx261-empty">No matching sample accounts.</p>';
 }
 function mediaView(media){
  if(!media.length)return '<p class="cx261-empty">No matching sample posts or Reels.</p>';
  return '<div class="cx261-grid explore-grid">'+media.map(item=>{
   const src=safeMediaUrl(item.source||item.image);
   const isVideo=item.mediaType==='video'||item.contentType?.startsWith('video/')||/\.(mp4|webm)(?:[?#]|$)/i.test(item.source||'');
   return '<button data-open-local-item="'+escapeHTML(item.id)+'"'+cxGridTileAttributes(item,item.kind)+' aria-label="Open sample '+item.kind+'">'+
    (isVideo?cxGridVideoMarkup(item,src):'<img src="'+src+'" loading="lazy" alt="Sample thumbnail">')+'</button>';
  }).join('')+'</div>';
 }
 function results(state){
  const q=clean(state.searchQuery),people=state.users.filter(u=>match([u.username,u.fullName,u.info].join(' '),q));
  const media=[...previewRanked('reel',state.reels).map(r=>({...r,kind:'reel'})),
   ...previewRanked('post',state.posts).map(p=>({...p,kind:'post'}))]
   .filter(x=>match([x.caption,x.song,x.artist,userById(state,x.userId)?.username].join(' '),q));
  const tags=[...new Set([...state.reels,...state.posts].flatMap(x=>String(x.caption||'').match(/#[\p{L}\p{N}_]{2,40}/gu)||[]))]
   .filter(x=>match(x,q.replace(/^#/,''))).slice(0,35);
  const audio=state.reels.filter(x=>x.song&&match((x.song||'')+' '+(x.artist||''),q));
  let body='';
  if(tab==='accounts')body=peopleView(people);
  else if(tab==='audio')body=audio.length?'<div class="cx261-audio">'+audio.map(x=>
   '<div>♫ <strong>'+escapeHTML(x.song)+'</strong><small>'+escapeHTML(x.artist||'Original audio')+'</small></div>').join('')+'</div>':
   '<p class="cx261-empty">No matching sample audio.</p>';
  else if(tab==='tags')body=tags.length?'<div class="cx261-tags">'+tags.map(tag=>
   '<button data-cx261-term="'+escapeHTML(tag)+'">'+escapeHTML(tag)+'</button>').join('')+'</div>':
   '<p class="cx261-empty">No matching hashtags.</p>';
  else body=(people.length?'<h2>Accounts</h2>'+peopleView(people.slice(0,4)):'')+
   '<h2>Posts</h2>'+mediaView(media);
  return '<nav class="cx261-tabs" aria-label="Search categories">'+cats.map(([key,label])=>
   '<button data-cx261-tab="'+key+'" aria-pressed="'+(tab===key)+'">'+label+'</button>').join('')+
   '</nav><div class="cx261-body">'+body+'</div>';
 }
 renderDiscover=function(state){
  if(mode==='editing'&&state.searchQuery!==lastInput)mode='idle';
  const original=baseDiscover(state);
  if(mode==='idle')return original;
  const extra='<section class="cx261-search-panel"><div class="cx261-controls">'+
   '<button data-cx261-back aria-label="Back to Explore">←</button>'+
   '<button data-cx261-clear aria-label="Clear search">×</button>'+
   '<button data-cx261-submit aria-label="Search">⌕</button></div>'+
   (mode==='editing'?suggestions(state):results(state))+'</section>';
  return original.replace('<main class="explore-screen"','<main class="explore-screen cx261-mode-'+mode+'"')
   .replace('</label>','</label>'+extra);
 };
 bindRepairEvents=function(){
  baseBind();
  if(getState().activeTab!=='discover'){mode='idle';return;}
  const input=document.getElementById('searchInput');
  input?.addEventListener('focus',()=>{if(mode==='idle'){mode='editing';lastInput=input.value;renderApp();}});
  input?.addEventListener('input',()=>{lastInput=input.value;mode='editing';});
  input?.addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();commit(input.value);input.blur();}
   else if(e.key==='Escape'){e.preventDefault();mode='idle';input.blur();renderApp();}
  });
  const on=(q,fn)=>document.querySelectorAll(q).forEach(el=>el.addEventListener('click',()=>fn(el)));
  on('[data-cx261-term]',el=>commit(el.dataset.cx261Term));
  on('[data-cx261-tab]',el=>{tab=el.dataset.cx261Tab;mode='results';renderApp();});
  on('[data-cx261-back]',()=>{mode='idle';renderApp();});
  on('[data-cx261-submit]',()=>commit(getState().searchQuery));
  on('[data-cx261-clear]',()=>{const s=getState();s.searchQuery='';lastInput='';saveState(s);mode='editing';renderApp();document.getElementById('searchInput')?.focus();});
  on('[data-cx261-clear-history]',()=>{recent.set(getState().currentUserId,[]);renderApp();});
  on('[data-cx261-remove]',el=>{const s=getState(),key=el.dataset.cx261Remove.toLowerCase();recent.set(s.currentUserId,historyFor(s).filter(x=>x.toLowerCase()!==key));renderApp();});
 };
 logout=function(){mode='idle';tab='for-you';recent.clear();return baseLogout();};
 window.CrushXSearchStep261={get mode(){return mode;},get tab(){return tab;},get recent(){return historyFor(getState()).slice();}};
})();