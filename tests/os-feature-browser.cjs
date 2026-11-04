/* Step 7 browser integration smoke. PLAYWRIGHT_MODULE=... node tests/os-feature-browser.cjs */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:720}});
  const errors=[],remoteWrites=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=request.url();
   if(url.startsWith('http://127.0.0.1:8000/'))return route.continue();
   if(request.method()!=='GET')remoteWrites.push({url,method:request.method()});
   if(/\.(?:js|css)(?:\?|$)|cdn\.tailwindcss|unpkg\.com/.test(url))
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   document.getElementById('authOverlay').style.display='none';
   navigate('home');
  });
  const trigger=page.locator('[data-os-open]');
  await trigger.waitFor();
  assert.equal(await trigger.count(),1,'Exactly one app OS controls entry');
  await trigger.click();
  const hub=page.locator('#cxOsFeatures');
  assert.equal(await hub.count(),1);
  assert.equal(await hub.getAttribute('aria-modal'),'true');
  assert.equal(await hub.locator('[data-os-feature]').count(),8);
  const css=await hub.evaluate(node=>{
   const s=getComputedStyle(node);
   return {position:s.position,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height};
  });
  assert.equal(css.position,'fixed','OS feature hub must be full-screen');
  assert.equal(css.width,390);
  assert.equal(css.height,720);
  assert.match(await hub.textContent(),/not connected/i);
  assert.equal(await page.evaluate(()=>CrushXAppOS.status('calls').callingReady),false);
  await hub.locator('[data-os-feature="camera"]').click();
  assert.equal(await page.evaluate(()=>getState().activeTab),'create');
  assert.equal(await hub.count(),0);
  await page.locator('[data-os-open]').click();
  await hub.locator('[data-os-feature="calls"]').click();
  assert.equal(await page.evaluate(()=>getState().activeTab),'messages');
  assert.equal(await hub.count(),0);
  await page.locator('[data-os-open]').click();
  assert.equal(await hub.locator('[data-os-ai]').count(),24,'All user-facing AI modules exposed via AURA-X');
  await hub.locator('[data-os-ai="editor"]').click();
  assert.equal(await hub.count(),0);
  const guided=page.locator('dialog[aria-label="AURA-X"]');
  assert.equal(await guided.count(),1,'Feature help reuses the single assistant');
  assert.match(await guided.locator('[data-ax-context]').textContent(),/Editor/);
  await guided.locator('[data-ax-consent]').click();
  await guided.locator('#axPrompt').fill('Fix touch and timeline overlap');
  await guided.locator('[data-ax-form] button[type="submit"]').click();
  assert.match(await guided.locator('[data-ax-output]').textContent(),/gesture ownership/i);
  assert.match(await guided.locator('[data-ax-output]').textContent(),/No model connected/i);
  await guided.locator('[data-close-dialog]').click();
  await page.locator('[data-os-open]').click();
  await page.keyboard.press('Escape');
  assert.equal(await hub.count(),0,'Escape closes full-screen OS controls');
  await page.locator('[data-os-open]').click();
  assert.equal(await page.locator('[data-ax-global]').count(),1,'AURA-X remains the only assistant entry');
  await hub.locator('[data-os-aura]').click();
  assert.equal(await hub.count(),0);
  assert.equal(await page.locator('dialog[aria-label="AURA-X"]').count(),1);
  await page.locator('dialog[aria-label="AURA-X"] [data-close-dialog]').click();
  await page.locator('[data-os-open]').click();
  await page.evaluate(()=>logout());
  assert.equal(await hub.count(),0,'Logout removes OS feature hub');
  assert.equal(await page.evaluate(()=>CrushXAppOS.open()),false,'No unauthenticated OS UI access');
  assert.deepEqual(remoteWrites,[],'Hub creates no remote mutations');
  assert.deepEqual(errors,[],'No unhandled JS errors');
  console.log('Crush.X OS Step 7 full-screen feature/navigation smoke PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
