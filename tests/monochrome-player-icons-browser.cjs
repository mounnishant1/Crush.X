/* Run with local python HTTP server on port 8000 and Playwright installed. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<!doctype html><html><body>
      <div class="explore-grid">
        <button id="reel" data-cx-item-kind="reel" data-cx-views="12345" aria-label="Open Reel" onclick="window.opened=(window.opened||0)+1">
          <video id="poster-video" poster="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E" muted playsinline></video><span>Reel</span>
        </button>
        <button id="unknown" data-cx-item-kind="reel" aria-label="Open Reel"><video id="not-ready" muted playsinline></video></button>
        <button id="photo" data-cx-item-kind="post" aria-label="Open Post"><img src="data:image/png;base64,iVBORw0KGgo="></button>
      </div>
      <div class="reels-deck"><button id="full"><video id="full-video" controls></video></button></div>
    </body></html>`);
    await page.addStyleTag({url:'http://127.0.0.1:8000/monochrome-player-icons.css'});
    await page.addScriptTag({url:'http://127.0.0.1:8000/monochrome-player-icons.js'});
    await page.waitForFunction(() => document.querySelector('#reel .cx-view-badge'));
    assert.equal(await page.locator('.cx-mono-play-mark').count(), 0, 'No central play glyph');
    assert.equal(await page.locator('#reel .cx-reel-mark').count(), 1, 'Reel corner icon');
    assert.equal(await page.locator('#reel .cx-view-badge').innerText(), '12K', 'Count is from data, not fictional');
    assert.equal(await page.locator('#reel .cx-view-badge').getAttribute('aria-label'), '12,345 views');
    assert.equal(await page.locator('#unknown .cx-view-badge').getAttribute('aria-label'), 'View count unavailable');
    assert.equal(await page.locator('#unknown .cx-view-number').count(), 0, 'No invented counts');
    assert.equal(await page.locator('#photo .cx-view-badge').count(), 0, 'Ordinary photos unaffected');
    assert.equal(await page.locator('#full .cx-view-badge').count(), 0, 'Full-screen Reel playback controls untouched');
    assert.equal(await page.locator('#poster-video').evaluate(video => getComputedStyle(video).visibility), 'visible');
    assert.equal(await page.locator('#not-ready').evaluate(video => getComputedStyle(video).visibility), 'hidden');
    assert.equal(await page.locator('#reel .cx-view-badge').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
    await page.locator('#reel').click();
    assert.equal(await page.evaluate(() => window.opened), 1, 'Tap still opens Reel');
    await page.evaluate(() => {
      const tile=document.createElement('button'); tile.dataset.cxItemKind='reel'; tile.dataset.cxViews='0';
      tile.id='dynamic';tile.appendChild(document.createElement('video'));
      document.querySelector('.explore-grid').appendChild(tile);
    });
    await page.waitForFunction(() => document.querySelector('#dynamic .cx-view-badge'));
    assert.equal(await page.locator('#dynamic .cx-view-badge').innerText(), '0');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#poster-video').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
    console.log('PASS: real thumbnails, no play overlays, corner views, dynamic cards, navigation, reduced motion.');
  } finally { await browser.close(); }
})().catch(err => {console.error(err);process.exitCode=1;});
