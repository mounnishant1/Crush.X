const socialSampleLikes={post_1:['user_1','user_3'],post_2:['user_3'],reel_1:['user_1','user_3']};
const socialOldHome=renderHome, socialOldReels=renderReels, socialOldBind=bindRepairEvents, socialOldPostOptions=openSamplePostOptions;
function socialItem(s,id){return [...s.posts,...s.reels].find(p=>p.id===id);}
function socialKind(s,item){return s.reels.some(p=>p.id===item.id)?'reel':'post';}
function socialFriends(s,id){return (socialSampleLikes[id]||[]).map(u=>userById(s,u)).filter(u=>u&&u.following&&u.id!==s.currentUserId);}
function socialBubble(s,item){
  const users=socialFriends(s,item.id);if(!users.length)return '';
  return `<button type="button" class="social-friend-bubble" data-social-friends="${escapeHTML(item.id)}" aria-label="View sample friends who liked this">
    <span class="social-avatar-stack" aria-hidden="true">${users.slice(0,3).map(u=>`<img src="${safeMediaUrl(u.avatar)}" alt="">`).join('')}</span>
    <span>Liked by <strong>${escapeHTML(users[0].username)}</strong>${users.length>1?' and others':''} <small>· sample</small></span></button>`;
}
function socialDraft(s,item,note,friendLike){
  const caption=String(item.caption||'').replace(/\s+/g,' ').slice(0,140);
  const header=(friendLike?'About the sample '+socialKind(s,item)+' you liked':'Sharing a sample '+socialKind(s,item))+(caption?': "'+caption+'"':'');
  return header+(String(note||'').trim()?'\n'+String(note).trim().slice(0,1500):'');
}
function socialSaveDrafts(itemId,ids,note,friendLike=false){
  const s=getState(),item=socialItem(s,itemId);if(!item)return 0;
  const recipients=[...new Set(ids)].filter(id=>id!==s.currentUserId&&userById(s,id));
  if(!recipients.length)return 0;
  const message=socialDraft(s,item,note,friendLike);s.messageDrafts||={};
  for(const id of recipients){
    const prior=String(s.messageDrafts[id]||'');
    s.messageDrafts[id]=(prior?(prior+'\n\n'+message).slice(-4000):message.slice(0,4000));
  }
  saveState(s);return recipients.length;
}
function socialFriendReply(id,friendId){
  const s=getState(),item=socialItem(s,id),friend=userById(s,friendId);
  if(!item||!friend||!socialFriends(s,id).some(u=>u.id===friendId))return;
  appDialog('Reply to @'+friend.username,`<p class="social-disclaimer">Illustrative friend-like activity. This only saves a local DM draft.</p>
    <form data-social-friend-form class="social-flow-form"><label>Your reply
      <textarea data-social-reply-text maxlength="1500" rows="3" placeholder="Say something about the post…"></textarea></label>
      <div class="social-quick-reactions">${['❤️','😂','🔥','🙌'].map(e=>`<button type="button" data-social-emoji="${e}">${e}</button>`).join('')}</div>
      <button type="submit" class="social-primary">Open DM with draft</button></form>
      <p class="social-disclaimer">No message is sent, queued or marked delivered.</p>`,dialog=>{
    const box=dialog.querySelector('[data-social-reply-text]');
    dialog.querySelectorAll('[data-social-emoji]').forEach(b=>b.addEventListener('click',()=>{box.value=(box.value+' '+b.dataset.socialEmoji).trim().slice(0,1500);box.focus();}));
    dialog.querySelector('[data-social-friend-form]').onsubmit=ev=>{
      ev.preventDefault();if(!box.value.trim()){box.focus();return;}
      if(socialSaveDrafts(id,[friendId],box.value,true)){dialog.close();navigate('messages',friendId);}
    };
  });
}
function socialOpenFriends(id){
  const s=getState(),item=socialItem(s,id);if(!item)return;
  const friends=socialFriends(s,id);
  appDialog('Sample friends who liked',`<p class="social-disclaimer">Demo activity only, not verified real friend likes.</p>
    <div class="social-friend-list">${friends.map(u=>`<div class="social-friend-row"><img src="${safeMediaUrl(u.avatar)}" alt=""><div><strong>@${escapeHTML(u.username)}</strong><small>Sample like</small></div><button type="button" data-social-friend-reply="${escapeHTML(u.id)}">Reply</button></div>`).join('')||'<p>No followed sample friends for this item.</p>'}</div>`,dialog=>{
    dialog.querySelectorAll('[data-social-friend-reply]').forEach(b=>b.addEventListener('click',()=>{const user=b.dataset.socialFriendReply;dialog.close();socialFriendReply(id,user);}));
  });
}
function socialMediaUrl(item){
  try{const url=new URL(item.source||item.image||'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}
  catch{return '';}
}
function socialOpenShare(id){
  const s=getState(),item=socialItem(s,id);if(!item)return;
  const people=s.users.filter(u=>u.id!==s.currentUserId),url=socialMediaUrl(item);
  appDialog('Share '+socialKind(s,item),`<p class="social-disclaimer">Select people and prepare local DM drafts. This does not send or queue any messages.</p>
    <form data-social-share-form class="social-flow-form">
      <input data-social-search maxlength="100" aria-label="Search sample people" placeholder="Search people…">
      <div class="social-recipient-list" role="group" aria-label="Choose DM recipients">${people.map(u=>`<label data-social-person="${escapeHTML((u.username+' '+u.fullName).toLowerCase())}"><input data-social-recipient type="checkbox" value="${escapeHTML(u.id)}"><img src="${safeMediaUrl(u.avatar)}" alt=""><span>@${escapeHTML(u.username)}</span></label>`).join('')}</div>
      <label>Message (optional)<textarea data-social-note rows="2" maxlength="1500" placeholder="What do you think?"></textarea></label>
      <button type="submit" class="social-primary">Save selected DM drafts</button><p data-social-status class="social-disclaimer" role="status">Choose one or more recipients.</p>
    </form>
    ${url?`<div class="social-link-actions"><button data-social-copy type="button">Copy media URL</button><button data-social-native type="button">Device share</button></div><p class="social-disclaimer">This is a media URL, not a published Crush.X post link.</p>`:''}`,dialog=>{
    const msg=dialog.querySelector('[data-social-status]');
    dialog.querySelector('[data-social-search]').addEventListener('input',ev=>{
      const q=ev.target.value.trim().toLowerCase();dialog.querySelectorAll('[data-social-person]').forEach(row=>{row.hidden=!row.dataset.socialPerson.includes(q);});
    });
    dialog.querySelector('[data-social-share-form]').onsubmit=ev=>{
      ev.preventDefault();
      const selected=[...dialog.querySelectorAll('[data-social-recipient]:checked')].map(x=>x.value);
      const count=socialSaveDrafts(id,selected,dialog.querySelector('[data-social-note]').value);
      msg.textContent=count?count+' local DM draft'+(count===1?'':'s')+' saved. No messages sent.':'Select at least one recipient.';
    };
    const copy=dialog.querySelector('[data-social-copy]');
    if(copy)copy.onclick=async()=>{
      try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);msg.textContent='Media URL copied.';}
      else msg.textContent='Copy media URL manually: '+url;}catch{msg.textContent='Copy failed.';}
    };
    const native=dialog.querySelector('[data-social-native]');
    if(native)native.onclick=async()=>{
      if(!navigator.share){msg.textContent='Device sharing is unavailable.';return;}
      try{await navigator.share({title:'Crush.X sample media',url});msg.textContent='Device sharing completed.';}
      catch(e){if(e?.name!=='AbortError')msg.textContent='Device sharing failed.';}
    };
  });
}
function socialOpenComments(id){
  const s=getState(),item=socialItem(s,id);if(!item)return;
  const comments=Array.isArray(item.comments)?item.comments:[];
  appDialog('Comments · local preview',`<p class="social-disclaimer">Mention is a draft in a local comment, not a threaded reply.</p>
    <div class="social-comment-list">${comments.slice(0,100).map(c=>`<div class="social-comment-row"><p><strong>@${escapeHTML(c.user)}</strong> ${escapeHTML(c.text)}</p><button type="button" data-social-mention="${escapeHTML(c.user)}">Mention</button></div>`).join('')||'<p>No local comments yet.</p>'}</div>`,dialog=>{
    dialog.querySelectorAll('[data-social-mention]').forEach(b=>b.addEventListener('click',()=>{
      const mention=b.dataset.socialMention.replace(/[^\w.]/g,'').slice(0,128);dialog.close();
      const box=[...document.querySelectorAll('[data-comment-input]')].find(el=>el.dataset.commentInput===id);
      if(box){box.value='@'+mention+' '+box.value;box.focus();box.scrollIntoView?.({block:'center'});}
    }));
  });
}
renderHome=function(s){
  const html=socialOldHome(s);
  return html.replace(/<article class="feed-card[\s\S]*?<\/article>/g,article=>{
    const m=article.match(/data-like="([^"]+)"/),item=m&&socialItem(s,m[1]);if(!item)return article;
    const id=escapeHTML(item.id);
    const marker='<div class="px-4 pb-4 pt-1 text-sm font-bold">';
    return article.replace(marker,marker+socialBubble(s,item)+`<button type="button" class="social-comments-shortcut" data-social-comments="${id}">View comments and reply</button>`).replace(`data-share="${id}"`,`data-social-share="${id}"`);
  });
};
renderReels=function(s){
  let html=socialOldReels(s);
  for(const item of s.reels){
    const id=escapeHTML(item.id);
    html=html.replace(`data-share="${id}"`,`data-social-share="${id}"`);
    html=html.replace(`<button data-reel-audio="${id}"`,socialBubble(s,item)+`<button type="button" class="social-comments-shortcut" data-social-comments="${id}">View comments</button><button data-reel-audio="${id}"`);
  }
  return html;
};
bindRepairEvents=function(){
  socialOldBind();
  document.querySelectorAll('[data-social-friends]').forEach(b=>b.addEventListener('click',()=>socialOpenFriends(b.dataset.socialFriends)));
  document.querySelectorAll('[data-social-share]').forEach(b=>b.addEventListener('click',()=>socialOpenShare(b.dataset.socialShare)));
  document.querySelectorAll('[data-social-comments]').forEach(b=>b.addEventListener('click',()=>socialOpenComments(b.dataset.socialComments)));
};
openSamplePostOptions=function(id){
  socialOldPostOptions(id);
  const share=document.querySelector('dialog[data-app-dialog] [data-option-share]');
  if(share)share.onclick=()=>socialOpenShare(id);
};

showLocalItem=function(id){
  const s=getState(),item=socialItem(s,id);if(!item)return;
  const author=userById(s,item.userId);
  const detailDialog=appDialog('Sample '+socialKind(s,item),`
    ${localItemMedia(item)}
    <p class="social-item-caption"><strong>@${escapeHTML(author?.username||'sample')}</strong> ${formatText(item.caption||'')}</p>
    ${socialBubble(s,item)}
    <div class="social-item-actions">
      <button data-social-item-like type="button" aria-pressed="${!!item.liked}">${item.liked?'Unlike':'Like'} · ${Number(item.likes||0).toLocaleString()}</button>
      <button data-social-item-save type="button" aria-pressed="${!!item.saved}">${item.saved?'Saved':'Save'}</button>
      <button data-social-item-comments type="button">Comments</button>
      <button data-social-item-share type="button">Share</button>
    </div>
    <p class="social-disclaimer">All engagement stays in this browser. No real account or notification is changed.</p>`,dialog=>{
    const like=dialog.querySelector('[data-social-item-like]');
    like.onclick=()=>{
      const state=getState(),found=socialItem(state,id);if(!found)return;
      found.liked=!found.liked;found.likes=Math.max(0,Number(found.likes||0)+(found.liked?1:-1));
      saveState(state);like.setAttribute('aria-pressed',String(found.liked));like.textContent=(found.liked?'Unlike':'Like')+' · '+Number(found.likes).toLocaleString();
    };
    const save=dialog.querySelector('[data-social-item-save]');
    save.onclick=()=>{
      const state=getState(),found=socialItem(state,id);if(!found)return;
      found.saved=!found.saved;saveState(state);save.setAttribute('aria-pressed',String(found.saved));save.textContent=found.saved?'Saved':'Save';
    };
    dialog.querySelector('[data-social-item-comments]').onclick=()=>socialOpenComments(id);
    dialog.querySelector('[data-social-item-share]').onclick=()=>socialOpenShare(id);
    dialog.querySelectorAll('[data-social-friends]').forEach(button=>button.addEventListener('click',()=>socialOpenFriends(id)));
  });
  // A selected item is a secondary screen, not a centered desktop popup.
  detailDialog?.classList?.add?.('cx-media-detail-fullscreen');
  return detailDialog;
};
