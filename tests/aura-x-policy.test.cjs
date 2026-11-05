const test = require('node:test');
const assert = require('node:assert/strict');
const {createSession,SCOPES} = require('../aura-x-policy.js');

test('Permissions default deny and require explicit scoped approval',()=>{
  const session=createSession();
  assert.equal(session.authorized('me','analyse:reel'),false);
  assert.equal(session.consent({ownerId:'me',scopes:['analyse:reel'],approved:false}).ok,false);
  assert.equal(session.authorized('me','analyse:reel'),false);
  assert.equal(session.consent({ownerId:'me',scopes:['send:message'],approved:true}).ok,false);
  assert.equal(session.consent({ownerId:'me',scopes:['analyse:reel'],approved:true,ttlMs:0}).ok,false);
  assert.equal(session.consent({ownerId:'me',scopes:['analyse:reel'],approved:true}).ok,true);
  assert.equal(session.authorized('me','analyse:reel'),true);
  assert.equal(session.authorized('me','draft:message'),false);
  assert.equal(session.authorized('me','apply:local-draft'),false);
  assert.equal(session.authorized('anotherUser','analyse:reel'),false);
  assert.equal(session.status('me').remoteEnabled,false);
  assert.equal(session.status('me').autopilotEnabled,false);
});
test('Permissions expire, revoke, and never survive an owner change',()=>{
  let clock=1000;
  const s=createSession({now:()=>clock});
  s.consent({ownerId:'me',scopes:['draft:message','apply:local-draft'],approved:true,ttlMs:60_000});
  clock+=59_999;
  assert.equal(s.authorized('me','draft:message'),true);
  clock+=1;
  assert.equal(s.authorized('me','draft:message'),false);
  assert.equal(s.authorized('me','apply:local-draft'),false);
  s.consent({ownerId:'me',scopes:['draft:message','apply:local-draft'],approved:true});
  assert.equal(s.revoke('apply:local-draft'),true);
  assert.equal(s.authorized('me','apply:local-draft'),false);
  assert.equal(s.authorized('me','draft:message'),true);
  s.bindOwner('owner2');
  assert.equal(s.authorized('me','draft:message'),false);
  assert.equal(s.status('owner2').permissions.length,0);
});
test('Memory cannot be written or read without grant; never stored across owner/logout',()=>{
  const s=createSession();
  assert.equal(s.writeNote('me','I like short replies').ok,false);
  assert.equal(s.note('me').ok,false);
  s.consent({ownerId:'me',scopes:['memory:read','memory:write'],approved:true});
  assert.equal(s.writeNote('me','I prefer concise Hindi replies').ok,true);
  assert.equal(s.note('me').text,'I prefer concise Hindi replies');
  assert.equal(s.note('user2').ok,false);
  assert.equal(s.writeNote('me','OTP 123456').ok,false);
  assert.equal(s.writeNote('me','bank account 9876543').ok,false);
  assert.equal(s.writeNote('me','x'.repeat(501)).ok,false);
  assert.equal(s.note('me').text,'I prefer concise Hindi replies');
  s.revoke('memory:read');
  assert.equal(s.note('me').ok,false);
  assert.equal(s.deleteNote('me'),true,'User can delete note even without memory-read permission');
  assert.equal(s.status('me').memoryPresent,false);
  s.clear();
  assert.equal(s.status('me').bound,false);
  assert.equal(s.note('me').ok,false);
});
test('Classifier fails closed for network, money, remote and unattended work',()=>{
  const s=createSession();
  for(const type of ['send:message','publish:reel','make:call','charge:inr','buy:coins','read:inbox','model:train','agent:autopilot','']) {
    assert.equal(s.classify({type}).decision,'DENY',type);
  }
  assert.equal(s.classify({type:'draft:message'}).decision,'LOCAL_ONLY');
  assert.equal(SCOPES.includes('publish:reel'),false);
  assert.equal(s.classify({type:'draft:message'}).decision,'LOCAL_ONLY');
});
