const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {isThumbnail, TILE_VIDEO, GLYPH} = require('../monochrome-player-icons.js');
function media({tagName='VIDEO', inGrid=true, blocked=false, inButton=true}={}) {
  return {
    tagName,
    matches: selector => inGrid && selector === TILE_VIDEO,
    closest: selector => selector.includes('.reels-deck') ? (blocked ? {} : null) : (inButton ? {} : null)
  };
}
test('only grid thumbnail video nodes qualify', () => {
  assert.equal(isThumbnail(media()), true);
  assert.equal(isThumbnail(media({tagName:'IMG'})), false);
  assert.equal(isThumbnail(media({inGrid:false})), false);
  assert.equal(isThumbnail(media({blocked:true})), false);
  assert.equal(isThumbnail(media({inButton:false})), false);
});
test('play symbol uses a compact vector glyph with currentColor (black/white skin)', () => {
  assert.match(GLYPH, /<svg/);
  assert.match(GLYPH, /fill="currentColor"/);
  assert.doesNotMatch(GLYPH, /#[0-9a-f]{3,8}/i);
});
test('both monochrome player assets are loaded after shared player', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /href="\.\/monochrome-player-icons\.css"/);
  assert.match(html, /src="\.\/monochrome-player-icons\.js"/);
  assert.ok(html.indexOf('monochrome-player-icons.css') > html.indexOf('unified-player.css'));
  assert.ok(html.indexOf('monochrome-player-icons.js') > html.indexOf('unified-player.js'));
});
