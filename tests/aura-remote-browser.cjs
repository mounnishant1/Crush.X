'use strict';
const test=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const r=route.request(),url=r.url();
   if(url.startsWith('http://127.0.0.1:8000/v1/aura/')){
    const data=r.postDataJSON?.();
    writes.push({path:new URL(url).pathname,method:r.method(),data});
    const path=new URL(url).pathname;
    const result=path==='/v1/aura/consent'&&r.method()==='POST'?
      {granted:true,scope:'ai:editor',expiresAt:Date.now()+900000}:
      path==='/v1/aura/guide'?
      {jobId:'00000000-0000-4000-8000-000000000001',status:'queued'}:
      path.includes('/jobs/')?{status:'completed',result:{workflow:'editor',
       suggestion:'Review timing and remove the overlap.',executed:false}}:
      {scope:'ai:editor',revoked:true,active:false};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
   }
   if(url.startsWith('http://127.0.0.1:8000/'))return route.continue();
   if(/\.(?:js|css)(?:\?|$)|cdn\.tailwindcss|unpkg\.com/.test(url))
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const m=document.createElement('meta');m.name='crushx-aura-api';m.content='same-origin';
   document.head.append(m);sessionStorage.setItem('crushx_access_token','x'.repeat(48));
   document.getElementById('authOverlay').style.display='none';
   navigate('home');
   CrushXAura.openFeature('editor');
  });
  const modal=page.locator('dialog[aria-label="AURA-X"]');
  await modal.waitFor();
  const optional=modal.locator('.cx-aura-remote');
  await optional.waitFor();
  test.equal(await optional.count(),1);
  test.equal(await page.locator('[data-ax-global]').count(),1,'single assistant only');
  await modal.locator('#axPrompt').fill('Fix preview touch overlap');
  await optional.locator('[data-remote-allow]').click();
  await test.equal(await optional.locator('[data-remote-ask]').isEnabled(),true);
  await optional.locator('[data-remote-ask]').click();
  await optional.locator('[data-remote-answer]').getByText('Review timing and remove the overlap.').waitFor();
  test.equal(writes.filter(x=>x.path==='/v1/aura/guide').length,1);
  const request=writes.find(x=>x.path==='/v1/aura/guide');
  test.equal(request.data.prompt,'Fix preview touch overlap');
  test.equal(request.data.context,'');
  test.equal(request.data.workflow,'editor');
  await optional.locator('[data-remote-revoke]').click();
  await optional.locator('[data-remote-status]').getByText('Model consent revoked.').waitFor();
  test.deepEqual(errors,[]);
  console.log('AURA-X remote opt-in browser flow PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});