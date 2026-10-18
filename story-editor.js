/* Crush.X Story Studio: browser-local editing and export; no remote publishing. */
const ssFilters = { Original:'none', Vivid:'saturate(1.65) contrast(1.12)', Mono:'grayscale(1)', Vintage:'sepia(.6) contrast(.92)', Glow:'saturate(1.3) brightness(1.2)', Film:'contrast(1.2) sepia(.2)', Cool:'hue-rotate(24deg) saturate(1.2)' };
const ssBackgrounds = { Sunset:'linear-gradient(140deg,#9234ac,#f43f8a 48%,#f9b44d)', Night:'linear-gradient(140deg,#100a37,#323f9b,#ac5ac4)', Mint:'linear-gradient(140deg,#064e3b,#0d9488,#a7f3d0)', Classic:'linear-gradient(140deg,#27272a,#52525b,#18181b)' };
const ssColors = ['#ffffff','#000000','#fe3c72','#ff9e36','#f8e94a','#59ed9c','#4fc3ff','#a67bff'];
let ssSession = null;
let ssDialog = null;
let ssToastTimer = null;
const ssE = value => escapeHTML(String(value ?? ''));

function ssSamples() {
  const state = getState();
  return [...state.posts.map(p => ({name:'Sample post', url:p.image || p.source, type:p.contentType || 'image/jpeg'})),
    ...state.stories.map(s => ({name:'Sample story',url:s.image,type:'image/jpeg'}))]
    .filter(m => { try { const u = new URL(m.url); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } })
    .slice(0,24).map((m,i) => ({...m,id:`sample-${i}`,sample:true}));
}
function ssFresh() {
  return {view:'gallery',panel:'',album:'Recents',albumOpen:false,multi:false,media:ssSamples(),selected:[],filter:'Original',effectCat:'Trending',effectQuery:'',savedEffects:[],bg:'Sunset',text:'',font:'Classic',textSize:37,textY:46,textColor:'#ffffff',textAlign:'center',textBg:false,sticker:'',musicUrl:'',musicName:'',mentions:[],mentionQuery:'',allowReshare:true,drawColor:'#ffffff',drawWidth:4,strokes:[],drawing:false,audience:'Your story',aiLabel:false,notice:''};
}
function ssNotice(message) {
  if (!ssSession) return;
  ssSession.notice = message;
  ssRender();
  if (ssToastTimer) clearTimeout(ssToastTimer);
  ssToastTimer = setTimeout(() => { if (!ssSession) return; ssSession.notice = ''; document.querySelector('.ss-toolbar-notice')?.remove(); }, 3500);
}
function ssClean() {
  if (ssToastTimer) clearTimeout(ssToastTimer);
  if (ssSession) for (const media of ssSession.media) if (!media.sample && media.url) URL.revokeObjectURL(media.url);
  if (ssSession?.musicUrl) URL.revokeObjectURL(ssSession.musicUrl);
  ssSession = null;
  ssDialog = null;
}
function ssClose() { if (ssDialog?.open) ssDialog.close(); else ssClean(); }
function openStoryStudio() {
  if (ssDialog?.open) return;
  ssSession = ssFresh();
  const dialog = document.createElement('dialog');
  dialog.className = 'story-studio';
  dialog.setAttribute('aria-label','Crush.X Add to Story');
  dialog.addEventListener('close',() => { dialog.remove(); ssClean(); });
  dialog.addEventListener('click',ssClick);
  dialog.addEventListener('input',ssInput);
  dialog.addEventListener('change',ssChange);
  dialog.addEventListener('pointerdown',ssDrawStart);
  dialog.addEventListener('pointermove',ssDrawMove);
  dialog.addEventListener('pointerup',ssDrawEnd);
  dialog.addEventListener('pointercancel',ssDrawEnd);
  document.body.append(dialog);
  ssDialog = dialog;
  ssRender();
  dialog.showModal();
}
function ssIcon(label, action, glyph, extra='') { return `<button class="ss-icon" data-ss="${action}" aria-label="${ssE(label)}" title="${ssE(label)}" ${extra}>${glyph}</button>`; }
function ssMediaHTML(m) {
  if (!m) return '';
  const src = ssE(m.url);
  return m.type.startsWith('video/') ? `<video src="${src}" muted autoplay loop playsinline aria-label="Story video preview"></video>` : `<img src="${src}" alt="${ssE(m.name || 'Story media')}">`;
}
function ssStage() {
  const s=ssSession, selected=s.selected.map(id => s.media.find(m => m.id===id)).filter(Boolean);
  const collage=selected.length>1;
  const pictures=collage ? `<div class="ss-collage" data-count="${selected.length}" style="filter:${ssFilters[s.filter]}">${selected.map(ssMediaHTML).join('')}</div>` : selected.length ? `<div style="position:absolute;inset:0;filter:${ssFilters[s.filter]}">${ssMediaHTML(selected[0])}</div>` : '';
  const style=s.font==='Signature'?'font-family:cursive;font-style:italic':s.font==='Poster'?'font-family:Impact,sans-serif;text-transform:uppercase':s.font==='Editor'?'font-family:Georgia,serif;font-weight:400':'font-family:inherit';
  return `<div class="ss-stage" style="background:${ssBackgrounds[s.bg]}">
    ${pictures}
    ${s.text ? `<div class="ss-overlay-text ${s.textBg?'is-backed':''}" style="top:${s.textY}%;font-size:${s.textSize}px;color:${s.textColor};text-align:${s.textAlign};${style}">${ssE(s.text)}</div>` : ''}
    ${s.sticker ? `<div class="ss-stickers">${ssE(s.sticker)}</div>` : ''}
    ${s.mentions.length ? `<div class="ss-mentions">${s.mentions.map(id=>ssE('@'+(getState().users.find(u=>u.id===id)?.username||''))).join(' ')}</div>` : ''}
    <canvas width="720" height="1280" class="${s.drawing?'is-drawing':''}" data-ss-canvas aria-label="Draw on story"></canvas>
  </div>`;
}
function ssGallery() {
  const s=ssSession;
  const shown=s.media.filter(m=>s.album!=='Photos'||!m.type.startsWith('video/')).filter(m=>s.album!=='Videos'||m.type.startsWith('video/'));
  return `<div class="ss-shell">
    <header class="ss-head">${ssIcon('Close story creator','close','×')}<h2>Add to story</h2>${ssIcon('Story settings','settings','⚙')}</header>
    <div class="ss-scroller">
      <div class="ss-quick">
        <button data-ss="templates"><span>▦</span>Templates</button><button data-ss="quick-effects"><span>✨</span>Effects</button><button data-ss="quick-music"><span>♫</span>Music</button><button data-ss="collage"><span>▧</span>Collage</button>
      </div>
      <div class="ss-albums"><button data-ss="album-toggle" class="ss-action" aria-expanded="${s.albumOpen}">${ssE(s.album)} ⌄</button><button data-ss="multi" class="ss-action ${s.multi?'is-on':''}" aria-pressed="${s.multi}">☷ Select</button></div>
      ${s.albumOpen ? `<div class="ss-gallery-menu">${['Recents','Photos','Videos','All albums','Google Photos','From Meta apps'].map(name=>`<button data-ss-album="${ssE(name)}" aria-pressed="${s.album===name}">${ssE(name)} ${['Google Photos','From Meta apps'].includes(name)?'<small>Not connected</small>':''}</button>`).join('')}</div>` : ''}
      <p class="ss-note">Browser access only: choose media from your device. Other tiles are labeled sample content.</p>
      <div class="ss-grid"><button data-ss="camera" aria-label="Take photo or video" style="font-size:35px">📷<span class="ss-source">Camera</span></button><button data-ss="file" aria-label="Choose images or videos" style="font-size:32px">＋<span class="ss-source">Choose files</span></button>
        ${shown.map(m=>`<button data-ss-media="${ssE(m.id)}" aria-label="Select ${ssE(m.name)}" aria-pressed="${s.selected.includes(m.id)}">${ssMediaHTML(m)}${s.multi?`<span class="ss-check ${s.selected.includes(m.id)?'is-selected':''}">${s.selected.includes(m.id)?s.selected.indexOf(m.id)+1:''}</span>`:''}<span class="ss-source">${m.sample?'Sample':ssE(m.name.slice(0,18))}</span></button>`).join('')}
      </div>
    </div>
    ${s.multi ? `<footer class="ss-foot"><span>${s.selected.length}/4 selected</span><button class="ss-primary" data-ss="edit-selected" ${s.selected.length<2?'disabled':''}>Next →</button></footer>` : ''}
    <input data-ss-file type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden>
    <input data-ss-camera type="file" accept="image/*,video/*" capture="environment" hidden>
    ${ssPanel()}
    ${s.notice?`<div class="ss-toolbar-notice" role="status">${ssE(s.notice)}</div>`:''}
  </div>`;
}
function ssEditor() {
  const s=ssSession;
  const actions=[['text','Aa','Text'],['stickers','▧','Stickers'],['music','♫','Music'],['restyle','✦','Restyle'],['effects','✨','Effects'],['mention','@','Mention'],['draw','✎','Draw'],['save','↓','Save'],['label','AI','Label AI'],['more','⋯','More']];
  return `<div class="ss-shell">
    <header class="ss-head">${ssIcon('Back to gallery','back','←')}<h2>Crush.X Story</h2>${ssIcon('Story settings','settings','⚙')}</header>
    <div class="ss-stage-wrap">${ssStage()}</div>
    <nav class="ss-tools" aria-label="Story editor tools">${actions.map(([id,icon,label])=>`<button data-ss="${id}" class="${s.panel===id?'is-on':''}" aria-label="${label}"><b>${icon}</b><span>${label}</span></button>`).join('')}</nav>
    <footer class="ss-foot"><button data-ss="audience-story" class="ss-action ${s.audience==='Your story'?'is-on':''}">◉ Your story</button><button data-ss="audience-close" class="ss-action ${s.audience==='Close Friends'?'is-on':''}">★ Close Friends</button><button data-ss="review" class="ss-primary" aria-label="Next to story review">Next →</button></footer>
    ${ssPanel()}
    ${s.notice?`<div class="ss-toolbar-notice" role="status">${ssE(s.notice)}</div>`:''}
  </div>`;
}
function ssReview() {
  const s=ssSession;
  return `<div class="ss-shell"><header class="ss-head">${ssIcon('Back to editor','back','←')}<h2>Review story</h2><span>✓</span></header>
    <div class="ss-review">${ssStage()}<div style="margin-top:14px"><b>Audience: ${ssE(s.audience)}</b><p class="ss-note">Local preview only. No story is published, and no followers or mentioned accounts are notified.</p>${s.musicName?`<p>♫ ${ssE(s.musicName)} (preview audio is not embedded in PNG)</p>`:''}${s.aiLabel?'<p>AI-generated content label: On (self-declared)</p>':''}${s.mentions.length?`<p>Mentions selected: ${s.mentions.length} (not notified)</p>`:''}</div></div>
    <footer class="ss-foot"><button data-ss="save" class="ss-action">↓ Save image</button><button data-ss="check-publish" class="ss-primary">Check sharing</button></footer>
    ${s.notice?`<div class="ss-toolbar-notice" role="status">${ssE(s.notice)}</div>`:''}
  </div>`;
}
function ssRender() {
  if (!ssDialog||!ssSession) return;
  ssDialog.innerHTML=ssSession.view==='gallery'?ssGallery():ssSession.view==='review'?ssReview():ssEditor();
  ssRedraw();
}

function ssUserRows() {
  const s=ssSession;
  const q=s.mentionQuery.trim().toLowerCase();
  const users=getState().users.filter(u=>u.id!==getState().currentUserId && (`${u.username} ${u.fullName}`).toLowerCase().includes(q)).slice(0,25);
  return users.length?users.map(u=>`<button class="ss-user" data-ss-user="${ssE(u.id)}" aria-pressed="${s.mentions.includes(u.id)}"><img src="${safeMediaUrl(u.avatar)}" alt=""><span><b>${ssE(u.username)}</b><br><small>${ssE(u.fullName)}</small></span><span class="ss-check">${s.mentions.includes(u.id)?'✓':''}</span></button>`).join(''):'<p class="ss-note">No matching sample profiles.</p>';
}
function ssPanel() {
  const s=ssSession,p=s.panel;
  if (!p) return '';
  let body='';
  if (p==='text') body=`<textarea class="ss-field" data-ss-text rows="3" maxlength="280" placeholder="Type your story text…">${ssE(s.text)}</textarea>
    <div class="ss-pills">${['Classic','Signature','Editor','Poster'].map(f=>`<button class="ss-pill ${f===s.font?'is-on':''}" data-ss-font="${f}">${f}</button>`).join('')}</div>
    <label>Text size <output>${s.textSize}</output><input data-ss-range="textSize" type="range" min="18" max="82" value="${s.textSize}"></label>
    <label>Vertical position <input data-ss-range="textY" type="range" min="12" max="80" value="${s.textY}"></label>
    <div class="ss-swatches">${ssColors.map(c=>`<button class="ss-swatch" style="background:${c}" data-ss-color="${c}" aria-label="Text color ${c}" aria-pressed="${s.textColor===c}"></button>`).join('')}</div>
    <div class="ss-pills"><button class="ss-pill" data-ss="text-align">Align: ${s.textAlign}</button><button class="ss-pill ${s.textBg?'is-on':''}" data-ss="text-bg">Background ${s.textBg?'On':'Off'}</button><button class="ss-pill" data-ss="text-clear">Clear text</button></div>`;
  else if (p==='stickers') body=`<p class="ss-note">Tap a sticker to place it on the story.</p><div class="ss-pills">${['❤️','🔥','✨','😍','🎉','💫','😊','💜','🌈','📍'].map(e=>`<button data-ss-sticker="${e}" class="ss-pill" style="font-size:27px">${e}</button>`).join('')}</div><label>Location sticker (manual)<input data-ss-location class="ss-field" maxlength="50" placeholder="Enter a place"></label><button class="ss-action" data-ss="add-location">Add location</button><button class="ss-action" data-ss="remove-sticker">Remove sticker</button>`;
  else if (p==='music') body=`<p class="ss-note">Choose audio from your device. We don't provide a licensed music catalog, and audio cannot be embedded in a PNG.</p><label class="ss-action" style="display:inline-block">Choose audio <input type="file" data-ss-audio accept="audio/*" hidden></label>${s.musicUrl?`<p style="margin:14px 0">♫ ${ssE(s.musicName)}</p><audio src="${ssE(s.musicUrl)}" controls style="width:100%"></audio><button class="ss-action" data-ss="remove-music">Remove music</button>`:''}`;
  else if (p==='effects') {
    const category=s.effectCat;
    const effects=ssVisibleEffects();
    body=`<div class="ss-pills">${['Trending','New','Personalized','Film Effects','Saved'].map(c=>`<button data-ss-cat="${c}" class="ss-pill ${c===category?'is-on':''}">${c}</button>`).join('')}</div><input class="ss-field" data-ss-effect-search value="${ssE(s.effectQuery)}" placeholder="Search effects" aria-label="Search effects"><div class="ss-pills" data-ss-effect-list>${effects.map(f=>`<button data-ss-filter="${f}" class="ss-pill ${s.filter===f?'is-on':''}">${f}</button>`).join('')||'<p>No effect matches.</p>'}</div><button data-ss="save-effect" class="ss-action">${s.savedEffects.includes(s.filter)?'★ Unsave':'☆ Save'} ${s.filter}</button><p class="ss-note">These are offline CSS color filters; no external effect library is connected.</p>`;
  } else if (p==='restyle') body=`<p class="ss-note">Manual color backgrounds—not an AI image restyling service.</p><div class="ss-pills">${Object.keys(ssBackgrounds).map(name=>`<button class="ss-pill ${s.bg===name?'is-on':''}" data-ss-bg="${name}">${name}</button>`).join('')}</div>`;
  else if (p==='mention') body=`<input class="ss-field" data-ss-search value="${ssE(s.mentionQuery)}" placeholder="Search sample profiles…" aria-label="Search people to mention"><div class="ss-users">${ssUserRows()}</div><label class="ss-toggle">Allow mentioned people to add this to their story <input data-ss-reshare type="checkbox" ${s.allowReshare?'checked':''}></label><p class="ss-note">Mentions are part of this local preview. No notifications or permission changes are sent.</p><button class="ss-action ss-primary" data-ss="mention-done" ${s.mentions.length?'':'disabled'}>Add (${s.mentions.length})</button>`;
  else if (p==='draw') body=`<p class="ss-note">Draw with your finger or mouse directly on the story.</p><div class="ss-swatches">${ssColors.map(c=>`<button class="ss-swatch" style="background:${c}" data-ss-drawcolor="${c}" aria-label="Draw color ${c}" aria-pressed="${s.drawColor===c}"></button>`).join('')}</div><label>Brush size <input type="range" data-ss-range="drawWidth" min="2" max="30" value="${s.drawWidth}"></label><div class="ss-pills"><button class="ss-pill" data-ss="undo-draw">Undo</button><button class="ss-pill" data-ss="clear-draw">Clear</button><button class="ss-pill" data-ss="toggle-draw">${s.drawing?'Stop drawing':'Start drawing'}</button></div>`;
  else if (p==='label') body=`<label class="ss-toggle">Label this as AI-generated content <input data-ss-ai type="checkbox" ${s.aiLabel?'checked':''}></label><p class="ss-note">Self-declared label only. Crush.X does not verify whether an image is AI-generated.</p>`;
  else if (p==='settings') body=`<p class="ss-note">Story drafts, imports and editing exist only in this browser session. There is no camera-roll access until you select or capture media.</p><label class="ss-toggle">Default audience <select class="ss-field" style="width:auto" data-ss-audience><option ${s.audience==='Your story'?'selected':''}>Your story</option><option ${s.audience==='Close Friends'?'selected':''}>Close Friends</option></select></label><p class="ss-note">Google Photos, Meta apps, music licensing, upload and live story delivery are not connected.</p>`;
  else if (p==='more') body=`<div style="display:grid;gap:10px"><button class="ss-action" data-ss="back">Choose different media</button><button class="ss-action" data-ss="clear-overlays">Clear text, stickers, mentions and drawings</button><button class="ss-action" data-ss="save">Save PNG preview</button><button class="ss-action" data-ss="settings">Story settings</button></div>`;
  return `<section class="ss-surface" role="region" aria-label="${ssE(p)} options"><header><h3>${ssE(({label:'Label AI',restyle:'Restyle (manual)',mention:'Mention people'})[p]||p[0].toUpperCase()+p.slice(1))}</h3><button class="ss-icon" data-ss="panel-close" aria-label="Done or close options">✓</button></header>${body}</section>`;
}
function ssVisibleEffects() {
  const s=ssSession;
  const categories={Trending:['Original','Vivid','Glow','Mono'],New:['Cool','Vintage','Film'],Personalized:['Original','Cool','Glow'], 'Film Effects':['Film','Vintage','Mono']};
  return (s.effectCat==='Saved'?s.savedEffects:categories[s.effectCat]||Object.keys(ssFilters))
    .filter(name=>!s.effectQuery||name.toLowerCase().includes(s.effectQuery.toLowerCase()));
}

function ssClick(event) {
  const s=ssSession;
  if (!s) return;
  const mediaButton=event.target.closest('[data-ss-media]');
  if (mediaButton) {
    const id=mediaButton.dataset.ssMedia;
    if (s.multi) {
      if (s.selected.includes(id)) s.selected=s.selected.filter(x=>x!==id);
      else if (s.selected.length<4) s.selected.push(id);
      else return ssNotice('Collage supports up to four images or videos.');
    } else { s.selected=[id]; s.view='editor'; s.panel=''; }
    return ssRender();
  }
  const album=event.target.closest('[data-ss-album]');
  if (album) {
    const name=album.dataset.ssAlbum;
    s.albumOpen=false;
    if (name==='Google Photos'||name==='From Meta apps') return ssNotice(`${name} is not connected. Use Choose files instead.`);
    s.album=name==='All albums'?'Recents':name;
    if (name==='All albums') return ssNotice('Only media selected in this browser is accessible. Showing Recents.');
    return ssRender();
  }
  const user=event.target.closest('[data-ss-user]');
  if (user) { const id=user.dataset.ssUser; s.mentions=s.mentions.includes(id)?s.mentions.filter(x=>x!==id):[...s.mentions,id]; return ssRender(); }
  const font=event.target.closest('[data-ss-font]'); if(font){s.font=font.dataset.ssFont;return ssRender();}
  const color=event.target.closest('[data-ss-color]');if(color){s.textColor=color.dataset.ssColor;return ssRender();}
  const drawcolor=event.target.closest('[data-ss-drawcolor]');if(drawcolor){s.drawColor=drawcolor.dataset.ssDrawcolor;return ssRender();}
  const sticker=event.target.closest('[data-ss-sticker]');if(sticker){s.sticker=sticker.dataset.ssSticker;s.panel='';return ssRender();}
  const filter=event.target.closest('[data-ss-filter]');if(filter){s.filter=filter.dataset.ssFilter;return ssRender();}
  const bg=event.target.closest('[data-ss-bg]');if(bg){s.bg=bg.dataset.ssBg;return ssRender();}
  const cat=event.target.closest('[data-ss-cat]');if(cat){s.effectCat=cat.dataset.ssCat;return ssRender();}
  const button=event.target.closest('[data-ss]');if(!button)return;
  const action=button.dataset.ss;
  if(action==='close') return ssClose();
  if(action==='file')return ssDialog.querySelector('[data-ss-file]')?.click();
  if(action==='camera')return ssDialog.querySelector('[data-ss-camera]')?.click();
  if(action==='album-toggle'){s.albumOpen=!s.albumOpen;return ssRender();}
  if(action==='multi'){s.multi=!s.multi;s.selected=[];return ssRender();}
  if(action==='collage'){s.multi=true;s.selected=[];return ssNotice('Select 2–4 tiles, then tap Next to make a collage.');}
  if(action==='edit-selected'){if(s.selected.length<2)return;s.view='editor';s.panel='';return ssRender();}
  if(action==='templates'){s.view='editor';s.selected=[];s.panel='restyle';return ssRender();}
  if(action==='quick-effects'||action==='quick-music'){s.view='editor';s.panel=action==='quick-effects'?'effects':'music';return ssRender();}
  if(action==='back') {if(s.view==='review')s.view='editor';else{s.view='gallery';s.panel='';s.drawing=false;}return ssRender();}
  if(action==='panel-close'){s.panel='';s.drawing=false;return ssRender();}
  if(['text','stickers','music','restyle','effects','mention','draw','label','settings','more'].includes(action)) {s.panel=action;s.drawing=action==='draw';return ssRender();}
  if(action==='remove-music'){if(s.musicUrl)URL.revokeObjectURL(s.musicUrl);s.musicUrl='';s.musicName='';return ssRender();}
  if(action==='save-effect'){s.savedEffects=s.savedEffects.includes(s.filter)?s.savedEffects.filter(f=>f!==s.filter):[...s.savedEffects,s.filter];return ssRender();}
  if(action==='text-align'){s.textAlign={center:'left',left:'right',right:'center'}[s.textAlign];return ssRender();}
  if(action==='text-bg'){s.textBg=!s.textBg;return ssRender();}
  if(action==='text-clear'){s.text='';return ssRender();}
  if(action==='remove-sticker'){s.sticker='';return ssRender();}
  if(action==='add-location'){const location=ssDialog.querySelector('[data-ss-location]')?.value.trim();if(!location)return ssNotice('Enter a location first.');s.sticker='📍 '+location.slice(0,50);s.panel='';return ssRender();}
  if(action==='mention-done'){if(!s.mentions.length)return;s.panel='';return ssRender();}
  if(action==='toggle-draw'){s.drawing=!s.drawing;return ssRender();}
  if(action==='undo-draw'){s.strokes.pop();return ssRender();}
  if(action==='clear-draw'){s.strokes=[];return ssRender();}
  if(action==='clear-overlays'){s.text='';s.sticker='';s.mentions=[];s.strokes=[];s.panel='';return ssRender();}
  if(action==='audience-story'||action==='audience-close'){s.audience=action==='audience-story'?'Your story':'Close Friends';return ssRender();}
  if(action==='review'){s.drawing=false;s.panel='';s.view='review';return ssRender();}
  if(action==='check-publish')return ssNotice('Live sharing is not connected. This story is not published. You can save a PNG preview.');
  if(action==='save')return ssExport();
}

function ssInput(event) {
  const s=ssSession; if(!s)return;
  const target=event.target;
  if(target.matches('[data-ss-text]'))s.text=target.value.slice(0,280);
  else if(target.matches('[data-ss-range]'))s[target.dataset.ssRange]=Number(target.value);
  else if(target.matches('[data-ss-search]')) {s.mentionQuery=target.value.slice(0,80);const users=ssDialog.querySelector('.ss-users');if(users)users.innerHTML=ssUserRows();return;}
  else if(target.matches('[data-ss-effect-search]')){
    s.effectQuery=target.value.slice(0,60);
    const list=ssDialog.querySelector('[data-ss-effect-list]');
    if(list)list.innerHTML=ssVisibleEffects().map(f=>`<button data-ss-filter="${f}" class="ss-pill ${s.filter===f?'is-on':''}">${f}</button>`).join('')||'<p>No effect matches.</p>';
    return;
  }
  else return;
  // Keep keyboard focus/caret during typing; only update the preview layer.
  const stage=ssDialog.querySelector('.ss-stage');
  if(stage) {const fresh=document.createElement('div');fresh.innerHTML=ssStage();const next=fresh.firstElementChild;const oldCanvas=stage.querySelector('canvas');const newCanvas=next.querySelector('canvas');if(oldCanvas&&newCanvas)next.replaceChild(oldCanvas,newCanvas);stage.replaceWith(next);}
  ssRedraw();
}
function ssChange(event) {
  const s=ssSession;if(!s)return;
  const target=event.target;
  if(target.matches('[data-ss-file],[data-ss-camera]')){
    const accepted=[];
    for(const file of Array.from(target.files||[]).slice(0,20)){
      try {validateMedia(file);accepted.push({id:`local-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:file.name,type:file.type,url:URL.createObjectURL(file),file,sample:false});}
      catch(error){s.notice=`Skipped ${file.name}: ${error.message}`;}
    }
    target.value='';
    if(!accepted.length)return ssRender();
    s.media.unshift(...accepted);
    s.album='Recents';s.albumOpen=false;
    if(s.multi){s.selected=accepted.slice(0,4).map(m=>m.id);return ssRender();}
    s.selected=[accepted[0].id];s.view='editor';s.panel='';return ssRender();
  }
  if(target.matches('[data-ss-audio]')){
    const file=target.files?.[0];if(!file)return;
    if(!file.type.startsWith('audio/')||file.size>20*1024*1024)return ssNotice('Choose an audio file up to 20 MB.');
    if(s.musicUrl)URL.revokeObjectURL(s.musicUrl);
    s.musicUrl=URL.createObjectURL(file);s.musicName=file.name;return ssRender();
  }
  if(target.matches('[data-ss-reshare]'))s.allowReshare=target.checked;
  if(target.matches('[data-ss-ai]'))s.aiLabel=target.checked;
  if(target.matches('[data-ss-audience]'))s.audience=target.value;
}

function ssCanvasPoint(event,canvas) {
  const rect=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
}
function ssDrawStart(event) {
  const canvas=event.target.closest('canvas[data-ss-canvas]');
  if(!canvas||!ssSession?.drawing||ssSession.view!=='editor')return;
  event.preventDefault();
  ssSession.activePointer=event.pointerId;
  ssSession.strokes.push({color:ssSession.drawColor,width:ssSession.drawWidth,points:[ssCanvasPoint(event,canvas)]});
  canvas.setPointerCapture?.(event.pointerId);
  ssRedraw();
}
function ssDrawMove(event) {
  const s=ssSession;
  if(!s||s.activePointer!==event.pointerId)return;
  const canvas=ssDialog?.querySelector('canvas[data-ss-canvas]');
  if(!canvas)return;
  event.preventDefault();
  s.strokes[s.strokes.length-1]?.points.push(ssCanvasPoint(event,canvas));
  ssRedraw();
}
function ssDrawEnd(event) {if(ssSession?.activePointer===event.pointerId)ssSession.activePointer=null;}
function ssPaintStrokes(ctx,width,height) {
  const strokes=ssSession?.strokes||[];
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of strokes){
    if(!stroke.points.length)continue;
    ctx.strokeStyle=stroke.color;
    ctx.lineWidth=stroke.width*width/360;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x*width,stroke.points[0].y*height);
    for(const p of stroke.points.slice(1))ctx.lineTo(p.x*width,p.y*height);
    if(stroke.points.length===1)ctx.lineTo(stroke.points[0].x*width+.1,stroke.points[0].y*height+.1);
    ctx.stroke();
  }
}
function ssRedraw() {
  const canvas=ssDialog?.querySelector('canvas[data-ss-canvas]');if(!canvas||!ssSession)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ssPaintStrokes(ctx,canvas.width,canvas.height);
}
function ssCover(ctx,image,x,y,width,height) {
  const iw=image.videoWidth||image.naturalWidth||image.width, ih=image.videoHeight||image.naturalHeight||image.height;
  if(!iw||!ih)throw new Error('Media is not ready to export yet.');
  const scale=Math.max(width/iw,height/ih),cropW=width/scale,cropH=height/scale;
  ctx.drawImage(image,(iw-cropW)/2,(ih-cropH)/2,cropW,cropH,x,y,width,height);
}
function ssLoadImage(media) {
  return new Promise((resolve,reject)=>{
    if(media.type.startsWith('video/')){
      const video=document.createElement('video');
      video.crossOrigin='anonymous';video.muted=true;video.preload='auto';
      video.onloadeddata=()=>resolve(video);
      video.onerror=()=>reject(new Error('Video frame could not be loaded.'));
      video.src=media.url;
      return;
    }
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('This image cannot be exported. Try an image from your device.'));
    img.src=media.url;
  });
}
function ssFillBackground(ctx,w,h,name) {
  const pairs={Sunset:['#9234ac','#f9b44d'],Night:['#100a37','#ac5ac4'],Mint:['#064e3b','#a7f3d0'],Classic:['#27272a','#18181b']};
  const [a,b]=pairs[name]||pairs.Sunset;
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,a);g.addColorStop(1,b);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
}
function ssWrappedText(ctx,text,x,y,maxWidth,lineHeight) {
  const lines=[];
  for(const paragraph of text.split('\n')) {
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      const trial=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(trial).width>maxWidth){lines.push(line);line=word;}
      else line=trial;
    }
    lines.push(line);
  }
  const firstY=y-(lines.length-1)*lineHeight/2;
  lines.forEach((line,i)=>ctx.fillText(line,x,firstY+i*lineHeight,maxWidth));
}
async function ssExport() {
  const s=ssSession;if(!s)return;
  const selected=s.selected.map(id=>s.media.find(m=>m.id===id)).filter(Boolean);
  try {
    const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas export is unavailable on this device.');
    ssFillBackground(ctx,720,1280,s.bg);
    if(selected.length){
      const images=await Promise.all(selected.map(ssLoadImage));
      ctx.save();ctx.filter=ssFilters[s.filter];
      images.forEach((img,i)=>{
        const n=images.length;
        const box=n===1?[0,0,720,1280]:n===2?[i*360,0,360,1280]:n===3?(i===2?[0,640,720,640]:[i*360,0,360,640]):[(i%2)*360,Math.floor(i/2)*640,360,640];
        ssCover(ctx,img,...box);
      });
      ctx.restore();
    }
    if(s.text){
      const size=s.textSize*2;
      ctx.font=`${s.font==='Editor'?'400': '800'} ${size}px ${s.font==='Signature'?'cursive':s.font==='Poster'?'Impact':s.font==='Editor'?'Georgia':'sans-serif'}`;
      ctx.textAlign=s.textAlign;ctx.textBaseline='middle';
      const x=s.textAlign==='left'?38:s.textAlign==='right'?682:360;
      const y=1280*s.textY/100;
      ctx.fillStyle=s.textColor;
      if(s.textBg){ctx.fillStyle='#0009';ctx.fillRect(20,y-size*1.4,680,size*2.8);ctx.fillStyle=s.textColor;}
      ctx.shadowColor='#0009';ctx.shadowBlur=13;ssWrappedText(ctx,s.text,x,y,640,size*1.15);ctx.shadowBlur=0;
    }
    if(s.sticker){ctx.font='95px sans-serif';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText(s.sticker,360,1280*.65,680);}
    if(s.mentions.length){ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText(s.mentions.map(id=>'@'+(getState().users.find(u=>u.id===id)?.username||'')).join(' '),360,1280*.8,680);}
    ssPaintStrokes(ctx,720,1280);
    const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png');}catch(err){reject(err);}});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='CrushX-Story-Preview.png';document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    ssNotice('PNG preview saved to your device. Nothing was published.');
  }catch(error){ssNotice(error.message||'Could not export this story. Try an uploaded image.');}
}

const ssPriorCreate=renderCreate;
renderCreate=function(){return ssPriorCreate().replace('<main>',`<main><div class="story-entry mb-4"><div><strong>✦ Add to Story</strong><p class="text-xs mt-1 text-slate-500">Gallery, text, mentions, stickers, effects and drawing</p></div><button data-open-story-studio>Add story →</button></div>`);};
const ssPriorBindRepair=bindRepairEvents;
bindRepairEvents=function(){ssPriorBindRepair();document.querySelectorAll('[data-open-story-studio]').forEach(button=>button.addEventListener('click',openStoryStudio));};
const ssPriorLogout=logout;
logout=function(){ssClose();ssPriorLogout();};
