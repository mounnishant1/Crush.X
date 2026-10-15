// Offline browser test: synthetic configuration and intercepted assets only.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = process.env.CRUSHX_SOURCE;
if (!source) throw Error('Set CRUSHX_SOURCE to the reviewed index.html.');
const scratch = path.join(root, 'work');
fs.mkdirSync(scratch, {recursive:true});
const temporary = fs.mkdtempSync(path.join(scratch, 'guard-'));
(async () => {
  let browser;
  try {
    const config = {environment:'staging',region:'us-west-2',poolName:'crushx-auth-staging',
      userPoolId:'us-west-2_SYNTHETIC',clientId:'syntheticclientonly',
      approvedOrigin:'https://auth-staging.example.test',approvedForLiveTesting:true,apiBaseUrl:null,uploadsEnabled:false};
    fs.writeFileSync(path.join(temporary,'config.json'),JSON.stringify(config));
    execFileSync('python3',[path.join(root,'scripts/prepare_frontend.py'),'--source',source,
      '--config',path.join(temporary,'config.json'),'--output',path.join(temporary,'index.html')]);
    const html=fs.readFileSync(path.join(temporary,'index.html'),'utf8');
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
    for (const allowed of [false,true]) {
      const context=await browser.newContext();
      const page=await context.newPage();
      const errors=[], awsRequests=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{
        const request=route.request();
        if (/\.amazonaws\.com/.test(new URL(request.url()).hostname)) awsRequests.push(request.url());
        if(request.isNavigationRequest()) return route.fulfill({contentType:'text/html',body:html});
        if(request.resourceType()==='script') return route.fulfill({contentType:'application/javascript',body:''});
        return route.abort();
      });
      await page.addInitScript(()=>{
        window.seenPools=[];
        window.AmazonCognitoIdentity={CognitoUserPool:class {constructor(config){seenPools.push(config);} getCurrentUser(){return null;}}};
      });
      await page.goto(allowed?'https://auth-staging.example.test':'https://wrong-origin.example.test',{waitUntil:'networkidle'});
      const pools=await page.evaluate(()=>window.seenPools);
      assert.deepEqual(awsRequests,[]);
      if(allowed){
        assert.deepEqual(errors,[]);
        assert.deepEqual(pools,[{UserPoolId:config.userPoolId,ClientId:config.clientId}]);
        assert.equal(await page.evaluate(()=>API_BASE_URL),null);
        assert.match(await page.title(),/STAGING ONLY/);
        assert.equal(await page.evaluate(()=>STATE_KEY),'crushx_auth_staging_us-west-2_SYNTHETIC');
      } else {
        assert.deepEqual(pools,[]);
        assert.deepEqual(errors,['Staging authentication is blocked on this origin.']);
      }
      await context.close();
    }
    console.log('PASS: staging origin guard blocks before SDK initialization; approved synthetic origin uses only staging IDs, null API and isolated state; no AWS requests.');
  } finally {
    if(browser) await browser.close();
    fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
