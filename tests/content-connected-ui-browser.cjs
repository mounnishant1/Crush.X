/* Browser test; PLAYWRIGHT_MODULE=... node tests/content-connected-ui-browser.cjs */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:820}});
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=req.url();
   if(url.startsWith('http://127.0.0.1:8000'))return route.continue();
   if(req.method()!=='GET')writes.push(url);
   if(/\.(js|css)(?:\?|$)|cdn\.tailwindcss|unpkg\.com/.test(url))
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   document.getElementById('authOverlay').style.display='none';
   window.__contentRemoteCalls=[];
   window.CrushXContentBackend={
    async setPreferences(p){window.__contentRemoteCalls.push(['consent',p]);return p;},
    async eraseHistory(){window.__contentRemoteCalls.push(['erase']);return {erased:true};},
    async ask(question,id){window.__contentRemoteCalls.push(['ask',question,id]);
     return {status:'queued',jobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};},
    async getJob(jobId){window.__contentRemoteCalls.push(['result',jobId]);
     return {status:'completed',result:{answer:'Authorized matching excerpt',
      sources:[{kind:'reel',id:'reel_1',excerpt:'Cooking pasta'}]}};}
   };
   navigate('home');
  });
  assert.deepEqual(await page.evaluate(()=>window.__contentRemoteCalls),[]);
  await page.locator('[data-ax-global]').click();
  const dlg=page.locator('dialog[aria-label="AURA-X"]');
  assert.equal(await dlg.locator('.cx-aura-connected').count(),1);
  await dlg.locator('.cx-aura-connected summary').click();
  await dlg.locator('[data-ax-remote-enable]').click();
  assert.match(await dlg.locator('[data-ax-remote-status]').textContent(),/enabled/);
  await dlg.locator('.cx-aura-content summary').click();
  await dlg.locator('#axContentQuestion').fill('Find my Reel');
  await dlg.locator('[data-ax-remote-ask]').click();
  assert.match(await dlg.locator('[data-ax-remote-status]').textContent(),/queued/);
  await dlg.locator('[data-ax-remote-check]').click();
  assert.match(await dlg.locator('[data-ax-remote-output]').textContent(),/\[reel:reel_1\]/);
  await dlg.locator('[data-ax-remote-disable]').click();
  assert.match(await dlg.locator('[data-ax-remote-status]').textContent(),/disabled/);
  const calls=await page.evaluate(()=>window.__contentRemoteCalls);
  assert.equal(calls.map(x=>x[0]).join(','),'consent,ask,result,consent,erase');
  assert.equal(calls[0][1].personalize,false);
  assert.equal(calls[3][1].read,false);
  assert.deepEqual(writes,[]);
  assert.deepEqual(errors,[]);
  console.log('Connected AURA-X content UI PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
