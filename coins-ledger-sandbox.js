/* Crush.X LIVE coins sandbox. DEMO ONLY: no INR, payments, payouts, bank or server settlement.
 * This is an in-memory accounting model, not an authoritative financial ledger.
 * Production must move issuance, balances and transfers to authenticated server transactions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrushXCoinSandbox = Object.freeze(api);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const MAX_BALANCE = 10000, MAX_GIFT = 100, MAX_DAILY = 500;
  const ID = /^[A-Za-z][A-Za-z0-9_-]{1,63}$/;
  const SYSTEM = 'demo:issuer';
  const VIEWER = 'demo:viewer';
  function positiveInteger(value, name, limit) {
    if (!Number.isSafeInteger(value) || value < 1 || value > limit)
      throw new TypeError(name + ' must be a positive safe integer within the sandbox limit');
    return value;
  }
  function validateId(value, label) {
    if (typeof value !== 'string' || !ID.test(value)) throw new TypeError('Invalid ' + label);
    return value;
  }
  function createLedger(options = {}) {
    const issuedCoins = options.initialCoins === undefined ? 120 : options.initialCoins;
    if (!Number.isSafeInteger(issuedCoins) || issuedCoins < 0 || issuedCoins > MAX_BALANCE)
      throw new TypeError('Invalid demo grant');
    const clock = options.now || Date.now;
    if (typeof clock !== 'function') throw new TypeError('Invalid clock');
    const transactions = [];
    const idempotency = new Map();
    const balances = new Map([[VIEWER, 0], [SYSTEM, 0]]);
    const spentPerDay = new Map();
    let sequence = 0;
    function write(kind, requestId, postings, extra = {}) {
      if (postings.length !== 2 || postings[0].delta + postings[1].delta !== 0)
        throw new Error('Unbalanced double-entry transaction');
      for (const posting of postings) {
        if (!Number.isSafeInteger(posting.delta) || !Number.isSafeInteger(balances.get(posting.account) || 0))
          throw new Error('Invalid posting');
        const next = (balances.get(posting.account) || 0) + posting.delta;
        if (!Number.isSafeInteger(next) || (posting.account !== SYSTEM && (next < 0 || next > MAX_BALANCE)))
          throw new Error('Negative or excessive sandbox balance');
      }
      const at = new Date(clock()).toISOString();
      const transaction = Object.freeze({
        seq: ++sequence, type: kind, requestId, at,
        postings: Object.freeze(postings.map(p => Object.freeze({account:p.account,delta:p.delta}))),
        ...extra
      });
      for (const posting of postings) balances.set(posting.account, (balances.get(posting.account) || 0) + posting.delta);
      transactions.push(transaction);
      return transaction;
    }
    if (issuedCoins) write('DEMO_ISSUANCE', 'demo-initial', [
      {account:SYSTEM,delta:-issuedCoins},{account:VIEWER,delta:issuedCoins}
    ]);
    function balance(account = VIEWER) {
      if (typeof account !== 'string') throw new TypeError('Invalid account');
      return balances.get(account) || 0;
    }
    function history() {
      return transactions.slice(); // Read-only frozen records, detached array.
    }
    function gift(request) {
      if (!request || typeof request !== 'object') throw new TypeError('Invalid gift request');
      const requestId = validateId(request.requestId, 'request ID');
      const creatorId = validateId(request.creatorId, 'creator');
      const coins = positiveInteger(request.coins, 'coins', MAX_GIFT);
      const existing = idempotency.get(requestId);
      if (existing) {
        if (existing.creatorId !== creatorId || existing.coins !== coins)
          throw new Error('Request ID reused with a different gift');
        return existing.transaction;
      }
      if (creatorId === 'viewer') throw new Error('Cannot gift yourself');
      if (balance(VIEWER) < coins) throw new Error('Insufficient demo coins');
      const day = new Date(clock()).toISOString().slice(0,10);
      const already = spentPerDay.get(day) || 0;
      if (already + coins > MAX_DAILY) throw new Error('Daily demo gifting limit reached');
      const creatorAccount = 'demo:creator:' + creatorId + ':pending';
      const transaction = write('DEMO_GIFT', requestId, [
        {account:VIEWER,delta:-coins},{account:creatorAccount,delta:coins}
      ],{creatorId,coins,redeemable:false,paid:false});
      idempotency.set(requestId, {creatorId,coins,transaction});
      spentPerDay.set(day,already+coins);
      return transaction;
    }
    function audit() {
      const replay = new Map();
      for (const transaction of transactions) {
        if (transaction.postings.reduce((sum,p) => sum + p.delta,0) !== 0)
          return Object.freeze({ok:false,reason:'Unbalanced posting'});
        for (const p of transaction.postings) replay.set(p.account,(replay.get(p.account)||0)+p.delta);
      }
      for (const [account,amount] of balances) if ((replay.get(account)||0) !== amount)
        return Object.freeze({ok:false,reason:'Balance mismatch'});
      const net = [...balances.values()].reduce((sum,v) => sum + v,0);
      return Object.freeze({ok:net===0,net,transactions:transactions.length,issuedDemoCoins:issuedCoins});
    }
    return Object.freeze({gift,balance,history,audit,initialDemoCoins:issuedCoins,
      maxGift:MAX_GIFT,maxDaily:MAX_DAILY,mode:'sandbox-no-money'});
  }
  // Direct INR gifts must NEVER become a client-side balance change or an assumed payment.
  function directInrStatus(amountPaise) {
    positiveInteger(amountPaise,'INR paise',100000);
    return Object.freeze({
      currency:'INR',amountPaise,status:'NOT_CONNECTED',
      charged:false,credited:false,
      message:'Direct INR gifting requires an authenticated server order, verified provider payment and settlement. No payment started.'
    });
  }
  return Object.freeze({createLedger,directInrStatus});
});
