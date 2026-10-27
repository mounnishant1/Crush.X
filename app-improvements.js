/* Local-only social preview. No network mutations or account impersonation. */
let appFeedFilter = 'all';
let appProfileFilter = 'posts';
let appExploreFilter = 'all';
let appProfileUserId = null;
let appProfileReturnTab = 'home';
let appProfileOpenedInSession = false;
let captionDraft = '';
let storyViewerDialog = null;
let storyViewerTimer = null;
let storyViewerStories = [];
let storyViewerIndex = 0;
let storyViewerElapsed = 0;
let storyViewerLastTick = 0;
let storyViewerPaused = false;
let storyViewerHold = false;
let storyViewerSwipeUntil = 0;
let storyViewerStartX = null;
let storyViewerStatus = '';
let storyViewerDrafts = {};
const storyViewerDuration = 6500;
let reelObserver = null;
const originalHome = renderHome;
const originalProfile = renderProfile;
const originalReels = renderReels;
const originalCreate = renderCreate;
const originalRepairEvents = bindRepairEvents;
const originalLogout = logout;
const originalRenderApp = renderApp;
const pcFilters = {Original:'none',Vivid:'saturate(1.55) contrast(1.12)',Warm:'sepia(.22) saturate(1.18)',Mono:'grayscale(1)'};
const pcRatios = {Original:'auto',Square:'1 / 1',Portrait:'4 / 5',Story:'9 / 16'};
function pcFresh() { return {filter:'Original',ratio:'Original',audience:'Everyone',location:'',tags:'',audioName:'',audioUrl:'',poll:false,pollQuestion:'',pollOne:'Yes',pollTwo:'No',hideLikes:false,hideComments:false,onlyProfile:false,aiLabel:false,moreOpen:false}; }
let pcDraft = pcFresh();

function closeAppDialog() {
  closeStoryViewer();
  document.querySelectorAll('dialog[data-app-dialog]').forEach(dialog => { dialog.close(); dialog.remove(); });
}
function appDialog(title, body, bind = () => {}) {
  const opener = document.activeElement;
  closeAppDialog();
  const dialog = document.createElement('dialog');
  dialog.dataset.appDialog = 'true';
  dialog.setAttribute('aria-label', title);
  dialog.className = 'app-dialog';
  dialog.innerHTML = `<section><header class="flex items-center justify-between gap-4 mb-4"><h2 class="text-xl font-bold">${escapeHTML(title)}</h2><button data-close-dialog aria-label="Close dialog" class="rounded-lg border px-3 py-2">Close</button></header>${body}</section>`;
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
  bind(dialog);
  dialog.showModal();
  return dialog;
}
function localItemMedia(item) {
  const url = safeMediaUrl(item.source || item.image);
  const video = item.contentType?.startsWith('video/') || item.mediaType === 'video' || /\.(mp4|webm)(?:[?#]|$)/i.test(item.source || '');
  return video ? `<video src="${url}" controls playsinline class="w-full rounded-xl max-h-[60vh]" aria-label="Saved video"></video>` : `<img src="${url}" alt="Sample media" class="w-full rounded-xl max-h-[60vh] object-contain">`;
}
function openGridMedia(id) {
  const state = getState();
  const index = state.reels.findIndex(item => item.id === id);
  if (index >= 0) {
    navigate('reels');
    const deck = document.querySelector('.reels-deck');
    if (deck) deck.scrollTop = index * deck.clientHeight;
    return;
  }
  showLocalItem(id);
}
function showLocalItem(id) {
  const state = getState();
  const item = [...state.posts, ...state.reels].find(item => item.id === id);
  if (!item) return;
  appDialog('Sample post', `${localItemMedia(item)}<p class="mt-3">${formatText(item.caption)}</p><p class="text-xs text-slate-500 mt-2">Local sample · ${item.comments.length} comments</p>`);
}
function closeStoryViewer() {
  if(storyViewerTimer){clearInterval(storyViewerTimer);storyViewerTimer=null;}
  const dialog=storyViewerDialog;
  storyViewerDialog=null;
  storyViewerStories=[];
  storyViewerStartX=null;
  if(dialog){if(dialog.open)dialog.close();dialog.remove();}
}
function storyViewerHTML() {
  const story=storyViewerStories[storyViewerIndex];if(!story)return '';
  const state=getState(),user=userById(state,story.userId);
  const name=escapeHTML(user?.username||'Sample user'),avatar=safeMediaUrl(user?.avatar||'');
  const own=story.userId===state.currentUserId;
  const status=storyViewerStatus?`<p class="sv-notice" role="status">${escapeHTML(storyViewerStatus)}</p>`:'';
  const draft=storyViewerDrafts[story.id]||'';
  return `<div class="sv-shell">
    <div class="sv-progress" aria-label="Story ${storyViewerIndex+1} of ${storyViewerStories.length}">${storyViewerStories.map((item,i)=>`<div class="sv-track"><div data-sv-progress="${i}" style="width:${i<storyViewerIndex?'100':i>storyViewerIndex?'0':Math.min(100,storyViewerElapsed/storyViewerDuration*100)}%"></div></div>`).join('')}</div>
    <header class="sv-head"><img src="${avatar}" alt=""><strong>${name}</strong><small>Sample · ${storyViewerIndex+1}/${storyViewerStories.length}</small><button data-sv="pause" aria-label="${storyViewerPaused?'Resume':'Pause'} story"><i data-lucide="${storyViewerPaused?'play':'pause'}">${storyViewerPaused?'▶':'Ⅱ'}</i></button><button data-sv="close" aria-label="Close story viewer"><i data-lucide="x">×</i></button></header>
    <div class="sv-photo" data-sv-stage tabindex="0" role="button" aria-label="${name}'s sample story; tap sides to navigate, center to pause"><img src="${safeMediaUrl(story.image)}" alt="Sample story by ${name}" draggable="false"></div>
    <button class="sv-prev" data-sv="previous" aria-label="Previous story" ${storyViewerIndex===0?'disabled':''}><i data-lucide="chevron-left">‹</i></button>
    <button class="sv-next" data-sv="next" aria-label="Next story"><i data-lucide="chevron-right">›</i></button>
    <footer class="sv-footer">${own?'<p class="sv-own">Your sample story · Viewer insights are not connected.</p>':`<div class="sv-reactions" aria-label="Preview reaction options">${['❤️','😂','🔥','😍','👏'].map(emoji=>`<button data-sv="reaction" data-sv-emoji="${emoji}" aria-label="Preview ${emoji} reaction">${emoji}</button>`).join('')}</div><form data-sv-reply-form><input data-sv-reply maxlength="200" value="${escapeHTML(draft)}" placeholder="Draft a reply (not sent)" aria-label="Story reply draft"><button type="submit" aria-label="Preview reply">Preview</button></form>`}
    <p class="sv-local-note">Story preview only · Nothing is sent or published.</p>${status}</footer>
  </div>`;
}
function storyViewerProgress() {
  if(!storyViewerDialog)return;
  storyViewerDialog.querySelectorAll('[data-sv-progress]').forEach((bar,i)=>{
    bar.style.width=(i<storyViewerIndex?100:i>storyViewerIndex?0:Math.min(100,storyViewerElapsed/storyViewerDuration*100))+'%';
  });
}
function storyViewerPaint() {
  if(!storyViewerDialog)return;
  storyViewerDialog.innerHTML=storyViewerHTML();
  try{window.lucide?.createIcons?.();}catch{}
}
function storyViewerMove(delta) {
  const index=storyViewerIndex+delta;
  if(index>=storyViewerStories.length)return closeStoryViewer();
  storyViewerIndex=Math.max(0,index);
  storyViewerElapsed=0;storyViewerLastTick=Date.now();storyViewerStatus='';storyViewerPaused=!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  storyViewerPaint();
}
function storyViewerTick() {
  if(!storyViewerDialog)return;
  const now=Date.now(),elapsed=Math.min(250,Math.max(0,now-storyViewerLastTick));storyViewerLastTick=now;
  if(storyViewerPaused||storyViewerHold||document.hidden)return;
  storyViewerElapsed+=elapsed;
  if(storyViewerElapsed>=storyViewerDuration)return storyViewerMove(1);
  storyViewerProgress();
}
function storyViewerHandleClick(event) {
  const button=event.target.closest('[data-sv]');
  if(button){
    const action=button.dataset.sv;
    if(action==='close')return closeStoryViewer();
    if(action==='previous')return storyViewerMove(-1);
    if(action==='next')return storyViewerMove(1);
    if(action==='pause'){storyViewerPaused=!storyViewerPaused;return storyViewerPaint();}
    if(action==='reaction'){
      storyViewerStatus=`${button.dataset.svEmoji} reaction preview only — not delivered.`;
      storyViewerPaused=true;return storyViewerPaint();
    }
  }
  const stage=event.target.closest('[data-sv-stage]');
  if(!stage||Date.now()<storyViewerSwipeUntil)return;
  const rect=stage.getBoundingClientRect(),relative=(event.clientX-rect.left)/rect.width;
  if(relative<.32)return storyViewerMove(-1);
  if(relative>.68)return storyViewerMove(1);
  storyViewerPaused=!storyViewerPaused;storyViewerPaint();
}
function openSampleStory(id) {
  const state=getState();
  const stories=state.stories.filter(story=>story.expiresAt>Date.now()&&safeMediaUrl(story.image));
  const index=stories.findIndex(story=>story.id===id);
  if(index<0)return;
  closeAppDialog();
  storyViewerStories=stories;storyViewerIndex=index;storyViewerElapsed=0;storyViewerLastTick=Date.now();storyViewerPaused=!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;storyViewerHold=false;storyViewerStatus='';storyViewerDrafts={};
  const dialog=document.createElement('dialog'),opener=document.activeElement;
  dialog.className='story-viewer';dialog.setAttribute('aria-label','Crush.X Story viewer');
  dialog.addEventListener('close',()=>{if(storyViewerDialog===dialog)closeStoryViewer();if(opener?.isConnected)opener.focus();});
  dialog.addEventListener('click',storyViewerHandleClick);
  dialog.addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea'))return;
    if(event.key==='ArrowRight'){event.preventDefault();storyViewerMove(1);}
    if(event.key==='ArrowLeft'){event.preventDefault();storyViewerMove(-1);}
    if(event.key===' '){event.preventDefault();storyViewerPaused=!storyViewerPaused;storyViewerPaint();}
  });
  dialog.addEventListener('input',event=>{if(event.target.matches('[data-sv-reply]'))storyViewerDrafts[stories[storyViewerIndex].id]=event.target.value.slice(0,200);});
  dialog.addEventListener('focusin',event=>{if(event.target.matches('[data-sv-reply]')){storyViewerPaused=true;dialog.querySelector('[data-sv="pause"]')?.setAttribute('aria-label','Resume story');}});
  dialog.addEventListener('submit',event=>{
    if(!event.target.matches('[data-sv-reply-form]'))return;
    event.preventDefault();
    const value=(storyViewerDrafts[stories[storyViewerIndex].id]||'').trim();
    storyViewerStatus=value?'Reply preview saved in this viewer only — no message sent.':'Write a reply draft first.';
    storyViewerPaused=true;storyViewerPaint();
  });
  dialog.addEventListener('pointerdown',event=>{const stage=event.target.closest('[data-sv-stage]');if(stage){storyViewerHold=true;storyViewerStartX=event.clientX;stage.setPointerCapture?.(event.pointerId);}});
  dialog.addEventListener('pointerup',event=>{
    if(storyViewerStartX===null)return;
    const delta=event.clientX-storyViewerStartX;
    storyViewerStartX=null;storyViewerHold=false;storyViewerLastTick=Date.now();
    if(Math.abs(delta)>55){storyViewerSwipeUntil=Date.now()+250;storyViewerMove(delta<0?1:-1);}
  });
  dialog.addEventListener('pointercancel',()=>{storyViewerHold=false;storyViewerStartX=null;});
  document.body.append(dialog);storyViewerDialog=dialog;
  storyViewerPaint();dialog.showModal();
  storyViewerTimer=setInterval(storyViewerTick,80);
}
renderHome = function(state) {
  const posts = state.posts.filter(post => appFeedFilter !== 'following' || post.userId === state.currentUserId || userById(state, post.userId)?.following);
  return originalHome({...state, posts}, appFeedFilter);
};
renderDiscover = function(state) {
  const query=state.searchQuery.trim().toLowerCase();
  const categories=[['all','All'],['people','People'],['posts','Posts'],['reels','Reels'],['tags','Tags']];
  const users=state.users.filter(user=>`${user.username} ${user.fullName} ${user.info}`.toLowerCase().includes(query));
  const allMedia=[...state.posts.map(item=>({...item,kind:'post'})),...state.reels.map(item=>({...item,kind:'reel'}))];
  const media=allMedia.filter(item=>(appExploreFilter==='all'||appExploreFilter==='posts'&&item.kind==='post'||appExploreFilter==='reels'&&item.kind==='reel')&&`${item.caption} ${userById(state,item.userId)?.username||''}`.toLowerCase().includes(query));
  const tags=[...new Set(allMedia.flatMap(item=>item.caption.match(/#[\p{L}\p{N}_]{2,40}/gu)||[]).map(tag=>tag.slice(1)))].slice(0,30);
  const visibleTags=tags.filter(tag=>!query||tag.toLowerCase().includes(query.replace(/^#/,'')));
  const showPeople=appExploreFilter==='all'||appExploreFilter==='people',showMedia=['all','posts','reels'].includes(appExploreFilter),showTags=appExploreFilter==='all'||appExploreFilter==='tags';
  return `<main class="explore-screen" aria-label="Discover sample content">
    <header class="explore-heading"><h1>Explore</h1><p>Discover sample creators and media on Crush.X</p></header>
    <label class="explore-search"><i data-lucide="search" aria-hidden="true">⌕</i><input id="searchInput" value="${escapeHTML(state.searchQuery)}" maxlength="200" placeholder="Search people, posts, hashtags…" aria-label="Search local sample content"></label>
    <nav class="explore-filters" aria-label="Explore filters">${categories.map(([id,label])=>`<button data-explore-filter="${id}" aria-pressed="${appExploreFilter===id}">${label}</button>`).join('')}</nav>
    ${showTags?`<section class="explore-tags" aria-label="Sample hashtags"><h2>Hashtags</h2><div>${visibleTags.map(tag=>`<button data-explore-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>`).join('')||'<p>No matching hashtags in sample captions.</p>'}</div></section>`:''}
    ${showPeople?`<section class="explore-people" aria-label="People"><h2>People</h2>${users.length?users.slice(0,appExploreFilter==='all'?5:30).map(user=>`<article><img src="${safeMediaUrl(user.avatar)}" alt=""><div><button class="cx-creator-link" data-profile-user="${escapeHTML(user.id)}" aria-label="Open ${escapeHTML(user.username)} sample profile">@${escapeHTML(user.username)}</button><small>${escapeHTML(user.fullName)}</small></div>${user.id===state.currentUserId?'<span>Sample persona</span>':`<button data-follow-user="${escapeHTML(user.id)}" aria-pressed="${user.following}">${user.following?'Following':'Follow'}</button>`}</article>`).join(''):'<p>No matching sample people.</p>'}</section>`:''}
    ${showMedia?`<section class="explore-media" aria-label="Explore media"><h2>${appExploreFilter==='reels'?'Reels':appExploreFilter==='posts'?'Posts':'Media'}</h2><div class="explore-grid">${media.map(item=>{
      const src=safeMediaUrl(item.source||item.image),video=item.mediaType==='video'||item.contentType?.startsWith('video/')||/\.(mp4|webm)(?:[?#]|$)/i.test(item.source||'');
      return `<button data-open-local-item="${escapeHTML(item.id)}" aria-label="Open sample ${item.kind}">${video?`<video src="${src}" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>`:`<img src="${src}" alt="Sample ${item.kind} thumbnail">`}<span>${item.kind==='reel'?'Reel':'Post'}</span></button>`;
    }).join('')}</div>${media.length?'':'<p>No matching sample media.</p>'}</section>`:''}
    <p class="explore-disclaimer">Local examples only · Live trends, search ranking and hashtags are not connected.</p>
  </main>`;
};
function openSampleActivity() {
  const state = getState();
  const liked = [...state.posts, ...state.reels].filter(item => item.liked).length;
  const saved = [...state.posts, ...state.reels].filter(item => item.saved).length;
  const followed = state.users.filter(user => user.following).length;
  appDialog('Activity', `<p class="text-sm text-slate-500">This is your local activity preview. Live notifications are not connected.</p><div class="mt-4 space-y-3"><p>❤️ Liked posts and reels: <strong>${liked}</strong></p><p>🔖 Saved posts and reels: <strong>${saved}</strong></p><p>👥 Following sample profiles: <strong>${followed}</strong></p></div><button data-activity-saved class="mt-5 w-full rounded-xl gradient-main p-3 font-bold text-white">View saved posts</button>`, dialog => {
    dialog.querySelector('[data-activity-saved]').onclick = () => { dialog.close(); appProfileFilter = 'saved'; navigate('profile'); };
  });
}
function openSamplePostOptions(postId) {
  const state = getState();
  const post = state.posts.find(item => item.id === postId);
  if (!post) return;
  const author = userById(state, post.userId);
  appDialog('Post options', `<p class="text-sm text-slate-500">Sample content · Actions stay in this browser.</p><div class="mt-4 grid gap-3"><button data-option-save class="rounded-xl border p-3 text-left">${post.saved ? 'Remove from saved' : 'Save post'}</button>${author && author.id !== state.currentUserId ? `<button data-option-follow class="rounded-xl border p-3 text-left">${author.following ? 'Unfollow' : 'Follow'} ${escapeHTML(author.username)}</button>` : ''}<button data-option-share class="rounded-xl border p-3 text-left">Share media link</button></div>`, dialog => {
    dialog.querySelector('[data-option-save]').onclick = () => { dialog.close(); const s=getState(), p=s.posts.find(item=>item.id===postId); if(p){p.saved=!p.saved;saveState(s);renderApp();} };
    const follow = dialog.querySelector('[data-option-follow]');
    if (follow) follow.onclick = () => { dialog.close(); const s=getState(), u=s.users.find(item=>item.id===post.userId); if(u){u.following=!u.following;u.followers=Math.max(0,Number(u.followers)+(u.following?1:-1));saveState(s);renderApp();} };
    dialog.querySelector('[data-option-share]').onclick = () => { dialog.close(); [...document.querySelectorAll('[data-share]')].find(button=>button.dataset.share===postId)?.click(); };
  });
}
renderProfile = function(state) {
  const me = currentUser(state);
  const own = state.posts.filter(post => post.userId === me.id);
  const saved = [...state.posts, ...state.reels].filter(post => post.saved);
  let html = originalProfile(state).replace('<div class="font-black">416</div>', `<div class="font-black">${state.users.filter(user => user.following).length}</div>`).replace(`<div class="font-black">${state.posts.length}</div>`, `<div class="font-black">${own.length}</div>`);
  html = html.replace('Soft sunsets, coffee, and city lights ✨', escapeHTML(me.info));
  const items = appProfileFilter === 'saved' ? saved : own;
  return html.replace('</section>', `<div class="mt-5 flex flex-wrap gap-3"><button data-edit-sample class="border rounded-lg px-4 py-2">Edit sample profile</button><button data-profile-filter="posts" aria-pressed="${appProfileFilter === 'posts'}" class="border rounded-lg px-4 py-2">Posts · ${own.length}</button><button data-profile-filter="saved" aria-pressed="${appProfileFilter === 'saved'}" class="border rounded-lg px-4 py-2">Saved · ${saved.length}</button></div><div class="app-media-grid">${items.map(item => `<button data-open-local-item="${escapeHTML(item.id)}" aria-label="Open ${appProfileFilter === 'saved' ? 'saved' : 'sample'} post">${item.contentType?.startsWith('video/') || item.mediaType === 'video' ? `<video src="${safeMediaUrl(item.source)}" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>` : `<img src="${safeMediaUrl(item.image || item.source)}" alt="Sample post thumbnail">`}</button>`).join('')}</div>${items.length ? '' : '<p class="mt-5 text-sm text-slate-500">Nothing saved yet. Use the bookmark on a post or reel.</p>'}</section>`);
};
renderReels = function(state) {
  if(!state.reels.length)return '<main class="glass rounded-[2rem] p-5">No reels yet.</main>';
  const glyph=(name,fallback)=>`<i data-lucide="${name}" aria-hidden="true">${fallback}</i>`;
  return `<main class="reels-deck" aria-label="Reels, swipe vertically to change" tabindex="0">${state.reels.map((reel,i)=>{
    const creator=userById(state,reel.userId)||currentUser(state);
    const src=safeMediaUrl(reel.source),id=escapeHTML(reel.id);
    const video=reel.mediaType==='video'||reel.contentType?.startsWith('video/')||/\.(mp4|webm|mov)(?:[?#]|$)/i.test(reel.source);
    const comments=Array.isArray(reel.comments)?reel.comments:[];
    return `<section class="reel-slide" data-reel-slide="${id}" aria-label="Reel ${i+1} of ${state.reels.length}">
      <div class="reel-visual" data-reel-visual="${id}">${video?`<video src="${src}" data-reel-video="${id}" muted loop playsinline controls preload="metadata" aria-label="Reel video"></video>`:`<img src="${src}" alt="Sample image reel by ${escapeHTML(creator.username)}"><span class="reel-image-note">Sample photo reel</span>`}</div>
      <div class="reel-rail" aria-label="Reel actions">
        <button data-like="${id}" aria-pressed="${!!reel.liked}" aria-label="${reel.liked?'Unlike':'Like'} reel">${glyph('heart','♡')}<span>${Number(reel.likes).toLocaleString()}</span></button>
        <button data-comment-focus="${id}" aria-label="Open comments">${glyph('message-circle','▢')}<span>${comments.length}</span></button>
        <button data-share="${id}" aria-label="Share media link">${glyph('send','↗')}<span>Share</span></button>
        <button data-save="${id}" aria-pressed="${!!reel.saved}" aria-label="${reel.saved?'Unsave':'Save'} reel">${glyph('bookmark','♧')}<span>${reel.saved?'Saved':'Save'}</span></button>
        <button data-reel-speed="${id}" aria-label="Change playback speed">${glyph('gauge','◷')}<span>1×</span></button>
        <button data-reel-mute="${id}" aria-label="Unmute reel">${glyph('volume-x','♩')}<span>Sound</span></button>
      </div>
      <div class="reel-details"><div class="reel-creator"><img src="${safeMediaUrl(creator.avatar)}" alt=""><button data-profile-user="${escapeHTML(creator.id)}" aria-label="Open ${escapeHTML(creator.username)} sample profile">@${escapeHTML(creator.username)}</button>${creator.id!==state.currentUserId?`<button data-follow-user="${escapeHTML(creator.id)}" aria-pressed="${creator.following}">${creator.following?'Following':'Follow'}</button>`:''}</div>
      <p class="reel-caption">${formatText(reel.caption)}</p>
      <button data-reel-audio="${id}" class="reel-audio" aria-label="Audio details">${glyph('music-2','♫')} ${escapeHTML(reel.artist||'Original Audio')} · ${escapeHTML(reel.song||'Original Audio')}</button>
      <div class="reel-extra"><button data-reel-template="${id}">${glyph('layout-template','▦')} Template</button><button data-reel-caption="${id}" aria-pressed="false">${glyph('captions','CC')} Caption</button></div>
      <div class="reel-comment-box"><input data-comment-input="${id}" maxlength="2000" placeholder="Local comment…" aria-label="Local reel comment"><button data-comment-send="${id}">Post</button></div>
      <p class="reel-sample-note">Local sample preview · No live view or share counts</p></div>
    </section>`;
  }).join('')}</main>`;
};
function bindReelControls() {
  reelObserver?.disconnect();reelObserver=null;
  const slides=[...document.querySelectorAll('.reel-slide')];
  if(!slides.length)return;
  const videos=[...document.querySelectorAll('[data-reel-video]')];
  if(window.IntersectionObserver){
    reelObserver=new window.IntersectionObserver(entries=>{
      for(const entry of entries){
        const video=entry.target.querySelector('video');if(!video)continue;
        if(entry.isIntersecting&&entry.intersectionRatio>=.6)video.play().catch(()=>{});
        else video.pause();
      }
    },{root:document.querySelector('.reels-deck'),threshold:[0,.6,1]});
    slides.forEach(slide=>reelObserver.observe(slide));
  }else videos[0]?.play?.().catch(()=>{});
  // One wheel burst / touch swipe / arrow press advances at most one reel.
  // Gesture listeners are scoped to the reel deck; comments, buttons and forms retain their own input behavior.
  const deck = document.querySelector('.reels-deck');
  if (deck && slides.length > 1) {
    let gestureLockUntil = 0, wheelDistance = 0, wheelDirection = 0, lastWheelAt = 0;
    let touchStart = null;
    const moveOne = direction => {
      const now = Date.now();
      if (now < gestureLockUntil || !direction) return false;
      const height = deck.clientHeight;
      if (height <= 0) return false;
      const current = Math.max(0, Math.min(slides.length - 1, Math.round(deck.scrollTop / height)));
      const next = Math.max(0, Math.min(slides.length - 1, current + Math.sign(direction)));
      if (next === current) return false;
      gestureLockUntil = now + 550;
      deck.scrollTo({ top: next * height, behavior: 'smooth' });
      return true;
    };
    deck.addEventListener('wheel', event => {
      if (event.ctrlKey || event.target.closest('input, textarea, select, [contenteditable], .caption-expanded .reel-caption')) return;
      event.preventDefault();
      const now = Date.now();
      if (now < gestureLockUntil) return;
      const amount = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * deck.clientHeight : event.deltaY;
      const direction = Math.sign(amount);
      if (!direction) return;
      if (now - lastWheelAt > 220 || direction !== wheelDirection) wheelDistance = 0;
      lastWheelAt = now;
      wheelDirection = direction;
      wheelDistance += Math.abs(amount);
      if (wheelDistance >= 35) { wheelDistance = 0; moveOne(direction); }
    }, { passive: false });
    deck.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.target.closest('input, textarea, select, button, [contenteditable]')) return;
      event.preventDefault();
      moveOne(event.key === 'ArrowDown' ? 1 : -1);
    });
    deck.addEventListener('touchstart', event => {
      touchStart = null;
      if (event.touches.length !== 1 || !event.target.closest('.reel-visual')) return;
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    deck.addEventListener('touchend', event => {
      if (!touchStart || event.changedTouches.length !== 1) { touchStart = null; return; }
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dy) >= 48 && Math.abs(dy) > Math.abs(dx) * 1.3) moveOne(dy < 0 ? 1 : -1);
    }, { passive: true });
    deck.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  }
  document.querySelectorAll('[data-reel-speed]').forEach(button=>button.addEventListener('click',()=>{
    const video=button.closest('.reel-slide')?.querySelector('video');
    if(!video)return appDialog('Playback speed','<p>This sample reel is an image. Speed controls work on videos only.</p>');
    const rates=[.5,1,1.5,2],next=rates[(rates.indexOf(video.playbackRate)+1)%rates.length];
    video.playbackRate=next;button.querySelector('span').textContent=next+'×';
  }));
  document.querySelectorAll('[data-reel-mute]').forEach(button=>button.addEventListener('click',()=>{
    const video=button.closest('.reel-slide')?.querySelector('video');
    if(!video)return appDialog('Audio','<p>This sample reel has no soundtrack. Choose your own audio in Story Studio.</p>');
    video.muted=!video.muted;button.setAttribute('aria-label',video.muted?'Unmute reel':'Mute reel');button.querySelector('span').textContent=video.muted?'Sound':'Mute';
  }));
  document.querySelectorAll('[data-reel-caption]').forEach(button=>button.addEventListener('click',()=>{
    const details=button.closest('.reel-details');if(!details)return;
    const expanded=details.classList.toggle('caption-expanded');button.setAttribute('aria-pressed',String(expanded));
  }));
  document.querySelectorAll('[data-reel-visual]').forEach(media=>media.addEventListener('dblclick',()=>{
    const slide=media.closest('.reel-slide'),like=slide?.querySelector('[data-like]');
    if(like?.getAttribute('aria-pressed')==='false')like.click();
  }));
  document.querySelectorAll('[data-reel-audio]').forEach(button=>button.addEventListener('click',()=>{
    const reel=getState().reels.find(item=>item.id===button.dataset.reelAudio);if(!reel)return;
    appDialog('Reel audio',`<p class="mb-2 font-bold">${escapeHTML(reel.artist||'Original Audio')} · ${escapeHTML(reel.song||'Original Audio')}</p><p class="text-sm text-slate-500">Audio metadata is from sample content. Licensed catalog and Use Audio from this reel are not connected.</p><button data-own-audio class="mt-4 rounded-xl border p-3">Choose my own audio for a Story</button>`,dialog=>{
      dialog.querySelector('[data-own-audio]').onclick=()=>{dialog.close();openStoryStudio();ssSession.view='editor';ssSession.panel='music';ssRender();};
    });
  }));
  document.querySelectorAll('[data-reel-template]').forEach(button=>button.addEventListener('click',()=>{
    openStoryStudio();ssSession.view='editor';ssSession.panel='restyle';ssRender();
  }));
}
renderCreate = function() {
  const field=(name,label,value,limit)=>`<label class="pc-field">${label}<input data-pc-field="${name}" maxlength="${limit}" value="${escapeHTML(value)}" class="w-full border rounded-xl px-3 py-2 bg-transparent" /></label>`;
  const toggle=(name,label)=>`<label class="pc-toggle"><span>${label}</span><input type="checkbox" data-pc-toggle="${name}" ${pcDraft[name]?'checked':''}></label>`;
  const controls=`<section class="pc-options" aria-label="Post editor options">
    <p class="pc-disclaimer">Reference-inspired draft options · Local preview only; these settings are not sent to a publishing service.</p>
    <h2>Photo and video adjustment</h2>
    <nav class="pc-chips" aria-label="Preview filters">${Object.keys(pcFilters).map(name=>`<button data-pc-filter="${name}" aria-pressed="${pcDraft.filter===name}">${name}</button>`).join('')}</nav>
    <nav class="pc-chips" aria-label="Crop preview ratio">${Object.keys(pcRatios).map(name=>`<button data-pc-ratio="${name}" aria-pressed="${pcDraft.ratio===name}">${name==='Story'?'9:16':name==='Portrait'?'4:5':name==='Square'?'1:1':'Original'}</button>`).join('')}</nav>
    <h2>Details</h2>
    ${field('location','Add location (manual)',pcDraft.location,90)}
    ${field('tags','Tag people (sample @handles, comma-separated)',pcDraft.tags,200)}
    <button type="button" class="cXmusic-trigger" data-cxmusic-open="post">Browse licensed Music Library</button>
    <p class="pc-disclaimer">Test catalog · CC BY 4.0 artist credit required. Audio preview does not mix into exported media.</p>
    <label class="pc-field">Add audio from this device <input type="file" data-pc-audio accept="audio/*" aria-label="Choose optional local audio"></label>
    <div data-pc-audio-preview>${pcDraft.audioUrl?`<p>♫ ${escapeHTML(pcDraft.audioName)}</p><audio src="${pcDraft.audioUrl}" controls></audio><button data-pc-remove-audio type="button">Remove audio</button>`:'<p class="pc-disclaimer">No audio selected. This audio is for review only; it is not mixed into the post.</p>'}</div>
    <label class="pc-field">Audience<select data-pc-audience class="w-full border rounded-xl px-3 py-2 bg-transparent">${['Everyone','Followers','Close Friends'].map(value=>`<option ${pcDraft.audience===value?'selected':''}>${value}</option>`).join('')}</select></label>
    <label class="pc-toggle"><span>Add a poll to this draft</span><input type="checkbox" data-pc-toggle="poll" ${pcDraft.poll?'checked':''}></label>
    <div data-pc-poll class="pc-poll ${pcDraft.poll?'':'hidden'}">${field('pollQuestion','Poll question',pcDraft.pollQuestion,120)}${field('pollOne','Option 1',pcDraft.pollOne,45)}${field('pollTwo','Option 2',pcDraft.pollTwo,45)}<p class="pc-disclaimer">No votes are collected.</p></div>
    <button data-pc-more aria-expanded="${pcDraft.moreOpen}" class="pc-more">More options <i data-lucide="chevron-down" aria-hidden="true"></i></button>
    <div data-pc-advanced class="${pcDraft.moreOpen?'':'hidden'}">${toggle('hideLikes','Hide like and view counts in draft')}${toggle('hideComments','Turn off comments (preview only)')}${toggle('onlyProfile','Only show on sample profile')}${toggle('aiLabel','Add AI-generated content label')}<p class="pc-disclaimer">Actual distribution, privacy and moderation need backend support.</p></div>
    <button data-pc-review class="pc-review" type="button">Review selected options</button>
  </section>`;
  return originalCreate().replace('id="captionInput"', 'id="captionInput" maxlength="2200"').replace('</textarea>', `${escapeHTML(captionDraft)}</textarea>`).replace('</section>', `${controls}</section>`);
};
function pcApplyPreview() {
  const preview=document.getElementById('mediaPreview');if(!preview)return;
  preview.style.filter=pcFilters[pcDraft.filter];
  preview.style.aspectRatio=pcRatios[pcDraft.ratio];
  preview.style.maxHeight=pcDraft.ratio==='Original'?'':'min(65vh,540px)';
  const media=preview.querySelector('img,video');if(media){media.style.width='100%';media.style.height=pcDraft.ratio==='Original'?'auto':'100%';media.style.objectFit='cover';media.style.maxHeight='100%';}
}
function pcReview() {
  const options=[`Audience: ${pcDraft.audience}`,`Preview filter: ${pcDraft.filter}`,`Crop: ${pcDraft.ratio}`,`Location: ${pcDraft.location||'None'}`,`Tagged sample handles: ${pcDraft.tags||'None'}`,`Audio: ${pcDraft.audioName||'None'}`,`Music credit: ${pcDraft.audioCredit||'None'}`,`Poll: ${pcDraft.poll?(pcDraft.pollQuestion||'Untitled'):'Off'}`,`Hide counts: ${pcDraft.hideLikes?'On':'Off'}`,`Comments: ${pcDraft.hideComments?'Off':'On'}`,`Profile only: ${pcDraft.onlyProfile?'Yes':'No'}`,`AI label: ${pcDraft.aiLabel?'On':'Off'}`];
  appDialog('Review post draft',`<ul class="space-y-2">${options.map(value=>`<li>${escapeHTML(value)}</li>`).join('')}</ul><p class="mt-4 text-sm text-slate-500">These are local draft options. No post, poll, tag notification, location or audience change is published.</p>`);
}
bindRepairEvents = function() {
  originalRepairEvents();
  bindReelControls();
  const on = (selector, fn) => document.querySelectorAll(selector).forEach(button => button.addEventListener('click', () => fn(button)));
  on('[data-feed-filter]', button => { appFeedFilter = button.dataset.feedFilter; renderApp(); });
  document.getElementById('activityButton')?.addEventListener('click', openSampleActivity);
  on('[data-story-create]', () => openStoryStudio());
  on('[data-post-options]', button => openSamplePostOptions(button.dataset.postOptions));
  document.querySelectorAll('[data-feed-media]').forEach(media => media.addEventListener('dblclick', () => {
    const post = getState().posts.find(item => item.id === media.dataset.feedMedia);
    if (!post || post.liked) return;
    [...document.querySelectorAll('[data-like]')].find(button => button.dataset.like === post.id)?.click();
  }));
  on('[data-profile-filter]', button => { appProfileFilter = button.dataset.profileFilter; renderApp(); });
  on('[data-explore-filter]', button => { appExploreFilter=button.dataset.exploreFilter;renderApp(); });
  on('[data-explore-tag]', button => { const state=getState();state.searchQuery='#'+button.dataset.exploreTag;appExploreFilter='all';saveState(state);renderApp(); });
  on('[data-open-local-item]', button => openGridMedia(button.dataset.openLocalItem));
  on('[data-profile-user]', button => {
    const state = getState();
    const user = userById(state, button.dataset.profileUser);
    if (!user) return;
    appProfileReturnTab = state.activeTab;
    appProfileOpenedInSession = true;
    navigate('profile', user.id === state.currentUserId ? null : user.id);
  });
  on('[data-profile-back]', () => {
    if (appProfileOpenedInSession) { appProfileOpenedInSession = false; history.back(); }
    else navigate(appProfileReturnTab === 'profile' ? 'home' : appProfileReturnTab);
  });
  on('[data-open-story]', button => openSampleStory(button.dataset.openStory));
  document.getElementById('sampleModeInfo')?.addEventListener('click', () => appDialog('Sample mode', '<p>Stories, likes, follows, saved items, profile edits and comments use sample data in this browser. Other people using this browser may see them.</p><p class="mt-3">Message drafts are never delivered. Publishing is not connected. Drafts are cleared on logout. Your Cognito account is separate from the sample profile.</p>'));
  document.getElementById('captionInput')?.addEventListener('input', event => { captionDraft = event.target.value.slice(0, 2200); });
  document.getElementById('mediaInput')?.addEventListener('change', pcApplyPreview);
  document.querySelector?.('[data-pc-audio]')?.addEventListener('change',event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('audio/')||!file.size||file.size>20*1024*1024){alert('Choose an audio file up to 20 MB.');event.target.value='';return;}
    if(pcDraft.audioUrl)URL.revokeObjectURL(pcDraft.audioUrl);
    pcDraft.audioUrl=URL.createObjectURL(file);pcDraft.audioName=file.name;
    const box=document.querySelector?.('[data-pc-audio-preview]');if(box){box.innerHTML='';const name=document.createElement('p');name.textContent='♫ '+file.name;const player=document.createElement('audio');player.src=pcDraft.audioUrl;player.controls=true;box.append(name,player);}
  });
  on('[data-pc-remove-audio]',()=>{if(pcDraft.audioUrl)URL.revokeObjectURL(pcDraft.audioUrl);pcDraft.audioUrl='';pcDraft.audioName='';const box=document.querySelector?.('[data-pc-audio-preview]');if(box)box.textContent='No audio selected.';});
  const updatePressed=(selector,chosen)=>document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[selector==='[data-pc-filter]'?'pcFilter':'pcRatio']===chosen)));
  on('[data-pc-filter]', button=>{pcDraft.filter=button.dataset.pcFilter;updatePressed('[data-pc-filter]',pcDraft.filter);pcApplyPreview();});
  on('[data-pc-ratio]', button=>{pcDraft.ratio=button.dataset.pcRatio;updatePressed('[data-pc-ratio]',pcDraft.ratio);pcApplyPreview();});
  document.querySelectorAll('[data-pc-field]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.pcField;pcDraft[key]=input.value.slice(0,key==='tags'?200:key==='location'?90:key==='pollQuestion'?120:45);}));
  document.querySelector?.('[data-pc-audience]')?.addEventListener('change',event=>{pcDraft.audience=['Everyone','Followers','Close Friends'].includes(event.target.value)?event.target.value:'Everyone';});
  document.querySelectorAll('[data-pc-toggle]').forEach(input=>input.addEventListener('change',()=>{const key=input.dataset.pcToggle;pcDraft[key]=input.checked;if(key==='poll')document.querySelector?.('[data-pc-poll]')?.classList.toggle('hidden',!pcDraft.poll);}));
  on('[data-pc-more]',button=>{pcDraft.moreOpen=!pcDraft.moreOpen;button.setAttribute('aria-expanded',String(pcDraft.moreOpen));document.querySelector?.('[data-pc-advanced]')?.classList.toggle('hidden',!pcDraft.moreOpen);});
  on('[data-pc-review]',pcReview);
  pcApplyPreview();
  on('[data-edit-sample]', () => {
    const me = currentUser(getState());
    appDialog('Edit sample profile', `<form data-edit-sample-form><label>Name<input data-sample-name value="${escapeHTML(me.fullName)}" maxlength="80" required class="w-full border rounded-lg p-3 mt-1 mb-4 bg-transparent"></label><label>Bio<textarea data-sample-bio maxlength="150" class="w-full border rounded-lg p-3 mt-1 bg-transparent">${escapeHTML(me.info)}</textarea></label><p class="text-xs text-slate-500 my-3">Saved in this browser. Your Cognito account is unchanged.</p><button class="gradient-main rounded-lg p-3 text-white">Save</button></form>`, dialog => {
      dialog.querySelector('form').onsubmit = event => {
        event.preventDefault();
        const name = dialog.querySelector('[data-sample-name]').value.trim();
        if (!name) return;
        const state = getState(), user = currentUser(state);
        user.fullName = name.slice(0, 80); user.info = dialog.querySelector('[data-sample-bio]').value.slice(0, 150);
        saveState(state); dialog.close(); renderApp();
      };
    });
  });
};
renderApp = function() {
  if (document.getElementById('authOverlay')?.style.display !== 'none') closeAppDialog();
  const reelScroll=document.querySelector?.('.reels-deck')?.scrollTop;
  originalRenderApp();
  // Failed sample media is visibly marked, with no repeated network retry loop.
  document.querySelectorAll('main .feed-media img, main .feed-media video, main .explore-grid img, main .explore-grid video, main .app-media-grid img, main .app-media-grid video').forEach(media => {
    const unavailable = () => { if (media.isConnected) media.parentElement?.classList.add('cx-media-unavailable'); };
    media.addEventListener('error', unavailable, { once: true });
    if (media.tagName === 'IMG' && media.complete && media.currentSrc && media.naturalWidth === 0) unavailable();
  });
  if(Number.isFinite(reelScroll)){const deck=document.querySelector?.('.reels-deck');if(deck)deck.scrollTop=reelScroll;}
};
logout = function() { closeAppDialog(); captionDraft = ''; if(pcDraft.audioUrl)URL.revokeObjectURL(pcDraft.audioUrl);pcDraft=pcFresh(); originalLogout(); };
