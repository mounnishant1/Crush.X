/* One AURA-X surface for Reels and Messages.
 * Works on local sample data only. Never auto-sends or reads external inboxes.
 */
(function(root) {
  'use strict';
  if (typeof bindRepairEvents !== 'function' || !root.CrushXAuraCore) return;
  let activeDialog = null;
  const core = root.CrushXAuraCore;
  const button = (label, title) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cx-aura-trigger rounded-xl border border-fuchsia-400/50 px-3 py-2 text-sm font-bold';
    el.setAttribute('aria-label', title || label);
    el.textContent = label;
    return el;
  };
  function openAgent(context) {
    const mode = context && context.mode === 'reel' ? 'reel' : 'message';
    const id = context && typeof context.id === 'string' ? context.id : '';
    if (activeDialog && activeDialog.open) activeDialog.close();
    const state = getState();
    const reel = mode === 'reel' ? state.reels.find(r => r.id === id) : null;
    const user = mode === 'message' ? userById(state, id || state.chatUserId) : null;
    const validMessage = mode === 'message' && !!user && user.id !== state.currentUserId;
    const hasContext = mode === 'reel' ? !!reel : validMessage;
    const status = mode === 'reel' ? (reel ? 'Selected sample reel' : 'No reel selected')
      : (validMessage ? 'Local draft for @' + user.username : 'Select a message draft');
    const body = `
      <p class="text-xs text-slate-500 mb-3">Local rule-based assistance · not connected to live AURA-X model, live analytics or inbox.</p>
      <p data-ax-context class="text-sm font-semibold mb-3"></p>
      ${mode === 'message' ? '<label class="block text-sm font-semibold" for="axIncoming">Incoming text (optional; paste it yourself)</label><textarea id="axIncoming" rows="3" maxlength="4000" class="w-full rounded-xl border p-3 mb-3 bg-transparent" placeholder="No live messages are read automatically"></textarea>' : ''}
      <form data-ax-form>
        <label for="axPrompt" class="block text-sm font-semibold">Ask AURA-X</label>
        <input id="axPrompt" maxlength="300" class="w-full rounded-xl border p-3 bg-transparent mt-1" placeholder="${mode === 'reel' ? 'Analyse hook, caption, and improvements' : 'Suggest a safe reply, polish, or check risk'}" />
        <button class="mt-3 rounded-xl gradient-main px-4 py-3 font-bold text-white" type="submit" ${hasContext ? '' : 'disabled'}>Analyse</button>
      </form>
      <section aria-live="polite" class="mt-4">
        <strong data-ax-title class="block"></strong>
        <pre data-ax-output class="whitespace-pre-wrap break-words text-sm mt-2 font-sans"></pre>
        ${mode === 'message' ? '<button type="button" data-ax-apply disabled class="rounded-xl border px-4 py-2 mt-3 font-semibold">Use as local draft</button>' : ''}
      </section>
      <p class="mt-4 text-xs text-slate-500">No background monitoring, autonomous replies, or publishing. Review every suggestion yourself.</p>`;
    let suggestion = '';
    // appDialog is the existing modal with escape-safe title and close management.
    appDialog('AURA-X', body, dialog => {
      activeDialog = dialog;
      dialog.addEventListener('close', () => { if (activeDialog === dialog) activeDialog = null; });
      dialog.querySelector('[data-ax-context]').textContent = status;
      const output = dialog.querySelector('[data-ax-output]');
      const outputTitle = dialog.querySelector('[data-ax-title]');
      const action = dialog.querySelector('[data-ax-apply]');
      const form = dialog.querySelector('[data-ax-form]');
      form.addEventListener('submit', event => {
        event.preventDefault();
        suggestion = '';
        if (action) action.disabled = true;
        if (!hasContext) return;
        const prompt = dialog.querySelector('#axPrompt').value;
        if (mode === 'reel') {
          const fresh = getState().reels.find(r => r.id === id);
          if (!fresh) { output.textContent = 'This reel is no longer available.'; return; }
          const report = core.reelAnalysis(fresh);
          outputTitle.textContent = report.title;
          output.textContent = [
            'Available sample counts:', ...report.metrics,
            '', 'Content observations:', ...report.observations,
            '', 'Suggestions:', ...report.actions, '', report.limitations
          ].join('\n');
        } else {
          const incoming = dialog.querySelector('#axIncoming').value;
          // Read current draft only after the user taps Analyse; never scrape inbox content.
          const saved = getState().messageDrafts?.[id] || '';
          const report = core.messageAssistance(incoming, saved, prompt);
          outputTitle.textContent = report.title;
          suggestion = report.suggestion;
          output.textContent = [
            ...report.observations,
            ...(suggestion ? ['', 'Suggested draft:', suggestion] : []),
            '', report.limitations
          ].join('\n');
          if (action) action.disabled = !suggestion;
        }
      });
      if (action) action.addEventListener('click', () => {
        if (!suggestion || !validMessage) return;
        const current = getState();
        if (current.chatUserId !== id || !userById(current,id)) {
          output.textContent = 'Open the matching conversation draft before applying.';
          return;
        }
        // Re-use existing draft input handler and local storage normalization.
        const input = document.getElementById('messageDraft');
        if (!input) {
          output.textContent = 'Draft editor is unavailable. No message was sent.';
          return;
        }
        input.value = suggestion.slice(0, 4000);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        dialog.close();
        input.focus();
      });
    });
  }
  function attachButtons() {
    // Rendered views are rebuilt frequently; buttons have no global event delegation leaks.
    document.querySelectorAll('.reel-slide[data-reel-slide]').forEach(slide => {
      const target = slide.querySelector('.reel-extra') || slide.querySelector('.reel-details');
      if (!target || target.querySelector('[data-ax-reel]')) return;
      const id = slide.getAttribute('data-reel-slide');
      const el = button('✦ AURA-X', 'Analyze this reel with AURA-X');
      el.dataset.axReel = id;
      el.addEventListener('click', () => openAgent({mode:'reel', id}));
      target.append(el);
    });
    const input = document.getElementById('messageDraft');
    if (input && !document.querySelector('[data-ax-message]')) {
      const el = button('✦ Draft with AURA-X', 'Open AURA-X message draft assistant');
      el.dataset.axMessage = '1';
      el.classList.add('mt-3');
      el.addEventListener('click', () => openAgent({mode:'message', id:getState().chatUserId}));
      input.insertAdjacentElement('afterend', el);
    }
    for (const nav of document.querySelectorAll('.mobile-header, .desktop-header-content')) {
      if (nav.querySelector('[data-ax-global]')) continue;
      const el = button('✦', 'Open AURA-X assistant');
      el.dataset.axGlobal = '1';
      el.addEventListener('click', () => {
        const s = getState();
        if (s.activeTab === 'messages' && s.chatUserId) openAgent({mode:'message',id:s.chatUserId});
        else if (s.activeTab === 'reels') {
          const slides = [...document.querySelectorAll('[data-reel-slide]')];
          const visible = slides.find(el => {
            const b = el.getBoundingClientRect();
            return b.height > 0 && b.top < innerHeight * .65 && b.bottom > innerHeight * .35;
          });
          openAgent({mode:'reel',id:visible?.getAttribute('data-reel-slide') || ''});
        } else openAgent({mode:'message',id:''});
      });
      nav.append(el);
    }
  }
  const before = bindRepairEvents;
  bindRepairEvents = function() {
    before();
    attachButtons();
  };
  // appDialog is automatically dismissed when the app changes user/session.
  root.CrushXAura = Object.freeze({openReel: id => openAgent({mode:'reel', id}),
    openMessage: id => openAgent({mode:'message', id})});
})(window);
