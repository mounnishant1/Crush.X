/* Step261: browser interaction exercises the real integrated app. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.AmazonCognitoIdentity={CognitoUserPool:class{getCurrentUser(){return null;}},CognitoUserAttribute:class{},CognitoUser:class{},AuthenticationDetails:class{}};});
await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8000/')?r.continue():r.abort());
await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof CrushXSearchStep261==='object');
await page.evaluate(()=>{document.getElementById('authOverlay').style.display='none';navigate('discover');});
await page.locator('#searchInput').focus();
await page.waitForFunction(()=>CrushXSearchStep261.mode==='editing');
await page.locator('#searchInput').fill('Midnight');
await page.locator('#searchInput').press('Enter');
assert.equal(await page.evaluate(()=>CrushXSearchStep261.mode),'results');
assert.equal(await page.locator('[data-cx261-tab]').count(),4);
assert.equal(await page.locator('[data-open-local-item="reel_1"]').count(),1);
await page.locator('[data-cx261-tab="accounts"]').click();
assert.match(await page.locator('.cx261-body').innerText(),/No matching sample accounts/);
await page.locator('[data-cx261-tab="audio"]').click();
await page.locator('[data-cx261-tab="tags"]').click();
await page.locator('[data-cx261-back]').click();
assert.equal(await page.evaluate(()=>CrushXSearchStep261.mode),'idle');
// Existing Explore profile links must become visible after a programmatic reset.
await page.locator('#searchInput').focus();
await page.locator('#searchInput').fill('Midnight');
await page.locator('#searchInput').press('Enter');
await page.evaluate(()=>{const state=getState();state.searchQuery='';saveState(state);renderApp();});
assert.equal(await page.evaluate(()=>CrushXSearchStep261.mode),'idle','external clear exits result overlay');
assert.equal(await page.locator('[data-profile-user="user_2"]').first().isVisible(),true,'legacy Explore profile visible');
assert.deepEqual(errors,[]);
console.log('Step261 mobile browser Search/Suggestions/For you/Accounts/Audio/Tags/Back PASS');
} finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});