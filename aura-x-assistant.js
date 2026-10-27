/* One AURA-X surface for Reels and Messages.
 * Works on local sample data only. Never auto-sends or reads external inboxes.
 */
(function(root) {
  'use strict';
  if (typeof bindRepairEvents !== 'function' || !root.CrushXAuraCore || !root.CrushXAuraPolicy) return;
  let activeDialog = null;
  const core = root.CrushXAuraCore;
  const permissions = root.CrushXAuraPolicy.createSession();
  const previousLogout = logout;
  let globalTrigger = null;
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
      <p class="text-xs text-slate-500 mb-3">One AURA-X assistant · local rule-based guidance. No live model, external inbox, model training, publishing or autonomous tasks.</p>
      <section class="cx-aura-permissions" aria-label="AURA-X local permissions">
        <p data-ax-policy-status role="status">Permission required. Access expires after 15 minutes.</p>
        <div class="cx-aura-permission-actions"><button type="button" data-ax-consent>Allow local analysis for 15 minutes</button><button type="button" data-ax-apply-consent>Allow editing my local draft for 15 minutes</button><button type="button" data-ax-revoke>Revoke permissions</button></div>
      </section>
      <p data-ax-context class="text-sm font-semibold mb-3"></p>
      ${mode === 'message' ? '<label class="block text-sm font-semibold" for="axIncoming">Incoming text (optional; paste it yourself)</label><textarea id="axIncoming" rows="3" maxlength="4000" class="w-full rounded-xl border p-3 mb-3 bg-transparent" placeholder="No live messages are read automatically"></textarea>' : ''}
      <form data-ax-form>
        <label for="axPrompt" class="block text-sm font-semibold">Ask AURA-X</label>
        <input id="axPrompt" maxlength="300" class="w-full rounded-xl border p-3 bg-transparent mt-1" placeholder="${mode === 'reel' ? 'Analyse hook, caption, and improvements' : 'Suggest a safe reply, polish, or check risk'}" />
        <button class="mt-3 rounded-xl gradient-main px-4 py-3 font-bold text-white" type="submit" disabled>Analyse</button>
      </form>
      <section aria-live="polite" class="mt-4">
        <strong data-ax-title class="block"></strong>
        <pre data-ax-output class="whitespace-pre-wrap break-words text-sm mt-2 font-sans"></pre>
        ${mode === 'message' ? '<button type="button" data-ax-apply disabled class="rounded-xl border px-4 py-2 mt-3 font-semibold">Use as local draft</button>' : ''}
      </section>
      <details class="cx-aura-memory"><summary>Optional private note — browser memory only</summary>
        <p>No automatic collection. This note is stored only in page memory and is erased on reload or logout.</p>
        <button type="button" data-ax-memory-consent>Allow local memory for 15 minutes</button>
        <label for="axMemory">Your note (max 500 characters; no secrets)</label>
        <textarea id="axMemory" maxlength="500" rows="3" placeholder="Add a non-sensitive preference yourself"></textarea>
        <div class="cx-aura-memory-actions"><button type="button" data-ax-memory-save>Save note</button><button type="button" data-ax-memory-export>View/export note</button><button type="button" data-ax-memory-delete>Delete note</button></div>
        <p data-ax-memory-status role="status"></p><pre data-ax-memory-output></pre>
      </details>
      <p class="mt-4 text-xs text-slate-500">Autopilot, direct messages, purchases, calls, publishing and background memory are unavailable. Every local draft requires review.</p>`;
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
      const currentOwner = () => getState().currentUserId;
      const relevantScope = mode === 'reel' ? 'analyse:reel' : 'draft:message';
      const policyText = dialog.querySelector('[data-ax-policy-status]');
      const updatePolicy = () => {
        const owner = currentOwner();
        form.querySelector('button[type="submit"]').disabled = !hasContext || !permissions.authorized(owner, relevantScope);
        policyText.textContent = permissions.authorized(owner,relevantScope) ? 'Local analysis permitted for this session (expires automatically).' : 'Permission required or expired. Nothing is analyzed automatically.';
        if (action && !permissions.authorized(owner,'apply:local-draft')) action.disabled = true;
      };
      updatePolicy();
      dialog.querySelector('[data-ax-consent]').addEventListener('click', () => {
        permissions.consent({ownerId:currentOwner(),scopes:['analyse:reel','draft:message'],approved:true}); updatePolicy();
      });
      dialog.querySelector('[data-ax-apply-consent]').addEventListener('click', () => {
        permissions.consent({ownerId:currentOwner(),scopes:['apply:local-draft'],approved:true}); updatePolicy();
        if (action && suggestion) action.disabled = false;
      });
      dialog.querySelector('[data-ax-revoke]').addEventListener('click', () => {
        permissions.revoke(); suggestion=''; if(action)action.disabled=true; output.textContent='Local permissions revoked.'; updatePolicy();
      });
      const memoryStatus=dialog.querySelector('[data-ax-memory-status]');
      const memoryOutput=dialog.querySelector('[data-ax-memory-output]');
      dialog.querySelector('[data-ax-memory-consent]').addEventListener('click', () => {
        const r=permissions.consent({ownerId:currentOwner(),scopes:['memory:read','memory:write'],approved:true});
        memoryStatus.textContent=r.ok?'Local memory access approved for 15 minutes.':r.reason;
      });
      dialog.querySelector('[data-ax-memory-save]').addEventListener('click', () => {
        const r=permissions.writeNote(currentOwner(),dialog.querySelector('#axMemory').value);
        memoryStatus.textContent=r.ok?'Note stored in this page session only.':r.reason;
      });
      dialog.querySelector('[data-ax-memory-export]').addEventListener('click', () => {
        const r=permissions.note(currentOwner());
        memoryOutput.textContent=r.ok?r.text:''; memoryStatus.textContent=r.ok?'Note available for manual copy; no data exported over a network.':r.reason;
      });
      dialog.querySelector('[data-ax-memory-delete]').addEventListener('click', () => {
        permissions.deleteNote(currentOwner());dialog.querySelector('#axMemory').value='';memoryOutput.textContent='';
        memoryStatus.textContent='Local note deleted.';
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        suggestion = '';
        if (action) action.disabled = true;
        if (!hasContext || !permissions.authorized(currentOwner(),relevantScope)) { output.textContent='Local consent is required or expired.';updatePolicy();return; }
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
          if (action) action.disabled = !suggestion || !permissions.authorized(currentOwner(),'apply:local-draft');
        }
      });
      if (action) action.addEventListener('click', () => {
        if (!suggestion || !validMessage || !permissions.authorized(currentOwner(),'apply:local-draft')) {
          output.textContent='Explicit local draft editing permission is required.';updatePolicy();return;
        }
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
  function inferContext() {
    const state=getState();
    if(state.activeTab==='messages' && state.chatUserId) return {mode:'message',id:state.chatUserId};
    if(state.activeTab==='reels'){
      const slides=[...document.querySelectorAll('[data-reel-slide]')];
      const deck=document.querySelector('.reels-deck');
      let visible=null;
      if(deck && deck.clientHeight > 0) {
        const index=Math.max(0,Math.min(slides.length-1,Math.round(deck.scrollTop/deck.clientHeight)));
        visible=slides[index];
      }
      return {mode:'reel',id:visible?.getAttribute('data-reel-slide')||''};
    }
    return {mode:'message',id:''};
  }
  function attachButtons() {
    // One persistent AURA-X button across the app; the active tab supplies context.
    if (!document.body?.append) return; // Lightweight DOM test harness may omit body.append.
    if (!globalTrigger || !globalTrigger.isConnected) {
      globalTrigger=button('✦ AURA-X','Open the unified AURA-X assistant');
      globalTrigger.dataset.axGlobal='1';
      globalTrigger.classList.add('cx-aura-float');
      globalTrigger.addEventListener('click', () => openAgent(inferContext()));
      document.body.append(globalTrigger);
    }
    const auth=document.getElementById('authOverlay');
    globalTrigger.hidden=!!auth && auth.style.display!=='none';
  }
  const before = bindRepairEvents;
  bindRepairEvents = function() {
    before();
    attachButtons();
  };
  // appDialog is automatically dismissed when the app changes user/session.
  logout=function(){ permissions.clear(); if(activeDialog?.open)activeDialog.close();previousLogout(); };
  document.addEventListener('crushx:session-ended', () => { permissions.clear(); if(activeDialog?.open)activeDialog.close(); });
  root.CrushXAura = Object.freeze({open:() => openAgent(inferContext()),
    openReel: id => openAgent({mode:'reel', id}),openMessage: id => openAgent({mode:'message', id}),
    status: () => permissions.status(getState().currentUserId)});
})(window);
