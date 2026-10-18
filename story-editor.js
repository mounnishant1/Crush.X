/* Crush.X Story Studio: browser-local editing and export; no remote publishing. */
const ssFilters = { Original:'none', Vivid:'saturate(1.65) contrast(1.12)', Mono:'grayscale(1)', Vintage:'sepia(.6) contrast(.92)', Glow:'saturate(1.3) brightness(1.2)', Film:'contrast(1.2) sepia(.2)', Cool:'hue-rotate(24deg) saturate(1.2)' };
const ssBackgrounds = { Sunset:'linear-gradient(140deg,#9234ac,#f43f8a 48%,#f9b44d)', Night:'linear-gradient(140deg,#100a37,#323f9b,#ac5ac4)', Mint:'linear-gradient(140deg,#064e3b,#0d9488,#a7f3d0)', Classic:'linear-gradient(140deg,#27272a,#52525b,#18181b)' };
const ssColors = ['#ffffff','#000000','#fe3c72','#ff9e36','#f8e94a','#59ed9c','#4fc3ff','#a67bff'];
const ssFonts = {
  Classic:['Arial,sans-serif','800','normal','0'], Signature:['cursive','600','italic','0'], Editor:['Georgia,serif','400','normal','0'], Poster:['Impact,sans-serif','900','normal','1px'],
  Modern:['Arial,sans-serif','500','normal','2px'], Elegant:['Georgia,serif','400','italic','1px'], Serif:['Times New Roman,serif','700','normal','0'], Typewriter:['Courier New,monospace','700','normal','0'],
  Handwritten:['Comic Sans MS,cursive','600','italic','0'], Rounded:['Trebuchet MS,sans-serif','800','normal','0'], Condensed:['Arial Narrow,sans-serif','900','normal','-1px'], Monospace:['monospace','600','normal','1px'],
  Neon:['Arial,sans-serif','800','normal','1px'], Outline:['Impact,sans-serif','900','normal','1px'], Shadow:['Georgia,serif','900','normal','0'], Bold:['Arial,sans-serif','900','normal','0'],
  Italic:['Georgia,serif','700','italic','0'], Minimal:['Arial,sans-serif','300','normal','2px'], Comic:['Comic Sans MS,cursive','800','normal','0'], Stencil:['Impact,sans-serif','700','normal','3px'],
  Retro:['Courier New,monospace','900','normal','2px'], Luxe:['Times New Roman,serif','400','italic','4px'], Brush:['cursive','900','italic','-1px'], Gradient:['Arial,sans-serif','900','normal','0']
};
const ssLanguages = {English:{lang:'en',ideas:['Living my best story ✨','A little moment, a big memory 💫','Today feels different 🌈','Good vibes only 💜']},Hindi:{lang:'hi',ideas:['आज की खूबसूरत याद ✨','हर पल खास है 💜','अपनी कहानी, अपनी पहचान','खुशियाँ बाँटते चलो 🌸']},Hinglish:{lang:'hi-Latn',ideas:['Aaj ka mood ekdum mast ✨','Apni story, apna style 💜','Yeh pal yaad rahega','Dil se happy vibes 🌈']},Punjabi:{lang:'pa',ideas:['ਅੱਜ ਦਾ ਦਿਨ ਬਹੁਤ ਸੋਹਣਾ ✨','ਆਪਣੀ ਕਹਾਣੀ ਆਪਣਾ ਅੰਦਾਜ਼','ਖੁਸ਼ੀਆਂ ਵੰਡਦੇ ਰਹੋ 💜','ਚੜ੍ਹਦੀ ਕਲਾ ਵਿੱਚ ਰਹੋ 🌟']},Haryanvi:{lang:'hi',ideas:['आज तो माहौल बढ़िया सै 🔥','अपणा अंदाज़ सबतै न्यारा','के हाल सै भाई 💪','दिल तै खुश रहो ❤️']}};
let ssSession = null;
const ssIconNames = {close:'x',settings:'settings',back:'arrow-left',text:'type',stickers:'smile-plus',music:'music-2',restyle:'wand-sparkles',effects:'sparkles',mention:'at-sign',draw:'pencil-line',save:'download',label:'badge-check',more:'ellipsis',camera:'camera',file:'image-plus',templates:'layout-template',collage:'layout-grid',multi:'list-checks',review:'arrow-right'};
const ssStickerTypes = [['Location','Location'],['Mention','Mention'],['Music','Music'],['GIF','GIF'],['AddYours','Add Yours'],['AddYoursMusic','Add Yours Music'],['Frame','Frame'],['Photo','Photo'],['Cutouts','Cutouts'],['Avatar','Avatar'],['Questions','Questions'],['Poll','Poll'],['Quiz','Quiz'],['Countdown','Countdown'],['Link','Link'],['EmojiSlider','Emoji Slider'],['Hashtag','Hashtag'],['DateTime','Date / Time']];
const ssStickerIcons = {Location:'map-pin',Mention:'at-sign',Music:'music-2',GIF:'film',AddYours:'users-round',AddYoursMusic:'music-3',Frame:'scan',Photo:'image-plus',Cutouts:'scissors',Avatar:'user-round',Questions:'message-circle-question',Poll:'chart-column',Quiz:'list-checks',Countdown:'hourglass',Link:'link',EmojiSlider:'sliders-horizontal',Hashtag:'hash',DateTime:'calendar-days'};
let ssDialog = null;
let ssToastTimer = null;
let ssTicker = null;
const ssE = value => escapeHTML(String(value ?? ''));

function ssSamples() {
  const state = getState();
  return [...state.posts.map(p => ({name:'Sample post', url:p.image || p.source, type:p.contentType || 'image/jpeg'})),
    ...state.stories.map(s => ({name:'Sample story',url:s.image,type:'image/jpeg'}))]
    .filter(m => { try { const u = new URL(m.url); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } })
    .slice(0,24).map((m,i) => ({...m,id:`sample-${i}`,sample:true}));
}
function ssFresh() {
  return {view:'gallery',panel:'',album:'Recents',albumOpen:false,multi:false,media:ssSamples(),selected:[],filter:'Original',effectCat:'Trending',effectQuery:'',savedEffects:[],bg:'Sunset',text:'',font:'Classic',textSize:37,textX:50,textY:46,textRotation:0,textScale:100,textColor:'#ffffff',textAlign:'center',textBg:false,textBold:false,textItalic:false,textOutline:false,textShadow:true,textGradient:false,textNeon:false,textAnimation:'None',language:'English',sticker:'',stickerKind:'',stickerTitle:'',stickerLocation:'',stickerAvatar:'🙂',stickerCutoutShape:'Circle',stickerOptions:['Yes','No','Maybe','Sure'],stickerCorrect:0,stickerVote:null,stickerReply:'',stickerReplyText:'',stickerDeadline:'',stickerLink:'',stickerGifUrl:'',stickerGifName:'',stickerPhotoUrl:'',stickerPhotoName:'',stickerEmoji:'😍',stickerSliderValue:50,stickerDateMode:'Both',stickerFrame:'Classic',musicUrl:'',musicName:'',lyrics:'',mentions:[],mentionQuery:'',allowReshare:true,drawColor:'#ffffff',drawWidth:4,strokes:[],drawing:false,audience:'Your story',aiLabel:false,notice:''};
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
  if (ssTicker) clearInterval(ssTicker);
  if (ssSession) for (const media of ssSession.media) if (!media.sample && media.url) URL.revokeObjectURL(media.url);
  if (ssSession?.musicUrl) URL.revokeObjectURL(ssSession.musicUrl);
  if (ssSession?.stickerGifUrl) URL.revokeObjectURL(ssSession.stickerGifUrl);
  if (ssSession?.stickerPhotoUrl) URL.revokeObjectURL(ssSession.stickerPhotoUrl);
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
  ssTicker = setInterval(() => { if (ssSession?.stickerKind==='Countdown') { const clock=ssDialog?.querySelector('.ss-countdown');if(clock)clock.textContent=ssTimeLeft(ssSession.stickerDeadline); } },1000);
}
function ssGlyph(name,fallback='•') {return `<i data-lucide="${name}" aria-hidden="true">${fallback}</i>`;}
function ssIcon(label, action, glyph, extra='') { return `<button class="ss-icon" data-ss="${action}" aria-label="${ssE(label)}" title="${ssE(label)}" ${extra}>${ssGlyph(ssIconNames[action]||'circle',glyph)}</button>`; }
function ssMediaHTML(m) {
  if (!m) return '';
  const src = ssE(m.url);
  return m.type.startsWith('video/') ? `<video src="${src}" muted autoplay loop playsinline aria-label="Story video preview"></video>` : `<img src="${src}" alt="${ssE(m.name || 'Story media')}">`;
}
function ssFontCss() {
  const s=ssSession,f=ssFonts[s.font]||ssFonts.Classic;
  return `font-family:${f[0]};font-weight:${s.textBold?'900':f[1]};font-style:${s.textItalic?'italic':f[2]};letter-spacing:${f[3]};${s.textOutline||s.font==='Outline'?'-webkit-text-stroke:1.5px #15151a;':''}${s.textShadow||s.font==='Shadow'?'text-shadow:0 3px 9px #000c;':'text-shadow:none;'}${s.textNeon||s.font==='Neon'?`text-shadow:0 0 9px ${s.textColor},0 0 25px ${s.textColor};`:''}${s.textGradient||s.font==='Gradient'?'background:linear-gradient(90deg,#ff4fa3,#fef08a,#38bdf8);background-clip:text;-webkit-background-clip:text;color:transparent;':''}`;
}
function ssTimeLeft(value) {
  const time=new Date(value).getTime();
  if(!Number.isFinite(time))return 'Set date and time';
  const seconds=Math.max(0,Math.floor((time-Date.now())/1000));
  if(!seconds)return 'Countdown finished';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}
function ssDateLabel(s=ssSession) {
  const date=new Date(),language=ssLanguages[s.language]?.lang||'en';
  if(s.stickerDateMode==='Time')return date.toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit'});
  if(s.stickerDateMode==='Date')return date.toLocaleDateString(language,{day:'numeric',month:'short',year:'numeric'});
  return date.toLocaleString(language,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function ssSafeLink(value) {
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function ssStickerCard() {
  const s=ssSession,kind=s.stickerKind;
  if(!kind||kind==='Frame')return '';
  const title=ssE(s.stickerTitle||({Poll:'Your vote?',Questions:'Ask me a question',Quiz:'Choose the answer',Countdown:'Coming soon',Link:'Link',GIF:'GIF',AddYours:'Add yours',EmojiSlider:'How much?',Hashtag:'CrushX',DateTime:'Date & time',Photo:'Photo sticker'})[kind]);
  let inner='';
  if(kind==='Poll')inner=`<strong>${title}</strong><div class="ss-card-choices">${s.stickerOptions.slice(0,2).map((v,i)=>`<button data-ss-vote="${i}" aria-pressed="${s.stickerVote===i}">${ssE(v||`Option ${i+1}`)} ${s.stickerVote===i?'✓':''}</button>`).join('')}</div><small>${s.stickerVote===null?'Try a local preview vote':'Preview vote recorded on this device'}</small>`;
  if(kind==='Quiz')inner=`<strong>${title}</strong><div class="ss-card-choices">${s.stickerOptions.slice(0,4).map((v,i)=>`<button data-ss-vote="${i}" aria-pressed="${s.stickerVote===i}">${ssE(v||`Option ${i+1}`)} ${s.stickerVote===i?(i===s.stickerCorrect?'✓':'✕'):''}</button>`).join('')}</div>${s.stickerVote!==null?`<small>${s.stickerVote===s.stickerCorrect?'Correct!':'Try again'}</small>`:'<small>Tap an answer to preview</small>'}`;
  if(kind==='Questions')inner=`<strong>${title}</strong><input class="ss-card-reply" data-ss-question-reply maxlength="180" placeholder="Type a local answer…" value="${ssE(s.stickerReplyText)}"><button class="ss-card-send" data-ss="send-reply">Reply</button>${s.stickerReply?`<small>Preview reply: ${ssE(s.stickerReply)}</small>`:''}`;
  if(kind==='Countdown')inner=`<strong>${title}</strong><div class="ss-countdown">${ssTimeLeft(s.stickerDeadline)}</div>`;
  if(kind==='Link'){const href=ssSafeLink(s.stickerLink);inner=`<strong>🔗 ${title}</strong>${href?`<a href="${ssE(href)}" target="_blank" rel="noopener noreferrer">Visit ${ssE(new URL(href).hostname)} ↗</a>`:'<small>Add a valid HTTPS link</small>'}`;}
  if(kind==='GIF')inner=s.stickerGifUrl?`<img class="ss-gif-sticker" src="${ssE(s.stickerGifUrl)}" alt="Animated GIF sticker">`:'<strong>Choose a GIF from your device</strong>';
  if(kind==='Location')inner=`<strong>📍 ${ssE(s.stickerLocation||'Add a place')}</strong><small>Manual place label · No location lookup or geotag is sent.</small>`;
  if(kind==='Cutouts')inner=s.stickerPhotoUrl?`<img class="ss-cutout-${s.stickerCutoutShape.toLowerCase()}" src="${ssE(s.stickerPhotoUrl)}" alt="Cutout from your chosen photo">`:'<strong>Choose a local photo for a cutout</strong>';
  if(kind==='Avatar')inner=`<strong class="ss-avatar-preview" aria-label="Emoji avatar preview">${ssE(s.stickerAvatar)}</strong><small>Emoji avatar preview · Not a generated personal avatar.</small>`;
  if(kind==='AddYoursMusic')inner=`<strong>♫ ${title}</strong><span>${ssE(s.musicName||'Choose your own audio')}</span><small>Local invitation preview · No shared music challenge is created.</small>`;
  if(kind==='AddYours')inner=`<strong>📷 ${title}</strong><button data-ss="add-yours" class="ss-card-send">${s.stickerPhotoUrl?'Change your photo':'Add a local photo'}</button>${s.stickerPhotoUrl?`<img class="ss-photo-sticker" src="${ssE(s.stickerPhotoUrl)}" alt="Local Add Yours photo">`:''}<small>Draft-only invitation; no other users are notified.</small>`;
  if(kind==='EmojiSlider')inner=`<strong>${title}</strong><div style="font-size:30px">${ssE(s.stickerEmoji)}</div><input type="range" data-ss-slider min="0" max="100" value="${s.stickerSliderValue}" aria-label="Emoji slider preview"><output data-ss-slider-value>${s.stickerSliderValue}%</output>`;
  if(kind==='Hashtag')inner=`<button class="ss-hashtag" data-ss="preview-hashtag">#${ssE((s.stickerTitle||'CrushX').replace(/^#+/,''))}</button>`;
  if(kind==='DateTime')inner=`<strong>📅 ${ssE(ssDateLabel(s))}</strong>`;
  if(kind==='Photo')inner=s.stickerPhotoUrl?`<img class="ss-photo-sticker" src="${ssE(s.stickerPhotoUrl)}" alt="Photo sticker">`:'<strong>Choose a photo from your device</strong>';
  return `<div class="ss-sticker-card ss-card-${kind.toLowerCase()}" aria-label="${ssE(kind)} sticker">${inner}</div>`;
}
function ssStage() {
  const s=ssSession, selected=s.selected.map(id => s.media.find(m => m.id===id)).filter(Boolean);
  const collage=selected.length>1;
  const pictures=collage ? `<div class="ss-collage" data-count="${selected.length}" style="filter:${ssFilters[s.filter]}">${selected.map(ssMediaHTML).join('')}</div>` : selected.length ? `<div style="position:absolute;inset:0;filter:${ssFilters[s.filter]}">${ssMediaHTML(selected[0])}</div>` : '';
  return `<div class="ss-stage" style="background:${ssBackgrounds[s.bg]}">
    ${pictures}
    ${s.stickerKind==='Frame'?`<div class="ss-story-frame ss-frame-${s.stickerFrame.toLowerCase()}" aria-label="${ssE(s.stickerFrame)} photo frame"></div>`:''}
    ${s.text ? `<div data-ss-textlayer tabindex="0" lang="${ssLanguages[s.language].lang}" class="ss-overlay-text ss-animate-${s.textAnimation.toLowerCase()} ${s.textBg?'is-backed':''}" title="Drag to position text" style="left:${s.textX}%;top:${s.textY}%;font-size:${s.textSize}px;color:${s.textColor};text-align:${s.textAlign};transform:translate(-50%,-50%) rotate(${s.textRotation}deg) scale(${s.textScale/100});${ssFontCss()}">${ssE(s.text)}</div>` : ''}
    ${s.sticker ? `<div class="ss-stickers">${ssE(s.sticker)}</div>` : ''}
    ${ssStickerCard()}
    ${s.mentions.length ? `<div class="ss-mentions">${s.mentions.map(id=>ssE('@'+(getState().users.find(u=>u.id===id)?.username||''))).join(' ')}</div>` : ''}
    ${s.lyrics?`<div class="ss-lyrics" aria-label="Manual music lyrics">♫ ${ssE(s.lyrics)}</div>`:''}
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
        <button data-ss="templates">${ssGlyph('layout-template','▦')}Templates</button><button data-ss="quick-effects">${ssGlyph('sparkles','✨')}Effects</button><button data-ss="quick-music">${ssGlyph('music-2','♫')}Music</button><button data-ss="collage">${ssGlyph('layout-grid','▧')}Collage</button>
      </div>
      <div class="ss-albums"><button data-ss="album-toggle" class="ss-action" aria-expanded="${s.albumOpen}">${ssE(s.album)} ⌄</button><button data-ss="multi" class="ss-action ${s.multi?'is-on':''}" aria-pressed="${s.multi}">☷ Select</button></div>
      ${s.albumOpen ? `<div class="ss-gallery-menu">${['Recents','Photos','Videos','All albums','Google Photos','From Meta apps'].map(name=>`<button data-ss-album="${ssE(name)}" aria-pressed="${s.album===name}">${ssE(name)} ${['Google Photos','From Meta apps'].includes(name)?'<small>Not connected</small>':''}</button>`).join('')}</div>` : ''}
      <p class="ss-note">Browser access only: choose media from your device. Other tiles are labeled sample content.</p>
      <div class="ss-grid"><button data-ss="camera" aria-label="Take photo or video" style="font-size:35px">${ssGlyph('camera','📷')}<span class="ss-source">Camera</span></button><button data-ss="file" aria-label="Choose images or videos" style="font-size:32px">${ssGlyph('image-plus','＋')}<span class="ss-source">Choose files</span></button>
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
    <nav class="ss-tools" aria-label="Story editor tools">${actions.map(([id,icon,label])=>`<button data-ss="${id}" class="${s.panel===id?'is-on':''}" aria-label="${label}">${ssGlyph(ssIconNames[id],icon)}<span>${label}</span></button>`).join('')}</nav>
    <footer class="ss-foot"><button data-ss="audience-story" class="ss-action ${s.audience==='Your story'?'is-on':''}">${ssGlyph('circle-dot','◉')} Your story</button><button data-ss="audience-close" class="ss-action ${s.audience==='Close Friends'?'is-on':''}">${ssGlyph('star','★')} Close Friends</button><button data-ss="review" class="ss-primary" aria-label="Next to story review">Next ${ssGlyph('arrow-right','→')}</button></footer>
    ${ssPanel()}
    <input type="file" data-ss-photo accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    ${s.notice?`<div class="ss-toolbar-notice" role="status">${ssE(s.notice)}</div>`:''}
  </div>`;
}
function ssReview() {
  const s=ssSession;
  return `<div class="ss-shell"><header class="ss-head">${ssIcon('Back to editor','back','←')}<h2>Review story</h2><span>✓</span></header>
    <div class="ss-review">${ssStage()}<div style="margin-top:14px"><b>Audience: ${ssE(s.audience)}</b><p class="ss-note">Local preview only. No story is published, and no followers or mentioned accounts are notified.</p>${s.musicName?`<p>♫ ${ssE(s.musicName)} (preview audio is not embedded in PNG)</p>`:''}${s.aiLabel?'<p>AI-generated content label: On (self-declared)</p>':''}${s.mentions.length?`<p>Mentions selected: ${s.mentions.length} (not notified)</p>`:''}</div></div>
    <footer class="ss-foot"><button data-ss="save" class="ss-action">${ssGlyph('download','↓')} Save image</button><button data-ss="check-publish" class="ss-primary">${ssGlyph('shield-check','✓')} Check sharing</button></footer>
    ${s.notice?`<div class="ss-toolbar-notice" role="status">${ssE(s.notice)}</div>`:''}
  </div>`;
}
function ssRender() {
  if (!ssDialog||!ssSession) return;
  const previousPanel=ssDialog.querySelector?.('.ss-surface');
  const previousScroll=previousPanel?.scrollTop||0;
  ssDialog.innerHTML=ssSession.view==='gallery'?ssGallery():ssSession.view==='review'?ssReview():ssEditor();
  if(previousPanel&&ssSession.panel){const next=ssDialog.querySelector?.('.ss-surface');if(next)next.scrollTop=previousScroll;}
  try{window.lucide?.createIcons?.();}catch{} // Icon package may be unavailable offline; fallback glyphs remain.
  ssRedraw();
}

function ssUserRows() {
  const s=ssSession;
  const q=s.mentionQuery.trim().toLowerCase();
  const users=getState().users.filter(u=>u.id!==getState().currentUserId && (`${u.username} ${u.fullName}`).toLowerCase().includes(q)).slice(0,25);
  return users.length?users.map(u=>`<button class="ss-user" data-ss-user="${ssE(u.id)}" aria-pressed="${s.mentions.includes(u.id)}"><img src="${safeMediaUrl(u.avatar)}" alt=""><span><b>${ssE(u.username)}</b><br><small>${ssE(u.fullName)}</small></span><span class="ss-check">${s.mentions.includes(u.id)?'✓':''}</span></button>`).join(''):'<p class="ss-note">No matching sample profiles.</p>';
}
function ssStickerOptionsPanel() {
  const s=ssSession,k=s.stickerKind;
  if(!k)return '<p class="ss-note">Choose a sticker type to customize its preview.</p>';
  if(k==='GIF')return `<label class="ss-action">Choose GIF <input data-ss-gif type="file" accept="image/gif" hidden></label>${s.stickerGifName?`<p>${ssE(s.stickerGifName)}</p>`:''}<p class="ss-note">Use a GIF you own or have rights to. PNG saves only a still frame.</p>`;
  if(k==='Location')return `<label>Place label<input class="ss-field" data-ss-sticker-field="stickerLocation" maxlength="80" value="${ssE(s.stickerLocation)}" placeholder="Where was this moment?"></label><p class="ss-note">Manual label only. No GPS, place search or location sharing occurs.</p>`;
  if(k==='Cutouts')return `<button class="ss-action" data-ss="add-yours">Choose image to cut out</button><label>Shape<select class="ss-field" data-ss-cutout-shape>${['Circle','Square','Rounded'].map(name=>`<option ${s.stickerCutoutShape===name?'selected':''}>${name}</option>`).join('')}</select></label><p class="ss-note">Simple clipped photo shape only; automatic background removal requires a segmentation model.</p>`;
  if(k==='Avatar')return `<p class="ss-note">Choose an emoji avatar for this draft; a 3D or account avatar generator is not connected.</p><div class="ss-pills">${['🙂','😎','🥰','🤩','🥳','🦊','🐱','💜'].map(emoji=>`<button class="ss-pill ${s.stickerAvatar===emoji?'is-on':''}" data-ss-avatar="${emoji}" aria-label="Avatar ${emoji}" aria-pressed="${s.stickerAvatar===emoji}">${emoji}</button>`).join('')}</div>`;
  if(k==='AddYoursMusic')return `<label>Music prompt<input class="ss-field" data-ss-sticker-field="stickerTitle" maxlength="120" value="${ssE(s.stickerTitle)}" placeholder="A song for this moment"></label><label class="ss-action">Choose your audio <input data-ss-audio type="file" accept="audio/*" hidden></label>${s.musicName?`<p>♫ ${ssE(s.musicName)}</p>`:''}<p class="ss-note">Preview only. No Instagram audio catalog or shared challenge is connected.</p>`;
  if(k==='Photo'||k==='AddYours')return `${k==='AddYours'?`<label>Invitation prompt<input class="ss-field" data-ss-sticker-field="stickerTitle" maxlength="120" value="${ssE(s.stickerTitle)}" placeholder="Add yours"></label>`:''}<button class="ss-action" data-ss="add-yours">Choose local photo</button>${s.stickerPhotoName?`<p>${ssE(s.stickerPhotoName)}</p>`:''}<p class="ss-note">This is a local photo sticker. Add Yours cannot invite other accounts without a verified backend.</p>`;
  if(k==='DateTime')return `<label>Date and time format<select class="ss-field" data-ss-date-mode>${['Both','Date','Time'].map(mode=>`<option ${s.stickerDateMode===mode?'selected':''}>${mode}</option>`).join('')}</select></label>`;
  if(k==='Frame')return `<label>Frame style<select class="ss-field" data-ss-frame>${['Classic','Polaroid','Neon'].map(mode=>`<option ${s.stickerFrame===mode?'selected':''}>${mode}</option>`).join('')}</select></label><p class="ss-note">Frame is rendered around the whole story and saved in PNG.</p>`;
  if(k==='EmojiSlider')return `<label>Slider question<input class="ss-field" data-ss-sticker-field="stickerTitle" maxlength="120" value="${ssE(s.stickerTitle)}" placeholder="How much?"></label><label>Slider emoji<select class="ss-field" data-ss-emoji>${['😍','🔥','❤️','😂','💜','✨'].map(emoji=>`<option ${s.stickerEmoji===emoji?'selected':''}>${emoji}</option>`).join('')}</select></label><label>Preview value <input type="range" data-ss-slider min="0" max="100" value="${s.stickerSliderValue}"></label><p class="ss-note">Only this browser's preview value changes.</p>`;
  let fields=`<label>${k==='Link'?'Link label':'Sticker title / question'}<input class="ss-field" data-ss-sticker-field="stickerTitle" maxlength="120" value="${ssE(s.stickerTitle)}" placeholder="${k==='Questions'?'Ask me anything…':'Write your text…'}"></label>`;
  if(k==='Poll'||k==='Quiz')fields+=`<div class="ss-sticker-form">${s.stickerOptions.slice(0,k==='Poll'?2:4).map((option,i)=>`<label>${k==='Quiz'?`<input type="radio" name="ss-correct" data-ss-correct="${i}" ${s.stickerCorrect===i?'checked':''} aria-label="Correct answer ${i+1}">`:''}Option ${i+1}<input class="ss-field" data-ss-option="${i}" maxlength="45" value="${ssE(option)}"></label>`).join('')}</div><p class="ss-note">${k==='Quiz'?'Choose the correct-answer radio button.':'Poll votes are preview-only and not shared.'}</p>`;
  if(k==='Countdown')fields+=`<label>Countdown date and time <input class="ss-field" type="datetime-local" data-ss-deadline value="${ssE(s.stickerDeadline)}"></label>`;
  if(k==='Link')fields+=`<label>HTTPS link <input class="ss-field" type="url" inputmode="url" data-ss-sticker-field="stickerLink" value="${ssE(s.stickerLink)}" placeholder="https://example.com"></label>`;
  return fields;
}
function ssPanel() {
  const s=ssSession,p=s.panel;
  if (!p) return '';
  let body='';
  if (p==='text') body=`<textarea class="ss-field" data-ss-text rows="3" maxlength="280" spellcheck="true" lang="${ssLanguages[s.language].lang}" placeholder="Type your story text…">${ssE(s.text)}</textarea>
    <label class="ss-line-label">Writing language<select class="ss-field" data-ss-language>${Object.keys(ssLanguages).map(lang=>`<option ${s.language===lang?'selected':''}>${lang}</option>`).join('')}</select></label>
    <p class="ss-note">AURA-X writing ideas (offline examples; no AI model or translation call)</p><div class="ss-pills">${ssLanguages[s.language].ideas.map((idea,i)=>`<button class="ss-pill" data-ss-idea="${i}">${ssE(idea)}</button>`).join('')}</div>
    <h4>24 writing styles</h4><div class="ss-font-grid">${Object.keys(ssFonts).map(f=>`<button class="ss-pill ${f===s.font?'is-on':''}" data-ss-font="${f}" style="font-family:${ssFonts[f][0]}">${f}</button>`).join('')}</div>
    <div class="ss-pills">${['Bold','Italic','Outline','Shadow','Gradient','Neon'].map(kind=>`<button class="ss-pill ${s['text'+kind]?'is-on':''}" data-ss-typography="${kind}" aria-pressed="${s['text'+kind]}">${kind}</button>`).join('')}</div>
    <label class="ss-line-label">Animation<select class="ss-field" data-ss-animation>${['None','Typing','Bounce','Fade','Slide'].map(name=>`<option ${s.textAnimation===name?'selected':''}>${name}</option>`).join('')}</select></label>
    <label>Size (${s.textSize}px) <input data-ss-range="textSize" type="range" min="18" max="82" value="${s.textSize}"></label>
    <label>Horizontal position (${s.textX}%) <input data-ss-range="textX" type="range" min="8" max="92" value="${s.textX}"></label>
    <label>Vertical position (${s.textY}%) <input data-ss-range="textY" type="range" min="12" max="88" value="${s.textY}"></label>
    <label>Rotation (${s.textRotation}°) <input data-ss-range="textRotation" type="range" min="-180" max="180" value="${s.textRotation}"></label>
    <label>Scale (${s.textScale}%) <input data-ss-range="textScale" type="range" min="50" max="180" value="${s.textScale}"></label>
    <div class="ss-swatches">${ssColors.map(c=>`<button class="ss-swatch" style="background:${c}" data-ss-color="${c}" aria-label="Text color ${c}" aria-pressed="${s.textColor===c}"></button>`).join('')}</div>
    <div class="ss-pills"><button class="ss-pill" data-ss="text-align">Align: ${s.textAlign}</button><button class="ss-pill ${s.textBg?'is-on':''}" data-ss="text-bg">Background ${s.textBg?'On':'Off'}</button><button class="ss-pill" data-ss="text-clear">Clear text</button></div><p class="ss-note">You can drag text directly on the preview. Animated effects are preview-only; PNG captures a still frame.</p>`;
  else if (p==='stickers') body=`<p class="ss-note">Choose a sticker. Poll, quiz and question responses stay only in this preview.</p><div class="ss-pills">${['❤️','🔥','✨','😍','🎉','💫','😊','💜','🌈','📍'].map(e=>`<button data-ss-sticker="${e}" class="ss-pill" style="font-size:27px">${e}</button>`).join('')}</div>
    <div class="ss-sticker-types">${ssStickerTypes.map(([id,label])=>`<button class="ss-pill ${s.stickerKind===id?'is-on':''}" data-ss-sticker-kind="${id}">${ssGlyph(ssStickerIcons[id],'✦')}<span>${label}</span></button>`).join('')}</div>
    <div class="ss-sticker-form">${ssStickerOptionsPanel()}</div>
    <label>Location sticker (manual)<input data-ss-location class="ss-field" maxlength="50" placeholder="Enter a place"></label><div class="ss-pills"><button class="ss-action" data-ss="add-location">Add location</button><button class="ss-action" data-ss="remove-sticker">Remove stickers</button></div>`;
  else if (p==='music') body=`<p class="ss-note">Choose audio from your device. No licensed music catalog is connected. Audio cannot be embedded in a PNG.</p><label class="ss-action" style="display:inline-block">Choose audio <input type="file" data-ss-audio accept="audio/*" hidden></label>${s.musicUrl?`<p style="margin:14px 0">♫ ${ssE(s.musicName)}</p><audio src="${ssE(s.musicUrl)}" controls style="width:100%"></audio><button class="ss-action" data-ss="remove-music">Remove music</button>`:''}<label class="ss-line-label">Manual lyrics (only use lyrics you have rights to)<textarea class="ss-field" data-ss-lyrics rows="2" maxlength="160" placeholder="Enter lyrics or your own words">${ssE(s.lyrics)}</textarea></label><p class="ss-note">Automatic synced lyrics and commercial music search require a licensed catalog/provider.</p>`;
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
  const vote=event.target.closest('[data-ss-vote]');
  if(vote){s.stickerVote=Number(vote.dataset.ssVote);return ssRender();}
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
  const avatar=event.target.closest('[data-ss-avatar]');if(avatar){s.stickerAvatar=avatar.dataset.ssAvatar;return ssRender();}
  const drawcolor=event.target.closest('[data-ss-drawcolor]');if(drawcolor){s.drawColor=drawcolor.dataset.ssDrawcolor;return ssRender();}
  const sticker=event.target.closest('[data-ss-sticker]');if(sticker){s.sticker=sticker.dataset.ssSticker;s.panel='';return ssRender();}
  const kind=event.target.closest('[data-ss-sticker-kind]');if(kind){
    if(kind.dataset.ssStickerKind==='Music'||kind.dataset.ssStickerKind==='Mention'){s.panel=kind.dataset.ssStickerKind==='Music'?'music':'mention';return ssRender();}
    s.stickerKind=kind.dataset.ssStickerKind;s.stickerVote=null;s.stickerTitle='';return ssRender();
  }
  const typography=event.target.closest('[data-ss-typography]');if(typography){const key='text'+typography.dataset.ssTypography;s[key]=!s[key];return ssRender();}
  const idea=event.target.closest('[data-ss-idea]');if(idea){const line=ssLanguages[s.language].ideas[Number(idea.dataset.ssIdea)];if(line)s.text=s.text?`${s.text}\n${line}`:line;return ssRender();}
  const filter=event.target.closest('[data-ss-filter]');if(filter){s.filter=filter.dataset.ssFilter;return ssRender();}
  const bg=event.target.closest('[data-ss-bg]');if(bg){s.bg=bg.dataset.ssBg;return ssRender();}
  const cat=event.target.closest('[data-ss-cat]');if(cat){s.effectCat=cat.dataset.ssCat;return ssRender();}
  const button=event.target.closest('[data-ss]');if(!button)return;
  const action=button.dataset.ss;
  if(action==='close') return ssClose();
  if(action==='file')return ssDialog.querySelector('[data-ss-file]')?.click();
  if(action==='camera')return ssDialog.querySelector('[data-ss-camera]')?.click();
  if(action==='add-yours')return ssDialog.querySelector('[data-ss-photo]')?.click();
  if(action==='preview-hashtag')return ssNotice('Hashtag is shown in this local draft. Public hashtag browsing is not connected.');
  if(action==='album-toggle'){s.albumOpen=!s.albumOpen;return ssRender();}
  if(action==='multi'){s.multi=!s.multi;s.selected=[];return ssRender();}
  if(action==='collage'){s.multi=true;s.selected=[];return ssNotice('Select 2–4 tiles, then tap Next to make a collage.');}
  if(action==='edit-selected'){if(s.selected.length<2)return;s.view='editor';s.panel='';return ssRender();}
  if(action==='templates'){s.view='editor';s.selected=[];s.panel='restyle';return ssRender();}
  if(action==='quick-effects'&&!s.selected.length)return ssNotice('Choose a photo or video, then open Effects in the editor. Live camera effects are not connected.');
  if(action==='quick-effects'||action==='quick-music'){s.view='editor';s.panel=action==='quick-effects'?'effects':'music';return ssRender();}
  if(action==='back') {if(s.view==='review')s.view='editor';else{s.view='gallery';s.panel='';s.drawing=false;}return ssRender();}
  if(action==='panel-close'){s.panel='';s.drawing=false;return ssRender();}
  if(['text','stickers','music','restyle','effects','mention','draw','label','settings','more'].includes(action)) {s.panel=action;s.drawing=action==='draw';return ssRender();}
  if(action==='remove-music'){if(s.musicUrl)URL.revokeObjectURL(s.musicUrl);s.musicUrl='';s.musicName='';return ssRender();}
  if(action==='save-effect'){s.savedEffects=s.savedEffects.includes(s.filter)?s.savedEffects.filter(f=>f!==s.filter):[...s.savedEffects,s.filter];return ssRender();}
  if(action==='text-align'){s.textAlign={center:'left',left:'right',right:'center'}[s.textAlign];return ssRender();}
  if(action==='text-bg'){s.textBg=!s.textBg;return ssRender();}
  if(action==='text-clear'){s.text='';return ssRender();}
  if(action==='remove-sticker'){s.sticker='';s.stickerKind='';s.stickerVote=null;return ssRender();}
  if(action==='add-location'){const location=ssDialog.querySelector('[data-ss-location]')?.value.trim();if(!location)return ssNotice('Enter a location first.');s.sticker='📍 '+location.slice(0,50);s.panel='';return ssRender();}
  if(action==='mention-done'){if(!s.mentions.length)return;s.panel='';return ssRender();}
  if(action==='send-reply'){const reply=s.stickerReplyText.trim();if(!reply)return ssNotice('Type a preview reply first.');s.stickerReply=reply.slice(0,180);return ssRender();}
  if(action==='toggle-draw'){s.drawing=!s.drawing;return ssRender();}
  if(action==='undo-draw'){s.strokes.pop();return ssRender();}
  if(action==='clear-draw'){s.strokes=[];return ssRender();}
  if(action==='clear-overlays'){s.text='';s.sticker='';s.stickerKind='';s.lyrics='';s.mentions=[];s.strokes=[];s.panel='';return ssRender();}
  if(action==='audience-story'||action==='audience-close'){s.audience=action==='audience-story'?'Your story':'Close Friends';return ssRender();}
  if(action==='review'){s.drawing=false;s.panel='';s.view='review';return ssRender();}
  if(action==='check-publish')return ssNotice('Live sharing is not connected. This story is not published. You can save a PNG preview.');
  if(action==='save')return ssExport();
}

function ssInput(event) {
  const s=ssSession; if(!s)return;
  const target=event.target;
  if(target.matches('[data-ss-text]'))s.text=target.value.slice(0,280);
  else if(target.matches('[data-ss-lyrics]'))s.lyrics=target.value.slice(0,160);
  else if(target.matches('[data-ss-sticker-field]')){
    const field=target.dataset.ssStickerField;
    if(['stickerTitle','stickerLink','stickerLocation'].includes(field))s[field]=target.value.slice(0,field==='stickerLink'?500:field==='stickerLocation'?80:120);
  }
  else if(target.matches('[data-ss-option]'))s.stickerOptions[Number(target.dataset.ssOption)]=target.value.slice(0,45);
  else if(target.matches('[data-ss-question-reply]')){s.stickerReplyText=target.value.slice(0,180);return;}
  else if(target.matches('[data-ss-slider]')){
    s.stickerSliderValue=Math.max(0,Math.min(100,Number(target.value)||0));
    ssDialog.querySelectorAll('[data-ss-slider-value]').forEach(output=>{output.textContent=s.stickerSliderValue+'%';});
    ssDialog.querySelectorAll('[data-ss-slider]').forEach(input=>{if(input!==target)input.value=String(s.stickerSliderValue);});
    return;
  }
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
  if(target.matches('[data-ss-gif]')){
    const file=target.files?.[0];if(!file)return;
    if(file.type!=='image/gif'||file.size>12*1024*1024||file.size<=0)return ssNotice('Choose a GIF file up to 12 MB.');
    if(s.stickerGifUrl)URL.revokeObjectURL(s.stickerGifUrl);
    s.stickerGifUrl=URL.createObjectURL(file);s.stickerGifName=file.name;s.stickerKind='GIF';return ssRender();
  }
  if(target.matches('[data-ss-photo]')){
    const file=target.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>12*1024*1024||file.size<=0)return ssNotice('Choose a JPG, PNG, WebP or GIF photo up to 12 MB.');
    if(s.stickerPhotoUrl)URL.revokeObjectURL(s.stickerPhotoUrl);
    s.stickerPhotoUrl=URL.createObjectURL(file);s.stickerPhotoName=file.name;
    return ssRender();
  }
  if(target.matches('[data-ss-date-mode]')){s.stickerDateMode=['Both','Date','Time'].includes(target.value)?target.value:'Both';return ssRender();}
  if(target.matches('[data-ss-frame]')){s.stickerFrame=['Classic','Polaroid','Neon'].includes(target.value)?target.value:'Classic';return ssRender();}
  if(target.matches('[data-ss-cutout-shape]')){s.stickerCutoutShape=['Circle','Square','Rounded'].includes(target.value)?target.value:'Circle';return ssRender();}
  if(target.matches('[data-ss-emoji]')){s.stickerEmoji=['😍','🔥','❤️','😂','💜','✨'].includes(target.value)?target.value:'😍';return ssRender();}
  if(target.matches('[data-ss-language]')){s.language=target.value in ssLanguages?target.value:'English';return ssRender();}
  if(target.matches('[data-ss-animation]')){s.textAnimation=['None','Typing','Bounce','Fade','Slide'].includes(target.value)?target.value:'None';return ssRender();}
  if(target.matches('[data-ss-correct]')){s.stickerCorrect=Number(target.dataset.ssCorrect);return ssRender();}
  if(target.matches('[data-ss-deadline]')){s.stickerDeadline=target.value;return ssRender();}
  if(target.matches('[data-ss-reshare]'))s.allowReshare=target.checked;
  if(target.matches('[data-ss-ai]'))s.aiLabel=target.checked;
  if(target.matches('[data-ss-audience]'))s.audience=target.value;
}

function ssCanvasPoint(event,canvas) {
  const rect=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
}
function ssDrawStart(event) {
  const s=ssSession;
  const textLayer=event.target.closest('[data-ss-textlayer]');
  if(textLayer&&s?.view==='editor'&&!s.drawing){
    const stage=textLayer.closest('.ss-stage');if(!stage)return;
    event.preventDefault();
    s.textDragPointer=event.pointerId;
    textLayer.setPointerCapture?.(event.pointerId);
    return;
  }
  const canvas=event.target.closest('canvas[data-ss-canvas]');
  if(!canvas||!s?.drawing||s.view!=='editor')return;
  event.preventDefault();
  ssSession.activePointer=event.pointerId;
  ssSession.strokes.push({color:ssSession.drawColor,width:ssSession.drawWidth,points:[ssCanvasPoint(event,canvas)]});
  canvas.setPointerCapture?.(event.pointerId);
  ssRedraw();
}
function ssDrawMove(event) {
  const s=ssSession;
  if(s?.textDragPointer===event.pointerId){
    const layer=ssDialog?.querySelector('[data-ss-textlayer]');const stage=layer?.closest('.ss-stage');
    if(!layer||!stage)return;
    const rect=stage.getBoundingClientRect();
    s.textX=Math.round(Math.max(8,Math.min(92,(event.clientX-rect.left)/rect.width*100)));
    s.textY=Math.round(Math.max(12,Math.min(88,(event.clientY-rect.top)/rect.height*100)));
    layer.style.left=s.textX+'%';layer.style.top=s.textY+'%';
    event.preventDefault();return;
  }
  if(!s||s.activePointer!==event.pointerId)return;
  const canvas=ssDialog?.querySelector('canvas[data-ss-canvas]');
  if(!canvas)return;
  event.preventDefault();
  s.strokes[s.strokes.length-1]?.points.push(ssCanvasPoint(event,canvas));
  ssRedraw();
}
function ssDrawEnd(event) {
  if(ssSession?.activePointer===event.pointerId)ssSession.activePointer=null;
  if(ssSession?.textDragPointer===event.pointerId){ssSession.textDragPointer=null;ssRender();}
}
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
function ssWrappedText(ctx,text,x,y,maxWidth,lineHeight,outline=false) {
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
  lines.forEach((line,i)=>{if(outline)ctx.strokeText(line,x,firstY+i*lineHeight,maxWidth);ctx.fillText(line,x,firstY+i*lineHeight,maxWidth);});
}
function ssRoundRect(ctx,x,y,w,h,r) {if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);}
function ssDrawFrame(ctx) {
  const kind=ssSession?.stickerFrame;
  if(ssSession?.stickerKind!=='Frame')return;
  ctx.save();
  if(kind==='Polaroid'){
    ctx.fillStyle='#faf9f6';ctx.fillRect(0,0,720,30);ctx.fillRect(0,0,30,1280);ctx.fillRect(690,0,30,1280);ctx.fillRect(0,1140,720,140);
    ctx.fillStyle='#41414a';ctx.font='italic 36px Georgia,serif';ctx.textAlign='center';ctx.fillText('Crush.X moments',360,1220);
  }else{
    ctx.strokeStyle=kind==='Neon'?'#fa4bb7':'#ffffff';ctx.lineWidth=kind==='Neon'?24:18;
    if(kind==='Neon'){ctx.shadowColor='#f472b6';ctx.shadowBlur=46;}
    ctx.strokeRect(22,22,676,1236);
  }
  ctx.restore();
}
async function ssDrawCard(ctx) {
  const s=ssSession,k=s?.stickerKind;if(!k)return;
  const x=84,y=720,w=552;
  if(k==='Frame')return;
  if(k==='GIF'){
    if(!s.stickerGifUrl)return;
    const img=await ssLoadImage({url:s.stickerGifUrl,type:'image/gif'});
    ctx.save();ctx.beginPath();ssRoundRect(ctx,x,y,w,320,18);ctx.clip();ssCover(ctx,img,x,y,w,320);ctx.restore();return;
  }
  if(k==='Photo'||k==='AddYours'){
    ctx.save();ctx.fillStyle='#ffffffed';ctx.beginPath();ssRoundRect(ctx,x,y,w,k==='AddYours'?390:340,18);ctx.fill();
    if(k==='AddYours'){ctx.fillStyle='#18181b';ctx.textAlign='center';ctx.font='bold 32px Arial,sans-serif';ctx.fillText(s.stickerTitle||'📷 Add yours',360,y+48,480);}
    if(s.stickerPhotoUrl){const img=await ssLoadImage({url:s.stickerPhotoUrl,type:'image/jpeg'});ctx.save();ctx.beginPath();ssRoundRect(ctx,x+18,y+(k==='AddYours'?67:18),w-36,270,12);ctx.clip();ssCover(ctx,img,x+18,y+(k==='AddYours'?67:18),w-36,270);ctx.restore();}
    else{ctx.fillStyle='#52525b';ctx.font='bold 30px Arial,sans-serif';ctx.textAlign='center';ctx.fillText('Choose a local photo',360,y+180,500);}
    ctx.restore();return;
  }
  if(k==='Hashtag'){
    ctx.save();ctx.textAlign='center';ctx.font='bold 54px Arial,sans-serif';ctx.fillStyle='#ffffff';ctx.shadowColor='#000';ctx.shadowBlur=14;ctx.fillText('#'+(s.stickerTitle||'CrushX').replace(/^#+/,''),360,830,620);ctx.restore();return;
  }
  if(k==='DateTime'){
    ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=15;ctx.font='bold 45px Arial,sans-serif';ctx.textAlign='center';ctx.fillText('📅 '+ssDateLabel(s),360,830,650);ctx.restore();return;
  }
  if(k==='Cutouts'){
    if(!s.stickerPhotoUrl)return;
    const img=await ssLoadImage({url:s.stickerPhotoUrl,type:'image/jpeg'});
    ctx.save();ctx.beginPath();
    if(s.stickerCutoutShape==='Circle')ctx.arc(360,860,145,0,Math.PI*2);
    else ssRoundRect(ctx,215,715,290,290,s.stickerCutoutShape==='Rounded'?40:0);
    ctx.clip();ssCover(ctx,img,215,715,290,290);ctx.restore();return;
  }
  if(k==='Location'||k==='Avatar'||k==='AddYoursMusic'){
    ctx.save();ctx.fillStyle='#ffffffec';ctx.beginPath();ssRoundRect(ctx,x,y,w,200,22);ctx.fill();ctx.fillStyle='#18181b';ctx.textAlign='center';ctx.font='bold 36px Arial,sans-serif';
    const label=k==='Location'?`📍 ${s.stickerLocation||'Add a place'}`:k==='Avatar'?s.stickerAvatar:`♫ ${s.stickerTitle||'Add yours music'}`;
    ctx.fillText(label,360,y+75,500);
    if(k==='AddYoursMusic'){ctx.font='25px Arial,sans-serif';ctx.fillText(s.musicName||'Choose your own audio',360,y+140,490);}
    ctx.restore();return;
  }
  ctx.save();ctx.fillStyle='#fffc';ctx.beginPath();ssRoundRect(ctx,x,y,w,k==='Quiz'?365:275,20);ctx.fill();
  ctx.fillStyle='#15151a';ctx.font='bold 35px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(s.stickerTitle||({Poll:'Your vote?',Quiz:'Choose the answer',Questions:'Ask me a question',Countdown:'Coming soon',Link:'Link',EmojiSlider:'How much?',AddYours:'Add yours'})[k],360,y+55,490);
  if(k==='Poll'||k==='Quiz'){
    const total=k==='Poll'?2:4;
    for(let i=0;i<total;i++){
      const row=Math.floor(i/2),col=i%2,px=x+18+col*260,py=y+105+row*110;
      ctx.fillStyle=s.stickerVote===i?'#2563eb':'#e9e6ff';ctx.beginPath();ssRoundRect(ctx,px,py,247,87,12);ctx.fill();
      ctx.fillStyle=s.stickerVote===i?'#fff':'#27272a';ctx.font='bold 28px Arial,sans-serif';ctx.fillText(s.stickerOptions[i]||`Option ${i+1}`,px+123,py+45,215);
    }
  }else if(k==='Questions'){
    ctx.fillStyle='#f5d0fe';ctx.fillRect(x+22,y+95,w-44,120);ctx.fillStyle='#4a044e';ctx.font='28px Arial,sans-serif';ctx.fillText(s.stickerReply||'Type a preview reply',360,y+155,w-75);
  }else if(k==='Countdown'){
    ctx.font='bold 37px Arial,sans-serif';ctx.fillStyle='#a21caf';ctx.fillText(ssTimeLeft(s.stickerDeadline),360,y+150,w-45);
  }else if(k==='Link'){
    ctx.font='bold 28px Arial,sans-serif';ctx.fillStyle='#2563eb';ctx.fillText(ssSafeLink(s.stickerLink)?new URL(ssSafeLink(s.stickerLink)).hostname:'Add a valid HTTPS link',360,y+150,w-55);
  }else if(k==='EmojiSlider'){
    ctx.font='bold 61px Arial,sans-serif';ctx.fillStyle='#c026d3';ctx.fillText(`${s.stickerEmoji} ${s.stickerSliderValue}%`,360,y+155,w-55);
  }
  ctx.restore();
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
    ssDrawFrame(ctx);
    if(s.text){
      ctx.save();
      const size=s.textSize*2,f=ssFonts[s.font]||ssFonts.Classic;
      ctx.translate(720*s.textX/100,1280*s.textY/100);ctx.rotate(s.textRotation*Math.PI/180);ctx.scale(s.textScale/100,s.textScale/100);
      ctx.font=`${s.textItalic?'italic':f[2]} ${s.textBold?'900':f[1]} ${size}px ${f[0]}`;
      ctx.textAlign=s.textAlign;ctx.textBaseline='middle';
      const x=s.textAlign==='left'?-280:s.textAlign==='right'?280:0;
      if(s.textBg){ctx.fillStyle='#0009';ctx.fillRect(-330,-size*1.5,660,size*3);}
      ctx.fillStyle=s.textColor;
      if(s.textGradient||s.font==='Gradient'){const g=ctx.createLinearGradient(-260,0,260,0);g.addColorStop(0,'#ff4fa3');g.addColorStop(.5,'#fef08a');g.addColorStop(1,'#38bdf8');ctx.fillStyle=g;}
      if(s.textNeon||s.font==='Neon'){ctx.shadowColor=s.textColor;ctx.shadowBlur=32;}
      else if(s.textShadow||s.font==='Shadow'){ctx.shadowColor='#000b';ctx.shadowBlur=13;}
      ctx.strokeStyle='#15151a';ctx.lineWidth=4;
      ssWrappedText(ctx,s.text,x,0,620,size*1.15,s.textOutline||s.font==='Outline');
      ctx.restore();
    }
    if(s.sticker){ctx.font='95px sans-serif';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText(s.sticker,360,1280*.65,680);}
    await ssDrawCard(ctx);
    if(s.mentions.length){ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.fillStyle='white';ctx.fillText(s.mentions.map(id=>'@'+(getState().users.find(u=>u.id===id)?.username||'')).join(' '),360,1280*.8,680);}
    if(s.lyrics){ctx.font='bold 34px Arial,sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=8;ssWrappedText(ctx,'♫ '+s.lyrics,360,1170,650,39);ctx.shadowBlur=0;}
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
