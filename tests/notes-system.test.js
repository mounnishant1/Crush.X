const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clean, publish, active, sanitizeFriends, LIFETIME_MS } = require('../notes-model.js');

test('creates a text, music, or animated sticker note with exactly 24 hours', () => {
  const now=Date.UTC(2026,9,18,16,0,0);
  for(const draft of [{text:'Hello friends'},{song:'soft-glow'},{sticker:'heart'}]){
    const note=publish(draft,now);
    assert.ok(note);
    assert.equal(note.expiresAt-now,LIFETIME_MS);
    assert.deepEqual(active(note,now+LIFETIME_MS-1),note);
    assert.equal(active(note,now+LIFETIME_MS),null);
  }
});

test('empty and attachment-only location notes cannot be shared', () => {
  assert.equal(publish({}),null);
  assert.equal(publish({text:'   ',location:'New Delhi'}),null);
  assert.equal(publish({song:'not-licensed'}),null);
});

test('user-controlled values are bounded and normalized', () => {
  const draft=clean({
    text:'A'.repeat(100), audience:'everyone', color:'script', tag:'<img>',
    song:'unverified-audio', sticker:'unknown', location:'X'.repeat(500)
  });
  assert.equal(draft.text.length,60);
  assert.equal(draft.location.length,70);
  assert.equal(draft.tag,'');
  assert.equal(draft.audience,'friends');
  assert.equal(draft.color,'pink');
  assert.equal(draft.song,'');
  assert.equal(draft.sticker,'');
});

test('rejects forged and expired timestamps', () => {
  const now=1000000000000;
  const note=publish({text:'yes'},now);
  assert.equal(active({...note,expiresAt:Infinity},now+1),null);
  assert.equal(active({...note,expiresAt:now+30000},now+1),null);
  assert.equal(active({...note,createdAt:now+2000},now),null);
  assert.equal(active(note,now-1),null);
  assert.equal(active(note,now+LIFETIME_MS),null);
});

test('close friend IDs are unique, valid, and bounded to available users', () => {
  assert.deepEqual(sanitizeFriends(['user_1','me','user_1','ghost','user_2'],['me','user_1','user_2']),['user_1','user_2']);
  assert.deepEqual(sanitizeFriends('not array',['user_1']),[]);
});
