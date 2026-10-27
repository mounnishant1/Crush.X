const assert = require('node:assert/strict');
const test = require('node:test');
const {createLedger,directInrStatus} = require('../coins-ledger-sandbox.js');

test('Demo issuance and balanced double-entry gift with independent pending creator account', () => {
  const ledger=createLedger({initialCoins:120,now:()=>Date.UTC(2026,9,27)});
  assert.equal(ledger.mode,'sandbox-no-money');
  assert.equal(ledger.balance(),120);
  assert.equal(ledger.balance('demo:issuer'),-120);
  const receipt=ledger.gift({requestId:'gift_0001',creatorId:'creator_1',coins:25});
  assert.equal(ledger.balance(),95);
  assert.equal(ledger.balance('demo:creator:creator_1:pending'),25);
  assert.equal(receipt.postings.reduce((sum,p)=>sum+p.delta,0),0);
  assert.equal(receipt.paid,false); assert.equal(receipt.redeemable,false);
  assert.deepEqual(ledger.audit(),{ok:true,net:0,transactions:2,issuedDemoCoins:120});
  assert.equal(Object.isFrozen(receipt),true);
  assert.equal(Object.isFrozen(receipt.postings[0]),true);
  ledger.history().pop();
  assert.equal(ledger.history().length,2,'History array mutation cannot touch ledger');
});

test('Idempotent gifts never double-spend and changed replay payload is rejected', () => {
  const ledger=createLedger();
  const request={requestId:'gift_repeat',creatorId:'alice',coins:10};
  const first=ledger.gift(request),balance=ledger.balance();
  const replay=ledger.gift({...request});
  assert.equal(replay,first);
  assert.equal(ledger.balance(),balance);
  assert.equal(ledger.history().length,2);
  assert.throws(()=>ledger.gift({...request,coins:50}),/different gift/);
  assert.throws(()=>ledger.gift({...request,creatorId:'other'}),/different gift/);
  assert.equal(ledger.balance(),balance);
});

test('Input validation, insufficiency and per-UTC-day limit fail without accounting side effects', () => {
  let time=Date.UTC(2026,9,27,5);
  const ledger=createLedger({initialCoins:10000,now:()=>time});
  const invalid=[
    {requestId:'bad$id',creatorId:'a',coins:5},
    {requestId:'validid',creatorId:'__proto__',coins:5},
    {requestId:'validid',creatorId:'viewer',coins:5},
    {requestId:'validid',creatorId:'alice',coins:0},
    {requestId:'validid',creatorId:'alice',coins:-1},
    {requestId:'validid',creatorId:'alice',coins:1.2},
    {requestId:'validid',creatorId:'alice',coins:101},
    {requestId:'validid',creatorId:'alice',coins:NaN}
  ];
  const original=ledger.audit().transactions;
  for(const gift of invalid) assert.throws(()=>ledger.gift(gift));
  assert.equal(ledger.audit().transactions,original);
  for(let i=0;i<5;i++) ledger.gift({requestId:'dailyGift_'+i,creatorId:'alice',coins:100});
  assert.throws(()=>ledger.gift({requestId:'dailyExtra',creatorId:'alice',coins:1}),/Daily/);
  assert.equal(ledger.balance(),9500);
  time += 86400000;
  ledger.gift({requestId:'nextDay',creatorId:'alice',coins:100});
  assert.equal(ledger.balance(),9400);
  assert.equal(ledger.audit().ok,true);
  const empty=createLedger({initialCoins:0});
  assert.throws(()=>empty.gift({requestId:'noFunds',creatorId:'alice',coins:1}),/Insufficient/);
});

test('Sandbox cannot execute payment capture, INR credit, payout or withdrawal', () => {
  const state=directInrStatus(1000);
  assert.deepEqual(state,{
    currency:'INR',amountPaise:1000,status:'NOT_CONNECTED',charged:false,credited:false,
    message:'Direct INR gifting requires an authenticated server order, verified provider payment and settlement. No payment started.'
  });
  assert.equal(Object.isFrozen(state),true);
  for(const value of [0,-100,12.50,NaN,Infinity,'1000',100001])
    assert.throws(()=>directInrStatus(value));
  const ledger=createLedger({initialCoins:100});
  assert.equal('charge' in ledger,false); assert.equal('withdraw' in ledger,false);
  assert.equal('topUp' in ledger,false); assert.equal('payout' in ledger,false);
  assert.equal('grant' in ledger,false);
  assert.equal(ledger.audit().ok,true);
});

test('Balances of creator pending accounts cannot be redeemed or impersonate real payments', () => {
  const ledger=createLedger({initialCoins:20});
  assert.throws(()=>ledger.gift({requestId:'selfGift',creatorId:'viewer',coins:5}),/yourself/);
  ledger.gift({requestId:'legitGift',creatorId:'creatorX',coins:20});
  assert.equal(ledger.balance(),0);
  assert.equal(ledger.balance('demo:creator:creatorX:pending'),20);
  assert.throws(()=>ledger.gift({requestId:'insufficient',creatorId:'creatorX',coins:1}),/Insufficient/);
  assert.equal(ledger.audit().ok,true);
});
