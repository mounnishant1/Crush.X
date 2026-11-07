/* Crush.X touch navigation: one horizontal gesture -> one tab.
 * Static preview only; Camera is a real permission-gated local preview, not native AR.
 */
(function (root) {
  'use strict';
  if (!root?.document || typeof navigate !== 'function' || typeof getState !== 'function') return;

  const ORDER = Object.freeze(['home','reels','messages','discover','profile']);
  const THRESHOLD = 72;
  let gesture = null;
  let stream = null;
  let facing = 'user';
  let cameraToken = 0;
  let photoUrl = null;

  function nextTab(tab, dx) {
    if (!Number.isFinite(dx) || dx === 0) return null;
    if (tab === 'home' && dx < 0) return 'camera';    // Home swipe LEFT opens Camera.
    if (tab === 'camera') return dx > 0 ? 'home' : null;
    const index = ORDER.indexOf(tab);
    if (index < 0) return null;
    // Swipe RIGHT advances Home -> Reels -> Messages -> Search -> Profile.
    // Swipe LEFT travels the exact reverse order, except Home -> Camera.
    const next = index + (dx > 0 ? 1 : -1);
    return next >= 0 && next < ORDER.length ? ORDER[next] : null;
  }

  function authenticated() {
    return root.document.getElementById('authOverlay')?.style.display === 'none';
  }
  function safeTarget(target) {
    if (!(target instanceof root.Element)) return false;
    if (!target.closest('#app main')) return false;
    // Login overlays can keep aria-modal=true while display:none; only a VISIBLE modal owns gestures.
    if ([...root.document.querySelectorAll('dialog[open], [aria-modal="true"]')].some(modal => {
      const cs=root.getComputedStyle(modal);
      return cs.display!=='none' && cs.visibility!=='hidden' && modal.getClientRects().length>0;
    })) return false;
    // Let controls, Stories, gallery carousels, horizontal scrollers and media
    // editors own their gestures. A horizontal swipe on blank Reel visual is OK.
    if (target.closest([
      'button','a','input','textarea','select','label',
      '[contenteditable]','[role="button"]','[role="slider"]','dialog',
      '.story-viewer','.story-studio','.cx-dp-viewer','#cxDpViewer',
      '.reel-rail','.reel-progress','.reel-comment-box','.reel-details',
      '.cx-reel-friend-tabs','.cx-friends-dock','.cx-friend-sheet',
      '.pc-chips','.pc-options','.cx261-tabs','.cx-media-carousel',
      '.cx-music-carousel','[data-cx-swipe-lock]','[data-sv-stage]'
    ].join(','))) return false;
    let node = target;
    const main = target.closest('#app main');
    while (node && node !== main && node instanceof root.Element) {
      const style = root.getComputedStyle(node);
      if (node.scrollWidth > node.clientWidth + 8 && /auto|scroll/.test(style.overflowX)) return false;
      node = node.parentElement;
    }
    return true;
  }
  function start(event) {
    gesture = null;
    if (!authenticated() || event.touches.length !== 1 || !safeTarget(event.target)) return;
    const touch = event.touches[0];
    // Native video timeline controls own touches near the bottom of a video.
    const video = event.target.closest('video[controls]');
    if (video && touch.clientY > video.getBoundingClientRect().bottom - 68) return;
    // Do not intercept Android system-back edge gesture.
    if (touch.clientX < 18 || touch.clientX > root.innerWidth - 18) return;
    const tab = getState().activeTab;
    if (!ORDER.includes(tab) && tab !== 'camera') return;
    gesture = {x:touch.clientX,y:touch.clientY,id:touch.identifier,tab,at:Date.now()};
  }
  function move(event) {
    if (!gesture) return;
    if (event.touches.length !== 1 || event.touches[0].identifier !== gesture.id) gesture=null;
  }
  function end(event) {
    const g=gesture;
    gesture=null;
    if (!g || !authenticated() || event.changedTouches.length !== 1) return;
    const touch=event.changedTouches[0];
    if (touch.identifier !== g.id || Date.now()-g.at > 1600) return;
    const dx=touch.clientX-g.x,dy=touch.clientY-g.y;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)*1.5) return;
    // User may have navigated by click / browser back during the gesture.
    if (getState().activeTab !== g.tab) return;
    const next=nextTab(g.tab,dx);
    if (!next) return;
    // This updates the single existing router and history. No duplicate screens.
    navigate(next);
    if (next === 'camera') void activateCamera();
  }

  function cameraStatus(message) {
    const el=root.document.querySelector('[data-cx-camera-status]');
    if (el) el.textContent=message;
  }
  function cameraVideo() {
    return root.document.querySelector('[data-cx-camera-video]');
  }
  function stopTracks(target) {
    try { target?.getTracks?.().forEach(track=>track.stop()); } catch {}
  }
  function clearPhoto() {
    if (photoUrl) { root.URL.revokeObjectURL(photoUrl);photoUrl=null; }
  }
  function stopCamera() {
    ++cameraToken;
    stopTracks(stream);
    stream=null;
    clearPhoto();
    const v=cameraVideo();
    if (v) { try {v.pause();v.srcObject=null;}catch{} }
  }
  function inCamera() {
    return authenticated() && getState().activeTab==='camera';
  }
  function attachCameraStream() {
    const v=cameraVideo();
    if (!v || !stream) return;
    v.srcObject=stream;
    v.style.transform=facing==='user'?'scaleX(-1)':'none';
    v.play().catch(()=>{cameraStatus('Preview paused. Tap Enable camera to retry.');});
    const shutter=root.document.querySelector('[data-cx-camera-shutter]');
    const flip=root.document.querySelector('[data-cx-camera-flip]');
    if (shutter) shutter.disabled=false;
    if (flip) flip.disabled=false;
  }
  async function activateCamera(requestedFacing=facing) {
    if (!inCamera()) return false;
    const media=root.navigator.mediaDevices;
    if (!media?.getUserMedia) {
      cameraStatus('Camera API unavailable. Use HTTPS, camera permissions, or a supported browser.');
      return false;
    }
    const ticket=++cameraToken;
    const previous=stream;
    const oldFacing=facing;
    cameraStatus('Requesting camera permission…');
    try {
      // Permission prompt only after a user swipe, Retry or Flip button.
      const next=await media.getUserMedia({video:{facingMode:{ideal:requestedFacing}},audio:false});
      if (!inCamera() || ticket!==cameraToken) {stopTracks(next);return false;}
      stream=next;
      facing=requestedFacing;
      if (previous!==next) stopTracks(previous);
      attachCameraStream();
      cameraStatus('Camera preview active · local device only · not recording or uploading');
      return true;
    } catch (error) {
      if (ticket!==cameraToken || !inCamera()) return false;
      stream=previous;
      facing=oldFacing;
      if (previous) attachCameraStream();
      const denied=error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError';
      cameraStatus(denied?'Camera permission denied. You can Retry after allowing camera access.':
        'Unable to start this camera. You can Retry or use a different camera.');
      return false;
    }
  }

  function takePhoto() {
    if (!inCamera() || !stream) return;
    const v=cameraVideo();
    if (!v || !v.videoWidth || !v.videoHeight) {
      cameraStatus('Camera not ready to capture.');return;
    }
    const canvas=root.document.createElement('canvas');
    canvas.width=v.videoWidth;canvas.height=v.videoHeight;
    const ctx=canvas.getContext('2d');
    if (!ctx) {cameraStatus('Photo capture unavailable on this browser.');return;}
    // Save exactly the mirrored selfie preview, not upside-down or sideways.
    if (facing==='user') {ctx.translate(canvas.width,0);ctx.scale(-1,1);}
    ctx.drawImage(v,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{
      if (!inCamera() || !blob) return;
      clearPhoto();
      photoUrl=root.URL.createObjectURL(blob);
      const container=root.document.querySelector('[data-cx-camera-photo]');
      if (container) {
        const img=root.document.createElement('img');
        img.alt='Local captured photo';img.src=photoUrl;
        container.replaceChildren(img);
      }
      cameraStatus('Photo captured locally. Nothing was uploaded.');
    },'image/png');
  }

  function renderCamera() {
    return '<main class="cx-swipe-camera" aria-label="Camera preview" data-cx-swipe-camera>'+
      '<header class="cx-swipe-camera-top"><button type="button" data-cx-camera-back aria-label="Back to Home">←</button>'+
      '<strong>Camera</strong><button type="button" data-cx-camera-flip disabled aria-label="Flip camera">Flip</button></header>'+
      '<div class="cx-swipe-camera-stage">'+
      '<video data-cx-camera-video autoplay muted playsinline aria-label="Local camera preview"></video>'+
      '<div data-cx-camera-photo class="cx-swipe-camera-photo"></div>'+
      '<p class="cx-swipe-camera-note">Live local camera preview. AR lenses and recorded video require the native app.</p></div>'+
      '<div class="cx-swipe-camera-bottom">'+
      '<p data-cx-camera-status role="status" aria-live="polite">Swipe from Home or tap Enable camera to request access.</p>'+
      '<div class="cx-swipe-camera-actions"><button type="button" data-cx-camera-retry>Enable camera / Retry</button>'+
      '<button type="button" data-cx-camera-shutter disabled aria-label="Take photo">●</button></div>'+
      '<p class="cx-swipe-camera-hint">Swipe right to return Home · camera stops when leaving</p>'+
      '</div></main>';
  }
  function syncCamera() {
    const active=inCamera();
    root.document.body.classList.toggle('cx-camera-route',active);
    if (!active) {if (stream) stopCamera();else clearPhoto();return;}
    root.document.querySelector('[data-cx-camera-back]')?.addEventListener('click',()=>navigate('home'));
    root.document.querySelector('[data-cx-camera-retry]')?.addEventListener('click',()=>void activateCamera());
    root.document.querySelector('[data-cx-camera-flip]')?.addEventListener('click',
      ()=>void activateCamera(facing==='user'?'environment':'user'));
    root.document.querySelector('[data-cx-camera-shutter]')?.addEventListener('click',takePhoto);
    if (stream) {attachCameraStream();cameraStatus('Camera preview active · local device only · not recording or uploading');}
  }

  // Bridge to the existing render/router; do not replace rendering in other modules.
  const previousRender=renderApp;
  renderApp=function(...args) {
    const result=previousRender.apply(this,args);
    syncCamera();
    return result;
  };
  root.document.addEventListener('touchstart',start,{passive:true});
  root.document.addEventListener('touchmove',move,{passive:true});
  root.document.addEventListener('touchend',end,{passive:true});
  root.document.addEventListener('touchcancel',()=>{gesture=null;},{passive:true});
  root.document.addEventListener('crushx:session-ended',stopCamera);
  root.addEventListener('pagehide',stopCamera);
  root.CrushXSwipeCamera=Object.freeze({render:renderCamera,activate:activateCamera,stop:stopCamera});
  root.CrushXHorizontalTabs=Object.freeze({nextTab,order:ORDER});
})(window);
