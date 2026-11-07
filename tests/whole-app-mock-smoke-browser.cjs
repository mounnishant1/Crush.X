'use strict';

/**
 * Crush.X whole-app MOCK smoke suite.
 * Coverage: actual static browser preview behavior only, with remote network blocked.
 * A passed mock check is NOT evidence for React/Capacitor, Unity, APK, AWS or devices.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BASE=process.env.CRUSHX_TEST_URL||'http://127.0.0.1:8000/';
const onePixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8Cb5sAAAAASUVORK5CYII=','base64');
const folder=path.join(process.cwd(),'mock-audit-artifacts');
fs.mkdirSync(folder,{recursive:true});

const checks=[
 {feature:'Login/signup',level:'browser-mock',run:async({page})=>{
  const user=page.locator('#usernameInput'),pass=page.locator('#passwordInput');
  assert.equal(await user.count(),1);assert.equal(await pass.count(),1);
  assert.equal(await user.isVisible(),true);
  const css=await user.evaluate(e=>getComputedStyle(e));
  assert.equal(css.boxShadow,'none','Auth fields must not have extra pink rings');
  await page.locator('#switchAuthButton').click();
  assert.equal(await page.locator('#emailInput').isVisible(),true);
  await page.locator('#switchAuthButton').click();
  assert.equal(await page.locator('#emailInput').isVisible(),false);
 }},
 {feature:'Home/feed likes',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  const before=await page.evaluate(()=>getState().posts.find(p=>p.id==='post_1').likes);
  await page.locator('[data-like="post_1"]').click();
  const after=await page.evaluate(()=>getState().posts.find(p=>p.id==='post_1').likes);
  assert.equal(after,before+1);
  await page.locator('[data-like="post_1"]').click();
  assert.equal(await page.evaluate(()=>getState().posts.find(p=>p.id==='post_1').likes),before);
 }},
 {feature:'Stories viewer',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  await page.locator('[data-open-story]').first().click();
  assert.equal(await page.locator('dialog.story-viewer').count(),1);
  await page.locator('[data-sv="next"]').click();
  assert.match(await page.locator('dialog.story-viewer').textContent(),/2\/3/);
  await page.locator('[data-sv="close"]').click();
  assert.equal(await page.locator('dialog.story-viewer').count(),0);
 }},
 {feature:'Reels player',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('reels');
  assert.ok(await page.locator('.reel-slide').count()>0);
  assert.equal(await page.locator('main .reels-deck').count(),1);
 }},
 {feature:'Explore/search',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('discover');
  const search=page.locator('#searchInput');
  assert.equal(await search.count(),1);
  await search.fill('aanya');
  assert.equal(await search.inputValue(),'aanya');
 }},
 {feature:'Profile & DP zoom',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('profile');
  const photo=page.locator('main img[data-cx-dp]').first();
  await photo.click();
  assert.equal(await page.locator('#cxDpViewer').count(),1);
  await page.getByRole('button',{name:'Zoom in'}).click();
  assert.ok(Number(await page.locator('.cx-dp-stage').getAttribute('data-scale'))>1);
  await page.getByRole('button',{name:'Close photo viewer'}).click();
  assert.equal(await page.locator('#cxDpViewer').count(),0);
 }},
 {feature:'Save/unsave',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  const saved=()=>page.evaluate(()=>getState().posts.find(p=>p.id==='post_1').saved);
  const was=await saved();
  await page.locator('[data-save="post_1"]').click();
  assert.equal(await saved(),!was);
  await page.locator('[data-save="post_1"]').click();
  assert.equal(await saved(),was);
 }},
 {feature:'Comment draft',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  await page.locator('[data-comment-input="post_1"]').fill('Local test draft');
  await page.locator('[data-like="post_1"]').click();
  assert.equal(await page.locator('[data-comment-input="post_1"]').inputValue(),'Local test draft');
 }},
 {feature:'Create/editor entry',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('create');
  assert.equal(await page.evaluate(()=>getState().activeTab),'create');
  assert.ok((await page.locator('main').first().textContent()).trim().length>20);
 }},
 {feature:'Messages local draft',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('messages');
  await page.locator('[data-chat-user="user_1"]').click();
  assert.equal(await page.locator('main.cx-chat-screen').count(),1);
  assert.match(await page.locator('main.cx-chat-screen').textContent(),/local draft/i);
 }},
 {feature:'Groups draft',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('messages');
  await page.locator('[data-cx-group-new]').click();
  assert.equal(await page.locator('main[aria-label="Group draft editor"]').count(),1);
  assert.equal(await page.evaluate(()=>location.hash),'#messages/group-draft');
 }},
 {feature:'Notes',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('messages');
  assert.ok(await page.locator('.cxn-rail').count()>0);
  await page.locator('[data-cxn-open]').click();
  assert.equal(await page.locator('dialog.cxn-dialog').count(),1);
 }},
 {feature:'Voice/video calls safe-fail',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('messages');
  await page.locator('[data-chat-user="user_1"]').click();
  await page.locator('[data-cx-unavailable="voice"]').click();
  assert.match(await page.locator('dialog.app-dialog').textContent(),/No call or connection was started/);
 }},
 {feature:'Offline P2P safe-fail',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('messages');
  await page.locator('[data-chat-user="user_1"]').click();
  await page.locator('[data-cx-unavailable="p2p"]').click();
  assert.match(await page.locator('dialog.app-dialog').textContent(),/No call or connection was started/);
 }},
 {feature:'Notifications/activity',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  await page.locator('#activityButton').click();
  assert.ok(await page.locator('dialog.app-dialog').count()>0);
  assert.match(await page.locator('dialog.app-dialog').textContent(),/local activity preview/i);
 }},
 {feature:'Live sandbox / no broadcast',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('profile');
  await page.locator('[data-cx-open-live]').click();
  assert.equal(await page.locator('dialog.cx-live-dialog').count(),1);
  assert.equal(await page.locator('.cx-live-feature button').isDisabled(),true);
  assert.match(await page.locator('.cx-live-preview').textContent(),/not connected/i);
 }},
 {feature:'Coin wallet sandbox',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('profile');
  await page.locator('[data-cx-open-live]').click();
  assert.equal(await page.locator('[data-cx-demo-balance]').textContent(),'120');
  await page.locator('[data-cx-live-gift="25"]').click();
  assert.equal(await page.locator('[data-cx-demo-balance]').textContent(),'95');
  await page.locator('[data-cx-live-inr]').click();
  assert.match(await page.locator('[data-cx-live-status]').textContent(),/No payment started/);
 }},
 {feature:'AURA-X consent boundary',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('reels');
  assert.equal(await page.locator('[data-ax-global]').count(),1);
  await page.locator('[data-ax-global]').click();
  const dialog=page.locator('dialog[aria-label="AURA-X"]');
  assert.equal(await dialog.count(),1);
  assert.equal(await dialog.locator('[data-ax-form] button').isDisabled(),true);
 }},
 {feature:'App OS controls',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  await page.locator('[data-os-open]').click();
  assert.equal(await page.locator('#cxOsFeatures').count(),1);
  assert.match(await page.locator('#cxOsFeatures').textContent(),/backend.*not connected/i);
 }},
 {feature:'Privacy/permissions',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('profile');
  await page.locator('#privacyPermissionsButton').click();
  assert.equal(await page.locator('dialog[aria-label="Privacy and permissions"]').count(),1);
 }},
 {feature:'Account status disconnected safety',level:'browser-mock',run:async({page,openApp})=>{
  await openApp('home');
  const state=await page.evaluate(()=>{
   const api=window.CrushXAccountLifecycle;
   return {present:!!api,opened:api?.open()};
  });
  assert.equal(state.present,true);
  assert.ok(state.opened!==false);
  assert.match(await page.locator('body').textContent(),/not connected/i);
 }}
];

// Deliberately separate unconnected real-service and device gates from mocks.
const releaseGates=[
 {feature:'Real Cognito + account reactivation',status:'Blocked',scope:'staging',reason:'No approved live staging login/OTP, moderator or recovery session receipts'},
 {feature:'Real social backend & publishing',status:'Blocked',scope:'staging',reason:'Preview explicitly disables production publish and user data contracts'},
 {feature:'Real camera / AR + MediaPipe',status:'Blocked',scope:'native',reason:'No Unity Editor/ARCore runtime or matching Android APK evidence'},
 {feature:'Real video export / Gallery',status:'Blocked',scope:'native',reason:'No matching Android recording/export QA and media integrity reports'},
 {feature:'DM and group delivery receipts',status:'Blocked',scope:'staging',reason:'Preview draft is local; no two-account backend receipts'},
 {feature:'WebRTC voice and video calls',status:'Blocked',scope:'two-device',reason:'Authenticated signaling/TURN and physical call evidence missing'},
 {feature:'Offline nearby encrypted P2P',status:'Blocked',scope:'two-device',reason:'No two-device airplane/offline transport and trust receipts'},
 {feature:'FCM foreground/background push',status:'Blocked',scope:'native',reason:'Real FCM token receipt and Android app lifecycle QA absent'},
 {feature:'Live stream ingest/playback',status:'Blocked',scope:'staging',reason:'Real streaming session and moderation evidence unavailable'},
 {feature:'Real INR/Razorpay or wallet payments',status:'Blocked',scope:'financial',reason:'No approved live gateway, webhook or ledger reconciliation evidence'},
 {feature:'AURA-X real provider & tool approval',status:'Blocked',scope:'staging',reason:'Model, permission and external action receipt unavailable'},
 {feature:'Latest Windows React/Capacitor v402 source',status:'Blocked',scope:'integration',reason:'Connected GitHub preview differs from latest F: working tree'},
 {feature:'Step306C 51 failures retest',status:'Untested',scope:'windows-vitest',reason:'Saved Windows run reported 273 pass, 51 fail; not rerun here'},
 {feature:'Unity EditMode / IL2CPP APK',status:'Untested',scope:'native',reason:'No Unity/Gradle execution in GitHub browser mock pipeline'},
 {feature:'OnePlus 9 Pro full-app QA',status:'Untested',scope:'device',reason:'No exact SHA-linked physical device execution'},
 {feature:'Production deployment',status:'Blocked',scope:'production',reason:'Independent release gates not satisfied and no deployment authorized'}
];

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 const actual=[];
 try{
  for(const check of checks){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const page=await context.newPage();
   const externalWrites=[],pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(e.message));
   await page.addInitScript(()=>{
    window.AmazonCognitoIdentity={CognitoUserPool:class{getCurrentUser(){return null;}}};
   });
   await page.route('**/*',route=>{
    const request=route.request();
    const url=request.url();
    if(request.method()!=='GET'&&request.method()!=='HEAD')externalWrites.push(url);
    if(url.startsWith(BASE))return route.continue();
    if(request.resourceType()==='image')
     return route.fulfill({status:200,contentType:'image/png',body:onePixel});
    return route.abort();
   });
   const openApp=async(tab)=>{
    await page.evaluate(name=>{
     document.getElementById('authOverlay').style.display='none';
     navigate(name);
    },tab);
   };
   const started=Date.now();
   try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await check.run({page,openApp});
    assert.deepEqual(externalWrites,[],'Mock test must not mutate backend');
    assert.deepEqual(pageErrors,[],'Browser page errors detected');
    actual.push({feature:check.feature,status:'Verified',scope:check.level,
     evidence:'Independent browser DOM/click assertions with all external requests blocked',
     durationMs:Date.now()-started});
    console.log('Verified MOCK:',check.feature);
   }catch(e){
    const error=(e.stack||e.message||String(e)).slice(0,1500);
    actual.push({feature:check.feature,status:'Failed',scope:check.level,error,durationMs:Date.now()-started});
    console.error('Failed MOCK:',check.feature,error);
    await page.screenshot({path:path.join(folder,'failed-'+String(actual.length).padStart(2,'0')+'.png'),timeout:3000}).catch(()=>{});
   }finally{
    await context.close();
   }
  }
 }finally{await browser.close();}
 const report={date:'2026-11-07',source:'GitHub browser preview ONLY',gitSha:process.env.GITHUB_SHA||null,
  mockChecks:actual,realReleaseGates:releaseGates,
  summary:{mockVerified:actual.filter(x=>x.status==='Verified').length,
   mockFailed:actual.filter(x=>x.status==='Failed').length,
   blocked:releaseGates.filter(x=>x.status==='Blocked').length,
   untested:releaseGates.filter(x=>x.status==='Untested').length}};
 fs.writeFileSync(path.join(folder,'mock-audit.json'),JSON.stringify(report,null,2)+'\n');
 const rows=['Feature,Scope,Status,Detail',...actual.map(x=>[x.feature,x.scope,x.status,x.error||x.evidence]),
 ...releaseGates.map(x=>[x.feature,x.scope,x.status,x.reason])];
 fs.writeFileSync(path.join(folder,'mock-gates.csv'),rows.map(row=>Array.isArray(row)?
  row.map(v=>'"'+String(v).replace(/"/g,'""').replace(/[\r\n]+/g,' ')+'"').join(','):row).join('\n')+'\n');
 console.log('MOCK SUMMARY',JSON.stringify(report.summary));
 if(report.summary.mockFailed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
