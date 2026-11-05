'use strict';
/**
 * Server-side, dependency-injected Crush.X message push outbox adapter.
 * Use only from a trusted worker after the message has been committed.
 * No Firebase keys, HTTP auth endpoints, or sample-user identity assumptions.
 */
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_:\-]{32,4096}$/;
function identifier(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
function createMessagePush({messageStore, deviceStore, preferences, outbox, messenger, logger = { warn() {} }}) {
  if (![messageStore, deviceStore, preferences, outbox, messenger].every(Boolean)) {
    throw new TypeError('Missing message push dependency');
  }
  async function registerDevice({authenticatedUserId, installationId, token}) {
    const userId = identifier(authenticatedUserId, 'authenticatedUserId');
    const deviceId = identifier(installationId, 'installationId');
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new TypeError('Invalid FCM token');
    // The request handler supplies authenticatedUserId from the verified session,
    // never from a request body. Upsert atomically transfers/revokes old ownership.
    await deviceStore.upsert({userId, installationId:deviceId, token, platform:'android'});
    return {registered:true};
  }
  async function unregisterDevice({authenticatedUserId, installationId}) {
    await deviceStore.revoke({userId:identifier(authenticatedUserId, 'authenticatedUserId'),
      installationId:identifier(installationId, 'installationId')});
    return {revoked:true};
  }
  async function sendCommittedMessage({eventId}) {
    const id = identifier(eventId, 'eventId');
    const event = await messageStore.getCommittedEvent(id);
    if (!event || event.id !== id || event.kind !== 'message' || event.deleted || event.recalled) {
      return {status:'not-deliverable', sent:0};
    }
    const recipientId = identifier(event.recipientId, 'stored recipient');
    const conversationId = identifier(event.conversationId, 'stored conversation');
    // Membership and privacy checks are enforced on the server at delivery time.
    if (!(await messageStore.canReceive({recipientId, conversationId, senderId:event.senderId}))) {
      return {status:'not-authorized', sent:0};
    }
    const prefs = await preferences.getForRecipient(recipientId);
    if (prefs?.messages === false || prefs?.mutedConversations?.includes(conversationId) ||
        prefs?.blockedSenders?.includes(event.senderId)) return {status:'muted', sent:0};
    const devices = await deviceStore.listActiveForUser(recipientId);
    let sent = 0, skipped = 0, failed = 0;
    for (const device of devices) {
      if (device.userId !== recipientId || device.platform !== 'android' ||
          !ID.test(device.installationId || '') || !TOKEN.test(device.token || '')) { skipped++; continue; }
      // tryClaim must be atomic with a bounded lease; distinct (eventId, installationId)
      // keys prevent duplicate notifications when the queue retries or workers race.
      const key = {eventId:id, installationId:device.installationId};
      if (!(await outbox.tryClaim(key))) { skipped++; continue; }
      try {
        await messenger.send({
          token:device.token,
          data:{kind:'message', eventId:id, recipientId, conversationId},
          android:{priority:'high', ttl:60000}
        });
        await outbox.markSent(key);
        sent++;
      } catch (error) {
        if (error?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/invalid-registration-token') {
          await deviceStore.revoke({userId:recipientId, installationId:device.installationId});
          await outbox.markSent(key); // do not retry permanently invalid device
        } else {
          await outbox.release(key); // transient failure may retry
          failed++;
          logger.warn('Message push delivery failure', {eventId:id, code:error?.code || 'unknown'});
        }
      }
    }
    return {status:failed ? 'retryable' : 'processed', sent, skipped, failed};
  }
  return Object.freeze({registerDevice, unregisterDevice, sendCommittedMessage});
}
module.exports = {createMessagePush};
