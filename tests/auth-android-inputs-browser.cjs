'use strict';
// Chromium Android viewport emulation. Visual source test only; NOT a physical APK/WebView result.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BASE=process.env.CRUSHX_TEST_URL||'http://127.0.0.1:8000/';

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'});
  const page=await context.newPage();
  const remoteWrites=[];
  await page.route('**/*',route=>{
   const req=route.request();
   if(req.method()!=='GET'&&req.method()!=='HEAD')remoteWrites.push(req.url());
   if(req.url().startsWith(BASE))return route.continue();
   // No CDN or AWS is needed to test critical scoped login styles.
   return route.abort();
  });
  await page.addInitScript(()=>{
   window.AmazonCognitoIdentity={CognitoUserPool:class {
    getCurrentUser(){return null;}
   }};
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  const user=page.locator('#usernameInput'),pass=page.locator('#passwordInput');
  await user.waitFor();
  assert.equal(await user.isVisible(),true);
  assert.equal(await pass.isVisible(),true);
  assert.equal(await page.locator('#emailInput').isVisible(),false);
  assert.equal(await page.locator('#resetCodeInput').isVisible(),false);
  assert.equal(await page.locator('#authForm input:visible').count(),2);
  await user.focus();
  const info=await user.evaluate(el=>{
   const style=getComputedStyle(el),rect=el.getBoundingClientRect();
   return {shadow:style.boxShadow,outline:style.outlineStyle,fontSize:style.fontSize,
    border:style.borderTopWidth,bg:style.backgroundColor,width:rect.width,
    left:rect.left,right:rect.right,height:rect.height};
  });
  assert.equal(info.shadow,'none','No extra colored outer box on focus');
  assert.equal(info.outline,'none','No double focus rectangle');
  assert.equal(info.border,'2px','One neutral focus border');
  assert.equal(info.fontSize,'16px','Prevent mobile input zoom');
  assert.ok(info.width>=220&&info.height>=48);
  assert.ok(info.left>=0&&info.right<=360,'Field stays in mobile viewport');
  assert.equal((await pass.getAttribute('type')),'password');
  await user.fill('crushx_user');
  await pass.fill('testing-password');
  assert.equal(await user.inputValue(),'crushx_user');
  assert.equal(await pass.inputValue(),'testing-password');
  await page.locator('#switchAuthButton').click();
  assert.equal(await page.locator('#emailInput').isVisible(),true);
  assert.equal(await pass.getAttribute('autocomplete'),'new-password');
  await page.locator('#switchAuthButton').click();
  assert.equal(await page.locator('#emailInput').isVisible(),false);
  assert.equal(await pass.getAttribute('autocomplete'),'current-password');
  const dimensions=await page.evaluate(()=>({
   scrollWidth:document.documentElement.scrollWidth,
   viewportWidth:document.documentElement.clientWidth,
   cardHeight:document.querySelector('#authOverlay .glass-strong').getBoundingClientRect().height
  }));
  assert.ok(dimensions.scrollWidth<=dimensions.viewportWidth+1,'No horizontal overflow');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  const dark=await user.evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.equal(dark,'rgb(20, 30, 48)','Dark login field is neutral');
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  const folder=path.join(process.cwd(),'auth-test-artifacts');
  fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,'android-login-360.png')});
  await page.setViewportSize({width:320,height:640});
  await user.focus();
  const small=await user.boundingBox();
  assert.ok(small.x>=0&&small.x+small.width<=320,'320px layout is not clipped');
  assert.deepEqual(remoteWrites,[],'Visual test never submits credentials or mutates backend');
  console.log('PASS: Android-sized Chromium login has two clean visible fields, neutral focus, autofill hooks, signup behavior and no horizontal clipping.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
