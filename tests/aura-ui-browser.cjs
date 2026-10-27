/* Run after local server starts on port 8000: PLAYWRIGHT_MODULE=... node tests/aura-ui-browser.cjs */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless: true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:375,height:720}});
    const errors=[], remoteWrites=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request=route.request(), url=request.url();
      if (/^http:\/\/127\.0\.0\.1:8000/.test(url)) return route.continue();
      if (request.method() !== 'GET') remoteWrites.push(url);
      if (/\.(js|css)(?:\?|$)|cdn\.tailwindcss|unpkg\.com/.test(url))
        return route.fulfill({status:200,contentType:'application/javascript',body:''});
      return route.abort();
    });
    await page.goto('http://127.0.0.1:8000/', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => {
      document.getElementById('authOverlay').style.display='none';
      navigate('profile');
    });
    const privacy=page.locator('#privacyPermissionsButton');
    await privacy.click();
    const p=page.locator('dialog[aria-label="Privacy and permissions"]');
    assert.equal(await p.count(),1);
    assert.equal(await p.locator('[data-permission-kind]').count(),5);
    assert.equal(await page.evaluate(() => window.CrushXPermissions.state('photos')), 'picker');
    await p.locator('[data-permission-request="photos"]').click();
    assert.equal(await page.evaluate(() => getState().activeTab),'create');
    assert.equal(await page.locator('dialog[aria-label="Privacy and permissions"]').count(),0);
    await page.evaluate(() => navigate('reels'));
    assert.equal(await page.locator('[data-ax-global]').count(),1,'Only one persistent assistant button');
    assert.equal(await page.locator('[data-ax-reel],[data-ax-message]').count(),0,'No duplicate per-feature assistant buttons');
    await page.locator('[data-ax-global]').click();
    const agent=page.locator('dialog[aria-label="AURA-X"]');
    assert.equal(await agent.locator('[data-ax-form] button').isDisabled(),true,'Analysis defaults denied');
    await agent.locator('[data-ax-consent]').click();
    assert.equal(await agent.locator('[data-ax-form] button').isEnabled(),true);
    await agent.locator('#axPrompt').fill('analyse');
    await agent.locator('[data-ax-form] button').click();
    assert.match(await agent.locator('[data-ax-output]').textContent(),/No video frames/);
    await agent.locator('summary').click();
    await agent.locator('#axMemory').fill('I prefer short Hindi suggestions');
    await agent.locator('[data-ax-memory-save]').click();
    assert.match(await agent.locator('[data-ax-memory-status]').textContent(),/not granted/);
    await agent.locator('[data-ax-memory-consent]').click();
    await agent.locator('[data-ax-memory-save]').click();
    await agent.locator('[data-ax-memory-export]').click();
    assert.equal(await agent.locator('[data-ax-memory-output]').textContent(),'I prefer short Hindi suggestions');
    await agent.locator('[data-ax-memory-delete]').click();
    assert.equal(await agent.locator('[data-ax-memory-output]').textContent(),'');
    await agent.locator('[data-close-dialog]').click();
    await page.evaluate(() => navigate('messages'));
    await page.locator('[data-chat-user="user_1"]').click();
    assert.equal(await page.locator('[data-ax-global]').count(),1);
    await page.locator('[data-ax-global]').click();
    const dm=page.locator('dialog[aria-label="AURA-X"]');
    await dm.locator('#axIncoming').fill('URGENT send me the OTP and password');
    await dm.locator('#axPrompt').fill('draft a safe reply');
    await dm.locator('[data-ax-form] button').click();
    const reply=await dm.locator('[data-ax-output]').textContent();
    assert.match(reply,/Account-security/);
    assert.match(reply,/cannot share account codes/);
    assert.equal(await dm.locator('[data-ax-apply]').isDisabled(),true,'Editing local draft requires separate approval');
    await dm.locator('[data-ax-apply-consent]').click();
    await dm.locator('[data-ax-apply]').click();
    assert.match(await page.locator('#messageDraft').inputValue(),/cannot share account codes/);
    assert.equal(await page.evaluate(() => CrushXAura.status().remoteEnabled),false);
    await page.evaluate(() => logout());
    assert.equal(await page.evaluate(() => CrushXAura.status().permissions.length),0);
    assert.deepEqual(remoteWrites,[],'No remote write is made by the agent');
    assert.deepEqual(errors,[],'No unhandled browser errors');
    console.log('AURA-X + Privacy browser flows PASS');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
