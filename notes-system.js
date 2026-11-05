// Crush.X Notes UI: browser-local preview; remote publication is not configured.
(() => {
  'use strict';
  const model = window.CrushXNotesModel;
  if (!model || typeof renderMessages !== 'function') return;
  const NOTE_KEY='crushx.notes.preview.v1', FRIENDS_KEY='crushx.notes.close-friends.preview.v1';
  const tracks=[
    {id:'soft-glow', name:'Soft Glow', melody:[261.63,329.63,392,523.25,392,329.63]},
    {id:'city-lights', name:'City Lights', melody:[220,329.63,440,369.99,329.63,261.63]},
    {id:'golden-hour', name:'Golden Hour', melody:[293.66,369.99,440,587.33,493.88,369.99]}
  ];
  const stickers={sparkle:'✨',heart:'💗',fire:'🔥',smile:'🥰'};
  const e=value=>escapeHTML(value==null?'':String(value));
  const readState=()=>getState();
  const memory={};
  function read(key){try{const v=localStorage.getItem(key);return v===null?(memory[key]??null):v;}catch{return memory[key]??null;}}
  function write(key,value){
    if(value===null)delete memory[key];else memory[key]=value;
    try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}
  }
  function activeNote(){
    let value;try{value=JSON.parse(read(NOTE_KEY)||'null');}catch{value=null;}
    const note=model.active(value);
    if(!note && value)write(NOTE_KEY,null);
    return note;
  }
  function readFriends(){
    let ids;try{ids=JSON.parse(read(FRIENDS_KEY)||'[]');}catch{ids=[];}
    return model.sanitizeFriends(ids,readState().users.map(u=>u.id));
  }
  const track=id=>tracks.find(t=>t.id===id);
  const audienceName=id=>id==='close'?'Close Friends':'Friends';
  const beforeMessages=renderMessages;
  renderMessages=function(s){
    const html=beforeMessages(s);
    if(s.chatUserId||typeof html!=='string')return html;
    const me=currentUser(s),note=activeNote();
    const content=note?(note.text||track(note.song)?.name||stickers[note.sticker]||'Your note'):'';
    const bar=`<section class="cxn-rail" aria-label="Notes">
      <div class="cxn-rail-title"><strong>Notes</strong><span>24-hour note</span></div>
      <div class="cxn-rail-strip"><button type="button" class="cxn-own" data-cxn-open aria-label="${note?'Edit your note':'Add your note'}">
        <span class="cxn-head"><img src="${safeMediaUrl(me.avatar)}" alt="">
          ${note?`<span class="cxn-preview-bubble">${e(content)}</span>`:'<span class="cxn-plus" aria-hidden="true">+</span>'}
        </span><small>${note?'Your note':'Leave a note'}</small></button></div>
      <p class="cxn-disclaimer">Local preview only · Notes are not visible to other accounts yet.</p>
    </section>`;
    return html.replace('<main>','<main>'+bar);
  };

  let dialog=null,draft=null,panel='',selected=[],priorFocus=null,sound=null,toastTimer=null;
  function ensureDialog(){
    if(dialog?.isConnected)return dialog;
    dialog=document.createElement('dialog');
    dialog.className='cxn-dialog';
    dialog.setAttribute('aria-label','Create a note');
    dialog.addEventListener('close',()=>{stopAudio();panel='';priorFocus?.focus?.();});
    dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close();else clickInside(ev);});
    dialog.addEventListener('input',inputInside);
    dialog.addEventListener('change',changeInside);
    document.body.append(dialog);
    return dialog;
  }
  function open(){
    if(document.getElementById('authOverlay')?.style.display!=='none')return;
    draft=model.clean(activeNote()||{});
    selected=readFriends();panel='';priorFocus=document.activeElement;
    const node=ensureDialog();render();if(!node.open)node.showModal();
    node.querySelector('[data-cxn-text]')?.focus({preventScroll:true});
  }
  function stopAudio(){if(sound){try{sound.close();}catch{}sound=null;}}
  function toast(value){
    const box=dialog?.querySelector('[data-cxn-toast]');
    if(!box)return;
    box.hidden=false;box.textContent=value;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(box.isConnected)box.hidden=true;},3200);
  }
  function audioPreview(id){
    stopAudio();
    const t=track(id),Ctor=window.AudioContext||window.webkitAudioContext;
    if(!t||!Ctor){toast('Audio preview is unavailable.');return;}
    try{
      const ctx=sound=new Ctor(),start=ctx.currentTime+.07;
      t.melody.forEach((frequency,index)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain(),at=start+index*.28;
        osc.type='sine';osc.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.13,at+.03);
        gain.gain.exponentialRampToValueAtTime(.001,at+.26);
        osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+.27);
      });
      setTimeout(()=>{if(sound===ctx)stopAudio();},2600);
      toast('Playing an original demo sound.');
    }catch{stopAudio();toast('Audio could not play.');}
  }
  const hasContent=()=>!!(draft.text.trim()||draft.song||draft.sticker);
  function allowedTags(){
    const users=readState().users.filter(u=>u.id!=='me');
    return draft.audience==='close'?users.filter(u=>selected.includes(u.id)):users.filter(u=>u.following);
  }
  function render(){
    if(!draft||!dialog)return;
    const me=currentUser(readState()),live=activeNote(),chips=[];
    const chosen=track(draft.song);
    if(chosen)chips.push(`<span class="cxn-chip">♫ <span>${e(chosen.name)}</span><button type="button" data-cxn="remove-song" aria-label="Remove song">×</button></span>`);
    if(draft.location)chips.push(`<span class="cxn-chip">📍 <span>${e(draft.location)}</span><button type="button" data-cxn="remove-location" aria-label="Remove location">×</button></span>`);
    if(draft.tag)chips.push(`<span class="cxn-chip">@ <span>${e(readState().users.find(u=>u.id===draft.tag)?.username||draft.tag)}</span><button type="button" data-cxn="remove-tag" aria-label="Remove tag">×</button></span>`);
    if(draft.sticker)chips.push(`<span class="cxn-chip">${stickers[draft.sticker]||''} <span>Animated sticker</span><button type="button" data-cxn="remove-sticker" aria-label="Remove sticker">×</button></span>`);
    dialog.innerHTML=`<div class="cxn-screen">
      <div class="cxn-top"><button type="button" data-cxn="close" aria-label="Close">×</button><span>New note</span><span class="cxn-top-spacer"></span></div>
      <div class="cxn-content">
        <div class="cxn-preview-wrap">
          <div class="cxn-bubble cxn-color-${e(draft.color)}"><textarea data-cxn-text maxlength="60" rows="2" aria-label="Your note" placeholder="Note...">${e(draft.text)}</textarea></div>
          <img class="cxn-avatar" src="${safeMediaUrl(me.avatar)}" alt="Your profile picture">
          <button type="button" class="cxn-color-button" data-cxn="colors" aria-label="Change note color">🎨</button>
        </div>
        <div class="cxn-tools" aria-label="Note attachments">
          <button type="button" data-cxn="music" aria-label="Add song" aria-pressed="${!!draft.song}">🎵</button>
          <button type="button" data-cxn="location" aria-label="Add location" aria-pressed="${!!draft.location}">📍</button>
          <button type="button" data-cxn="sticker" aria-label="Add animated sticker" aria-pressed="${!!draft.sticker}"><b style="font-size:16px;color:#11bc73">GIF</b></button>
        </div>
        <p class="cxn-counter"><span data-cxn-count>${draft.text.length}</span> / 60 characters</p>
        <div class="cxn-extras">${chips.join('')}</div>
      </div>
      <p class="cxn-hint">Lasts 24 hours · Preview on your device; not a live share.</p>
      <div class="cxn-foot">
        <button type="button" class="cxn-audience-open" data-cxn="audience">♧ ${audienceName(draft.audience)} ❯</button>
        <div style="display:flex;align-items:center;gap:8px">
          ${live?'<button type="button" class="cxn-delete" data-cxn="delete">Delete</button>':''}
          <button type="button" class="cxn-share" data-cxn="share" ${hasContent()?'':'disabled'}>Share</button>
        </div>
      </div>
      <div class="cxn-toast" data-cxn-toast role="status" hidden></div>${sheetHtml()}
    </div>`;
  }
  function audienceRow(symbol,title,desc,value){
    return `<button type="button" class="cxn-row" data-cxn="audience-select" data-value="${value}" role="radio" aria-checked="${draft.audience===value}">
      <span class="cxn-row-icon ${value==='close'?'green':''}">${symbol}</span><span class="cxn-row-body"><b>${title}</b><small>${desc}</small></span><span class="cxn-radio" aria-hidden="true"></span></button>`;
  }
  function sheetHtml(){
    if(!panel)return '';
    let title='Choose',body='',footer='<button type="button" class="cxn-sheet-action" data-cxn="done">Done</button>';
    if(panel==='audience'){
      title='Share with';
      body=`<div role="radiogroup" aria-label="Choose note audience">
        ${audienceRow('♧','Friends','Followers you follow back','friends')}
        ${audienceRow('★','Close Friends','Only people on your list','close')}
        <button type="button" class="cxn-row" data-cxn="friends" style="justify-content:space-between"><span>Manage Close Friends</span><span>${selected.length} selected ›</span></button>
        <button type="button" class="cxn-row" data-cxn="tag" style="justify-content:space-between"><span>Tag a friend</span><span>›</span></button></div>`;
    }else if(panel==='friends'){
      title='Close Friends';
      body=`<input type="search" class="cxn-search" data-cxn-search placeholder="Search people…" aria-label="Search friends">
        ${readState().users.filter(u=>u.id!=='me').map(u=>`<label class="cxn-person" data-search-name="${e((u.username+' '+u.fullName).toLowerCase())}">
          <img src="${safeMediaUrl(u.avatar)}" alt=""><span>@${e(u.username)}</span>
          <input type="checkbox" data-cxn-friend value="${e(u.id)}" ${selected.includes(u.id)?'checked':''} aria-label="Add ${e(u.username)} to Close Friends"></label>`).join('')}`;
      footer='<button type="button" class="cxn-sheet-action" data-cxn="save-friends">Save list</button>';
    }else if(panel==='tag'){
      title='Tag a friend';
      body=`<button type="button" class="cxn-row" data-cxn="select-tag" data-value="">No tag ${draft.tag?'':'✓'}</button>
        ${allowedTags().map(u=>`<button type="button" class="cxn-row" data-cxn="select-tag" data-value="${e(u.id)}"><img src="${safeMediaUrl(u.avatar)}" alt="" style="width:39px;height:39px;border-radius:50%;object-fit:cover"><span>@${e(u.username)}</span> ${draft.tag===u.id?'✓':''}</button>`).join('')}
        <p class="cxn-preview-only">Sample people only. Notifications and real audience checks require the social backend.</p>`;
      footer='';
    }else if(panel==='music'){
      title='Add song';
      body=`<div class="cxn-tracks">${tracks.map(t=>`<div style="display:flex;gap:6px;align-items:center">
        <button type="button" data-cxn="select-track" data-value="${t.id}" style="flex:1"><span class="cxn-track-preview">♫</span><span><b>${e(t.name)}</b><small>Crush.X Original Demo</small></span>${draft.song===t.id?'✓':'+'}</button>
        <button type="button" data-cxn="play-track" data-value="${t.id}" aria-label="Play ${e(t.name)}" style="padding:10px">▶</button></div>`).join('')}</div>
        <p class="cxn-preview-only">Only original synthesised demo sounds. Licensed commercial music is not connected.</p>`;
      footer='<button type="button" class="cxn-sheet-action" data-cxn="remove-song">No song</button>';
    }else if(panel==='location'){
      title='Add location';
      body=`<input type="text" maxlength="70" class="cxn-search" data-cxn-location value="${e(draft.location)}" placeholder="Type a city or place…" aria-label="Location">
        ${['New Delhi','Mumbai','Chandigarh','Bengaluru'].map(city=>`<button type="button" class="cxn-row" data-cxn="select-location" data-value="${city}">📍 ${city}</button>`).join('')}
        <p class="cxn-preview-only">Manual label only · Location permission is never requested automatically.</p>`;
    }else if(panel==='sticker'){
      title='Animated stickers';
      body=`<div class="cxn-stickers">${Object.entries(stickers).map(([id,symbol])=>`<button type="button" data-cxn="select-sticker" data-value="${id}" aria-label="${id}"><span class="cxn-animated">${symbol}</span></button>`).join('')}</div>
        <p class="cxn-preview-only">Built-in animated stickers. External GIF search is not connected.</p>`;
      footer='<button type="button" class="cxn-sheet-action" data-cxn="remove-sticker">No sticker</button>';
    }else if(panel==='colors'){
      title='Bubble color';
      body=`<div class="cxn-colors">${['pink','purple','blue','mint'].map(color=>`<button type="button" class="cxn-color-${color}" data-cxn="select-color" data-value="${color}" aria-label="${color}">${draft.color===color?'✓':''}</button>`).join('')}</div>`;
      footer='';
    }
    return `<div class="cxn-sheet-scrim" data-cxn="done" aria-hidden="true"></div>
      <section class="cxn-sheet" role="region" aria-label="${e(title)}"><div class="cxn-handle" aria-hidden="true"></div>
        <div class="cxn-sheet-head"><button type="button" data-cxn="back">‹ Back</button><strong>${e(title)}</strong><button type="button" data-cxn="done">Done</button></div>
        <div class="cxn-sheet-body">${body}</div>${footer}</section>`;
  }
  function saveNote(){
    if(draft.audience==='close' && !selected.length){panel='friends';render();toast('Select at least one Close Friend.');return;}
    if(draft.tag&&!allowedTags().some(u=>u.id===draft.tag))draft.tag='';
    const note=model.publish(draft);
    if(!note){toast('Write a note or choose a song or sticker.');return;}
    write(NOTE_KEY,JSON.stringify(note));
    dialog.close();renderApp();
    const message=document.getElementById('appStatus');
    if(message)message.textContent='Note saved locally for 24 hours. Nothing was published.';
  }
  function clickInside(event){
    const button=event.target.closest('[data-cxn]');
    if(!button||!dialog.contains(button))return;
    const action=button.dataset.cxn,value=button.dataset.value||'';
    if(action==='close'){dialog.close();return;}
    if(action==='share'){saveNote();return;}
    if(action==='delete'){write(NOTE_KEY,null);dialog.close();renderApp();return;}
    if(action==='play-track'){audioPreview(value);return;}
    if(action==='back'){panel=['friends','tag'].includes(panel)?'audience':'';render();return;}
    if(action==='done'){if(panel==='location')draft.location=(dialog.querySelector('[data-cxn-location]')?.value||'').trim().slice(0,70);panel='';render();return;}
    if(['audience','music','location','sticker','colors','tag','friends'].includes(action)){panel=action;render();return;}
    if(action==='audience-select'){draft.audience=value==='close'?'close':'friends';if(draft.tag&&!allowedTags().some(u=>u.id===draft.tag))draft.tag='';render();return;}
    if(action==='save-friends'){
      selected=model.sanitizeFriends(selected,readState().users.map(u=>u.id));
      write(FRIENDS_KEY,JSON.stringify(selected));
      if(draft.tag&&!allowedTags().some(u=>u.id===draft.tag))draft.tag='';
      panel='audience';render();return;
    }
    if(action==='select-tag'){draft.tag=value;panel='';render();return;}
    if(action==='select-track'){draft.song=track(value)?value:'';stopAudio();panel='';render();return;}
    if(action==='remove-song'){draft.song='';stopAudio();panel='';render();return;}
    if(action==='select-location'){draft.location=value;panel='';render();return;}
    if(action==='remove-location'){draft.location='';render();return;}
    if(action==='select-sticker'){draft.sticker=stickers[value]?value:'';panel='';render();return;}
    if(action==='remove-sticker'){draft.sticker='';panel='';render();return;}
    if(action==='select-color'){draft.color=value;panel='';render();return;}
    if(action==='remove-tag'){draft.tag='';render();}
  }
  function inputInside(event){
    if(event.target.matches('[data-cxn-text]')){
      draft.text=event.target.value.slice(0,60);
      const count=dialog.querySelector('[data-cxn-count]');if(count)count.textContent=draft.text.length;
      const share=dialog.querySelector('.cxn-share');if(share)share.disabled=!hasContent();
    }else if(event.target.matches('[data-cxn-search]')){
      const q=event.target.value.toLowerCase().trim();
      dialog.querySelectorAll('[data-search-name]').forEach(row=>{row.hidden=!row.dataset.searchName.includes(q);});
    }else if(event.target.matches('[data-cxn-location]'))draft.location=event.target.value.slice(0,70);
  }
  function changeInside(event){
    if(!event.target.matches('[data-cxn-friend]'))return;
    const id=event.target.value;
    if(event.target.checked)selected.push(id);
    else selected=selected.filter(x=>x!==id);
    selected=model.sanitizeFriends(selected,readState().users.map(u=>u.id));
    write(FRIENDS_KEY,JSON.stringify(selected));
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-cxn-open]'))open();});
  function clear(){
    write(NOTE_KEY,null);write(FRIENDS_KEY,null);
    if(dialog?.open)dialog.close();
  }
  document.addEventListener('crushx:session-ended',clear);
  const oldLogout=logout;
  logout=function(){clear();oldLogout();};
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && readState().activeTab==='messages' && !readState().chatUserId && !dialog?.open)renderApp();
  });
  setInterval(()=>{
    if(document.hidden||dialog?.open)return;
    const s=readState();
    if(s.activeTab==='messages'&&!s.chatUserId&&document.querySelector('.cxn-preview-bubble')&&!activeNote())renderApp();
  },60000);
  window.CrushXNotes=Object.freeze({open,current:activeNote});
})();
