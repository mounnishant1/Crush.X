/* Crush.X browser-local SAMPLE feed adapter. No network, trained model, inferred
 * demographics, private messages, backend ACLs, persistence or phone telemetry.
 * DO NOT reuse this adapter for server feeds: use trusted signed authorization.
 */
(function (root, factory) {
  'use strict';
  const core = root && root.CrushXContentIntelligence ||
    (typeof module === 'object' && module.exports ? require('./content-intelligence.js') : null);
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && core) {
    const bridge = api.createPreviewBridge({
      getState: () => typeof root.getState === 'function' ? root.getState() : null,
      rerender: () => { if (typeof root.renderApp === 'function') root.renderApp(); }
    });
    root.CrushXContentBridge = bridge;
    root.document.addEventListener('crushx:session-ended', bridge.clear);
    const attach = () => {
      const app = root.document.getElementById('app');
      if (!app || app.dataset.cxContentBound) return;
      app.dataset.cxContentBound = 'true';
      const show = value => {
        const area = root.document.getElementById('appStatus');
        if (area) area.textContent = value;
      };
      app.addEventListener('click', event => {
        const open=event.target.closest('[data-content-open]');
        if (open) {
          const itemId=open.dataset.contentOpen;
          const kind=open.dataset.contentKind;
          if (!['reel_1','post_1','post_2'].includes(itemId) ||
              !['reel','post'].includes(kind) || typeof root.navigate!=='function') return;
          root.navigate(kind==='reel'?'reels':'home');
          const target=[...root.document.querySelectorAll('[data-content-card]')]
            .find(node=>node.dataset.contentCard===itemId);
          target?.scrollIntoView({block:'start',behavior:'smooth'});
          return;
        }
        const why = event.target.closest('[data-content-why]');
        if (why) return show(bridge.why(why.dataset.contentWhy, why.dataset.contentKind));
        const hide = event.target.closest('[data-content-hide]');
        if (!hide) return;
        if (!bridge.hide(hide.dataset.contentHide, hide.dataset.contentKind))
          return show('This preview item is unavailable.');
        bridge.rerender();
        show('Hidden for this page session. Reset interests in AURA-X to restore it.');
      });
      // Reels loop by default, so ended rarely fires. Record one local
      // completion on reaching 95% of actual duration; no background telemetry.
      const maybeCompleted = event => {
        const video=event.target.closest?.('[data-cx-content-video]');
        if (!video || video.dataset.cxCompletionRecorded==='true') return;
        if (!Number.isFinite(video.duration)||video.duration<=0||
            !Number.isFinite(video.currentTime)||video.currentTime/video.duration<0.95)return;
        video.dataset.cxCompletionRecorded='true';
        bridge.record('complete',video.dataset.cxContentVideo,video.dataset.contentKind);
      };
      app.addEventListener('timeupdate',maybeCompleted,true);
      app.addEventListener('ended',maybeCompleted,true);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', attach, {once:true});
    else attach();
  }
})(typeof window !== 'undefined' ? window : null, function (core) {
  'use strict';
  if (!core) throw new TypeError('CONTENT_INTELLIGENCE_CORE_REQUIRED');
  const SAMPLE_IDS = new Set(['reel_1','post_1','post_2','story_1','story_2','story_3']);
  const TYPES = Object.freeze({reel:'reels',post:'posts',story:'stories'});
  const valid = id => typeof id === 'string' && /^[A-Za-z0-9_.-]{1,96}$/.test(id);
  const arr = x => Array.isArray(x) ? x : [];
  function createPreviewBridge({getState,rerender=()=>{},now=Date.now,ttlMs=15*60*1000}={}) {
    if (typeof getState !== 'function' || typeof now !== 'function' || typeof rerender !== 'function')
      throw new TypeError('PREVIEW_DEPENDENCIES_REQUIRED');
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 60*60*1000) throw new TypeError('INVALID_TTL');
    let account = '', session = null, expiry = 0;
    let hidden = new Set();
    const snapshot = () => {
      const state = getState();
      return state && typeof state === 'object' && !Array.isArray(state) && valid(state.currentUserId) ? state : null;
    };
    const clear = () => {
      if (session) session.setConsent(false);
      session = null; account = ''; expiry = 0; hidden.clear();
    };
    function ensure() {
      const state = snapshot();
      if (!state) { clear(); return null; }
      if (state.currentUserId !== account) {
        clear(); account = state.currentUserId;
        session = core.createSession({viewerId:account,now});
      }
      if (expiry && now() >= expiry) {session.setConsent(false); hidden.clear(); expiry=0;}
      return state;
    }
    function project(item,kind) {
      // Only six hardcoded demo IDs are allowed. Local collections have NO
      // verified publication, moderation, audience or creator permissions.
      if (!item || !SAMPLE_IDS.has(item.id) || !TYPES[kind] ||
          !item.id.startsWith(kind+'_') || !valid(item.userId)) return null;
      return {id:item.id,creatorId:item.userId,kind,status:'published',
        moderation:'approved',visibility:'public',caption:typeof item.caption==='string'?item.caption:'',
        title:kind==='reel'&&typeof item.song==='string'?item.song:'',
        expiresAt:kind==='story'?item.expiresAt:undefined};
    }
    function list(state,kind) {
      return arr(state[TYPES[kind]]).filter(item => project(item,kind));
    }
    const publicSamples = state => ['reel','post','story'].flatMap(kind=>list(state,kind).map(item=>project(item,kind)));
    const isOn = () => {ensure();return !!expiry && now()<expiry && !!session?.status().consented;};
    const status = () => {
      ensure();const state = session?.status() || {consented:false,signalCount:0,interests:[]};
      return Object.freeze({...state,expiresAt:expiry||null,previewOnly:true});
    };
    function consent(approved) {
      if (!ensure()) return false;
      if (approved !== true) {session.setConsent(false);hidden.clear();expiry=0;rerender();return false;}
      session.setConsent(true);expiry=now()+ttlMs;rerender();return true;
    }
    function setInterests(csv) {
      if (!isOn()) return false;
      const topics=Array.isArray(csv)?csv:typeof csv==='string'?csv.split(','):[];
      const ok=session.setInterests(topics.map(x=>String(x).trim().toLowerCase()));
      if (ok) rerender();return ok;
    }
    function rank(kind) {
      const state=ensure();if(!state || !TYPES[kind])return [];
      const originals=list(state,kind).filter(item=>!hidden.has(item.id) &&
        !arr(state.socialHiddenIds).includes(item.id) && !arr(state.socialMutedIds).includes(item.userId));
      if (!isOn())return originals;
      const followed=arr(state.users).filter(u=>u?.following===true).map(u=>u.id);
      const results=session.rank(originals.map(item=>project(item,kind)),{
        followedCreators:followed,kind,limit:100
      });
      const byId=new Map(originals.map(item=>[item.id,item]));
      return results.map(result=>byId.get(result.item.id)).filter(Boolean);
    }
    function findItem(id,kind) {
      const state=ensure();return state && valid(id) && TYPES[kind]
        ? list(state,kind).find(item=>item.id===id) : null;
    }
    function record(action,id,kind,watchFraction=0) {
      if (!isOn()) return false;
      const item=findItem(id,kind);return !!item && session.record(action,project(item,kind),{watchFraction});
    }
    function hide(id,kind) {
      const item=findItem(id,kind);
      if (!item) return false;
      hidden.add(id);
      if (isOn()) record('not_interested',id,kind);
      return true;
    }
    function why(id,kind) {
      if (!isOn())return 'Personalized ranking is off. AURA-X can enable a temporary local preview.';
      const item=findItem(id,kind);if (!item)return 'Content no longer available in this sample.';
      const selected=session.rank([project(item,kind)],{kind,limit:1})[0];
      return selected ? selected.why+' (sample preview; not a live recommendation)' : 'Content is not eligible.';
    }
    function ask(question) {
      const state=ensure();
      if (!state || !isOn()) return {ok:false,answer:'Allow content analysis in AURA-X first.',sources:[],modelUsed:false};
      const source=publicSamples(state).filter(item=>!hidden.has(item.id) &&
        !arr(state.socialHiddenIds).includes(item.id) && !arr(state.socialMutedIds).includes(item.creatorId));
      return session.ask(question,source,{limit:5});
    }
    function reset() {
      if (!ensure())return false;
      hidden.clear();session.reset();rerender();return true;
    }
    return Object.freeze({consent,setInterests,rank,record,hide,why,ask,reset,status,clear,rerender});
  }
  return Object.freeze({createPreviewBridge});
});