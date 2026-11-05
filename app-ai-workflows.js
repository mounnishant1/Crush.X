/* AURA-X whole-app local guidance. This is NOT a model, API client, or
 * autonomous agent. The single AURA-X dialog consumes these pure suggestions.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CrushXAIWorkflows=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const topics=[
  ['home','Home','Check story rings, feed refresh and comment sheets; keep every destination reachable.'],
  ['explore','Explore','Check category chips, live search state, empty results and grid-to-reel navigation.'],
  ['stories','Stories','Verify story rings, swipe/tap gestures, interactive stickers and publish-ready previews.'],
  ['reels','Reels','Verify one swipe equals one reel, playback ownership, sound, comments and export.'],
  ['posts','Posts','Review multi-photo selection, reorder, each-image edits, draft and publish confirmation.'],
  ['camera','Camera & AR','Check front camera, preview orientation, permissions, lens selection and frame rate.'],
  ['editor','Editor','Check selection, timeline trim, text, captions, stickers, audio and final export.'],
  ['stickers','Stickers','Check cutout transparency, brush/restore, animation timing, tracking and layer order.'],
  ['messages','Messages','Review unsent drafts, Primary/General switching, voice notes and delivery receipts.'],
  ['groups','Groups','Review participant roles, requests, privacy and group permission handling.'],
  ['calls','Calls','Check call permissions, ringing, audio route, recovery and disconnect states.'],
  ['live','Live','Check stream preview, audience comments, moderation, reconnect and end-live behavior.'],
  ['profile','Profile','Check avatar, follow/following readability, highlights and full-screen edit flows.'],
  ['notifications','Notifications','Check navigation deep links, badges, read status and notification preferences.'],
  ['settings','Settings','Review security, 2FA options, privacy, blocked accounts and logout.'],
  ['creator','Creator tools','Review creator analytics definitions, attribution, drafts and collaboration controls.'],
  ['moderation','Safety','Review reports, user appeals, blocking and safeguards against automated enforcement.'],
  ['ads','Ads','Review creative drafts, disclosure, targeting permissions, budget approvals and reporting.'],
  ['wallet','Wallet','Review gifts, ledger integrity, payment confirmations and dispute handling.'],
  ['offline','Offline nearby','Check QR pairing, device identity, encryption, reconnect and network transitions.'],
  ['music','Music','Review license eligibility, attribution, saved tracks, waveform and export sync.'],
  ['avatar','Avatar','Check facial rig, pose transitions, flip controls, animation and privacy.'],
  ['account','Account','Review login, Google/Cognito session, MFA and account switching.'],
  ['search','Search','Check query results, relevance, filters, history and profile/reel deep links.'],
  ['owner','Owner controls','Review audit receipts, deployment approval, system health and rollback gates.']
 ];
 const list=Object.freeze(topics.map(([id,title,check])=>Object.freeze({id,title,check})));
 const lookup=id=>list.find(item=>item.id===id)||null;
 const forTab=tab=>({home:'home',messages:'messages',create:'editor',
  discover:'explore',reels:'reels',profile:'profile'})[tab]||'home';
 function review(id,prompt){
  const topic=lookup(id);
  if(!topic)return null;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>300)
   return Object.freeze({title:topic.title+' — local guidance',steps:Object.freeze([
    'Describe the screen or behavior you want to improve; do not include secrets.'
   ]),limitations:'This local guide cannot inspect your current phone, repositories or live account.'});
  const p=prompt.trim().toLowerCase(),checks=[
   'Inspect the current screen and reproduce the issue with explicit steps.',
   topic.check,
   'Check empty, loading, permission-denied, offline and back-navigation states.',
   'Run automated regression tests and verify the behavior on a real Android device.'
  ];
  if(/tap|touch|scroll|swipe|gesture|click|overlap|animation|slide|flip|टच|स्वाइप/iu.test(p))
   checks.splice(2,0,'Test gesture ownership, focus, hit targets, clipping, transitions and reduced-motion mode.');
  if(/record|video|photo|camera|export|frame|audio|music|mp4/iu.test(p))
   checks.splice(2,0,'Compare live preview with saved media and verify orientation, timing, audio and permissions.');
  if(/message|call|payment|wallet|publish|deploy|delete|send|private|login|security/iu.test(p))
   checks.splice(2,0,'Require verified identity, user confirmation, idempotency and durable success receipts before any real action.');
  return Object.freeze({
   title:topic.title+' — local checklist',
   steps:Object.freeze(checks),
   limitations:'Rule-based local guidance only. No model connected, no private data read, no tools executed, and no changes applied.'
  });
 }
 return Object.freeze({list:()=>list.slice(),lookup,forTab,review});
});