// Portable browser regression suite; run with a local HTTP server on port 8000.
// PLAYWRIGHT_MODULE/CHROMIUM_EXECUTABLE optionally select the cloud installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
// One-second 32px WebM fixture generated locally, never fetched or uploaded.
const videoFixture = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAQjEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggQN7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAj0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WInTSUh2jKFTOcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgSC6gSCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WInTSUh2jKFTNnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAxLjAwMDAwMDAwMAAfQ7Z1QmTngQCjt4EAAIBwAgCdASogACAAAEcIhYWIhYSIAgICdPLGYf4AAP7+1iRyzOFey//uDj/+4OP/7g4/dMCjlYEAKACxAQAFEKwAGAAYWC/0AAhwAKOVgQBQALEBAAUQrAAYABhYL/QACHAAo5WBAHgAsQEABRCsABgAGFgv9AAIcACjlYEAoACxAQAFEKwAGAAYWC/0AAhwAKOVgQDIALEBAAUQrAAYABhYL/QACHAAo5WBAPAAsQEABRCsABgAGFgv9AAIcACjlYEBGACxAQAFEBAUYABhYL/QACHAAKOVgQFAALEBAAUQrAAYABhYL/QACHAAo5WBAWgAsQEABRCsABgAGFgv9AAIcACjlYEBkACxAQAFEKwAGAAYWC/0AAhwAKOVgQG4ALEBAAUQrAAYABhYL/QACHAAo5WBAeAAsQEABRCsABgAGFgv9AAIcACjlYECCACxAQAFEKwAGAAYWC/0AAhwAKOVgQIwALEBAAUQrAAYABhYL/QACHAAo5WBAlgAsQEABRCsABgAGFgv9AAIcACjlYECgACxAQAFEKwAGAAYWC/0AAhwAKOVgQKoALEBAAUQrAAYABhYL/QACHAAo5WBAtAAsQEABRAQFGAAYWC/0AAhwACjlYEC+ACxAQAFEKwAGAAYWC/0AAhwAKOVgQMgALEBAAUQrAAYABhYL/QACHAAo5WBA0gAsQEABRCsABgAGFgv9AAIcACjlYEDcACxAQAFEKwAGAAYWC/0AAhwAKOVgQOYALEBAAUQrAAYABhYL/QACHAAo5WBA8AAsQEABRCsABgAGFgv9AAIcAAcU7trkbuPs4EAt4r3gQHxggGj8IED', 'base64');
const { execFileSync } = require('node:child_process');
const assets = Object.fromEntries(['https://cdn.tailwindcss.com', 'https://unpkg.com/lucide@latest'].map(url => [url, execFileSync('curl', ['--fail','--silent','--show-error','--location','--max-time','30',url], {maxBuffer: 5*1024*1024})]));
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {}), headless: true, args: ['--no-sandbox'] });
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
      window.mockAuth = {loginMode:'failure',mfaCode:null,mfaFailure:false,mfaThrows:false,sessionValid:true,expired:false,currentUser:false,restoreFailure:false,deferRestore:false,sessionSeconds:3600};
      window.mockSession = () => ({isValid:()=>mockAuth.sessionValid,getAccessToken:()=>({getJwtToken:()=>'mock-access',getExpiration:()=>Math.floor(Date.now()/1000)+(mockAuth.expired?-1:mockAuth.sessionSeconds)}),getIdToken:()=>({getJwtToken:()=>'mock-id',getExpiration:()=>Math.floor(Date.now()/1000)+(mockAuth.expired?-1:mockAuth.sessionSeconds)})});
      window.prompt = () => mockAuth.mfaCode;
      window.AmazonCognitoIdentity = {
        CognitoUserPool: class { getCurrentUser() { return mockAuth.currentUser ? new AmazonCognitoIdentity.CognitoUser({Username:'real-user'}) : null; } signUp(username, password, attributes, ignored, callback) { calls.push(['signUp', username]); callback(null, { user: new AmazonCognitoIdentity.CognitoUser({Username: username}), userConfirmed: false }); } },
        CognitoUserAttribute: class {}, AuthenticationDetails: class { constructor(options) { Object.assign(this,options); } },
        CognitoUser: class {
          constructor(options) { this.username = options.Username; }
          forgotPassword(callbacks) { calls.push(['forgot', this.username]); if(mockAuth.forgotError) callbacks.onFailure(mockAuth.forgotError); else callbacks.inputVerificationCode({}); }
          confirmPassword(code, password, callbacks) { calls.push(['reset', code, password]); if (failReset) callbacks.onFailure({message: 'Code expired'}); else callbacks.onSuccess(); }
          authenticateUser(details, callbacks) { calls.push(['login',this.username,details.Username]); if(mockAuth.loginMode==='success') callbacks.onSuccess(mockSession()); else if(mockAuth.loginMode==='mfa') callbacks.mfaRequired(); else callbacks.onFailure({message: 'Incorrect credentials'}); }
          sendMFACode(code, callbacks, type) { calls.push(['mfa',code,type]); if(mockAuth.mfaThrows) throw Error('MFA transport failed'); if(mockAuth.mfaFailure) callbacks.onFailure({message:'MFA rejected'}); else callbacks.onSuccess(mockSession()); }
          getSession(callback) { if(mockAuth.deferRestore) {window.deferredRestore=callback;return;} callback(mockAuth.restoreFailure?Error('Refresh rejected'):null,mockSession()); }
          signOut() { calls.push(['signOut']);mockAuth.currentUser=false; }
          confirmRegistration(code, force, callback) { calls.push(['confirm', code, force]); if(mockAuth.confirmThrows) throw Error('Confirmation transport failed'); callback(mockAuth.confirmFailure?Error('Code invalid'):null); }
          resendConfirmationCode(callback) { if(mockAuth.resendThrows) throw Error('Resend transport failed'); callback(null); }
        }
      };
      Object.defineProperty(navigator, 'share', { value: async data => { calls.push(['share', data.url]); }, configurable: true });
    });
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto('http://127.0.0.1:8000', {waitUntil:'networkidle'});
    for (const [password, expected] of [
      ['Password123', false], ['Password123!', true], ['Pa1!', false],
      ['password123!', false], ['PASSWORD123!', false], ['Password!!!', false],
      ['Password123💖', false]
    ]) assert.equal(await page.evaluate(password=>validPassword(password), password), expected, `Password policy: ${password}`);
    assert.equal(await page.evaluate(()=>Array.from(COGNITO_SPECIAL_CHARACTERS).every(character=>validPassword('Password123'+character))), true);
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /enter your username/i);
    await page.locator('#switchAuthButton').click();
    await page.locator('#usernameInput').fill('testuser');
    await page.locator('#emailInput').fill('invalid');
    await page.locator('#passwordInput').fill('Password123!');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /valid email/);
    assert.equal(await page.evaluate(() => calls.length), 0);
    await page.locator('#emailInput').fill('test@example.com');
    await page.locator('#passwordInput').fill('Password123');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /special character/);
    assert.equal(await page.evaluate(()=>calls.some(c=>c[0]==='signUp')), false);
    await page.locator('#passwordInput').fill('Password123!');
    await page.locator('#authButton').click();
    assert.equal(await page.evaluate(()=>calls.some(c=>c[0]==='signUp')), true);
    await page.locator('#confirmButton').click();
    assert.match(await page.locator('#confirmationMessage').textContent(), /six-digit/);
    await page.locator('#confirmationCode').fill('123456');
    await page.evaluate(()=>{mockAuth.confirmThrows=true;});
    await page.locator('#confirmButton').click();
    assert.match(await page.locator('#confirmationMessage').textContent(), /Confirmation transport failed/);
    assert.equal(await page.locator('#loader').evaluate(e=>e.classList.contains('show')), false);
    await page.evaluate(()=>{mockAuth.confirmThrows=false;mockAuth.resendThrows=true;});
    await page.locator('#resendButton').click();
    assert.match(await page.locator('#confirmationMessage').textContent(), /Resend transport failed/);
    await page.evaluate(()=>{mockAuth.resendThrows=false;});
    await page.locator('#confirmButton').click();
    assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='confirm').every(c=>c[2]===false)), true);
    assert.equal((await page.locator('#authButton').textContent()).trim(), 'Login');
    await page.locator('#usernameInput').fill('testuser');
    await page.locator('#passwordInput').fill('WrongPassword123!');
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
    await page.locator('#passwordInput').fill('Password123');
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /special character/);
    assert.equal(await page.evaluate(()=>calls.some(c=>c[0]==='reset')), false);
    await page.locator('#passwordInput').fill('NewPassword123!');
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
    for (const width of [320, 375, 768, 1024, 1199, 1200, 1279, 1280]) {
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
    // Authentication lifecycle is tested with SDK mocks only; no real accounts.
    await page.evaluate(() => { localStorage.removeItem(STATE_KEY); memoryState = clone(defaultState); logout(); });
    const login = async (mode = 'success', identity = 'actual-staging-user') => {
      await page.evaluate(mode => { mockAuth.loginMode = mode; }, mode);
      await page.locator('#usernameInput').fill(identity);
      await page.locator('#passwordInput').fill('Password123!');
      await page.locator('#authButton').click();
    };
    const tokenPair = () => page.evaluate(() => [sessionStorage.getItem('crushx_access_token'), sessionStorage.getItem('crushx_id_token')]);
    await login();
    assert.deepEqual(await tokenPair(), ['mock-access', 'mock-id']);
    for (const identity of ['CaseSensitive.User', 'Mixed.Email+tag@example.com', '+15555550123']) {
      await page.evaluate(()=>logout());
      await login('success', identity);
      assert.deepEqual(await page.evaluate(()=>calls.filter(c=>c[0]==='login').at(-1)), ['login',identity,identity]);
    }
    assert.equal(await page.evaluate(()=>calls.some(c=>c[0]==='mfa')), false); // Verified pool has MFA OFF.

    await page.evaluate(() => navigate('profile'));
    assert.match(await page.locator('main').textContent(), /Sample profile — not your Cognito account/);
    assert.equal(await page.locator('main').textContent().then(text => text.includes('actual-staging-user')), false);
    await page.evaluate(() => { sessionStorage.setItem('unrelated', 'keep'); const s=getState(); s.messageDrafts={user_1:'secret draft'}; saveState(s); logout(); });
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('unrelated')), 'keep');
    assert.deepEqual(await page.evaluate(() => getState().messageDrafts), {});
    await page.evaluate(() => { mockAuth.mfaCode = ' 123456 '; });
    await login('mfa');
    assert.deepEqual(await tokenPair(), ['mock-access', 'mock-id']);
    assert.equal(await page.evaluate(() => calls.some(c => c[0]==='mfa' && c[1]==='123456' && c[2]==='SMS_MFA')), true);
    await page.evaluate(() => { logout(); mockAuth.mfaFailure = true; });
    await login('mfa');
    assert.match(await page.locator('#authMessage').textContent(), /MFA rejected/);
    assert.deepEqual(await tokenPair(), [null, null]);
    await page.evaluate(() => { mockAuth.mfaFailure = false; mockAuth.mfaThrows = true; });
    await login('mfa');
    assert.match(await page.locator('#authMessage').textContent(), /MFA transport failed/);
    assert.equal(await page.locator('#loader').evaluate(e => e.classList.contains('show')), false);
    await page.evaluate(() => { mockAuth.mfaThrows = false; mockAuth.mfaCode = null; });
    await login('mfa');
    assert.match(await page.locator('#authMessage').textContent(), /MFA cancelled/);
    await page.evaluate(() => { mockAuth.mfaCode = 'invalid'; });
    await login('mfa');
    assert.match(await page.locator('#authMessage').textContent(), /six-digit/);
    await page.evaluate(() => { mockAuth.mfaCode = '123456'; mockAuth.sessionValid = false; });
    await login('mfa');
    assert.deepEqual(await tokenPair(), [null, null]);
    await page.evaluate(() => { mockAuth.sessionValid = true; mockAuth.expired = true; });
    await login();
    assert.match(await page.locator('#authMessage').textContent(), /Session expired/);
    assert.deepEqual(await tokenPair(), [null, null]);
    await page.evaluate(() => {
      sessionStorage.removeItem('crushx_logged_out');
      mockAuth.expired = false; mockAuth.currentUser = true;
      sessionStorage.setItem('crushx_access_token','stale'); sessionStorage.setItem('crushx_id_token','stale');
      restoreSession();
    });
    assert.deepEqual(await tokenPair(), ['mock-access', 'mock-id']);
    await page.evaluate(() => {mockAuth.restoreFailure = true; restoreSession();});
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.equal(await page.locator('#authOverlay').isVisible(), true);
    await page.evaluate(() => {mockAuth.restoreFailure = false; mockAuth.currentUser = true; mockAuth.sessionValid = false; restoreSession();});
    assert.deepEqual(await tokenPair(), [null, null]);
    await page.evaluate(() => {mockAuth.sessionValid = true; mockAuth.currentUser = false; sessionStorage.setItem('crushx_id_token','stale'); restoreSession();});
    assert.deepEqual(await tokenPair(), [null, null]);
    await page.evaluate(() => {mockAuth.currentUser = true; mockAuth.deferRestore = true; restoreSession(); logout(); mockAuth.deferRestore = false; deferredRestore(null, mockSession());});
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.equal(await page.locator('#authOverlay').isVisible(), true);
    await page.evaluate(()=>{mockAuth.currentUser=true;restoreSession();});
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.equal(await page.locator('#authOverlay').isVisible(), true);
    // Token storage denial must fail closed without leaving a partial pair.
    await page.evaluate(() => {window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value) {if(this===sessionStorage && key==='crushx_id_token') throw Error('Storage denied'); return originalSetItem.call(this,key,value);};});
    await login();
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.equal(await page.locator('#authOverlay').isVisible(), true);
    await page.evaluate(() => {Storage.prototype.setItem=originalSetItem;});
    // Advance browser time rather than waiting for a real token expiration.
    await page.clock.install();
    await page.evaluate(() => {mockAuth.sessionSeconds=2;});
    await login();
    await page.clock.fastForward(3000);
    assert.deepEqual(await tokenPair(), [null, null]);
    assert.match(await page.locator('#authMessage').textContent(), /Session expired/);
    await page.evaluate(() => {mockAuth.sessionSeconds=3600;});
    // Missing SDK and reset rate-limit errors cannot strand the loader.
    await page.evaluate(() => {window.savedSDK=AmazonCognitoIdentity; window.AmazonCognitoIdentity=null; cognitoPool=null;});
    await login();
    assert.match(await page.locator('#authMessage').textContent(), /SDK failed to load/);
    await page.evaluate(() => {window.AmazonCognitoIdentity=savedSDK; mockAuth.forgotError={code:'LimitExceededException',message:'Try again later'};});
    await page.locator('#forgotButton').click();
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /Try again later/);
    assert.equal(await page.locator('#loader').evaluate(e => e.classList.contains('show')), false);
    await page.evaluate(() => {mockAuth.forgotError={code:'UserNotFoundException',message:'Account not found'};});
    await page.locator('#authButton').click();
    assert.match(await page.locator('#authMessage').textContent(), /If the account can be recovered/);
    await page.locator('#switchAuthButton').click();
    assert.equal(await page.locator('#resetCodeInput').isVisible(), false);
    assert.equal(await page.locator('#usernameInput').evaluate(e=>e.readOnly), false);
    await page.evaluate(() => {mockAuth.forgotError=null; logout(); document.getElementById('authOverlay').style.display='none';});
    // Malformed shapes/references and prototype keys from persisted state.
    for (const value of ['{bad json', 'null', '{"users":[],"posts":[null],"reels":"wrong","searchQuery":{}}']) {
      await page.evaluate(value => {localStorage.setItem(STATE_KEY,value);renderApp();}, value);
      assert.equal(await page.evaluate(() => currentUser(getState()).id), 'me');
    }
    await page.evaluate(() => {const s=clone(defaultState); s.users.push({id:'__proto__',username:'bad'}); s.currentUserId='user_2'; s.posts.push({id:'dangling',userId:'missing'}); saveState(s); renderApp();});
    assert.equal(await page.evaluate(() => getState().users.some(u=>u.id==='__proto__')), false);
    assert.equal(await page.evaluate(() => getState().posts.some(p=>p.id==='dangling')), false);
    assert.equal(await page.evaluate(() => getState().currentUserId), 'me');
    // Persisted text, attribute and URL payloads must never execute.
    await page.evaluate(() => {
      window.xssTriggered=0;
      const payload='<img src=x onerror="window.xssTriggered++">';
      const s=clone(defaultState); s.users[0].username=payload; s.users[0].fullName=payload; s.users[0].info=payload;
      s.users[0].avatar='https://example.com/" onerror="window.xssTriggered++';
      s.users[1].avatar='javascript:window.xssTriggered++';
      s.posts[0].caption=payload; s.posts[0].location=payload; s.posts[0].image='data:image/svg+xml,<svg onload="window.xssTriggered++"/>';
      s.posts[0].comments=[{user:payload,text:payload}];
      s.reels[0].source='javascript:window.xssTriggered++'; s.reels[0].caption=payload; s.reels[0].song=payload;
      s.messageDrafts={user_1:'</textarea>'+payload}; s.searchQuery='" autofocus onfocus="window.xssTriggered++';
      s.posts.push({...s.posts[0],id:'" onclick="window.xssTriggered++'});
      saveState(s);
    });
    for (const tab of ['home','discover','profile','reels','messages']) {
      await page.evaluate(tab=>navigate(tab,tab==='messages'?'user_1':null),tab);
      assert.equal(await page.locator('[onerror],[onload],[onfocus],[onclick]').count(), 0);
      assert.equal(await page.locator('[src^="javascript:"],[src^="data:"]').count(), 0);
      assert.equal(await page.evaluate(()=>window.xssTriggered), 0);
    }
    assert.equal(await page.locator('#messageDraft').inputValue().then(v=>v.startsWith('</textarea>')), true);
    await page.evaluate(() => {saveState(clone(defaultState));navigate('home');location.hash='#messages/%E0%A4%A';});
    await page.waitForFunction(()=>getState().activeTab==='messages');
    assert.equal(await page.locator('#messageDraft').count(), 0);
    await page.evaluate(()=>navigate('messages','__proto__'));
    assert.equal(await page.locator('#messageDraft').count(), 0);
    await page.evaluate(()=>navigate('unknown'));
    assert.equal(await page.evaluate(()=>getState().activeTab), 'home');
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>getState().activeTab), 'home');
    assert.equal(await page.locator('#authOverlay').isVisible(), true);
    await page.evaluate(()=>{document.getElementById('authOverlay').style.display='none';navigate('messages','user_2');});
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#messageDraft').count(), 1);
    // Denied or quota-exhausted storage retains only page memory.
    await page.evaluate(()=>{window.originalGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw Error('denied');};});
    await page.evaluate(()=>{const s=getState();s.searchQuery='memory-only';saveState(s);});
    assert.equal(await page.evaluate(()=>getState().searchQuery), 'memory-only');
    await page.evaluate(()=>{Storage.prototype.getItem=originalGetItem;storageUnavailable=false;saveState(clone(defaultState));window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};const s=getState();s.searchQuery='quota-memory';saveState(s);});
    assert.equal(await page.evaluate(()=>getState().searchQuery), 'quota-memory');
    await page.evaluate(()=>{Storage.prototype.setItem=originalSetItem;storageUnavailable=false;saveState(clone(defaultState));});

    assert.deepEqual(remoteWrites, []); assert.deepEqual(errors, []);
    console.log('PASS: verified password policy and unchanged username/email/phone alias forwarding, auth validation/recovery/error retry, local interactions/share, reels, drafts/history, mobile layouts, media restrictions, upload guard, MFA/token/expiration/restoration/logout, storage corruption/denial and persisted XSS; no remote writes or JS exceptions.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
