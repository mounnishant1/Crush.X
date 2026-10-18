const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const asset of ['social-notifications.css','social-notifications.js'])assert.ok(html.includes('./'+asset),asset);
const empty={addEventListener(){}},app={innerHTML:''};
const doc={
  activeElement:null,body:{classList:{toggle(){}}},
  getElementById(id){return id==='app'?app:['cancelConfirmation','authForm','switchAuthButton','confirmButton','resendButton','forgotButton'].includes(id)?empty:null;},
  querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}
};
let storage=null;
const ctx=vm.createContext({console,Date,Math,URL,document:doc,location:{hash:''},history:{pushState(){}},
  window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return storage;},setItem(k,v){storage=v;},removeItem(){storage=null;}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx,{filename:'index.html'});
for(const name of ['app-improvements.js','social-interactions.js','social-advanced.js','social-notifications.js']){
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx,{filename:name});
}
const run=code=>vm.runInContext(code,ctx);
assert.equal(run('socialNotificationUnread("me")'),0);
assert.equal(run('socialNotificationInbox("user_1").length'),0);
const before=run('getState().posts[0].comments[0].likes');
let r=run('socialNotificationSetReaction("post_1","c_0","me",true)');
assert.equal(r.ok,true);assert.equal(r.notified,true);
assert.equal(run('getState().posts[0].comments[0].likes'),before+1);
assert.equal(run('socialNotificationUnread("user_1")'),1);
assert.equal(run('socialNotificationUnread("me")'),0);
r=run('socialNotificationSetReaction("post_1","c_0","me",true)');
assert.equal(r.changed,false);assert.equal(run('socialNotificationInbox("user_1").length'),1);
r=run('socialNotificationSetReaction("post_1","c_0","me",false)');
assert.equal(r.changed,true);assert.equal(run('socialNotificationInbox("user_1").length'),0);
const own=run('getState().posts.find(p=>p.id==="post_2").comments[0].id');ctx.own=own;
assert.equal(run('socialNotificationSetReaction("post_2",own,"me",true).notified'),false);
assert.equal(run('socialNotificationUnread("me")'),0);
run('socialNotificationSetReaction("post_2",own,"me",false)');
r=run('socialNotificationSetReaction("post_2",own,"user_1",true)');
assert.equal(r.notified,true);
assert.equal(run('socialNotificationUnread("me")'),1);
const id=run('socialNotificationInbox("me")[0].id');ctx.notificationId=id;
assert.equal(run('socialNotificationRead(notificationId,"user_1")'),false);
assert.equal(run('socialNotificationRead(notificationId,"me")'),true);
assert.equal(run('socialNotificationUnread("me")'),0);
assert.equal(run('socialNotificationInbox("me")[0].read'),true);
assert.equal(run('socialNotificationReadAll("me")'),0);
run('socialNotificationSetReaction("post_2",own,"user_1",false)');
assert.equal(run('socialNotificationInbox("me").length'),0);
run('socialNotificationSetReaction("post_2",own,"user_1",true)');
assert.equal(run('socialNotificationUnread("me")'),1);
assert.equal(run('socialNotificationReadAll("me")'),1);
assert.equal(run('socialNotificationUnread("me")'),0);
assert.equal(run('socialNotificationSetReaction("post_2","invalid","user_1",true).ok'),false);
assert.equal(run('socialNotificationSetReaction("post_2",own,"fake",true).ok'),false);
assert.equal(run('socialNotificationSetReaction("post_2",own,"user_1",true).changed'),false);
run('socialNotificationSetReaction("post_2",own,"user_1",false)');
run('socialNotificationSetReaction("post_2",own,"user_1",true)');
assert.equal(run('socialNotificationUnread("me")'),1);
run('{let s=getState();s.socialNotifications.push({id:"bad_event",type:"comment_like",actorId:"missing",recipientId:"me",itemId:"post_2",commentId:"c_0",read:false,createdAt:100});saveState(s);}');
assert.equal(run('socialNotificationInbox("me").some(n=>n.id==="bad_event")'),false);
run('appDialog=(title,body)=>{globalThis.lastInbox={title,body};}');
run('socialNotificationActivity()');
assert.equal(ctx.lastInbox.title,'Activity');
assert.match(ctx.lastInbox.body,/liked your comment/);
assert.match(ctx.lastInbox.body,/data-notif-open=/);
assert.match(ctx.lastInbox.body,/Mark all as read/);
assert.match(ctx.lastInbox.body,/Test: simulate a friend liking my comment/);
assert.match(ctx.lastInbox.body,/Local simulation only/);
run('advancedModifyComment("post_2",own,"delete")');
assert.equal(run('socialNotificationInbox("me").length'),0);
const malicious='evil <img src=x onerror=alert(1)>';
run('{const s=getState();s.posts[0].comments[0].text="evil <img src=x onerror=alert(1)>";saveState(s);}');
run('socialNotificationSetReaction("post_1","c_0","me",true)');
run('socialNotificationActivity("user_1")');
assert.doesNotMatch(ctx.lastInbox.body,/<img src=x onerror/);
assert.match(ctx.lastInbox.body,/&lt;img/);
console.log('Comment-like notification ownership, dedupe, unlike, read, deep-link data and XSS checks PASS');
