'use strict';
/* Browser-only proof of timed Reel EXTRA options hiding after 2-3 seconds.
 * The social action rail stays visible; no Shop checkout is invented.
 */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BASE=process.env.CRUSHX_TEST_URL||'http://127.0.0.1:8000/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[],remoteWrites=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.AmazonCognitoIdentity={CognitoUserPool:class{getCurrentUser(){return null;}}};
    });
    await page.route('**/*',route=>{
      const req=route.request(),url=req.url();
      if(!['GET','HEAD'].includes(req.method()))remoteWrites.push(url);
      if(url.startsWith(BASE))return route.continue();
      return route.abort();
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      document.getElementById('authOverlay').style.display='none';
      const state=getState(),sample=state.reels[0];
      if(!sample)throw Error('Missing local sample reel');
      state.reels=Array.from({length:6},(_,i)=>({
        ...sample,id:'cx_hide_'+(i+1),liked:false,saved:false,reposted:false,
        caption:'Secondary controls visibility test '+(i+1)
      }));
      saveState(state);
      navigate('reels');
    });
    const slides=page.locator('.reel-slide');
    assert.equal(await slides.count(),6);
    assert.equal(await page.evaluate(()=>CrushXReelOptions.durationMs),2800);
    const first=slides.first();
    assert.equal(await first.locator('[data-cx-reel-more]').count(),1);
    for(const selector of ['[data-like]','[data-advanced-comments]','[data-social-share]','[data-save]']){
      assert.equal(await first.locator(selector).isVisible(),true,selector+' should always be visible');
    }
    for(const selector of ['[data-reel-speed]','[data-reel-mute]','[data-repost]','[data-advanced-reel-menu]']){
      assert.equal(await first.locator(selector).isVisible(),true,selector+' initially visible');
    }
    // On each Reel, secondary actions go INVISIBLE automatically after ~3 seconds.
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.reel-slide[data-reel-slide="cx_hide_1"] [data-reel-speed]')).visibility==='hidden',null,{timeout:5000});
    assert.equal(await first.locator('[data-reel-speed]').isVisible(),false);
    assert.equal(await first.locator('[data-reel-mute]').isVisible(),false);
    assert.equal(await first.locator('[data-repost]').isVisible(),false);
    assert.equal(await first.locator('[data-advanced-reel-menu]').isVisible(),false);
    for(const selector of ['[data-like]','[data-advanced-comments]','[data-social-share]','[data-save]']){
      assert.equal(await first.locator(selector).isVisible(),true,selector+' vanished after hide');
    }
    const toggle=first.locator('[data-cx-reel-more]');
    assert.equal(await toggle.isVisible(),true,'More must stay visible');
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    await toggle.click();
    await page.waitForFunction(()=>{const e=document.querySelector('.reel-slide[data-reel-slide="cx_hide_1"] [data-reel-speed]');return e&&getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().height>0;},null,{timeout:2500});
    assert.equal(await first.locator('[data-reel-speed]').isVisible(),true,'More reopens extra actions');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.reel-slide[data-reel-slide="cx_hide_1"] [data-reel-speed]')).visibility==='hidden',null,{timeout:5000});
    await first.locator('.reel-visual').click({position:{x:150,y:220},force:true});
    await page.waitForFunction(()=>{const e=document.querySelector('.reel-slide[data-reel-slide="cx_hide_1"] [data-reel-speed]');return e&&getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().height>0;},null,{timeout:2500});
    assert.equal(await first.locator('[data-reel-speed]').isVisible(),true,'tap on Reel reopens extras');
    // New Reel receives its OWN ~3-second timer; not a permanently visible rail.
    await page.evaluate(()=>{
      const deck=document.querySelector('.reels-deck');
      deck.scrollTop=deck.clientHeight*4;
      deck.dispatchEvent(new Event('scroll',{bubbles:true}));
    });
    await page.waitForFunction(()=>CrushXReelOptions.status().activeReelId==='cx_hide_5',null,{timeout:4000});
    const fifth=slides.nth(4);
    assert.equal(await fifth.locator('[data-reel-mute]').isVisible(),true);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.reel-slide[data-reel-slide="cx_hide_5"] [data-reel-speed]')).visibility==='hidden',null,{timeout:5000});
    assert.equal(await fifth.locator('[data-reel-mute]').isVisible(),false);
    assert.equal(await fifth.locator('[data-like]').isVisible(),true);
    assert.deepEqual(errors,[],'No page JS runtime errors');
    assert.deepEqual(remoteWrites,[],'Preview must never send a real upload/payment');
    console.log('PASS: Reels secondary Shop/extra option slots auto-hide at 2.8s, More/tap reveal and repeat for Reel #5; primary actions remain.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
