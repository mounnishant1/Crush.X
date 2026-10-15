// Run against the requested local server. Uses installed Playwright without changing dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/workspace/cloud-onboarding/crushx/node_modules/playwright');
const assert = require('node:assert/strict');
// One-second 32px WebM fixture generated locally, never fetched or uploaded.
const videoFixture = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAQjEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggQN7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAj0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WInTSUh2jKFTOcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgSC6gSCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WInTSUh2jKFTNnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAwMDAwMDAwMAAfQ7Z1QmTngQCjt4EAAIBwAgCdASogACAAAEcIhYWIhYSIAgICdPLGYf4AAP7+1iRyzOFey//uDj/+4OP/7g4/dMCjlYEAKACxAQAFEKwAGAAYWC/0AAhwAKOVgQBQALEBAAUQrAAYABhYL/QACHAAo5WBAHgAsQEABRCsABgAGFgv9AAIcACjlYEAoACxAQAFEKwAGAAYWC/0AAhwAKOVgQDIALEBAAUQrAAYABhYL/QACHAAo5WBAPAAsQEABRCsABgAGFgv9AAIcACjlYEBGACxAQAFEBAUYABhYL/QACHAAKOVgQFAALEBAAUQrAAYABhYL/QACHAAo5WBAWgAsQEABRCsABgAGFgv9AAIcACjlYEBkACxAQAFEKwAGAAYWC/0AAhwAKOVgQG4ALEBAAUQrAAYABhYL/QACHAAo5WBAeAAsQEABRCsABgAGFgv9AAIcACjlYECCACxAQAFEKwAGAAYWC/0AAhwAKOVgQIwALEBAAUQrAAYABhYL/QACHAAo5WBAlgAsQEABRCsABgAGFgv9AAIcACjlYECgACxAQAFEKwAGAAYWC/0AAhwAKOVgQKoALEBAAUQrAAYABhYL/QACHAAo5WBAtAAsQEABRAQFGAAYWC/0AAhwACjlYEC+ACxAQAFEKwAGAAYWC/0AAhwAKOVgQMgALEBAAUQrAAYABhYL/QACHAAo5WBA0gAsQEABRCsABgAGFgv9AAIcACjlYEDcACxAQAFEKwAGAAYWC/0AAhwAKOVgQOYALEBAAUQrAAYABhYL/QACHAAo5WBA8AAsQEABRCsABgAGFgv9AAIcAAcU7trkbuPs4EAt4r3gQHxggGj8IED', 'base64');
const { execFileSync } = require('node:child_process');
const assets = Object.fromEntries(['https://cdn.tailwindcss.com', 'https://unpkg.com/lucide@latest'].map(url => [url, execFileSync('curl', ['--fail','--silent','--show-error','--location','--max-time','30',url], {maxBuffer: 5*1024*1024})]));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
    const errors = [], remoteWrites = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      if (request.url().startsWith('http://127.0.0.1:8000')) {
        const response = await fetch(request.url());
        return route.fulfill({ status: response.status, contentType: response.headers.get('content-type'), body: Buffer.from(await response.arrayBuffer()) });
      }
      if (request.url() === 'https://example.com/movie.webm?x=1') return route.fulfill({ contentType: 'video/webm', body: videoFixture });
      if (request.method() !== 'GET') remoteWrites.push(request.url());
      if (/cdn.tailwindcss.com/.test(request.url())) return route.fulfill({ contentType: 'application/javascript', body: assets['https://cdn.tailwindcss.com'] });
      if (/unpkg.com/.test(request.url())) return route.fulfill({ contentType: 'application/javascript', body: assets['https://unpkg.com/lucide@latest'] });
      if (/amazon-cognito/.test(request.url())) return route.fulfill({ contentType: 'application/javascript', body: '' });
      return route.abort();
    });
    await page.addInitScript(() => {
      window.calls = [];
      window.failReset = true;
      window.AmazonCognitoIdentity = {
        CognitoUserPool: class { getCurrentUser() { return null; } signUp(username, password, attributes, ignored, callback) { calls.push(['signUp', username]); callback(null, { user: new AmazonCognitoIdentity.CognitoUser({Username: username}), userConfirmed: false }); } },
        CognitoUserAttribute: class {}, AuthenticationDetails: class {},
        CognitoUser: class {
          constructor(options) { this.username = options.Username; }
          forgotPassword(callbacks) { calls.push(['forgot', this.username]); callbacks.inputVerificationCode({}); }
          confirmPassword(code, password, callbacks) { calls.push(['reset', code, password]); if (failReset) callbacks.onFailure({message: 'Code expired'}); else callbacks.onSuccess(); }
          authenticateUser(details, callbacks) { calls.push(['login']); callbacks.onFailure({message: 'Incorrect credentials'}); }
          confirmRegistration(code, force, callback) { calls.push(['confirm', code]); callback(null); }
          resendConfirmationCode(callback) { callback(null); }
        }
      };
      Object.defineProperty(navigator, 'share', { value: async data => { calls.push(['share', data.url]); }, configurable: true });
    });
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto('http://127.0.0.1:8000', {waitUntil:'networkidle'});
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /enter your username/i);
    await page.locator('#switchAuthButton').click();
    await page.locator('#usernameInput').fill('testuser');
    await page.locator('#emailInput').fill('invalid');
    await page.locator('#passwordInput').fill('Password1');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /valid email/);
    assert.equal(await page.evaluate(() => calls.length), 0);
    await page.locator('#emailInput').fill('test@example.com');
    await page.locator('#authButton').click();
    await page.locator('#confirmButton').click();
    assert.match(await page.locator('#confirmationMessage').textContent(), /six-digit/);
    await page.locator('#confirmationCode').fill('123456');
    await page.locator('#confirmButton').click();
    assert.equal((await page.locator('#authButton').textContent()).trim(), 'Login');
    await page.locator('#usernameInput').fill('testuser');
    await page.locator('#passwordInput').fill('wrong');
    await page.locator('#passwordInput').press('Enter');
    assert.match(await page.locator('#authMessage').textContent(), /Incorrect credentials/);
    await page.locator('#forgotButton').click();
    await page.locator('#authButton').click();
    assert.equal(await page.evaluate(() => calls.some(c => c[0] === 'forgot' && c[1] === 'testuser')), true);
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /six-digit/);
    await page.locator('#resetCodeInput').fill('123456');
    await page.locator('#passwordInput').fill('weak');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /8 characters/);
    await page.locator('#passwordInput').fill('NewPassword1');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /Code expired/);
    assert.equal(await page.locator('#loader').evaluate(e => e.classList.contains('show')), false);
    await page.evaluate(() => failReset = false);
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /Password reset/);
    assert.equal((await page.locator('#authButton').textContent()).trim(), 'Login');
    await page.evaluate(() => document.getElementById('authOverlay').style.display = 'none');
    const like = page.locator('[data-like="post_1"]');
    const before = await page.evaluate(() => getState().posts[0].likes);
    await like.click(); assert.equal(await page.evaluate(() => getState().posts[0].likes), before + 1);
    await like.click(); assert.equal(await page.evaluate(() => getState().posts[0].likes), before);
    await page.locator('[data-save="post_1"]').click(); assert.equal(await page.evaluate(() => getState().posts[0].saved), true);
    await page.locator('[data-comment-focus="post_1"]').click();
    assert.equal(await page.locator('[data-comment-input="post_1"]').evaluate(e => e === document.activeElement), true);
    await page.locator('[data-comment-input="post_1"]').fill('<img src=x onerror=alert(1)>');
    await page.locator('[data-comment-input="post_1"]').press('Enter');
    assert.equal(await page.locator('main img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => getState().posts[0].comments.at(-1).text), '<img src=x onerror=alert(1)>');
    await page.locator('[data-share="post_1"]').click(); assert.equal(await page.evaluate(() => calls.some(c => c[0] === 'share' && c[1].startsWith('https://images.unsplash.com/'))), true);
    await page.evaluate(() => navigate('discover'));
    await page.locator('[data-follow-user="user_2"]').click(); assert.equal(await page.evaluate(() => getState().users.find(u => u.id === 'user_2').following), true);
    await page.locator('#searchInput').pressSequentially('aanya');
    assert.equal(await page.locator('#searchInput').inputValue(), 'aanya');
    assert.equal(await page.locator('#searchInput').evaluate(e => e === document.activeElement), true);
    await page.evaluate(() => {const s = getState(); s.reels.push({...s.reels[0],id:'video_test',userId:'user_2',source:'https://example.com/movie.webm?x=1',mediaType:'video'}); saveState(s); navigate('reels');});
    assert.equal(await page.locator('main video').count(), 1); assert.equal(await page.locator('main video').getAttribute('controls'), '');
    assert.equal(await page.locator('main img[alt="Reel image"]').count(), 1);
    await page.locator('main video').evaluate(async video => { await video.play(); });
    await page.waitForFunction(() => document.querySelector('main video')?.currentTime > 0.1);
    await page.locator('main video').evaluate(video => video.pause());
    await page.locator('[data-comment-input="video_test"]').fill('Local reel comment'); await page.locator('[data-comment-send="video_test"]').click();
    assert.equal(await page.evaluate(() => getState().reels.find(r => r.id === 'video_test').comments.length), 1);
    await page.evaluate(() => navigate('messages'));
    await page.locator('[data-chat-user="user_1"]').click();
    await page.locator('#messageDraft').fill('Only a draft');
    await page.locator('#messagesBack').click();
    await page.locator('[data-chat-user="user_1"]').click();
    assert.equal(await page.locator('#messageDraft').inputValue(), 'Only a draft');
    await page.goBack(); assert.equal(await page.locator('#messageDraft').count(), 0);
    await page.goForward(); assert.equal(await page.locator('#messageDraft').inputValue(), 'Only a draft');
    for (const width of [320, 375, 768, 1024, 1280]) {
      await page.setViewportSize({width, height:640});
      for (const tab of ['home','discover','messages','reels','profile','create']) {
        await page.evaluate(tab => navigate(tab), tab);
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {const r=e.getBoundingClientRect(); return r.width && r.right > innerWidth+1}).map(e => [e.tagName,e.id,e.className,e.getBoundingClientRect().right]).slice(0,15));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, JSON.stringify(overflow) + `${width}px ${tab} overflow`);
        const desktop = await page.locator('.desktop-nav').isVisible(), mobile = await page.locator('.bottom-nav').isVisible();
        assert.equal(desktop || mobile, true, `${width}px missing navigation`);
        assert.equal(desktop && mobile, false, `${width}px duplicate navigation`);
      }
    }
    await page.locator('#mediaInput').setInputFiles({name:'preview.webm',mimeType:'video/webm',buffer:videoFixture});
    assert.equal(await page.locator('#mediaPreview video').count(), 1);
    const previewUrl = await page.locator('#mediaPreview video').getAttribute('src');
    await page.evaluate(() => navigate('home'));
    assert.equal(await page.evaluate(async url => {try {await fetch(url);return false;} catch {return true;}}, previewUrl), true);
    await page.evaluate(() => {
      for (const file of [{type:'image/svg+xml',size:10},{type:'video/mp4',size:0},{type:'video/mp4',size:101*1024*1024}]) {
        let rejected = false; try {validateMedia(file);} catch {rejected = true;} if (!rejected) throw Error('Invalid file accepted');
      }
      validateMedia({type:'video/mp4',size:1024});
      for (const data of [{uploadUrl:'https://example.com'}, {uploadUrl:'http://example.com',mediaUrl:'https://example.com'}]) {
        let rejected = false; try {validateUploadResponse(data);} catch {rejected = true;} if (!rejected) throw Error('Invalid response accepted');
      }
      validateUploadResponse({uploadUrl:'https://example.com/upload',mediaUrl:'https://example.com/media'});
      return uploadToS3({type:'video/mp4',size:1024});
    });
    await page.evaluate(() => { const s = getState(); s.reels=[]; saveState(s); navigate('reels'); });
    assert.match(await page.locator('main').textContent(), /No reels/);
    assert.deepEqual(remoteWrites, []); assert.deepEqual(errors, []);
    console.log('PASS: auth validation/recovery/error retry, local interactions/share, reels, drafts/history, mobile layouts, media restrictions, upload guard; no remote writes or JS exceptions.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
