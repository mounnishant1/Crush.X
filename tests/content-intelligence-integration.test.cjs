// node --test tests/content-intelligence-integration.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ai=require('../content-intelligence.js');
const {createPreviewBridge}=require('../app-content-intelligence.js');
const NOW=1800000000000;
function item(id,topics=['gaming'],extra={}){
 return {id,creatorId:id.split('_')[0],kind:'reel',caption:topics.join(' '),topics,
 status:'published',moderation:'approved',visibility:'public',publishedAt:NOW-86400000,...extra};
}
function sample(now=NOW){
 return {currentUserId:'me',users:[{id:'me'},{id:'user_1',following:true}],
 reels:[{id:'reel_1',userId:'user_1',caption:'Cook pasta tonight'}],
 posts:[{id:'post_1',userId:'me',caption:'Gaming today'}, {id:'post_2',userId:'user_1',caption:'Cooking dinner'}],
 stories:[{id:'story_1',userId:'me',expiresAt:now+86400000}],
 socialHiddenIds:[],socialMutedIds:[]};
}
test('core ranking respects explicit opt-in and no cross-user event transfer',()=>{
 const e={viewerId:'other',action:'save',topics:['cooking']};
 assert.equal(ai.userProfile({viewerId:'me',events:[e],consented:true}).weights.cooking,undefined);
 const q={viewerId:'me',items:[item('a_1',['gaming']),item('b_1',['cooking'])],now:NOW};
 assert.equal(ai.rankContent({...q,consented:true,explicitInterests:['cooking']})[0].item.id,'b_1');
});
test('core excludes private, unapproved, deleted and expired content',()=>{
 const candidates=[item('a_1',['cooking'],{visibility:'private'}),item('b_1',['cooking'],{status:'deleted'}),
 item('c_1',['cooking'],{moderation:'rejected'}),item('d_1',['cooking'],{kind:'story',expiresAt:NOW-1})];
 assert.equal(ai.rankContent({viewerId:'me',items:candidates,now:NOW}).length,0);
 const q=ai.answerQuestion({viewerId:'me',analysisConsent:true,question:'cooking',items:candidates,now:NOW});
 assert.equal(q.sources.length,0);
});
test('source-backed answer abstains without matching evidence',()=>{
 const q=ai.answerQuestion({viewerId:'me',analysisConsent:true,question:'pasta',items:[item('a_1',['cooking'],{caption:'Cooking pasta'})],now:NOW});
 assert.equal(q.sources[0].id,'a_1');
 assert.equal(q.modelUsed,false);
 assert.equal(ai.answerQuestion({viewerId:'me',analysisConsent:true,question:'quantum',items:[],now:NOW}).sources.length,0);
});
test('core rejects sensitive topics and unauthorized types',()=>{
 const p=ai.userProfile({viewerId:'me',consented:true,explicitInterests:['religion','politics','gaming']});
 assert.deepEqual({...p.weights},{gaming:4});
 assert.equal(ai.rankContent({viewerId:'me',items:[item('a_1',['gaming'],{kind:'dm'})],now:NOW}).length,0);
});
test('browser preview only indexes known sample IDs',()=>{
 const state=sample();state.reels.push({id:'unknown_secret',userId:'user_1',caption:'private secrets'});
 const bridge=createPreviewBridge({getState:()=>state,now:()=>NOW});
 assert.deepEqual(bridge.rank('reel').map(x=>x.id),['reel_1']);
 bridge.consent(true);assert.equal(bridge.ask('private secrets').sources.length,0);
 assert.equal(bridge.ask('pasta').sources[0].id,'reel_1');
});
test('browser preview respects hidden and muted creators for Q&A and ranking',()=>{
 const state=sample();state.socialHiddenIds=['post_1'];state.socialMutedIds=['user_1'];
 const bridge=createPreviewBridge({getState:()=>state,now:()=>NOW});bridge.consent(true);
 assert.equal(bridge.rank('reel').length,0);
 assert.equal(bridge.ask('pasta').sources.length,0);
});
test('not interested hides item even without profiling',()=>{
 const bridge=createPreviewBridge({getState:()=>sample(),now:()=>NOW});
 assert.equal(bridge.hide('post_1','post'),true);
 assert.deepEqual(bridge.rank('post').map(x=>x.id),['post_2']);
 bridge.reset();
 assert.deepEqual(bridge.rank('post').map(x=>x.id),['post_1','post_2']);
});
test('personalization expires and account switch clears memory',()=>{
 let now=NOW,state=sample();
 const bridge=createPreviewBridge({getState:()=>state,now:()=>now});
 bridge.consent(true);bridge.record('like','reel_1','reel');
 assert.equal(bridge.status().signalCount,1);
 now+=900001;
 assert.equal(bridge.status().consented,false);
 assert.equal(bridge.status().signalCount,0);
 bridge.consent(true);
 state={...state,currentUserId:'another'};
 assert.equal(bridge.status().consented,false);
});
test('app and single AURA assistant include the integration scripts and controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const aura=fs.readFileSync(path.join(__dirname,'..','aura-x-assistant.js'),'utf8');
 assert.ok(html.includes('src="./content-intelligence.js"'));
 assert.ok(html.includes('src="./app-content-intelligence.js"'));
 assert.ok(html.includes('data-content-hide'));
 assert.ok(html.includes('data-content-why'));
 assert.ok(aura.includes('data-ax-content-ask'));
 assert.ok(aura.includes('data-ax-content-allow'));
 assert.ok(aura.includes("permissions.authorized(currentOwner(),'analyse:content')"));
});
