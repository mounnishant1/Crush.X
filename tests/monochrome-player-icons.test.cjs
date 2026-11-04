const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {formatViews, isThumbnail, EYE, REEL} = require('../monochrome-player-icons.js');
function video({tagName='VIDEO', grid=true, blocked=false} = {}) {
  return {
    tagName,
    closest: selector => selector.includes('.explore-grid button') ? (grid ? {} : null) : (blocked ? {} : null)
  };
}
test('views are formatted but unknown data is not fabricated', () => {
  assert.equal(formatViews(null), null);
  assert.equal(formatViews(undefined), null);
  assert.equal(formatViews(''), null);
  assert.equal(formatViews('invalid'), null);
  assert.equal(formatViews(-1), null);
  assert.equal(formatViews(0), '0');
  assert.equal(formatViews(999), '999');
  assert.equal(formatViews(1234), '1.2K');
  assert.equal(formatViews(20150), '20K');
  assert.equal(formatViews(1234567), '1.2M');
});
test('only Explore/Profile video previews are enhanced', () => {
  assert.equal(isThumbnail(video()), true);
  assert.equal(isThumbnail(video({tagName:'IMG'})), false);
  assert.equal(isThumbnail(video({grid:false})), false);
  assert.equal(isThumbnail(video({blocked:true})), false);
});
test('eye and Reel marks do not contain a center play symbol', () => {
  assert.match(EYE, /<svg/);
  assert.match(REEL, /<svg/);
  assert.doesNotMatch(EYE + REEL, /m9 5 11 7|cx-mono-play-mark/);
});
test('HTML and app tile metadata persist optional poster and real views', () => {
  const base = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(base, 'app-improvements.js'), 'utf8');
  assert.match(index, /optionalCount\(reel\.views\)/);
  assert.match(index, /optionalCount\(post\.views\)/);
  assert.match(index, /thumbnail: localText\(reel\.thumbnail/);
  assert.match(app, /data-cx-item-kind/);
  assert.match(app, /data-cx-views/);
  assert.match(app, /poster="/);
  assert.ok(index.indexOf('monochrome-player-icons.js') > index.indexOf('unified-player.js'));
});
