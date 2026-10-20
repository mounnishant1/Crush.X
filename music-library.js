/* Crush.X test music library. CC BY 4.0 tracks; not a commercial music provider. */
(function (root) {
  'use strict';
  const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
  const SOURCE = 'https://incompetech.com/music/royalty-free/index.html?isrc=';
  const MEDIA = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
  // These are real named recordings with individual official attribution pages.
  // Source-page licensing must remain attached to every synced/published draft.
  const rows = [
    ['USUAN1100843','Wallpaper','Chill',215,'Uplifting, relaxed'],
    ['USUAN1200068','Reunited','Romantic',71,'Bright, sentimental'],
    ['USUAN1100772','Sneaky Snitch','Funny',137,'Playful, quirky'],
    ['USUAN1900055','Blippy Trance','Electronic',120,'Bouncy, synth'],
    ['USUAN1300025','The Complex','Cinematic',268,'Intense, epic'],
    ['USUAN1200083','Summer Day','Chill',198,'Guitar, relaxed'],
    ['USUAN1300033','Clean Soul','Romantic',307,'Warm, mellow'],
    ['USUAN1900015','Almost Bliss','Chill',317,'Bright, thoughtful'],
    ['USUAN1700019','Miami Viceroy','Electronic',268,'Funky, grooving'],
    ['USUAN1300001','All This','Cinematic',229,'Driving, orchestral'],
    ['USUAN1900022','Wholesome','Chill',364,'Warm, grooving'],
    ['USUAN1100186','Juniper','Cinematic',198,'Orchestral, epic']
  ];
  const TRACKS = Object.freeze(rows.map(function (r) {
    return Object.freeze({
      id: r[0], title: r[1], artist: 'Kevin MacLeod',
      genre: r[2], durationSeconds: r[3], mood: r[4],
      sourceUrl: SOURCE + encodeURIComponent(r[0]),
      audioUrl: MEDIA + encodeURIComponent(r[1]) + '.mp3',
      license: 'CC BY 4.0', licenseUrl: LICENSE,
      attribution: '"' + r[1] + '" Kevin MacLeod (incompetech.com) | Licensed under Creative Commons: By Attribution 4.0 | ' + LICENSE
    });
  }));
  const FAV_KEY = 'crushx_music_favorites_v1';
  let favoriteMemory = [];
  let dialog = null, player = null, playStart = 0, clipLength = 30, source = '';
  let current = null, searchTerm = '', genre = 'All', onlySaved = false, context = null;
  let statusNode = null, resultNode = null, detailsNode = null;
  function favorites() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(id => TRACKS.some(t => t.id === id)).slice(0, 100) : [];
    } catch { return favoriteMemory.slice(); }
  }
  function setFavorites(ids) {
    favoriteMemory = ids.slice();
    try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch {}
  }
  function findTracks(query, category, savedOnly, savedIds) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    const list = savedIds || [];
    return TRACKS.filter(track => {
      if (category && category !== 'All' && track.genre !== category) return false;
      if (savedOnly && !list.includes(track.id)) return false;
      return [track.title, track.artist, track.genre, track.mood].some(v => v.toLocaleLowerCase().includes(needle));
    });
  }
  function h(tag, className, textValue) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  }
  function button(label, className, action) {
    const node = h('button', className, label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function status(text) { if (statusNode) statusNode.textContent = text || ''; }
  function stopAudio() {
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
      player = null;
    }
  }
  function close() {
    stopAudio();
    if (!dialog) return;
    const old = dialog;
    dialog = null;
    try { if (old.open) old.close(); } catch {}
    old.remove();
    const opener = context && context.opener;
    context = null;
    statusNode = null;
    if (opener && opener.isConnected) opener.focus();
  }
  function preview(track) {
    if (!track) return;
    if (player && source === track.id && !player.paused) {
      player.pause();
      status('Preview paused.');
      return;
    }
    stopAudio();
    source = track.id;
    player = new Audio(track.audioUrl);
    player.preload = 'none';
    player.currentTime = Math.min(playStart, Math.max(0, track.durationSeconds - 1));
    player.addEventListener('timeupdate', function () {
      if (!player) return;
      if (player.currentTime >= Math.min(track.durationSeconds, playStart + clipLength)) {
        player.pause(); status('Preview finished.');
      }
    });
    player.addEventListener('error', function () {
      status('Preview unavailable from music host. Open the official track page to download and review.');
      stopAudio();
    }, {once:true});
    player.play().then(function () { status('Playing ' + track.title + ' (preview only).'); })
      .catch(function () { status('Browser blocked playback or music host is unavailable. Tap Preview again or open source.'); });
  }
  function renderDetails() {
    if (!detailsNode || !current) return;
    detailsNode.replaceChildren();
    detailsNode.append(h('h3', 'cxmusic-title', current.title), h('p', 'cxmusic-meta', current.artist + ' · ' + current.genre + ' · ' + Math.floor(current.durationSeconds / 60) + ':' + String(current.durationSeconds % 60).padStart(2, '0')));
    const seekRow = h('label', 'cxmusic-control', 'Start clip at ' + playStart + 's');
    const maxStart = Math.max(0, current.durationSeconds - 1);
    const seek = h('input'); seek.type = 'range'; seek.min = '0'; seek.max = String(maxStart); seek.value = String(playStart); seek.setAttribute('aria-label', 'Music clip start time');
    seek.addEventListener('input', function () { playStart = Number(seek.value); seekRow.firstChild.textContent = 'Start clip at ' + playStart + 's'; if (player) player.currentTime = playStart; });
    seekRow.append(seek);
    detailsNode.append(seekRow);
    const durations = h('div', 'cxmusic-lengths');
    [15,30,60].forEach(seconds => {
      const item = button(seconds + ' sec', clipLength === seconds ? 'cxmusic-active' : '', function () {clipLength = seconds; renderDetails();});
      item.setAttribute('aria-pressed', String(clipLength === seconds)); durations.append(item);
    });
    detailsNode.append(durations);
    const actions = h('div', 'cxmusic-actions');
    actions.append(button('▶ Preview', 'cxmusic-ghost', function () { preview(current); }));
    actions.append(button('Use Audio', 'cxmusic-primary', function () {
      if (context && typeof context.onUse === 'function') {
        try { context.onUse(current, {startSeconds:playStart, durationSeconds:Math.min(clipLength,current.durationSeconds - playStart)}); }
        catch { status('Cannot apply music to this draft.'); return; }
        close();
      }
    }));
    detailsNode.append(actions);
    const license = h('p', 'cxmusic-credits', current.attribution);
    const links = h('p','cxmusic-links');
    const link = h('a', null, 'Official recording / license evidence');
    link.href = current.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const ll = h('a', null, 'CC BY 4.0'); ll.href = LICENSE; ll.target = '_blank'; ll.rel = 'noopener noreferrer';
    links.append(link, ll);
    detailsNode.append(license, links, h('p','cxmusic-hint','Artist attribution must remain visible in the final reel/story/post. No automatic audio mixing or online publishing is enabled.'));
  }
  function renderResults() {
    if (!resultNode) return;
    resultNode.replaceChildren();
    const tracks = findTracks(searchTerm, genre, onlySaved, favorites());
    if (!tracks.length) {resultNode.append(h('p','cxmusic-empty','No tracks found. Try a different title, artist or mood.')); return;}
    const saved = favorites();
    tracks.forEach(track => {
      const row = h('div', 'cxmusic-track' + (current && current.id === track.id ? ' is-selected' : ''));
      const badge = h('span','cxmusic-cover','♫'); badge.setAttribute('aria-hidden','true');
      const title = button(track.title, 'cxmusic-trackname', function () { current=track; playStart=0; stopAudio(); renderResults(); renderDetails();});
      title.setAttribute('aria-label','Select '+track.title+' by '+track.artist);
      const info = h('div','cxmusic-trackinfo'); info.append(title, h('span',null, track.artist+' · '+track.genre));
      const fav = button(saved.includes(track.id)?'★':'☆','cxmusic-fav',function(){
        const set = favorites(); const next=set.includes(track.id)?set.filter(id=>id!==track.id):set.concat(track.id);
        setFavorites(next); renderResults();
      });
      fav.setAttribute('aria-label',(saved.includes(track.id)?'Remove favorite ':'Save favorite ')+track.title);
      row.append(badge, info, fav);
      resultNode.append(row);
    });
  }
  function renderGenres(holder) {
    holder.replaceChildren();
    ['All','Chill','Romantic','Funny','Electronic','Cinematic'].forEach(name => {
      const item = button(name,genre===name?'cxmusic-active':'',function(){genre=name;renderGenres(holder);renderResults();});
      item.setAttribute('aria-pressed',String(genre===name)); holder.append(item);
    });
  }
  function open(options) {
    if (typeof document === 'undefined') return;
    close();
    const cfg = options || {};
    context = {opener: document.activeElement, onUse:cfg.onUse};
    searchTerm = ''; genre = 'All'; onlySaved = false; playStart = 0; clipLength = 30; source = '';
    current = cfg.trackId ? TRACKS.find(t => t.id === cfg.trackId) || TRACKS[0] : TRACKS[0];
    dialog = h('dialog','cxmusic-modal');
    dialog.setAttribute('aria-label','Crush.X Music Library');
    dialog.addEventListener('close',close);
    const header = h('header','cxmusic-head');
    const intro = h('div'); intro.append(h('h2',null,'♫ Music Library'),h('p',null,'Licensed test music · real artist credits'));
    header.append(intro,button('×','cxmusic-close',close));
    const search = h('input','cxmusic-search');
    search.type='search'; search.placeholder='Search songs, artists, moods…';search.setAttribute('aria-label','Search music library');
    search.addEventListener('input',function(){searchTerm=search.value;renderResults();});
    const genres = h('nav','cxmusic-genres'); genres.setAttribute('aria-label','Music genres');
    const saved = button('☆ Saved', 'cxmusic-saved', function () {
      onlySaved = !onlySaved; saved.setAttribute('aria-pressed',String(onlySaved));
      saved.textContent = onlySaved?'★ Saved':'☆ Saved'; renderResults();
    });saved.setAttribute('aria-pressed','false');
    const filters = h('div','cxmusic-filters'); filters.append(genres,saved);
    resultNode = h('section','cxmusic-list');resultNode.setAttribute('aria-label','Search results');
    detailsNode = h('section','cxmusic-detail'); detailsNode.setAttribute('aria-label','Selected track');
    const notice = h('p','cxmusic-hint','12 verified-track metadata entries · preview streams from the composer’s site (network required).');
    statusNode = h('p','cxmusic-status'); statusNode.setAttribute('role','status');
    dialog.append(header,search,filters,resultNode,detailsNode,notice,statusNode);
    document.body.append(dialog);
    renderGenres(genres);renderResults();renderDetails();
    dialog.showModal();
    search.focus();
  }
  function useInPost(track,clip) {
    if (typeof pcDraft === 'undefined') throw new Error('Post editor unavailable');
    if (pcDraft.audioUrl && pcDraft.audioUrl.startsWith('blob:')) URL.revokeObjectURL(pcDraft.audioUrl);
    pcDraft.audioUrl=track.audioUrl; pcDraft.audioName=track.title + ' · ' + track.artist;
    pcDraft.audioTrackId=track.id; pcDraft.audioCredit=track.attribution;
    pcDraft.audioClipStart=clip.startSeconds;pcDraft.audioClipDuration=clip.durationSeconds;
    const box = document.querySelector('[data-pc-audio-preview]');
    if (box) {
      const name=h('p',null,'♫ '+pcDraft.audioName);
      const audio=h('audio'); audio.src=track.audioUrl; audio.controls=true;audio.preload='none';
      const credit=h('p','cxmusic-credits',track.attribution);
      box.replaceChildren(name,audio,credit,button('Remove audio','cxmusic-ghost',function(){
        pcDraft.audioUrl='';pcDraft.audioName='';pcDraft.audioTrackId='';pcDraft.audioCredit='';
        box.textContent='No audio selected.';
      }));
    }
  }
  function useInStory(track,clip) {
    if (typeof ssSession === 'undefined' || !ssSession) throw new Error('Story editor unavailable');
    if (ssSession.musicUrl && ssSession.musicUrl.startsWith('blob:')) URL.revokeObjectURL(ssSession.musicUrl);
    ssSession.musicUrl=track.audioUrl;ssSession.musicName=track.title+' · '+track.artist;
    ssSession.musicTrackId=track.id;ssSession.musicCredit=track.attribution;
    ssSession.musicClipStart=clip.startSeconds;ssSession.musicClipDuration=clip.durationSeconds;
    ssRender();
  }
  function attach() {
    // A delegated handler survives app navigation and Story Studio re-render.
    document.addEventListener('click',function (event) {
      const origin=event.target.closest('[data-cxmusic-open]');
      if (origin) {
        event.preventDefault();
        const target=origin.dataset.cxmusicOpen;
        if (target==='story') open({onUse:useInStory});
        else open({onUse:useInPost});
        return;
      }
      const reel = event.target.closest('[data-reel-audio]');
      if (!reel) return;
      // Intercept the earlier sample-only reel audio handler without changing
      // the reel playback or comment system.
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const item=getState().reels.find(x => x.id===reel.dataset.reelAudio);
      const matched=item && TRACKS.find(x=>x.title===item.song && x.artist===item.artist);
      open({trackId:matched?.id,onUse:function(track,clip){
        useInPost(track,clip); navigate('create');
      }});
    },true);
    document.addEventListener('keydown',function(event){
      if (event.key==='Escape' && dialog?.open) close();
    });
  }
  const api=Object.freeze({tracks:TRACKS,findTracks:findTracks,open:open,close:close});
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  if (root && root.document) {root.CrushXMusic=api;attach();}
})(typeof window === 'undefined' ? null : window);
