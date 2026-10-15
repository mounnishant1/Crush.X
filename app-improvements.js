/* Local-only social preview. No network mutations or account impersonation. */
let appFeedFilter = 'all';
let appProfileFilter = 'posts';
let captionDraft = '';
const originalHome = renderHome;
const originalProfile = renderProfile;
const originalReels = renderReels;
const originalCreate = renderCreate;
const originalRepairEvents = bindRepairEvents;
const originalLogout = logout;
const originalRenderApp = renderApp;

function closeAppDialog() {
  document.querySelectorAll('dialog[data-app-dialog]').forEach(dialog => { dialog.close(); dialog.remove(); });
}
function appDialog(title, body, bind = () => {}) {
  const opener = document.activeElement;
  closeAppDialog();
  const dialog = document.createElement('dialog');
  dialog.dataset.appDialog = 'true';
  dialog.setAttribute('aria-label', title);
  dialog.className = 'app-dialog';
  dialog.innerHTML = `<section><header class="flex items-center justify-between gap-4 mb-4"><h2 class="text-xl font-bold">${escapeHTML(title)}</h2><button data-close-dialog aria-label="Close dialog" class="rounded-lg border px-3 py-2">Close</button></header>${body}</section>`;
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
  bind(dialog);
  dialog.showModal();
  return dialog;
}
function localItemMedia(item) {
  const url = safeMediaUrl(item.source || item.image);
  const video = item.contentType?.startsWith('video/') || item.mediaType === 'video' || /\.(mp4|webm)(?:[?#]|$)/i.test(item.source || '');
  return video ? `<video src="${url}" controls playsinline class="w-full rounded-xl max-h-[60vh]" aria-label="Saved video"></video>` : `<img src="${url}" alt="Sample media" class="w-full rounded-xl max-h-[60vh] object-contain">`;
}
function showLocalItem(id) {
  const state = getState();
  const item = [...state.posts, ...state.reels].find(item => item.id === id);
  if (!item) return;
  appDialog('Sample post', `${localItemMedia(item)}<p class="mt-3">${formatText(item.caption)}</p><p class="text-xs text-slate-500 mt-2">Local sample · ${item.comments.length} comments</p>`);
}
function openSampleStory(id) {
  const state = getState();
  const stories = state.stories.filter(story => story.expiresAt > Date.now());
  const index = stories.findIndex(story => story.id === id);
  if (index < 0) return;
  const story = stories[index], user = userById(state, story.userId);
  appDialog(`${user.username} · Sample story`, `<img src="${safeMediaUrl(story.image)}" alt="Sample story" class="w-full rounded-xl max-h-[65vh] object-contain"><div class="flex justify-between gap-4 mt-4"><button data-previous-story class="border rounded-lg p-3" ${index === 0 ? 'disabled' : ''}>Previous</button><span class="self-center text-xs">${index + 1} / ${stories.length}</span><button data-next-story class="border rounded-lg p-3" ${index === stories.length - 1 ? 'disabled' : ''}>Next</button></div>`, dialog => {
    dialog.querySelector('[data-previous-story]').onclick = () => openSampleStory(stories[index - 1].id);
    dialog.querySelector('[data-next-story]').onclick = () => openSampleStory(stories[index + 1].id);
  });
}
renderHome = function(state) {
  const posts = state.posts.filter(post => appFeedFilter !== 'following' || post.userId === state.currentUserId || userById(state, post.userId)?.following);
  let html = originalHome({...state, posts});
  html = html.replace('<main class="space-y-5">', `<main class="space-y-5"><div class="flex gap-4" aria-label="Feed filter"><button data-feed-filter="all" aria-pressed="${appFeedFilter === 'all'}" class="font-bold ${appFeedFilter === 'all' ? 'text-pink-500' : ''}">All posts</button><button data-feed-filter="following" aria-pressed="${appFeedFilter === 'following'}" class="font-bold ${appFeedFilter === 'following' ? 'text-pink-500' : ''}">Following</button></div>`);
  if (!posts.length) html = html.replace('</main>', '<p class="p-6 text-center text-slate-500">No posts here yet. Follow a sample profile to see more.</p></main>');
  // Give the existing story circles keyboard-accessible viewer actions.
  let index = 0;
  const stories = state.stories.filter(story => story.expiresAt > Date.now());
  html = html.replace(/<div class="min-w-\[76px\] text-center">/g, () => `<div role="button" tabindex="0" data-open-story="${escapeHTML(stories[index++].id)}" aria-label="Open sample story" class="min-w-[76px] text-center cursor-pointer">`);
  return html;
};
renderProfile = function(state) {
  const me = currentUser(state);
  const own = state.posts.filter(post => post.userId === me.id);
  const saved = [...state.posts, ...state.reels].filter(post => post.saved);
  let html = originalProfile(state).replace('<div class="font-black">416</div>', `<div class="font-black">${state.users.filter(user => user.following).length}</div>`).replace(`<div class="font-black">${state.posts.length}</div>`, `<div class="font-black">${own.length}</div>`);
  html = html.replace('Soft sunsets, coffee, and city lights ✨', escapeHTML(me.info));
  const items = appProfileFilter === 'saved' ? saved : own;
  return html.replace('</section>', `<div class="mt-5 flex flex-wrap gap-3"><button data-edit-sample class="border rounded-lg px-4 py-2">Edit sample profile</button><button data-profile-filter="posts" aria-pressed="${appProfileFilter === 'posts'}" class="border rounded-lg px-4 py-2">Posts · ${own.length}</button><button data-profile-filter="saved" aria-pressed="${appProfileFilter === 'saved'}" class="border rounded-lg px-4 py-2">Saved · ${saved.length}</button></div><div class="app-media-grid">${items.map(item => `<button data-open-local-item="${escapeHTML(item.id)}" aria-label="Open ${appProfileFilter === 'saved' ? 'saved' : 'sample'} post">${item.contentType?.startsWith('video/') || item.mediaType === 'video' ? `<video src="${safeMediaUrl(item.source)}" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>` : `<img src="${safeMediaUrl(item.image || item.source)}" alt="Sample post thumbnail">`}</button>`).join('')}</div>${items.length ? '' : '<p class="mt-5 text-sm text-slate-500">Nothing saved yet. Use the bookmark on a post or reel.</p>'}</section>`);
};
renderReels = function(state) {
  return originalReels(state).replace(/<button data-share="([^"]+)">Share<\/button>/g, (button, id) => {
    const item = state.reels.find(reel => reel.id === id);
    return `${button}<button data-save="${id}" aria-pressed="${!!item?.saved}">${item?.saved ? 'Unsave' : 'Save'}</button>`;
  });
};
renderCreate = function() {
  return originalCreate().replace('id="captionInput"', 'id="captionInput" maxlength="2200"').replace('</textarea>', `${escapeHTML(captionDraft)}</textarea>`);
};
bindRepairEvents = function() {
  originalRepairEvents();
  const on = (selector, fn) => document.querySelectorAll(selector).forEach(button => button.addEventListener('click', () => fn(button)));
  on('[data-feed-filter]', button => { appFeedFilter = button.dataset.feedFilter; renderApp(); });
  on('[data-profile-filter]', button => { appProfileFilter = button.dataset.profileFilter; renderApp(); });
  on('[data-open-local-item]', button => showLocalItem(button.dataset.openLocalItem));
  on('[data-open-story]', button => openSampleStory(button.dataset.openStory));
  document.querySelectorAll('[data-open-story]').forEach(button => button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } }));
  document.getElementById('sampleModeInfo')?.addEventListener('click', () => appDialog('Sample mode', '<p>Stories, likes, follows, saved items, profile edits and comments use sample data in this browser. Other people using this browser may see them.</p><p class="mt-3">Message drafts are never delivered. Publishing is not connected. Drafts are cleared on logout. Your Cognito account is separate from the sample profile.</p>'));
  document.getElementById('captionInput')?.addEventListener('input', event => { captionDraft = event.target.value.slice(0, 2200); });
  on('[data-edit-sample]', () => {
    const me = currentUser(getState());
    appDialog('Edit sample profile', `<form data-edit-sample-form><label>Name<input data-sample-name value="${escapeHTML(me.fullName)}" maxlength="80" required class="w-full border rounded-lg p-3 mt-1 mb-4 bg-transparent"></label><label>Bio<textarea data-sample-bio maxlength="150" class="w-full border rounded-lg p-3 mt-1 bg-transparent">${escapeHTML(me.info)}</textarea></label><p class="text-xs text-slate-500 my-3">Saved in this browser. Your Cognito account is unchanged.</p><button class="gradient-main rounded-lg p-3 text-white">Save</button></form>`, dialog => {
      dialog.querySelector('form').onsubmit = event => {
        event.preventDefault();
        const name = dialog.querySelector('[data-sample-name]').value.trim();
        if (!name) return;
        const state = getState(), user = currentUser(state);
        user.fullName = name.slice(0, 80); user.info = dialog.querySelector('[data-sample-bio]').value.slice(0, 150);
        saveState(state); dialog.close(); renderApp();
      };
    });
  });
};
renderApp = function() {
  if (document.getElementById('authOverlay')?.style.display !== 'none') closeAppDialog();
  originalRenderApp();
};
logout = function() { closeAppDialog(); captionDraft = ''; originalLogout(); };
