const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const asset of ['social-advanced.js','social-advanced.css'])assert.ok(html.includes('./'+asset),asset);
const empty={addEventListener(){}},document={
  activeElement:null,body:{classList:{toggle(){}}},
  getElementById(id){return ['cancelConfirmation','authForm','switchAuthButton','confirmButton','resendButton','forgotButton'].includes(id)?empty:null;},
  querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}
};
let stored=null;
const context=vm.createContext({console,Date,URL,Math,document,location:{hash:''},history:{pushState(){}},window:{addEventListener(){},scrollTo(){}},
  localStorage:{getItem(){return stored;},setItem(_k,v){stored=v;},removeItem(){stored=null;}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context,{filename:'index.html'});
for(const file of ['app-improvements.js','social-interactions.js','social-advanced.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=s=>vm.runInContext(s,context);
assert.match(run('renderHome(getState())'),/data-advanced-comments="post_1"/);
assert.match(run('renderReels(getState())'),/data-advanced-reel-menu="reel_1"/);
assert.match(run('renderProfile(getState())'),/data-advanced-library/);
assert.equal(run('advancedAddComment("post_1","New local comment")'),true);
const id=run('getState().posts[0].comments.at(-1).id');
context.replyId=id;
assert.equal(run('advancedAddComment("post_1","@me reply",replyId)'),true);
assert.equal(run('getState().posts[0].comments.at(-1).parentId'),id);
assert.equal(run('advancedModifyComment("post_1",replyId,"like")'),true);
assert.equal(run('getState().posts[0].comments.find(c=>c.id===replyId).likes'),1);
assert.equal(run('advancedModifyComment("post_1",replyId,"edit","Changed")'),true);
assert.equal(run('getState().posts[0].comments.find(c=>c.id===replyId).text'),'Changed');
assert.equal(run('advancedModifyComment("post_1",replyId,"delete")'),true);
assert.equal(run('getState().posts[0].comments.some(c=>c.parentId===replyId)'),false);
const col=run('advancedCreateCollection("Travel")');context.col=col;
assert.ok(col.startsWith('collection_'));
assert.equal(run('advancedSetCollection("post_2",col,true)'),true);
assert.equal(run('getState().socialCollections[0].itemIds.includes("post_2")'),true);
assert.equal(run('getState().posts.find(p=>p.id==="post_2").saved'),true);
assert.equal(run('advancedSetCollection("post_2",col,false)'),true);
assert.equal(run('getState().socialCollections[0].itemIds.includes("post_2")'),false);
run('advancedToggleHidden("post_2")');
assert.doesNotMatch(run('renderHome(getState())'),/data-like="post_2"/);
run('advancedToggleHidden("post_2")');
assert.match(run('renderHome(getState())'),/data-like="post_2"/);
run('advancedToggleMute("user_1")');
assert.doesNotMatch(run('renderHome(getState())'),/data-like="post_2"/);
run('advancedToggleMute("user_1")');
assert.match(run('renderHome(getState())'),/data-like="post_2"/);
run('{const s=getState();s.socialStoryDrafts=[{id:"storydraft_demo",itemId:"post_1",note:"A draft"}];saveState(s);}');
assert.equal(run('getState().socialStoryDrafts[0].note'),'A draft');
run('{const s=getState();s.posts[0].comments.push({id:"evil",parentId:null,user:"<script>alert(1)</script>",text:"<img src=x onerror=alert(1)>"});saveState(s);}');
run('appDialog=(title,body)=>{globalThis.testModal={title,body};}');
run('advancedComments("post_1")');
assert.doesNotMatch(context.testModal.body,/<script>|<img src=x/);
assert.match(context.testModal.body,/&lt;script&gt;/);
console.log('Advanced social threads, collections, Story drafts and hidden/muted source checks PASS');
