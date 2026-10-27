/* Crush.X Live Studio + wallet preview. Browser session demo; NO streaming, billing or payouts. */
(() => {
  'use strict';
  const ledgerAPI = window.CrushXCoinSandbox;
  if (!ledgerAPI || typeof renderProfile !== 'function' || typeof bindRepairEvents !== 'function') return;
  let dialog = null, ledger = null, chosenCreator = '', counter = 0, message = '';
  const priorProfile = renderProfile, priorBind = bindRepairEvents, priorLogout = logout;
  function getLedger() { return ledger || (ledger = ledgerAPI.createLedger()); }
  function creators() {
    const state = getState();
    return state.users.filter(user => user.id !== state.currentUserId && /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(user.id));
  }
  function close() { if (dialog?.open) dialog.close(); }
  function render() {
    if (!dialog) return;
    const l = getLedger(), people = creators();
    if (!people.some(c => c.id === chosenCreator)) chosenCreator = people[0]?.id || '';
    const creator = people.find(user => user.id === chosenCreator);
    const history = l.history().filter(e => e.type === 'DEMO_GIFT').slice(-8).reverse();
    dialog.innerHTML = '<section class="cx-live-screen">' +
      '<header class="cx-live-top"><button data-cx-live-close type="button" aria-label="Close Live Studio">← Back</button><h1>Crush.X Live Studio</h1><span class="cx-live-demo">SANDBOX</span></header>' +
      '<p class="cx-live-notice">Preview only: no live video, no audience, no actual coins, payments or payouts. All demo balances disappear on logout or page reload.</p>' +
      '<section class="cx-live-feature" aria-label="Broadcast status"><h2>Broadcast</h2><div class="cx-live-preview"><span aria-hidden="true">◉</span><strong>Camera broadcast not connected</strong><small>Real broadcast requires streaming credentials, ingest service, moderation and mobile testing.</small></div>' +
      '<button type="button" disabled aria-label="Start broadcast unavailable">Start Live — unavailable</button></section>' +
      '<section class="cx-live-wallet" aria-label="Demo coin wallet"><h2>Coins Wallet — test mode</h2><p><strong data-cx-demo-balance>' + l.balance() + '</strong> demo coins · not purchased, not redeemable</p>' +
      '<small>Double-entry accounting demonstration, not your payment balance. Virtual test issuance: ' + l.initialDemoCoins + ' coins.</small></section>' +
      '<section class="cx-live-gift" aria-label="Simulate a coin gift"><h2>Sample coin gift</h2><p>Choose a sample creator:</p><div class="cx-live-creators">' +
        people.map(user => '<button type="button" data-cx-live-creator="' + escapeHTML(user.id) + '" aria-pressed="' + (user.id === chosenCreator) + '">@' + escapeHTML(user.username) + '</button>').join('') +
      '</div><p>Gift size, demo coins:</p><div class="cx-live-amounts">' +
        [5,10,25,50,100].map(coins => '<button type="button" data-cx-live-gift="' + coins + '" ' + (!creator || l.balance() < coins ? 'disabled' : '') + '>' + coins + ' coins</button>').join('') +
      '</div><p class="cx-live-notice">Only a simulated gift is recorded. No real user receives a gift or balance.</p></section>' +
      '<section class="cx-live-inr" aria-label="INR gifting integration status"><h2>Direct INR gifting</h2><p>Provider integration: <strong>Not connected</strong>. No checkout, UPI request, payment capture or payout can start here.</p>' +
      '<button type="button" data-cx-live-inr>Check ₹10 gift availability</button><small>Do not trust payment status or wallet credits from browser code.</small></section>' +
      '<section class="cx-live-ledger" aria-label="Demo ledger"><h2>Demo gift ledger</h2><div data-cx-live-ledger>' +
        (history.length ? history.map(tx => '<p>' + escapeHTML(tx.requestId) + ' · ' + tx.coins + ' demo coins to @' + escapeHTML(people.find(u => u.id === tx.creatorId)?.username || 'sample creator') + ' · no payout</p>').join('') : '<p>No simulated gifts yet.</p>') +
      '</div><small>Every gift debits the demo viewer account and credits the creator’s pending demo account.</small></section>' +
      '<p data-cx-live-status role="status" aria-live="polite">' + escapeHTML(message || 'Ready for a local simulation. Nothing will be charged.') + '</p>' +
      '</section>';
  }
  function open() {
    if (dialog) return;
    getLedger();
    const opener = document.activeElement;
    dialog = document.createElement('dialog');
    dialog.className = 'cx-live-dialog';
    dialog.setAttribute('aria-label','Live Studio sandbox');
    dialog.addEventListener('click', event => {
      const button = event.target.closest?.('button');
      if (!button) return;
      if (button.hasAttribute('data-cx-live-close')) { close(); return; }
      const selected = button.dataset.cxLiveCreator;
      if (selected) {
        if (!creators().some(u => u.id === selected)) return;
        chosenCreator = selected; message = ''; render(); return;
      }
      if (button.hasAttribute('data-cx-live-inr')) {
        const result = ledgerAPI.directInrStatus(1000);
        message = 'INR: ' + result.message;
        render(); return;
      }
      if (!button.hasAttribute('data-cx-live-gift')) return;
      const amount = Number(button.dataset.cxLiveGift);
      const person = creators().find(u => u.id === chosenCreator);
      if (!person) return;
      try {
        const receipt = getLedger().gift({requestId:'demoGift_'+(++counter),creatorId:person.id,coins:amount});
        const check = getLedger().audit();
        if (!check.ok) throw Error('Sandbox ledger audit failed');
        message = receipt.coins + ' demo coins transferred for preview only. No payment or payout.';
      } catch (error) {
        message = 'Simulated gift rejected: ' + (error?.message || 'unknown error');
      }
      render();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => {
      dialog.remove(); dialog = null; if (opener?.isConnected) opener.focus();
    });
    document.body.append(dialog);
    render();
    dialog.showModal();
  }
  renderProfile = function(state) {
    const markup = priorProfile(state);
    if (typeof appProfileUserId !== 'undefined' && appProfileUserId) return markup;
    return markup.replace('</main>', '<div class="cx-live-entry"><button type="button" data-cx-open-live>Live Studio & Demo Wallet</button><p>Live broadcasts and INR gifting are not connected.</p></div></main>');
  };
  bindRepairEvents = function() {
    priorBind();
    document.querySelectorAll('[data-cx-open-live]').forEach(button => button.addEventListener('click', open));
  };
  logout = function() {
    close();
    if (dialog) { dialog.remove(); dialog = null; }
    ledger = null; chosenCreator = ''; counter = 0; message = '';
    priorLogout();
  };
  document.addEventListener('crushx:session-ended', () => {
    close(); if (dialog) { dialog.remove(); dialog = null; }
    ledger = null; chosenCreator = ''; counter = 0; message = '';
  });
  window.CrushXLivePreview = Object.freeze({
    open, close,
    status: () => Object.freeze({mode:'DEMO_ONLY',broadcast:false,realPayments:false,payouts:false,
      demoBalance:ledger?.balance() ?? null, demoAudit:ledger?.audit() ?? null})
  });
})();
