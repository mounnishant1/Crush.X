/* PLAYWRIGHT_MODULE=... node tests/content-ui-browser.cjs; local port 8000 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],remoteWrites=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=request.url();
   if(/^http:\/\/127\.0\.0\.1:8000/.test(url))return route.continue();
   if(request.method()!=='GET')remoteWrites.push(url);
   if(/\.(js|css)(?:\?|$)|cdn\.tailwindcss|unpkg\.com/.test(url))
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   document.getElementById('authOverlay').style.display='none';
   navigate('home');
  });
  assert.equal(await page.evaluate(()=>CrushXContentBridge.status().consented),false);
  assert.equal(await page.locator('[data-content-card="post_1"]').count(),1);
  assert.equal(await page.locator('[data-ax-global]').count(),1);
  await page.locator('[data-ax-global]').click();
  const dialog=page.locator('dialog[aria-label="AURA-X"]');
  await dialog.locator('.cx-aura-content summary').click();
  await dialog.locator('[data-ax-content-allow]').click();
  assert.equal(await page.evaluate(()=>CrushXContentBridge.status().consented),true);
  await dialog.locator('#axContentTopics').fill('cooking, gaming, religion');
  await dialog.locator('[data-ax-content-set]').click();
  const interests=await page.evaluate(()=>CrushXContentBridge.status().interests);
  assert.deepEqual(interests,['cooking','gaming']);
  await dialog.locator('#axContentQuestion').fill('Midnight City');
  await dialog.locator('[data-ax-content-ask]').click();
  assert.match(await dialog.locator('[data-ax-content-output]').textContent(),/\[reel:reel_1\]/);
  await dialog.locator('#axContentQuestion').fill('quantum physics');
  await dialog.locator('[data-ax-content-ask]').click();
  assert.match(await dialog.locator('[data-ax-content-output]').textContent(),/No matching/);
  await dialog.locator('[data-close-dialog]').click();
  await page.locator('[data-content-hide="post_1"]').click();
  assert.equal(await page.locator('[data-content-card="post_1"]').count(),0);
  await page.locator('[data-ax-global]').click();
  const second=page.locator('dialog[aria-label="AURA-X"]');
  await second.locator('.cx-aura-content summary').click();
  await second.locator('[data-ax-content-reset]').click();
  await second.locator('[data-close-dialog]').click();
  assert.equal(await page.locator('[data-content-card="post_1"]').count(),1);
  await page.evaluate(()=>navigate('discover'));
  assert.equal(await page.locator('[data-content-open="reel_1"]').count(),1);
  await page.locator('[data-content-open="reel_1"]').click();
  assert.equal(await page.evaluate(()=>getState().activeTab),'reels');
  await page.locator('[data-content-why="reel_1"]').click();
  assert.match(await page.locator('#appStatus').textContent(),/sample preview/);
  await page.evaluate(()=>logout());
  assert.equal(await page.evaluate(()=>CrushXContentBridge.status().consented),false);
  assert.deepEqual(remoteWrites,[]);
  assert.deepEqual(errors,[]);
  console.log('Content Intelligence browser flows PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
