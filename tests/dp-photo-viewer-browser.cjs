'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BASE=process.env.CRUSHX_TEST_URL||'http://127.0.0.1:8000/';
const onePixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8Cb5sAAAAASUVORK5CYII=','base64');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:360,height:780},deviceScaleFactor:2,
   isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),writes=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const req=route.request(),url=req.url();
   if(req.method()!=='GET'&&req.method()!=='HEAD')writes.push(url);
   if(url.startsWith(BASE))return route.continue();
   if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/png',body:onePixel});
   return route.abort();
  });
  await page.addInitScript(()=>{
   window.AmazonCognitoIdentity={CognitoUserPool:class{getCurrentUser(){return null;}}};
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   document.getElementById('authOverlay').style.display='none';
   navigate('profile');
  });
  const dp=page.locator('main img[data-cx-dp]').first();
  await dp.waitFor({state:'visible'});
  await dp.click();
  const modal=page.locator('#cxDpViewer'),stage=page.locator('.cx-dp-stage');
  await modal.waitFor({state:'visible'});
  assert.equal(await modal.getAttribute('aria-modal'),'true');
  assert.equal(await stage.getAttribute('data-scale'),'1');

  await page.getByRole('button',{name:'Zoom in'}).click();
  assert.ok(Number(await stage.getAttribute('data-scale'))>1);
  await page.getByRole('button',{name:'Reset zoom'}).click();
  assert.equal(Number(await stage.getAttribute('data-scale')),1);

  // Simulate two independent touchscreen contacts in mobile Chromium.
  const pinch=await page.evaluate(()=>{
   const el=document.querySelector('.cx-dp-stage');
   const box=el.getBoundingClientRect(),y=box.top+box.height/2;
   const mid=box.left+box.width/2;
   function fire(type,id,x){
    el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
     pointerId:id,pointerType:'touch',isPrimary:id===41,button:0,buttons:type==='pointerup'?0:1,
     clientX:x,clientY:y}));
   }
   fire('pointerdown',41,mid-70);
   fire('pointerdown',42,mid+70);
   fire('pointermove',42,mid+115);
   fire('pointermove',41,mid-115);
   const zoom=Number(el.dataset.scale);
   fire('pointerup',42,mid+115);
   fire('pointerup',41,mid-115);
   return zoom;
  });
  assert.ok(pinch>1.4,'Two-finger stretch must enlarge photo; got '+pinch);
  await page.getByRole('button',{name:'Reset zoom'}).click();

  const doubleTap=await page.evaluate(()=>{
   const el=document.querySelector('.cx-dp-stage');
   const box=el.getBoundingClientRect();
   const x=box.left+box.width/2,y=box.top+box.height/2;
   const tap=id=>{
    for(const type of ['pointerdown','pointerup']){
     el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,
      pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerdown'?1:0,
      clientX:x,clientY:y}));
    }
   };
   tap(51);tap(52);
   return Number(el.dataset.scale);
  });
  assert.ok(doubleTap>2,'Double touch must zoom; got '+doubleTap);
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(),0,'Escape closes fullscreen viewer');

  // A DP inside a chat-row button opens the image, not the chat draft.
  await page.evaluate(()=>navigate('messages'));
  const messageDP=page.locator('.cx-chat-row img[data-cx-dp], [data-chat-user] img[data-cx-dp]').first();
  await messageDP.waitFor({state:'visible'});
  await messageDP.click();
  assert.equal(await modal.count(),1);
  await page.getByRole('button',{name:'Close photo viewer'}).click();
  assert.equal(await modal.count(),0);

  await page.evaluate(()=>navigate('profile'));
  assert.equal(await page.evaluate(()=>window.CrushXDPViewer.open('javascript:alert(1)')),false,
   'Unsafe scheme rejected');
  assert.equal(await page.evaluate(()=>window.CrushXDPViewer.isOpen()),false);

  const folder=path.join(process.cwd(),'dp-test-artifacts');
  fs.mkdirSync(folder,{recursive:true});
  await dp.click();
  await page.screenshot({path:path.join(folder,'dp-fullscreen-mobile.png')});
  await page.getByRole('button',{name:'Zoom in'}).click();
  await page.screenshot({path:path.join(folder,'dp-zoom-mobile.png')});
  assert.deepEqual(writes,[],'No backend writes from DP interaction');
  assert.equal(errors.length,0,'Unexpected page exceptions: '+errors.join('; '));
  console.log('PASS: DP tap, fullscreen, pinch stretch, double-tap, zoom/reset, keyboard close, chat non-navigation and URL safety.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
