/* Step254 integrated browser navigation/touch flow: run against local HTTP :8000. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.AmazonCognitoIdentity={
        CognitoUserPool:class {getCurrentUser(){return null;}},
        CognitoUserAttribute:class {},
        CognitoUser:class {},
        AuthenticationDetails:class {}
      };
    });
    await page.route('**/*',route=>{
      if(route.request().url().startsWith('http://127.0.0.1:8000/')) return route.continue();
      return route.abort();
    });
    await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof openGridMedia==='function'&&!!document.querySelector('.bottom-nav'));
    await page.evaluate(()=>{
      document.getElementById('authOverlay').style.display='none';
      const s=getState(),base=s.reels[0];
      if(!base) throw Error('Need at least one sample Reel');
      s.reels=[
        {...base,id:'reel_1',views:12345},
        {...base,id:'reel_step254_b',userId:'user_1',caption:'Second ranked Reel',views:null},
        {...base,id:'reel_step254_c',userId:'user_2',caption:'Third ranked Reel',views:0}
      ];
      saveState(s);
      const previous=previewRanked;
      previewRanked=function(kind,items) {
        return kind==='reel' ? [...items].reverse() : previous(kind,items);
      };
      navigate('discover');
    });
    const tile=page.locator('.explore-grid [data-open-local-item="reel_1"]').first();
    assert.equal(await tile.count(),1,'Explore must include the target Reel');
    assert.equal(await tile.locator('.cx-mono-play-mark').count(),0,'No central Play icon');
    assert.equal(await tile.locator('.cx-reel-mark').count(),1,'Top-right Reel icon');
    assert.equal(await tile.locator('.cx-view-badge').getAttribute('aria-label'),'12,345 views','actual view count carried through');
    assert.equal(await tile.locator('.cx-view-number').textContent(),'12K');
    await tile.tap();
    await page.waitForFunction(()=>{
      const deck=document.querySelector('.reels-deck');
      if(!deck||!deck.clientHeight)return false;
      const slides=[...deck.querySelectorAll('[data-reel-slide]')];
      return slides[Math.round(deck.scrollTop/deck.clientHeight)]?.dataset.reelSlide==='reel_1';
    });
    const deckState=()=>page.evaluate(()=>{
      const deck=document.querySelector('.reels-deck');
      const slides=[...deck.querySelectorAll('[data-reel-slide]')];
      return {active:slides[Math.round(deck.scrollTop/deck.clientHeight)]?.dataset.reelSlide,order:slides.map(slide=>slide.dataset.reelSlide)};
    });
    assert.deepEqual((await deckState()).order,['reel_step254_c','reel_step254_b','reel_1'],'Ranked order must differ from storage order');
    assert.equal((await deckState()).active,'reel_1','Tap opened matching ranked Reel');
    const rail=await page.evaluate(()=>{
      const button=document.querySelector('.reel-rail button');
      const rail=button?.closest('.reel-rail');
      if(!rail)throw Error('Missing Reel icon rail');
      const evt=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:85});
      rail.dispatchEvent(evt);
      return {intercepted:evt.defaultPrevented,minHeight:parseFloat(getComputedStyle(button).minHeight)};
    });
    assert.equal(rail.intercepted,false,'Deck must not steal scroll from Reel action rail');
    assert.ok(rail.minHeight>=44,'Icon touch target must be at least 44px tall');
    await page.locator('[data-reel-slide="reel_1"] [data-profile-user]').tap();
    await page.waitForFunction(()=>location.hash.startsWith('#profile'));
    await page.goBack();
    await page.waitForFunction(()=>location.hash==='#reels');
    await page.waitForFunction(()=>{
      const deck=document.querySelector('.reels-deck');
      const slides=[...deck.querySelectorAll('[data-reel-slide]')];
      return slides[Math.round(deck.scrollTop/deck.clientHeight)]?.dataset.reelSlide==='reel_1';
    });
    assert.equal((await deckState()).active,'reel_1','Browser Back restored same Reel');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Mobile viewport must not horizontally overflow');
    assert.deepEqual(errors,[], 'No browser runtime errors');
    console.log('PASS: Explore touch, actual view badge, ranked Reel opening, rail wheel ownership, icon targets, Profile Back restoration and mobile bounds');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
