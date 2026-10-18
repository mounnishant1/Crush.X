// node --test tests/aura-x-core.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../aura-x-core.js');

test('reel analysis keeps live metrics unknown', () => {
  const r = core.reelAnalysis({caption: 'Nice evening', likes: 4, comments: [], shares: 2});
  assert.equal(r.kind, 'reel');
  assert.ok(!r.metrics.some(x => x.startsWith('Views:')));
  assert.match(r.limitations, /No video frames/);
});
test('only provided views permit ratio calculation', () => {
  const r = core.reelAnalysis({caption: 'See this #view', likes: 4, comments: [], shares: 2},
    {views: 100, saves: 0});
  assert.ok(r.metrics.some(x => x.includes('6.0%')));
});
test('credential phishing is flagged and never echoed in a draft', () => {
  const r = core.messageAssistance('Urgent, send me your OTP and bank account', '', '');
  assert.ok(r.risk.length >= 2);
  assert.match(r.suggestion, /cannot share account codes/);
});
test('draft cannot pretend to have sent messages', () => {
  const r = core.messageAssistance('', 'Please call me tomorrow', 'polish');
  assert.equal(r.suggestion, 'Please call me tomorrow.');
  assert.match(r.limitations, /No message was sent/);
});
test('Hindi instruction returns neutral Hindi response', () => {
  const r = core.messageAssistance('कल आना?', '', 'reply in Hindi');
  assert.match(r.suggestion, /[\u0900-\u097f]/);
});
