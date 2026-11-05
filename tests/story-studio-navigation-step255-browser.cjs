'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.AmazonCognitoIdentity={CognitoUserPool:class {getCurrentUser(){return null;}},CognitoUserAttribute:class{},CognitoUser:class{},AuthenticationDetails:class{}};
  });
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8000/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof openSampleStory==='function'&&typeof openStoryStudio==='function');
  await page.evaluate(()=>{document.getElementById('authOverlay').style.display='none'; navigate('home'); openSampleStory('story_2');});
  await page.waitForFunction(()=>!!document.querySelector('dialog.story-viewer[open]'));
  const pause=page.locator('dialog.story-viewer [data-sv="pause"]');
  await pause.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>storyViewerPaused),true,'pause icon toggles');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.sv),'pause','pause keeps keyboard focus after redraw');
  const stage=page.locator('dialog.story-viewer [data-sv-stage]');
  await stage.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>storyViewerPaused),false,'Enter on stage resumes');
  assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-sv-stage')),true,'stage keeps focus after redraw');
  const prev=await page.evaluate(()=>storyViewerIndex);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>storyViewerIndex),prev+1,'arrow switches exactly one Story');
  assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-sv-stage')),true,'stage focus survives Story navigation');
  const beforeCancel=await page.evaluate(()=>storyViewerIndex);
  await page.evaluate(()=>{
    const stage=document.querySelector('.story-viewer [data-sv-stage]');
    const e=(type,point)=>new PointerEvent(type,{pointerId:8,clientX:point,clientY:300,isPrimary:true,bubbles:true,cancelable:true});
    stage.dispatchEvent(e('pointerdown',220));
    stage.dispatchEvent(e('pointercancel',160));
    stage.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:350}));
  });
  assert.equal(await page.evaluate(()=>storyViewerIndex),beforeCancel,'pointer cancel prevents ghost Story tap');
  await page.locator('dialog.story-viewer [data-sv="close"]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog.story-viewer[open]'));
  await page.evaluate(()=>openStoryStudio());
  await page.waitForFunction(()=>!!document.querySelector('dialog.story-studio[open]'));
  await page.locator('dialog.story-studio [data-ss="templates"]').click();
  assert.equal(await page.evaluate(()=>ssSession?.view),'editor','gallery templates open real editor');
  await page.locator('dialog.story-studio [data-ss="text"]').click();
  assert.equal(await page.evaluate(()=>ssSession?.panel),'text','text icon opens text options');
  const input=page.locator('dialog.story-studio [data-ss-text]');
  await input.fill('Keyboard focus safe 123');
  assert.equal(await input.inputValue(),'Keyboard focus safe 123','editor text retained during preview redraw');
  assert.equal(await page.evaluate(()=>ssSession?.text),'Keyboard focus safe 123');
  const back=page.locator('dialog.story-studio [data-ss="back"]').first();
  await back.click();
  assert.equal(await page.evaluate(()=>ssSession?.view),'gallery','editor back returns gallery');
  await page.locator('dialog.story-studio [data-ss="close"]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog.story-studio[open]'));
  assert.deepEqual(errors,[],'no script exceptions');
  console.log('PASS: Story focus, Enter, next, canceled swipe and Studio gallery > editor > text > back > close on mobile');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
