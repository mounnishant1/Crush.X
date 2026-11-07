/* Crush.X — one full-screen DP photo viewer. No upload, posting or server mutation.
 * Explicit opt-in: images carrying data-cx-dp open in viewer.
 * Story rings keep their existing tap-to-view-story action. */
(function(root){
 'use strict';
 if(!root || !root.document) return;
 const doc=root.document;
 const MIN=1, MAX=5;
 const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
 let panel=null,stage=null,photo=null,zoomLabel=null,focusReturn=null;
 let previousOverflow='',scale=1,dx=0,dy=0;
 let pointers=new Map(),gesture=null,tap=null,lastTap=null,observer=null;
 function safePhotoSource(source){
  if(typeof source!=='string'||!source.trim())return '';
  try{
   const url=new URL(source,root.location.href);
   if(url.username||url.password)return '';
   if(url.protocol==='https:'||(url.protocol==='http:'&&url.origin===root.location.origin)||
    (url.protocol==='blob:'&&url.origin===root.location.origin))return url.href;
  }catch{}
  return '';
 }
 function node(tag,className,text){
  const el=doc.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
 }
 function button(label,action,display){
  const btn=node('button','cx-dp-control',display||label);
  btn.type='button';
  btn.setAttribute('aria-label',label);
  btn.addEventListener('click',action);
  return btn;
 }
 function bounds(){
  if(!stage)return {x:0,y:0};
  return {x:Math.max(0,(scale-1)*stage.clientWidth/2),
   y:Math.max(0,(scale-1)*stage.clientHeight/2)};
 }
 function paint(){
  if(!photo)return;
  const b=bounds();
  dx=clamp(dx,-b.x,b.x);dy=clamp(dy,-b.y,b.y);
  photo.style.transform='translate3d('+dx+'px,'+dy+'px,0) scale('+scale+')';
  if(zoomLabel)zoomLabel.textContent=Math.round(scale*100)+'%';
  stage.dataset.scale=String(scale);
 }
 function setZoom(next,clientX,clientY){
  if(!stage)return;
  const rect=stage.getBoundingClientRect(),old=scale;
  next=clamp(next,MIN,MAX);
  const pivotX=Number.isFinite(clientX)?clientX-(rect.left+rect.width/2):0;
  const pivotY=Number.isFinite(clientY)?clientY-(rect.top+rect.height/2):0;
  const ratio=next/old;
  dx=pivotX+(dx-pivotX)*ratio;
  dy=pivotY+(dy-pivotY)*ratio;
  scale=next;
  paint();
 }
 function reset(){scale=1;dx=0;dy=0;paint();}
 function close(){
  if(!panel)return;
  pointers.clear();gesture=null;tap=null;lastTap=null;
  panel.remove();panel=null;stage=null;photo=null;zoomLabel=null;
  doc.body.style.overflow=previousOverflow;
  try{if(focusReturn&&focusReturn.isConnected)focusReturn.focus();}catch{}
  focusReturn=null;
 }
 function updateGesture(){
  if(!stage||!gesture)return;
  const entries=[...pointers.values()];
  if(entries.length===2&&gesture.kind==='pinch'){
   const a=entries[0],b=entries[1],dist=Math.hypot(a.x-b.x,a.y-b.y);
   const ratio=dist/gesture.distance;
   const next=clamp(gesture.scale*ratio,MIN,MAX);
   const rect=stage.getBoundingClientRect();
   const startX=gesture.cx-(rect.left+rect.width/2),startY=gesture.cy-(rect.top+rect.height/2);
   const centerX=(a.x+b.x)/2,centerY=(a.y+b.y)/2;
   const adjusted=next/gesture.scale;
   dx=startX+(gesture.dx-startX)*adjusted+(centerX-gesture.cx);
   dy=startY+(gesture.dy-startY)*adjusted+(centerY-gesture.cy);
   scale=next;paint();
  }else if(entries.length===1&&gesture.kind==='pan'&&scale>1){
   dx=gesture.dx+(entries[0].x-gesture.x);
   dy=gesture.dy+(entries[0].y-gesture.y);
   paint();
  }
 }
 function onPointerDown(e){
  if(!panel||e.button!==undefined&&e.button!==0)return;
  if(e.pointerType==='mouse'&&e.buttons!==1)return;
  e.preventDefault();
  try{stage.setPointerCapture(e.pointerId);}catch{}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1){
   gesture={kind:'pan',x:e.clientX,y:e.clientY,dx,dy};
   tap={id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now(),moved:false};
  }else if(pointers.size===2){
   const [a,b]=[...pointers.values()];
   gesture={kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
    scale,dx,dy,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   tap=null;lastTap=null;
  }
 }
 function onPointerMove(e){
  if(!pointers.has(e.pointerId))return;
  const p=pointers.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;
  if(tap&&tap.id===e.pointerId&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>12)
   tap.moved=true;
  if(pointers.size===1||pointers.size===2)updateGesture();
 }
 function onPointerEnd(e){
  if(!pointers.has(e.pointerId))return;
  const isTap=e.type==='pointerup'&&pointers.size===1&&tap&&tap.id===e.pointerId&&
   !tap.moved&&Date.now()-tap.at<350&&e.pointerType!=='mouse';
  pointers.delete(e.pointerId);
  if(isTap){
   const point={x:e.clientX,y:e.clientY,at:Date.now()};
   if(lastTap&&point.at-lastTap.at<360&&Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<44){
    setZoom(scale>1?1:2.5,point.x,point.y);
    lastTap=null;
   }else lastTap=point;
  }
  tap=null;
  if(pointers.size===1){
   const p=[...pointers.values()][0];
   gesture={kind:'pan',x:p.x,y:p.y,dx,dy};
  }else gesture=null;
 }
 function handleKey(e){
  if(!panel)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key==='Tab'){
   const controls=[...panel.querySelectorAll('button:not([disabled])')];
   if(controls.length){
    if(e.shiftKey&&doc.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus();}
    else if(!e.shiftKey&&doc.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}
   }
   return;
  }
  if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(scale+0.5);}
  else if(e.key==='-'){e.preventDefault();setZoom(scale-0.5);}
  else if(e.key==='0'){e.preventDefault();reset();}
  else if(scale>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
   e.preventDefault();
   if(e.key==='ArrowLeft')dx+=40;
   if(e.key==='ArrowRight')dx-=40;
   if(e.key==='ArrowUp')dy+=40;
   if(e.key==='ArrowDown')dy-=40;
   paint();
  }
 }
 function open(input){
  const src=safePhotoSource(typeof input==='string'?input:input?.currentSrc||input?.src);
  if(!src)return false;
  if(panel)close();
  focusReturn=doc.activeElement;
  previousOverflow=doc.body.style.overflow;
  scale=1;dx=0;dy=0;pointers=new Map();gesture=null;tap=null;lastTap=null;
  panel=node('section','cx-dp-overlay');
  panel.id='cxDpViewer';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Profile photo viewer');
  const header=node('header','cx-dp-head');
  const back=button('Close photo viewer',close,'←');
  back.classList.add('cx-dp-back');
  const heading=node('strong','cx-dp-title','Profile photo');
  header.append(back,heading);
  stage=node('div','cx-dp-stage');
  stage.setAttribute('aria-label','Pinch to zoom profile photo');
  photo=node('img','cx-dp-photo');
  photo.alt=typeof input==='string'?'Profile photo':input.getAttribute('data-cx-dp-label')||'Profile photo';
  photo.draggable=false;
  photo.src=src;
  const error=node('p','cx-dp-error','Photo unavailable.');
  error.hidden=true;
  photo.addEventListener('error',()=>{photo.hidden=true;error.hidden=false;});
  stage.append(photo,error);
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  stage.addEventListener('pointerup',onPointerEnd);
  stage.addEventListener('pointercancel',onPointerEnd);
  stage.addEventListener('lostpointercapture',onPointerEnd);
  stage.addEventListener('dblclick',e=>{
   if(e.pointerType&&e.pointerType!=='mouse')return;
   e.preventDefault();setZoom(scale>1?1:2.5,e.clientX,e.clientY);
  });
  stage.addEventListener('wheel',e=>{
   if(!panel)return;
   e.preventDefault();
   setZoom(scale*(e.deltaY<0?1.15:1/1.15),e.clientX,e.clientY);
  },{passive:false});
  const footer=node('footer','cx-dp-footer');
  const minus=button('Zoom out',()=>setZoom(scale-0.5),'−');
  const restore=button('Reset zoom',reset,'Reset');
  const plus=button('Zoom in',()=>setZoom(scale+0.5),'+');
  zoomLabel=node('output','cx-dp-level','100%');
  zoomLabel.setAttribute('aria-live','off');
  footer.append(minus,zoomLabel,plus,restore);
  panel.append(header,stage,footer);
  doc.body.append(panel);
  doc.body.style.overflow='hidden';
  reset();back.focus();
  return true;
 }
 function isDPPicture(target){
  const el=target?.closest?.('img[data-cx-dp]');
  if(!el||!el.isConnected||el.closest('#cxDpViewer')||
   el.closest('[data-open-story],.story-border,[data-sv-open],[data-sv-head]'))return null;
  return el;
 }
 function decorate(rootNode=doc){
  // Dynamic app re-renders; keep keyboard access without wrapping native buttons.
  for(const el of rootNode.querySelectorAll?.('img[data-cx-dp]:not([data-cx-dp-ready])')||[]){
   el.dataset.cxDpReady='1';
   if(!el.closest('button,a,[role="button"]')){
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',el.getAttribute('data-cx-dp-label')||'Open profile photo');
   }
  }
 }
 doc.addEventListener('click',e=>{
  const el=isDPPicture(e.target);
  if(el&&safePhotoSource(el.currentSrc||el.src)){
   e.preventDefault();e.stopImmediatePropagation();open(el);
  }
 },true);
 doc.addEventListener('keydown',e=>{
  if(panel){handleKey(e);return;}
  const el=isDPPicture(e.target);
  if(el&&(e.key==='Enter'||e.key===' ')){
   e.preventDefault();e.stopImmediatePropagation();open(el);
  }
 },true);
 function start(){
  decorate();
  if(typeof root.MutationObserver==='function'){
   observer=new root.MutationObserver(mutations=>{
    for(const m of mutations)for(const child of m.addedNodes||[]){
     if(child.nodeType===1){if(child.matches?.('img[data-cx-dp]'))decorate(child.parentElement);
      else decorate(child);}
    }
   });
   observer.observe(doc.body,{childList:true,subtree:true});
  }
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 doc.addEventListener('crushx:session-ended',close);
 root.addEventListener('popstate',close);
 root.CrushXDPViewer=Object.freeze({open,close,isOpen:()=>!!panel,zoom:()=>scale});
})(typeof window!=='undefined'?window:null);
