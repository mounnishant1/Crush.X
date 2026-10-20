/* Run: node --test tests/music-library.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const { tracks, findTracks } = require('../music-library.js');

test('test catalog contains unique official recordings and real attribution', () => {
  assert.equal(tracks.length, 12);
  assert.equal(new Set(tracks.map(t => t.id)).size, tracks.length);
  for (const t of tracks) {
    assert.match(t.id, /^USUAN\d{7}$/);
    assert.equal(t.artist, 'Kevin MacLeod');
    assert.equal(t.license, 'CC BY 4.0');
    assert.equal(t.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
    assert.ok(t.attribution.includes(t.title));
    assert.ok(t.attribution.includes(t.artist));
    assert.ok(t.attribution.includes(t.licenseUrl));
    assert.equal(new URL(t.sourceUrl).hostname, 'incompetech.com');
    assert.equal(new URL(t.audioUrl).hostname, 'incompetech.com');
    assert.ok(t.durationSeconds > 0);
  }
});
test('search is case-insensitive and matches title genre and mood', () => {
  assert.deepEqual(findTracks('sneaky snitch').map(t => t.title), ['Sneaky Snitch']);
  assert.ok(findTracks('KEVIN MACLEOD').length >= 10);
  assert.ok(findTracks('grooving').length >= 1);
  assert.ok(findTracks('zzzz-no-match').length === 0);
});
test('genre and favorites filters compose correctly', () => {
  assert.ok(findTracks('', 'Chill').every(t => t.genre === 'Chill'));
  assert.deepEqual(findTracks('', 'Chill', true, [tracks[0].id]).map(t => t.id), [tracks[0].id]);
  assert.deepEqual(findTracks('Sneaky','Chill').map(t => t.id), []);
  assert.deepEqual(findTracks('Sneaky','Funny',true,[]).map(t => t.id), []);
});
test('track objects are immutable to prevent accidental client metadata corruption', () => {
  assert.ok(Object.isFrozen(tracks));
  for (const t of tracks) assert.ok(Object.isFrozen(t));
});
