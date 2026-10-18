const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app-experience.css'),'utf8');
assert.match(html,/href="\.\/app-experience\.css"/);
for(const name of ['.story-viewer','.sv-progress','.sv-reactions','.reels-deck','.reel-slide','scroll-snap-type:y mandatory','.explore-screen','.explore-grid'])assert.ok(css.includes(name),name);

const handlers={};
const dialogs=[];
const noop={addEventListener(){}};
const document={
  hidden:false,activeElement:null,
  body:{classList:{toggle(){}},append(dialog){dialogs.push(dialog);}},
  getElementById(id){return ['cancelConfirmation','authForm','switchAuthButton','confirmButton','resendButton','forgotButton'].includes(id)?noop:null;},
  querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){},
  createElement(tag){
    assert.equal(tag,'dialog');
    return {open:false,innerHTML:'',removed:false,
      setAttribute(){},addEventListener(type,fn){this.events||={};this.events[type]=fn;},
      querySelectorAll(){return [];},querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}
    };
  }
};
const context=vm.createContext({
  document,console,Date,URL,setInterval,clearInterval,setTimeout,clearTimeout,
  window:{addEventListener(){},scrollTo(){}},location:{hash:''},history:{pushState(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}
});
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);
vm.runInContext(inline,context,{filename:'index.html'});
vm.runInContext(fs.readFileSync(path.join(root,'app-improvements.js'),'utf8'),context,{filename:'app-improvements.js'});
const run=source=>vm.runInContext(source,context);

// Real local story array: viewer must open for a valid live story and skip expired content.
run('openSampleStory("story_2")');
assert.equal(dialogs.length,1);
assert.equal(run('storyViewerIndex'),1);
assert.match(dialogs[0].innerHTML,/sv-progress/);
assert.match(dialogs[0].innerHTML,/data-sv="reaction"/);
assert.match(dialogs[0].innerHTML,/Draft a reply \(not sent\)/);
assert.match(dialogs[0].innerHTML,/Nothing is sent or published/);
assert.match(dialogs[0].innerHTML,/data-lucide="pause"/);
assert.ok(dialogs[0].events.keydown);
dialogs[0].events.keydown({key:'ArrowRight',preventDefault(){},target:{matches(){return false;}}});
assert.equal(run('storyViewerIndex'),2);
dialogs[0].events.keydown({key:'ArrowLeft',preventDefault(){},target:{matches(){return false;}}});
assert.equal(run('storyViewerIndex'),1);
dialogs[0].events.focusin({target:{matches(selector){return selector==='[data-sv-reply]';}}});
assert.equal(run('storyViewerPaused'),true);
dialogs[0].events.input({target:{value:'test unsent reply',matches(selector){return selector==='[data-sv-reply]';}}});
assert.equal(run('storyViewerDrafts["story_2"]'),'test unsent reply');
dialogs[0].events.submit({target:{matches(selector){return selector==='[data-sv-reply-form]';}},preventDefault(){}});
assert.match(dialogs[0].innerHTML,/no message sent/);
dialogs[0].events.pointerdown({pointerId:3,clientX:250,target:{closest(selector){return selector==='[data-sv-stage]'?{setPointerCapture(){}}:null;}}});
dialogs[0].events.pointerup({pointerId:3,clientX:120});
assert.equal(run('storyViewerIndex'),2);
run('storyViewerMove(-1)');
const eventFor=(action,props={})=>({target:{closest(selector){return selector==='[data-sv]'?{dataset:{sv:action,...props}}:null;}}});
context.clickEvent=eventFor('reaction',{svEmoji:'🔥'});
run('storyViewerHandleClick(clickEvent)');
assert.equal(run('storyViewerPaused'),true);
assert.match(dialogs[0].innerHTML,/reaction preview only/);
run('storyViewerMove(1)');
assert.equal(run('storyViewerIndex'),2);
assert.equal(run('storyViewerPaused'),false);
assert.match(dialogs[0].innerHTML,/sv-progress/);
run('storyViewerMove(-1)');
assert.equal(run('storyViewerIndex'),1);
run('storyViewerDrafts["story_2"]="hello, local only";storyViewerStatus="";storyViewerPaint()');
assert.match(dialogs[0].innerHTML,/hello, local only/);
run('storyViewerStatus="<script>alert(1)<\/script>";storyViewerPaint()');
assert.doesNotMatch(dialogs[0].innerHTML,/<script>alert/);
assert.match(dialogs[0].innerHTML,/&lt;script&gt;/);
run('closeStoryViewer()');
assert.equal(dialogs[0].removed,true);
assert.equal(run('storyViewerDialog'),null);
assert.equal(run('storyViewerTimer'),null);
run('openSampleStory("missing")');
assert.equal(dialogs.length,1);

// Reel cards now have full-height snap slides and every exposed local control is bound.
const reels=run('renderReels(getState())');
for(const item of ['reels-deck','reel-slide','data-reel-visual','data-like="reel_1"','data-comment-input="reel_1"','data-comment-send="reel_1"','data-share="reel_1"','data-save="reel_1"','data-reel-speed','data-reel-mute','data-reel-audio','data-reel-template','data-reel-caption','data-lucide="bookmark"'])assert.ok(reels.includes(item),item);
assert.match(reels,/Sample photo reel/);
assert.match(reels,/Local sample preview/);
run('{const s=getState();s.reels[0].caption="<img onerror=alert(1)>";saveState(s);}');
assert.doesNotMatch(run('renderReels(getState())'),/<img onerror=alert\(1\)>/);
assert.match(run('renderReels(getState())'),/&lt;img/);

// Existing Search destination now finds local posts, reels, people and caption hashtags.
run('appExploreFilter="all"');
const discover=run('renderDiscover(getState())');
for(const field of ['id="searchInput"','data-explore-filter="people"','data-explore-filter="posts"','data-explore-filter="reels"','data-explore-filter="tags"','data-open-local-item="post_1"','data-open-local-item="reel_1"','data-follow-user'])assert.ok(discover.includes(field),field);
run('appExploreFilter="reels"');
assert.match(run('renderDiscover(getState())'),/data-open-local-item="reel_1"/);
assert.doesNotMatch(run('renderDiscover(getState())'),/data-open-local-item="post_1"/);
run('appExploreFilter="posts"');
assert.match(run('renderDiscover(getState())'),/data-open-local-item="post_1"/);
assert.doesNotMatch(run('renderDiscover(getState())'),/data-open-local-item="reel_1"/);
run('{const s=getState();s.posts[0].caption="#CrushX sunset";saveState(s);appExploreFilter="tags";}');
assert.match(run('renderDiscover(getState())'),/data-explore-tag="CrushX"/);
run('{const s=getState();s.searchQuery="<img onerror=alert(1)>";saveState(s);}');
assert.doesNotMatch(run('renderDiscover(getState())'),/<img onerror=alert\(1\)>/);
assert.match(run('renderDiscover(getState())'),/&lt;img/);

console.log('Story viewer, Reel and Explore flow/icon/security checks PASS');
