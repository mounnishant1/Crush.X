// Comment-like activity is a browser-only preview. Server notifications must use authenticated actors.
const notificationOriginalModifyComment=advancedModifyComment;
const notificationOriginalActivity=openSampleActivity;
const notificationOriginalRenderApp=renderApp;

function notificationForMe(state){
  return (state.socialNotifications||[]).filter(n=>n.recipientId===state.currentUserId)
    .sort((a,b)=>b.createdAt-a.createdAt).slice(0,100);
}
function notificationUnreadCount(state){
  return notificationForMe(state).filter(n=>!n.readAt).length;
}
function notificationRefreshBadges(){
  if(typeof document==='undefined'||!document.querySelectorAll)return;
  const count=notificationUnreadCount(getState());
  document.querySelectorAll('[data-cxn-count]').forEach(b=>{
    b.textContent=count>99?'99+':String(count);
    b.hidden=count===0;
  });
}
function notificationSetCommentLike(itemId,commentId,actorId,shouldLike){
  const s=getState(),item=socialItem(s,itemId),comment=item?.comments?.find(c=>c.id===commentId);
  if(!comment||!userById(s,actorId)||typeof shouldLike!=='boolean')return false;
  const likedBy=new Set(Array.isArray(comment.likedBy)?comment.likedBy:comment.liked?['me']:[]);
  if(likedBy.has(actorId)===shouldLike)return false;
  if(shouldLike)likedBy.add(actorId);else likedBy.delete(actorId);
  comment.likedBy=[...likedBy];
  comment.liked=likedBy.has(s.currentUserId);
  comment.likes=Math.max(0,Number(comment.likes||0)+(shouldLike?1:-1));
  s.socialNotifications||=[];
  // Remove a revoked like from the sample inbox; repeated like calls never fan out twice.
  s.socialNotifications=s.socialNotifications.filter(n=>!(n.type==='comment_like'&&n.itemId===itemId&&n.commentId===commentId&&n.actorId===actorId));
  if(shouldLike&&comment.userId&&comment.userId!==actorId&&userById(s,comment.userId)){
    s.socialNotifications.unshift({
      id:'notify_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),
      type:'comment_like',recipientId:comment.userId,actorId,itemId,commentId,
      createdAt:Date.now(),readAt:0
    });
  }
  s.socialNotifications=s.socialNotifications.slice(0,100);
  saveState(s);notificationRefreshBadges();return true;
}
advancedModifyComment=function(itemId,id,action,text=''){
  if(action==='like'){
    const s=getState(),comment=socialItem(s,itemId)?.comments?.find(c=>c.id===id);
    if(!comment)return false;
    return notificationSetCommentLike(itemId,id,s.currentUserId,!(comment.likedBy||[]).includes(s.currentUserId));
  }
  const changed=notificationOriginalModifyComment(itemId,id,action,text);
  // normalizeState removes notifications pointing to deleted comments or child replies.
  if(changed&&action==='delete')notificationRefreshBadges();
  return changed;
};
function notificationMarkRead(id){
  const s=getState(),n=(s.socialNotifications||[]).find(n=>n.id===id&&n.recipientId===s.currentUserId);
  if(!n)return false;
  if(!n.readAt){n.readAt=Date.now();saveState(s);}
  notificationRefreshBadges();return true;
}
function notificationMarkAllRead(){
  const s=getState();let changed=0;
  for(const n of s.socialNotifications||[]){
    if(n.recipientId===s.currentUserId&&!n.readAt){n.readAt=Date.now();changed++;}
  }
  if(changed)saveState(s);
  notificationRefreshBadges();return changed;
}
function notificationOpenComment(id){
  const state=getState(),n=(state.socialNotifications||[]).find(n=>n.id===id&&n.recipientId===state.currentUserId);
  if(!n)return false;
  notificationMarkRead(id);
  if(!socialItem(getState(),n.itemId)?.comments?.some(c=>c.id===n.commentId))return false;
  advancedComments(n.itemId);
  const rows=document.querySelectorAll?.('[data-advanced-comment-id]')||[];
  const target=[...rows].find(row=>row.dataset.advancedCommentId===n.commentId);
  if(target){
    target.classList.add('cxn-highlight');
    target.setAttribute('tabindex','-1');
    target.focus?.({preventScroll:true});
    target.scrollIntoView?.({block:'center'});
  }
  return true;
}
function notificationPreviewFriendLike(){
  // Explicit QA simulation, never presented as another person's real action.
  const s=getState(),mine=[...s.posts,...s.reels]
    .flatMap(item=>(item.comments||[]).filter(c=>c.userId===s.currentUserId).map(c=>({item,c})))[0];
  if(!mine)return 'Write a local comment first, then test a sample friend Like.';
  const actor=s.users.find(u=>u.id!==s.currentUserId&&u.id!==mine.c.userId);
  if(!actor)return 'No sample friend available.';
  if((mine.c.likedBy||[]).includes(actor.id)){
    notificationSetCommentLike(mine.item.id,mine.c.id,actor.id,false);
    return 'Sample friend Like removed locally.';
  }
  notificationSetCommentLike(mine.item.id,mine.c.id,actor.id,true);
  return 'Sample friend Like created locally; no real person was notified.';
}
openSampleActivity=function(){
  const s=getState(),notes=notificationForMe(s),unread=notificationUnreadCount(s);
  const rows=notes.map(n=>{
    const actor=userById(s,n.actorId),item=socialItem(s,n.itemId),c=item?.comments?.find(x=>x.id===n.commentId);
    if(!actor||!c)return '';
    return `<button type="button" class="cxn-row ${n.readAt?'':'cxn-unread'}" data-cxn-open="${escapeHTML(n.id)}">
      <img src="${safeMediaUrl(actor.avatar)}" alt="" loading="lazy">
      <span><strong>@${escapeHTML(actor.username)}</strong> liked your comment
        <small>“${escapeHTML(c.text.slice(0,100))}” · ${escapeHTML(socialKind(s,item))} · ${n.readAt?'Read':'New'}</small></span>
      <span aria-hidden="true">♥</span></button>`;
  }).join('');
  appDialog('Activity · sample inbox',`<p class="social-disclaimer">Local preview only: no live users, remote alerts or push delivery. ${unread} unread.</p>
    <div class="cxn-activity-actions"><button type="button" data-cxn-mark-all>Mark all read</button>
    <button type="button" data-cxn-demo>Test sample friend Like</button></div>
    <p data-cxn-status role="status" class="social-disclaimer">The test action is simulated and stays in this browser.</p>
    <div class="cxn-inbox" aria-label="Comment notifications">${rows||'<p>No comment-like notifications for this sample persona yet.</p>'}</div>`,dialog=>{
    dialog.querySelector('[data-cxn-mark-all]').onclick=()=>{notificationMarkAllRead();dialog.close();openSampleActivity();};
    dialog.querySelector('[data-cxn-demo]').onclick=()=>{
      const msg=notificationPreviewFriendLike();dialog.close();openSampleActivity();
      const status=document.querySelector('dialog[data-app-dialog] [data-cxn-status]');
      if(status)status.textContent=msg;
    };
    dialog.querySelectorAll('[data-cxn-open]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.cxnOpen;dialog.close();notificationOpenComment(id);
    }));
  });
};
renderApp=function(){
  notificationOriginalRenderApp();
  const count=notificationUnreadCount(getState());
  const badge=()=>{
    const el=document.createElement('span');
    el.className='cxn-badge';el.dataset.cxnCount='';
    el.textContent=count>99?'99+':String(count);el.hidden=count===0;return el;
  };
  const mobile=document.getElementById('activityButton');
  if(mobile){mobile.classList.add('cxn-button');mobile.append(badge());mobile.setAttribute('aria-label','Activity and notifications, '+count+' unread');}
  const theme=document.getElementById('themeButton');
  if(theme?.parentElement){
    const desktop=document.createElement('button');
    desktop.type='button';desktop.className='cxn-button cxn-desktop-button';
    desktop.setAttribute('aria-label','Activity and notifications, '+count+' unread');
    desktop.textContent='♥';desktop.append(badge());desktop.addEventListener('click',openSampleActivity);
    theme.parentElement.insertBefore(desktop,theme);
  }
};
