'use strict';
/* Real Chromium mobile-width touch / visible DOM integration for the browser preview.
   This is NOT physical Android/React/Unity/AR evidence. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BASE=process.env.CRUSHX_TEST_URL||'http://127.0.0.1:8000/';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8Cb5sAAAAASUVORK5CYII=','base64');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__cameraRequests=0;
    window.AmazonCognitoIdentity={CognitoUserPool:class {getCurrentUser(){return null;}}};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      window.__cameraRequests++;
      throw new DOMException('Denied by test harness','NotAllowedError');
    }}});
  });
  await page.route('**/*',r=>{
   const req=r.request(),url=req.url();
   if(!['GET','HEAD'].includes(req.method())) writes.push(url);
   if(url.startsWith(BASE))return r.continue();
   if(req.resourceType()==='image')return r.fulfill({status:200,contentType:'image/png',body:pixel});
   return r.abort();
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{document.getElementById('authOverlay').style.display='none';navigate('home');});
  await page.waitForFunction(()=>!!window.CrushXHorizontalTabs&&!!window.CrushXSwipeCamera);
  assert.deepEqual(await page.evaluate(()=>CrushXHorizontalTabs.order),['home','reels','messages','discover','profile']);
  assert.equal(await page.evaluate(()=>CrushXHorizontalTabs.nextTab('home',-150)),'camera');
  assert.equal(await page.evaluate(()=>CrushXHorizontalTabs.nextTab('home',150)),'reels');
  assert.equal(await page.evaluate(()=>CrushXHorizontalTabs.nextTab('profile',-150)),'discover');
  assert.equal(await page.evaluate(()=>CrushXHorizontalTabs.nextTab('camera',150)),'home');

  // Single-finger event sequence, testing route history and gesture direction.
  const swipe=async(dx,dy=0,targetSelector='#app main')=>page.evaluate(({dx,dy,targetSelector})=>{
    const node=document.querySelector(targetSelector);
    assertNode(node);
    function assertNode(el){if(!el)throw Error('Missing swipe target');}
    const t1=new Touch({identifier:17,target:node,clientX:dx<0?295:105,clientY:375,pageX:dx<0?295:105,pageY:375});
    const t2=new Touch({identifier:17,target:node,clientX:(dx<0?295:105)+dx,clientY:375+dy,pageX:(dx<0?295:105)+dx,pageY:375+dy});
    node.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t1],changedTouches:[t1],targetTouches:[t1]}));
    node.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[t2],targetTouches:[]}));
    return {tab:getState().activeTab,hash:location.hash};
  },{dx,dy,targetSelector});

  // On Home, swipe LEFT must open Camera. Never pretend native Unity AR is running.
  assert.equal((await swipe(-174)).tab,'camera',await page.evaluate(()=>CrushXHorizontalTabs.debug()));
  assert.equal(await page.locator('main.cx-swipe-camera').count(),1);
  assert.match(await page.locator('[data-cx-camera-status]').textContent(),/denied|requesting/i);
  assert.equal(await page.evaluate(()=>window.__cameraRequests),1,'Camera permission requested by deliberate swipe');
  assert.equal(await page.locator('[data-cx-camera-shutter]').isDisabled(),true,'No fake capture without a stream');
  assert.equal((await swipe(180)).tab,'home','Camera swipe RIGHT returns Home');
  assert.equal(await page.locator('main.cx-swipe-camera').count(),0);

  // Forward + reverse: Home -> Reels -> Messages -> Search -> Profile.
  for(const tab of ['reels','messages','discover','profile']){
    const result=await swipe(180);
    assert.equal(result.tab,tab);
  }
  for(const tab of ['discover','messages','reels','home']){
    const result=await swipe(-180);
    assert.equal(result.tab,tab);
  }
  assert.equal((await swipe(180,160)).tab,'home','Vertical/diagonal gesture must not change tabs');
  assert.equal((await swipe(40)).tab,'home','Short gesture must not change tabs');
  assert.equal((await swipe(180,0,'#app .sample-hint')).tab,'home','Non-main touch must not route');

  // Story dialog owns its own horizontal swipes; app navigation must stay put.
  await page.locator('[data-open-story]').first().click();
  assert.equal(await page.locator('dialog.story-viewer').count(),1);
  await swipe(180,0,'dialog.story-viewer');
  assert.equal(await page.evaluate(()=>getState().activeTab),'home');
  await page.locator('[data-sv="close"]').click();

  // Default mobile Reel stage must also allow native-like swipe right, not just empty areas.
  await page.evaluate(()=>navigate('reels'));
  const rect=await page.locator('main.reels-deck').boundingBox();
  assert.ok(rect?.height>200,'Reels deck visible');
  const session=await context.newCDPSession(page);
  const y=Math.min(rect.y+190,rect.y+rect.height/2);
  const first={x:115,y},last={x:298,y};
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:207,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[last]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>getState().activeTab==='messages');
  console.log('PASS: Real Chromium Reels swipe right -> Messages');

  // Six independent Reel slides: no actions may disappear after first 2-3.
  await page.evaluate(()=>{
    const s=getState(),sample=s.reels[0];
    s.reels=Array.from({length:6},(_,i)=>({...sample,id:'swipe_control_'+(i+1),
      caption:'Persistence test reel '+(i+1),liked:false,saved:false,reposted:false}));
    saveState(s);navigate('reels');
  });
  const slides=page.locator('.reel-slide');
  assert.equal(await slides.count(),6);
  for(let i=0;i<6;i++){
    const slide=slides.nth(i);
    assert.equal(await slide.locator('.reel-rail').count(),1,'Action rail missing on Reel '+(i+1));
    for(const sel of ['[data-like]','[data-comment-focus]','[data-share]','[data-repost]','[data-save]']){
      assert.equal(await slide.locator('.reel-rail '+sel).count(),1,sel+' missing on Reel '+(i+1));
    }
    assert.equal(await slide.locator('.reel-rail').evaluate(e=>getComputedStyle(e).visibility),'visible');
  }
  const lastSlide=slides.last();
  await lastSlide.scrollIntoViewIfNeeded();
  await lastSlide.locator('[data-save]').click();
  assert.equal(await page.evaluate(()=>getState().reels.find(r=>r.id==='swipe_control_6').saved),true);
  // Shop is not connected to this demo. Do not add a misleading fake merchant.
  assert.equal(await page.locator('[data-cx-real-shop-checkout]').count(),0);
  assert.deepEqual(writes,[],'No mock action may charge, upload or write to an external server');
  assert.deepEqual(errors,[],'No page JavaScript exceptions');
  console.log('PASS: Home left Camera; Camera right Home; reversible horizontal tabs; swipe ownership; 6 Reel action rails');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
