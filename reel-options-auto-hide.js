/* Crush.X secondary Reel controls: show briefly on every Reel, then fade.
 * Like/Comment/Share/Save remain visible; no fake Shop backend is created.
 * Browser preview only; no external requests.
 */
(function(root) {
  'use strict';
  if (!root?.document || typeof renderApp !== 'function' || typeof getState !== 'function') return;
  const AUTO_HIDE_MS = 2800;
  const EXTRA_SELECTOR = [
    '[data-reel-speed]', '[data-reel-mute]', '[data-repost]',
    '[data-reel-shop]', '[data-cx-reel-shop]', '[data-shop]',
    '[data-reel-options]', '[data-cx-reel-optional]'
  ].join(',');
  let deck=null, activeKey='', revealed=true, hideAt=0, timer=null, pendingFrame=null;

  function clearTimer() {
    if (timer !== null) {root.clearTimeout(timer);timer=null;}
  }
  function activeSlide() {
    if (!deck || !deck.isConnected) return null;
    const slides=[...deck.querySelectorAll('.reel-slide')];
    if (!slides.length) return null;
    const index=Math.max(0,Math.min(slides.length-1,
      Math.round(deck.scrollTop / Math.max(1,deck.clientHeight))));
    return slides[index];
  }
  function apply() {
    if (!deck || !deck.isConnected) return;
    for (const slide of deck.querySelectorAll('.reel-slide')) {
      const isActive=slide.dataset.reelSlide===activeKey;
      const isVisible=isActive && revealed;
      slide.classList.toggle('cx-reel-extra-hidden',!isVisible);
      const button=slide.querySelector('[data-cx-reel-more]');
      if (button) {
        button.setAttribute('aria-expanded',String(isVisible));
        button.setAttribute('aria-label',isVisible?'Hide extra Reel options':'Show extra Reel options');
        const word=button.querySelector('[data-cx-reel-more-label]');
        if(word) word.textContent=isVisible?'Less':'More';
      }
      for(const extra of slide.querySelectorAll('[data-cx-reel-extra]')) {
        extra.setAttribute('aria-hidden',String(!isVisible));
        extra.tabIndex=isVisible?0:-1;
      }
    }
  }
  function schedule() {
    clearTimer();
    hideAt=Date.now()+AUTO_HIDE_MS;
    timer=root.setTimeout(()=>{
      timer=null;
      if (getState().activeTab!=='reels' || !deck?.isConnected) return;
      if (root.document.querySelector('dialog[open]')) {
        schedule();return;
      }
      // Do not move keyboard focus into newly hidden items.
      if (root.document.activeElement?.matches?.('[data-cx-reel-extra]')) {
        schedule();return;
      }
      revealed=false;
      apply();
    },AUTO_HIDE_MS);
  }
  function reveal() {
    if (getState().activeTab!=='reels' || !activeSlide()) return;
    revealed=true;
    apply();
    schedule();
  }
  function hide() {
    if (getState().activeTab!=='reels' || !activeSlide()) return;
    clearTimer();revealed=false;hideAt=0;apply();
  }
  function updateActive() {
    if (!deck || !deck.isConnected) return;
    const current=activeSlide();
    const id=current?.dataset.reelSlide || '';
    if (!id) return;
    if (activeKey!==id) {
      activeKey=id;
      revealed=true;
      apply();
      schedule();
    } else apply();
  }
  function queueUpdate() {
    if (pendingFrame !== null) return;
    pendingFrame=root.requestAnimationFrame(()=>{
      pendingFrame=null;
      updateActive();
    });
  }
  function bindDeck() {
    const next=root.document.querySelector('.reels-deck');
    if (getState().activeTab!=='reels' || !next) {
      clearTimer();deck=null;activeKey='';revealed=true;hideAt=0;
      return;
    }
    if (deck!==next) {
      clearTimer();
      deck=next;
      activeKey='';
      revealed=true;
      hideAt=0;
      deck.addEventListener('scroll',queueUpdate,{passive:true});
    }
    for(const slide of deck.querySelectorAll('.reel-slide')){
      const rail=slide.querySelector('.reel-rail');
      if (!rail) continue;
      const extras=rail.querySelectorAll(EXTRA_SELECTOR);
      if (!extras.length) continue;
      extras.forEach(button=>{
        button.setAttribute('data-cx-reel-extra','');
      });
      if (!rail.querySelector('[data-cx-reel-more]')) {
        const button=root.document.createElement('button');
        button.type='button';
        button.className='cx-reel-more-trigger';
        button.dataset.cxReelMore='';
        button.setAttribute('aria-expanded','true');
        button.innerHTML='<span aria-hidden="true">···</span><span data-cx-reel-more-label>Less</span>';
        // A stable More toggle stays after the ordinary Like/Comment/Share/Save rail.
        rail.append(button);
        button.addEventListener('click',()=>{
          if (slide!==activeSlide()) return;
          if (revealed) hide();
          else reveal();
        });
      }
      const media=slide.querySelector('[data-reel-visual]');
      if (media && !media.dataset.cxReelRevealBound) {
        media.dataset.cxReelRevealBound='1';
        media.addEventListener('click',event=>{
          // Playback taps, not existing buttons, re-open the extra options.
          if(event.target.closest('button,a,input,textarea,select')) return;
          if (slide!==activeSlide()) return;
          if (!revealed) reveal();
          else schedule();
        });
      }
    }
    // Reels start with extras visible only on the active slide, not all slides.
    updateActive();
  }
  const previousRender=renderApp;
  renderApp=function(...args) {
    const result=previousRender.apply(this,args);
    bindDeck();
    return result;
  };
  root.document.addEventListener('crushx:session-ended',()=>{
    clearTimer();deck=null;activeKey='';revealed=true;
  });
  root.addEventListener('pagehide',()=>{clearTimer();deck=null;});
  root.CrushXReelOptions=Object.freeze({
    durationMs:AUTO_HIDE_MS,
    reveal,hide,
    status:()=>({activeReelId:activeKey,revealed,hideAt})
  });
})(window);
