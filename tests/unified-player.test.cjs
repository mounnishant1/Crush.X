const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {timeLabel, shouldEnhance} = require('../unified-player.js');
function video({controls=true, excluded=false, initialized=false, reel=false}={}) {
  return {
    tagName:'VIDEO', dataset: initialized ? {cxUnifiedPlayer:'1'} : {},
    hasAttribute: name => name === 'controls' && controls,
    matches: () => reel, closest: () => excluded ? {} : null
  };
}
test('time formatting is stable for unknown, short and long media', () => {
  assert.equal(timeLabel(Infinity),'0:00');
  assert.equal(timeLabel(NaN),'0:00');
  assert.equal(timeLabel(-3),'0:00');
  assert.equal(timeLabel(65.9),'1:05');
  assert.equal(timeLabel(3602),'1:00:02');
});
test('only native controlled, non-special videos are enhanced', () => {
  assert.equal(shouldEnhance(video()),true);
  assert.equal(shouldEnhance(video({controls:false})),false);
  assert.equal(shouldEnhance(video({reel:true})),false);
  assert.equal(shouldEnhance(video({excluded:true})),false);
  assert.equal(shouldEnhance(video({initialized:true})),false);
  assert.equal(shouldEnhance({tagName:'AUDIO'}),false);
});
test('integration keeps assets after existing player logic', () => {
  const index = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(index, /href="\.\/unified-player\.css"/);
  assert.match(index, /src="\.\/unified-player\.js"/);
  assert.ok(index.lastIndexOf('unified-player.js') > index.indexOf('app-improvements.js'));
});
