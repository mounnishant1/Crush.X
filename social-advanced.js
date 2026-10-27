const advancedOldHome=renderHome,advancedOldReels=renderReels,advancedOldProfile=renderProfile,advancedOldBind=bindRepairEvents;
const advancedOldPostOptions=openSamplePostOptions,advancedOldShare=socialOpenShare;
function advancedAddComment(itemId,body,parentId=null){
  const text=String(body||'').trim().slice(0,2000),s=getState(),item=socialItem(s,itemId);
  if(!text||!item)return false;
  item.comments||=[];if(item.comments.length>=1000)return false;
  if(parentId&&!item.comments.some(c=>c.id===parentId))return false;
  const id='c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  item.comments.push({id,parentId,user:currentUser(s).username,text,liked:false,likes:0});saveState(s);return true;
}
function advancedModifyComment(itemId,id,action,text=''){
  const s=getState(),item=socialItem(s,itemId),c=item?.comments?.find(c=>c.id===id);
  if(!c)return false;
  if(action==='like'){c.liked=!c.liked;c.likes=Math.max(0,Number(c.likes||0)+(c.liked?1:-1));}
  else if(action==='edit'){if(c.user!==currentUser(s).username||!String(text).trim())return false;c.text=String(text).trim().slice(0,2000);}
  else if(action==='delete'){
    if(c.user!==currentUser(s).username)return false;
    const removed=new Set([id]);let last;
    do{last=removed.size;item.comments.filter(c=>removed.has(c.parentId)).forEach(c=>removed.add(c.id));}while(last!==removed.size);
    item.comments=item.comments.filter(c=>!removed.has(c.id));
  }else return false;
  saveState(s);return true;
}
function advancedComments(itemId,parent=null,preserveParent=false){
  const s=getState(),item=socialItem(s,itemId);if(!item)return;
  const comments=item.comments||[],reply=comments.find(c=>c.id===parent),ordered=[],seen=new Set();
  function walk(parentId,depth){
    for(const c of comments){if(seen.has(c.id)||(c.parentId||null)!==parentId)continue;
      seen.add(c.id);ordered.push({c,depth});if(depth<5)walk(c.id,depth+1);}
  }
  walk(null,0);comments.filter(c=>!seen.has(c.id)).forEach(c=>ordered.push({c,depth:0}));
  appDialog('Comments · local thread',`<p class="social-disclaimer">Sample replies, likes and inbox notifications stay in this browser. No real person receives an alert.</p>
    <div class="advanced-thread">${ordered.slice(0,200).map(({c,depth})=>`<div class="advanced-comment" data-advanced-comment-id="${escapeHTML(c.id)}" style="--reply-depth:${Math.min(depth,3)}">
      <p><strong>@${escapeHTML(c.user)}</strong> ${escapeHTML(c.text)}</p>
      <div class="advanced-actions"><button data-advanced-like="${escapeHTML(c.id)}" aria-pressed="${!!c.liked}">♥ ${c.likes||0}</button>
      <button data-advanced-reply="${escapeHTML(c.id)}">Reply</button>
      ${c.user===currentUser(s).username?`<button data-advanced-edit="${escapeHTML(c.id)}">Edit</button><button data-advanced-delete="${escapeHTML(c.id)}">Delete</button>`:''}</div></div>`).join('')||'<p>No local comments yet.</p>'}</div>
    <form data-advanced-comment-form class="social-flow-form">
      ${reply?`<p>Replying to @${escapeHTML(reply.user)} <button type="button" data-advanced-cancel>Cancel</button></p>`:''}
      <label>Comment<textarea data-advanced-text rows="2" maxlength="2000" placeholder="Write a comment…"></textarea></label>
      <button type="submit" class="social-primary">Post local comment</button></form>`,dialog=>{
    const field=dialog.querySelector('[data-advanced-text]');
    if(reply)field.value='@'+reply.user.replace(/[^\w.]/g,'')+' ';
    dialog.querySelector('[data-advanced-comment-form]').onsubmit=e=>{e.preventDefault();if(advancedAddComment(itemId,field.value,reply?.id)){dialog.close();advancedComments(itemId,null,preserveParent);}};
    dialog.querySelector('[data-advanced-cancel]')?.addEventListener('click',()=>{dialog.close();advancedComments(itemId,null,preserveParent);});
    dialog.querySelectorAll('[data-advanced-reply]').forEach(b=>b.addEventListener('click',()=>{dialog.close();advancedComments(itemId,b.dataset.advancedReply,preserveParent);}));
    dialog.querySelectorAll('[data-advanced-like]').forEach(b=>b.addEventListener('click',()=>{if(advancedModifyComment(itemId,b.dataset.advancedLike,'like')){dialog.close();advancedComments(itemId,null,preserveParent);}}));
    dialog.querySelectorAll('[data-advanced-delete]').forEach(b=>b.addEventListener('click',()=>{
      if(!window.confirm?.('Delete this local comment and replies?'))return;
      if(advancedModifyComment(itemId,b.dataset.advancedDelete,'delete')){dialog.close();advancedComments(itemId,null,preserveParent);}
    }));
    dialog.querySelectorAll('[data-advanced-edit]').forEach(b=>b.addEventListener('click',()=>{
      const c=socialItem(getState(),itemId)?.comments?.find(c=>c.id===b.dataset.advancedEdit);if(!c)return;
      dialog.close();appDialog('Edit local comment',`<form data-advanced-edit-form class="social-flow-form"><label>Edit<textarea data-advanced-edit-text maxlength="2000">${escapeHTML(c.text)}</textarea></label><button type="submit" class="social-primary">Save edit</button></form>`,edit=>{
        edit.querySelector('[data-advanced-edit-form]').onsubmit=e=>{e.preventDefault();if(advancedModifyComment(itemId,c.id,'edit',edit.querySelector('[data-advanced-edit-text]').value)){edit.close();advancedComments(itemId,null,preserveParent);}};
      },preserveParent);
    }));
  },preserveParent);
}
function advancedCreateCollection(name){
  const value=String(name||'').trim().slice(0,45);if(!value)return null;
  const s=getState();s.socialCollections||=[];
  const existing=s.socialCollections.find(c=>c.name.toLowerCase()===value.toLowerCase());
  if(existing)return existing.id;
  if(s.socialCollections.length>=30)return null;
  const id='collection_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  s.socialCollections.push({id,name:value,itemIds:[]});saveState(s);return id;
}
function advancedSetCollection(itemId,collectionId,include){
  const s=getState(),item=socialItem(s,itemId),c=s.socialCollections?.find(c=>c.id===collectionId);
  if(!item||!c)return false;
  c.itemIds=c.itemIds.filter(x=>x!==itemId);if(include){c.itemIds.push(itemId);item.saved=true;}
  saveState(s);return true;
}
function advancedCollections(itemId){
  const s=getState(),item=socialItem(s,itemId);if(!item)return;
  appDialog('Save to collection',`<p class="social-disclaimer">Private browser-only sample collection; not synced.</p>
    <div class="advanced-collection-list">${(s.socialCollections||[]).map(c=>`<label><input data-advanced-collection="${escapeHTML(c.id)}" type="checkbox" ${c.itemIds.includes(itemId)?'checked':''}> ${escapeHTML(c.name)} (${c.itemIds.length})</label>`).join('')||'<p>Create a collection below.</p>'}</div>
    <form data-advanced-collection-form class="social-flow-form"><label>Collection name<input data-advanced-name maxlength="45" placeholder="Travel, Favorites…"></label><button class="social-primary">Create & save</button></form>
    <button data-advanced-basic-save class="advanced-link-button">${item.saved?'Remove from saved':'Save without collection'}</button>`,dialog=>{
    dialog.querySelectorAll('[data-advanced-collection]').forEach(b=>b.addEventListener('change',()=>advancedSetCollection(itemId,b.dataset.advancedCollection,b.checked)));
    dialog.querySelector('[data-advanced-collection-form]').onsubmit=e=>{e.preventDefault();const id=advancedCreateCollection(dialog.querySelector('[data-advanced-name]').value);if(id){advancedSetCollection(itemId,id,true);dialog.close();advancedCollections(itemId);}};
    dialog.querySelector('[data-advanced-basic-save]').onclick=()=>{
      const state=getState(),target=socialItem(state,itemId);target.saved=!target.saved;
      if(!target.saved)(state.socialCollections||[]).forEach(c=>c.itemIds=c.itemIds.filter(x=>x!==itemId));
      saveState(state);dialog.close();renderApp();
    };
  });
}
function advancedStoryDraft(itemId){
  const s=getState(),item=socialItem(s,itemId);if(!item)return;
  appDialog('Add to Story · draft',`${localItemMedia(item)}<form data-advanced-story-form class="social-flow-form">
    <label>Text overlay<textarea data-advanced-story-note maxlength="200" rows="2" placeholder="Your caption…"></textarea></label>
    <button class="social-primary">Save Story draft</button></form><p class="social-disclaimer">This saves a media reference, not a story. Nothing is uploaded, copied, published or delivered.</p>`,dialog=>{
    dialog.querySelector('[data-advanced-story-form]').onsubmit=e=>{
      e.preventDefault();const state=getState();state.socialStoryDrafts||=[];
      state.socialStoryDrafts.push({id:'storydraft_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),itemId,note:dialog.querySelector('[data-advanced-story-note]').value.slice(0,200)});
      state.socialStoryDrafts=state.socialStoryDrafts.slice(-30);saveState(state);dialog.close();advancedStoryDrafts();
    };
  });
}
function advancedStoryDrafts(){
  const s=getState();appDialog('Story drafts · local',`<p class="social-disclaimer">No Story has been published. Ensure media rights before posting.</p>
    <div class="advanced-collection-list">${(s.socialStoryDrafts||[]).map(d=>`<div><strong>${escapeHTML((socialItem(s,d.itemId)?.caption||'Sample content').slice(0,65))}</strong><p>${escapeHTML(d.note)}</p>
    <button data-advanced-delete-draft="${escapeHTML(d.id)}">Delete draft</button></div>`).join('')||'<p>No Story drafts yet.</p>'}</div>`,dialog=>{
    dialog.querySelectorAll('[data-advanced-delete-draft]').forEach(b=>b.addEventListener('click',()=>{
      const state=getState();state.socialStoryDrafts=(state.socialStoryDrafts||[]).filter(d=>d.id!==b.dataset.advancedDeleteDraft);
      saveState(state);dialog.close();advancedStoryDrafts();
    }));
  });
}
function advancedCollectionLibrary(){
  const s=getState();
  appDialog('Saved collections · local',`<p class="social-disclaimer">Private sample collections.</p>
    <div class="advanced-collection-list">${(s.socialCollections||[]).map(c=>`<div><strong>${escapeHTML(c.name)} · ${c.itemIds.length}</strong>
    ${c.itemIds.map(id=>`<button data-advanced-library-item="${escapeHTML(id)}">${escapeHTML((socialItem(s,id)?.caption||id).slice(0,70))}</button>`).join('')}
    <button data-advanced-delete-collection="${escapeHTML(c.id)}">Delete collection</button></div>`).join('')||'<p>No collections created.</p>'}</div>`,dialog=>{
    dialog.querySelectorAll('[data-advanced-library-item]').forEach(b=>b.addEventListener('click',()=>{dialog.close();showLocalItem(b.dataset.advancedLibraryItem);}));
    dialog.querySelectorAll('[data-advanced-delete-collection]').forEach(b=>b.addEventListener('click',()=>{
      const state=getState();state.socialCollections=(state.socialCollections||[]).filter(c=>c.id!==b.dataset.advancedDeleteCollection);
      saveState(state);dialog.close();advancedCollectionLibrary();
    }));
  });
}
function advancedToggleHidden(id){
  const s=getState();if(!socialItem(s,id))return;
  s.socialHiddenIds||=[];
  s.socialHiddenIds=s.socialHiddenIds.includes(id)?s.socialHiddenIds.filter(x=>x!==id):[...s.socialHiddenIds,id];
  saveState(s);renderApp();
}
function advancedToggleMute(id){
  const s=getState();if(!userById(s,id)||id===s.currentUserId)return;
  s.socialMutedIds||=[];
  s.socialMutedIds=s.socialMutedIds.includes(id)?s.socialMutedIds.filter(x=>x!==id):[...s.socialMutedIds,id];
  saveState(s);renderApp();
}
function advancedHiddenManager(){
  const s=getState();
  appDialog('Hidden & muted · sample',`<p class="social-disclaimer">These are local filters only.</p>
    <div class="advanced-collection-list">${(s.socialHiddenIds||[]).map(id=>`<button data-advanced-restore="${escapeHTML(id)}">Restore ${escapeHTML(id)}</button>`).join('')}
    ${(s.socialMutedIds||[]).map(id=>`<button data-advanced-unmute="${escapeHTML(id)}">Unmute @${escapeHTML(userById(s,id)?.username||id)}</button>`).join('')}
    ${!(s.socialHiddenIds?.length||s.socialMutedIds?.length)?'<p>No muted or hidden items.</p>':''}</div>`,dialog=>{
    dialog.querySelectorAll('[data-advanced-restore]').forEach(b=>b.addEventListener('click',()=>{advancedToggleHidden(b.dataset.advancedRestore);dialog.close();advancedHiddenManager();}));
    dialog.querySelectorAll('[data-advanced-unmute]').forEach(b=>b.addEventListener('click',()=>{advancedToggleMute(b.dataset.advancedUnmute);dialog.close();advancedHiddenManager();}));
  });
}
function advancedProfileModal(userId){
  const s=getState(),u=userById(s,userId);if(!u)return;
  appDialog('@'+u.username+' · sample',`<div class="advanced-profile"><img src="${safeMediaUrl(u.avatar)}" alt=""><div><strong>@${escapeHTML(u.username)}</strong><p>${escapeHTML(u.fullName)}</p><small>${escapeHTML(u.info)}</small></div></div>
    <p class="social-disclaimer">Sample profile; not a remote account.</p>
    ${userId!==s.currentUserId?`<div class="social-item-actions"><button data-advanced-follow>${u.following?'Unfollow':'Follow'}</button><button data-advanced-dm>Open DM draft</button></div>`:''}
    <div class="advanced-collection-list">${[...s.posts,...s.reels].filter(p=>p.userId===userId).map(p=>`<button data-advanced-profile-item="${escapeHTML(p.id)}">${escapeHTML(p.caption.slice(0,80))}</button>`).join('')||'<p>No sample posts.</p>'}</div>`,dialog=>{
    dialog.querySelector('[data-advanced-follow]')?.addEventListener('click',()=>{
      const state=getState(),u=userById(state,userId);if(!u)return;
      u.following=!u.following;u.followers=Math.max(0,Number(u.followers||0)+(u.following?1:-1));
      saveState(state);dialog.close();advancedProfileModal(userId);
    });
    dialog.querySelector('[data-advanced-dm]')?.addEventListener('click',()=>{dialog.close();navigate('messages',userId);});
    dialog.querySelectorAll('[data-advanced-profile-item]').forEach(b=>b.addEventListener('click',()=>{dialog.close();showLocalItem(b.dataset.advancedProfileItem);}));
  });
}
function advancedMenu(id){
  const s=getState(),item=socialItem(s,id);if(!item)return;
  if(s.posts.some(p=>p.id===id))advancedOldPostOptions(id);
  else appDialog('Reel options','<p class="social-disclaimer">Sample reel actions, not remote services.</p>');
  const dialog=document.querySelector('dialog[data-app-dialog]'),section=dialog?.querySelector('section');if(!section)return;
  const author=userById(s,item.userId),menu=document.createElement('div');menu.className='advanced-menu';
  menu.innerHTML=`<button data-advanced-menu="collection">Save to collection</button><button data-advanced-menu="story">Add to Story draft</button>
    <button data-advanced-menu="profile">View creator profile</button>
    <button data-advanced-menu="hide">${(s.socialHiddenIds||[]).includes(id)?'Restore':'Not interested · hide locally'}</button>
    ${author?.id!==s.currentUserId?`<button data-advanced-menu="mute">${(s.socialMutedIds||[]).includes(item.userId)?'Unmute':'Mute'} sample author</button>`:''}
    <button data-advanced-menu="report">Report (preview only)</button>`;
  section.append(menu);
  menu.querySelectorAll('[data-advanced-menu]').forEach(b=>b.addEventListener('click',()=>{
    const action=b.dataset.advancedMenu;dialog.close();
    if(action==='collection')advancedCollections(id);
    if(action==='story')advancedStoryDraft(id);
    if(action==='profile')advancedProfileModal(item.userId);
    if(action==='hide')advancedToggleHidden(id);
    if(action==='mute')advancedToggleMute(item.userId);
    if(action==='report')appDialog('Report not connected','<p>No report was sent. Moderation requires a verified backend. You may hide this sample post locally.</p>');
  }));
}
renderHome=function(s){
  const hidden=new Set(s.socialHiddenIds||[]),muted=new Set(s.socialMutedIds||[]);
  let html=advancedOldHome({...s,posts:s.posts.filter(p=>!hidden.has(p.id)&&!muted.has(p.userId))});
  for(const p of s.posts)html=html.replace(`data-comment-focus="${escapeHTML(p.id)}"`,`data-advanced-comments="${escapeHTML(p.id)}"`);
  return html;
};
renderReels=function(s){
  const hidden=new Set(s.socialHiddenIds||[]),muted=new Set(s.socialMutedIds||[]);
  let html=advancedOldReels({...s,reels:s.reels.filter(p=>!hidden.has(p.id)&&!muted.has(p.userId))});
  for(const p of s.reels){
    const id=escapeHTML(p.id);
    html=html.replace(`data-comment-focus="${id}"`,`data-advanced-comments="${id}"`);
    html=html.replace(`<button data-save="${id}"`,`<button data-advanced-reel-menu="${id}" aria-label="More reel options">•••</button><button data-save="${id}"`);
  }
  return html;
};
renderProfile=function(s){
  const html=advancedOldProfile(s);
  return html.replace('</main>',`<section class="advanced-profile-tools glass"><h2>Saved & Story tools · sample</h2>
    <div><button data-advanced-library>Saved collections (${s.socialCollections?.length||0})</button>
    <button data-advanced-drafts>Story drafts (${s.socialStoryDrafts?.length||0})</button>
    <button data-advanced-hidden>Hidden & muted</button></div></section></main>`);
};
socialOpenComments=advancedComments;
socialOpenShare=function(id,preserveParent=false){
  advancedOldShare(id,preserveParent);
  const dialogs=[...document.querySelectorAll('dialog[data-app-dialog][open]')];
  const section=dialogs.at(-1)?.querySelector('section');if(!section)return;
  const b=document.createElement('button');b.type='button';b.className='advanced-link-button';b.textContent='Add to Story draft · not published';
  section.append(b);b.onclick=()=>{section.closest('dialog').close();advancedStoryDraft(id);};
};
openSamplePostOptions=advancedMenu;
bindRepairEvents=function(){
  advancedOldBind();
  document.querySelectorAll('[data-advanced-comments]').forEach(b=>b.addEventListener('click',()=>advancedComments(b.dataset.advancedComments)));
  document.querySelectorAll('[data-advanced-reel-menu]').forEach(b=>b.addEventListener('click',()=>advancedMenu(b.dataset.advancedReelMenu)));
  document.querySelector('[data-advanced-library]')?.addEventListener('click',advancedCollectionLibrary);
  document.querySelector('[data-advanced-drafts]')?.addEventListener('click',advancedStoryDrafts);
  document.querySelector('[data-advanced-hidden]')?.addEventListener('click',advancedHiddenManager);
};
