const notifOriginalModify=advancedModifyComment,notifOriginalRender=renderApp;
function socialNotificationOwner(state,comment){
  return state.users.find(u=>u.username===comment.user)||null;
}
function socialNotificationSetReaction(itemId,commentId,actorId,shouldLike){
  const state=getState(),item=socialItem(state,itemId);
  const comment=item?.comments?.find(c=>c.id===commentId);
  const actor=userById(state,actorId);
  if(!comment||!actor||typeof shouldLike!=='boolean')return {ok:false,changed:false,notified:false};
  comment.likedBy=Array.isArray(comment.likedBy)?comment.likedBy.filter(id=>userById(state,id)):[];
  const wasLiked=comment.likedBy.includes(actorId);
  if(wasLiked===shouldLike)return {ok:true,changed:false,notified:false};
  comment.likedBy=comment.likedBy.filter(id=>id!==actorId);
  if(shouldLike)comment.likedBy.push(actorId);
  comment.liked=comment.likedBy.includes(state.currentUserId);
  comment.likes=Math.max(0,Number(comment.likes||0)+(shouldLike?1:-1));
  const owner=socialNotificationOwner(state,comment);
  const exists=state.socialNotifications||[];
  state.socialNotifications=exists.filter(n=>!(n.type==='comment_like'&&n.actorId===actorId&&n.itemId===itemId&&n.commentId===commentId));
  let notified=false;
  if(shouldLike&&owner&&owner.id!==actorId){
    state.socialNotifications.push({
      id:'notif_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),
      type:'comment_like',actorId,recipientId:owner.id,itemId,commentId,read:false,createdAt:Date.now()
    });
    notified=true;
  }
  state.socialNotifications=state.socialNotifications.slice(-500);
  saveState(state);
  return {ok:true,changed:true,notified};
}
function socialNotificationInbox(userId){
  const state=getState();
  if(!userById(state,userId))return [];
  return (state.socialNotifications||[]).filter(event=>event.recipientId===userId)
    .sort((a,b)=>b.createdAt-a.createdAt);
}
function socialNotificationUnread(userId){
  return socialNotificationInbox(userId).filter(event=>!event.read).length;
}
function socialNotificationRead(id,userId){
  const state=getState(),event=(state.socialNotifications||[]).find(e=>e.id===id&&e.recipientId===userId);
  if(!event)return false;
  event.read=true;saveState(state);return true;
}
function socialNotificationReadAll(userId){
  const state=getState();let count=0;
  for(const event of state.socialNotifications||[])if(event.recipientId===userId&&!event.read){event.read=true;count++;}
  if(count)saveState(state);
  return count;
}
advancedModifyComment=function(itemId,commentId,action,text=''){
  if(action!=='like')return notifOriginalModify(itemId,commentId,action,text);
  const state=getState(),item=socialItem(state,itemId),c=item?.comments?.find(c=>c.id===commentId);
  if(!c)return false;
  const actorId=state.currentUserId;
  const liked=Array.isArray(c.likedBy)?c.likedBy.includes(actorId):!!c.liked;
  return socialNotificationSetReaction(itemId,commentId,actorId,!liked).ok;
};
function socialNotificationDemoTarget(){
  const state=getState(),me=currentUser(state);
  for(const item of [...state.posts,...state.reels]){
    const comment=(item.comments||[]).find(c=>c.user===me.username);
    const actor=state.users.find(u=>u.id!==me.id&&u.id===item.userId)||state.users.find(u=>u.id!==me.id);
    if(comment&&actor)return {itemId:item.id,commentId:comment.id,actorId:actor.id};
  }
  return null;
}
function socialNotificationOpen(id,userId){
  const state=getState(),event=(state.socialNotifications||[]).find(n=>n.id===id&&n.recipientId===userId);
  if(!event)return;
  socialNotificationRead(id,userId);
  const item=socialItem(getState(),event.itemId),comment=item?.comments?.find(c=>c.id===event.commentId);
  if(!item||!comment){
    appDialog('Comment unavailable','<p>The comment may have been removed. No action is available.</p>');
    return;
  }
  advancedComments(event.itemId);
  const row=[...document.querySelectorAll('[data-advanced-comment-id]')].find(el=>el.dataset.advancedCommentId===event.commentId);
  row?.classList.add('social-notif-target');
  row?.scrollIntoView?.({block:'center',behavior:'smooth'});
  socialNotificationPaintBadge();
}
function socialNotificationActivity(viewUserId=null){
  const state=getState(),me=state.currentUserId,userId=viewUserId||me;
  if(!userById(state,userId))return;
  const events=socialNotificationInbox(userId),unread=events.filter(e=>!e.read).length;
  const sampleUsers=state.users.filter(u=>u.id!==me);
  const ownTarget=socialNotificationDemoTarget();
  const selected=userById(state,userId);
  const activityDialog = appDialog('Activity',`<p class="social-disclaimer">Local simulation only — real comment likes, cross-account alerts and Android push are not connected.</p>
    <div class="social-notif-tabs">
      <button type="button" data-notif-viewer="${escapeHTML(me)}" aria-pressed="${userId===me}">My sample inbox</button>
      ${sampleUsers.map(u=>`<button type="button" data-notif-viewer="${escapeHTML(u.id)}" aria-pressed="${userId===u.id}">@${escapeHTML(u.username)}</button>`).join('')}
    </div>
    <p class="social-notif-summary">Viewing @${escapeHTML(selected.username)} · ${unread} unread · ${events.length} local notifications</p>
    ${userId===me&&ownTarget?`<button type="button" data-notif-demo class="social-notif-demo">Test: simulate a friend liking my comment</button>`:''}
    <div class="social-notif-items" role="list">${events.map(event=>{
      const actor=userById(state,event.actorId),item=socialItem(state,event.itemId);
      const comment=item?.comments?.find(c=>c.id===event.commentId);
      return `<button type="button" role="listitem" data-notif-open="${escapeHTML(event.id)}" class="social-notif-event ${event.read?'':'is-unread'}">
        <img src="${safeMediaUrl(actor?.avatar||'')}" alt="">
        <span><strong>@${escapeHTML(actor?.username||'Sample account')}</strong> liked your comment
          <small>${escapeHTML((comment?.text||'').slice(0,90))}</small></span>
        ${event.read?'':'<i class="social-notif-dot" aria-label="Unread"></i>'}
      </button>`;
    }).join('')||'<p class="social-disclaimer">No sample notifications yet.</p>'}</div>
    ${unread?'<button type="button" data-notif-mark-all class="advanced-link-button">Mark all as read</button>':''}
    <p class="social-disclaimer">A real notification will require authenticated server records and a push provider.</p>`,dialog=>{
    dialog.querySelectorAll('[data-notif-viewer]').forEach(b=>b.addEventListener('click',()=>{
      const next=b.dataset.notifViewer;dialog.close();socialNotificationActivity(next);
    }));
    dialog.querySelector('[data-notif-demo]')?.addEventListener('click',()=>{
      if(ownTarget){
        socialNotificationSetReaction(ownTarget.itemId,ownTarget.commentId,ownTarget.actorId,true);
        dialog.close();socialNotificationActivity(me);socialNotificationPaintBadge();
      }
    });
    dialog.querySelectorAll('[data-notif-open]').forEach(b=>b.addEventListener('click',()=>{
      dialog.close();socialNotificationOpen(b.dataset.notifOpen,userId);
    }));
    dialog.querySelector('[data-notif-mark-all]')?.addEventListener('click',()=>{
      socialNotificationReadAll(userId);
      dialog.close();socialNotificationActivity(userId);socialNotificationPaintBadge();
    });
  });
  activityDialog?.classList?.add('cx-activity-fullscreen');
}
openSampleActivity=function(){socialNotificationActivity();};
function socialNotificationPaintBadge(){
  const state=getState(),count=socialNotificationUnread(state.currentUserId);
  const btn=document.getElementById('activityButton');
  if(btn){
    btn.classList.add('social-notif-bell');
    btn.querySelector('[data-notif-badge]')?.remove();
    if(count){
      const bubble=document.createElement('span');
      bubble.dataset.notifBadge='';bubble.className='social-notif-badge';bubble.textContent=String(Math.min(count,99))+(count>99?'+':'');
      btn.append(bubble);
    }
  }
  const theme=document.getElementById('themeButton');
  if(theme){
    let desktop=document.getElementById('socialDesktopActivity');
    if(!desktop){
      desktop=document.createElement('button');desktop.id='socialDesktopActivity';desktop.type='button';
      desktop.className='social-desktop-activity';desktop.setAttribute('aria-label','Open activity and notifications');
      theme.parentNode?.insertBefore(desktop,theme);
      desktop.addEventListener('click',()=>socialNotificationActivity());
    }
    desktop.textContent='♡ Activity'+(count?' · '+count:'');
  }
}
renderApp=function(){
  const result=notifOriginalRender();
  socialNotificationPaintBadge();
  return result;
};
