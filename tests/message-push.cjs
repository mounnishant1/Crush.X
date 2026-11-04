'use strict';
const assert = require('node:assert/strict');
const {createMessagePush} = require('../push/server/message-push.cjs');
(async () => {
  const registrations = new Map(), calls = [], receipts = new Map();
  const events = { e1:{id:'e1',kind:'message',recipientId:'u1',senderId:'u2',conversationId:'c1'}, e2:{id:'e2',kind:'message',recipientId:'u1',senderId:'u2',conversationId:'c2'}, e3:{id:'e3',kind:'message',recipientId:'u1',senderId:'u2',conversationId:'c1',deleted:true} };
  const prefs = {messages:true,mutedConversations:[],blockedSenders:[]};
  let authorized = true;
  const service = createMessagePush({
    messageStore:{getCommittedEvent:async id=>events[id],canReceive:async()=>authorized},
    deviceStore:{
      upsert:async v=>registrations.set(v.installationId,v),
      revoke:async v=>{if(registrations.get(v.installationId)?.userId===v.userId) registrations.delete(v.installationId);},
      listActiveForUser:async id=>[...registrations.values()].filter(v=>v.userId===id)
    }, preferences:{getForRecipient:async()=>prefs},
    outbox:{tryClaim:async v=>{const k=v.eventId+':'+v.installationId; if(receipts.has(k))return false; receipts.set(k,'leased');return true;},
      markSent:async v=>receipts.set(v.eventId+':'+v.installationId,'sent'),
      release:async v=>receipts.delete(v.eventId+':'+v.installationId)},
    messenger:{send:async m=>{calls.push(m);}},logger:{warn:()=>{}}
  });
  const token='A'.repeat(64);
  await assert.rejects(service.registerDevice({authenticatedUserId:'u1',installationId:'dev1',token:'too-short'}));
  await service.registerDevice({authenticatedUserId:'u1',installationId:'dev1',token});
  assert.equal((await service.sendCommittedMessage({eventId:'e1'})).sent,1);
  assert.deepEqual(Object.keys(calls[0].data).sort(),['conversationId','eventId','kind','recipientId']);
  assert.equal(calls[0].android.priority,'high');
  assert.equal('notification' in calls[0],false,'no private message preview in FCM');
  assert.equal((await service.sendCommittedMessage({eventId:'e1'})).sent,0,'duplicate push suppressed');
  prefs.mutedConversations=['c2'];
  assert.equal((await service.sendCommittedMessage({eventId:'e2'})).status,'muted');
  prefs.mutedConversations=[];
  authorized=false;
  assert.equal((await service.sendCommittedMessage({eventId:'e2'})).status,'not-authorized');
  authorized=true;
  assert.equal((await service.sendCommittedMessage({eventId:'e3'})).status,'not-deliverable');
  await service.unregisterDevice({authenticatedUserId:'u1',installationId:'dev1'});
  assert.equal(registrations.size,0);
  console.log('PASS: register/revoke, committed-only, auth/mute, per-device dedupe, data-only privacy, notification priority');
})().catch(e=>{console.error(e);process.exitCode=1;});
