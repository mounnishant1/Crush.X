/* Run after python3 -m http.server 8000 and PLAYWRIGHT_MODULE setup. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<!doctype html><html><head><title>Player icon smoke test</title></head><body>
      <div class="explore-grid"><button id="explore" type="button" aria-label="Open sample Reel" onclick="window.clicked=(window.clicked||0)+1">
        <video id="no-poster" muted playsinline preload="metadata"></video><span>Reel</span>
      </button></div>
      <div class="app-media-grid"><button id="saved" type="button" aria-label="Open saved Reel">
        <video id="with-poster" poster="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E" muted playsinline></video>
      </button></div>
      <div class="reels-deck"><button id="real-reel"><video id="active-player" controls></video></button></div>
    </body></html>`);
    await page.addStyleTag({url:'http://127.0.0.1:8000/monochrome-player-icons.css'});
    await page.addScriptTag({url:'http://127.0.0.1:8000/monochrome-player-icons.js'});
    await page.waitForFunction(() => document.querySelectorAll('.cx-mono-play-mark').length === 2);
    assert.equal(await page.locator('#explore .cx-mono-play-mark').count(), 1);
    assert.equal(await page.locator('#saved .cx-mono-play-mark').count(), 1);
    assert.equal(await page.locator('#real-reel .cx-mono-play-mark').count(), 0, 'Full Reel playback must remain untouched');
    assert.equal(await page.locator('#no-poster').evaluate(el=>getComputedStyle(el).visibility), 'hidden', 'Old giant placeholder frame hidden when poster absent');
    assert.equal(await page.locator('#with-poster').evaluate(el=>getComputedStyle(el).visibility), 'visible', 'Real supplied poster stays visible');
    assert.equal(await page.locator('#explore .cx-mono-play-mark').evaluate(el=>getComputedStyle(el).color), 'rgb(255, 255, 255)');
    assert.equal(await page.locator('#explore .cx-mono-play-mark').evaluate(el=>getComputedStyle(el).pointerEvents), 'none');
    await page.locator('#explore').click();
    assert.equal(await page.evaluate(()=>window.clicked), 1, 'Click should still route to Reel');
    await page.evaluate(() => {
      const button=document.createElement('button'); button.type='button'; button.id='dynamic';
      const video=document.createElement('video'); button.append(video);
      document.querySelector('.explore-grid').append(button);
    });
    await page.waitForFunction(() => document.querySelector('#dynamic .cx-mono-play-mark'));
    assert.equal(await page.locator('#dynamic .cx-mono-play-mark').count(), 1);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#explore .cx-mono-play-mark').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    console.log('PASS: monochrome icons, fallback, poster preservation, dynamic cards, accessibility and click.');
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
