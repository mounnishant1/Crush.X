'use strict';
// Whole-app AURA-X advisory workflows. All AI results are suggestions, never
// executable tool calls. The caller must supply real, trusted consent storage.
const MODULES=Object.freeze([
 'home','explore','stories','reels','posts','camera','editor','stickers',
 'messages','groups','calls','live','profile','notifications','settings',
 'creator','moderation','ads','wallet','offline','music','avatar','account','search'
]);
const OWNER_MODULES=Object.freeze(['owner']);
const descriptions=Object.freeze({
 home:'Help organize a social home feed and accessibility choices.',
 explore:'Suggest search and discovery improvements without personalizing from hidden data.',
 stories:'Suggest interactive Story layout, captions and accessibility.',
 reels:'Suggest reel structure, hooks, pacing and rights checks.',
 posts:'Suggest post copy, carousel ordering and accessibility.',
 camera:'Explain camera and AR lens options without taking a photo.',
 editor:'Suggest non-destructive edit operations and preview checks.',
 stickers:'Suggest sticker editing, transparency and timing workflows.',
 messages:'Suggest an unsent reply. Do not transmit or fetch inbox content.',
 groups:'Suggest group-management and safety guidance without changing membership.',
 calls:'Explain call setup and privacy. Do not initiate or record calls.',
 live:'Suggest live-stream setup and moderation plans without broadcasting.',
 profile:'Suggest account-owned profile and accessibility improvements.',
 notifications:'Suggest user-controlled notification settings.',
 settings:'Explain privacy settings and authentication options.',
 creator:'Suggest creator analytics questions without inventing metrics.',
 moderation:'Suggest safety review; never ban or remove accounts.',
 ads:'Suggest ad creative and compliance checks; never purchase or publish ads.',
 wallet:'Explain wallet and gifting safeguards; never debit, credit or transfer value.',
 offline:'Explain nearby encrypted messaging and pairing precautions.',
 music:'Suggest licensed-audio selection and attribution checks.',
 avatar:'Suggest facial rig and animation editing without biometrics processing.',
 account:'Explain account security without collecting credentials or OTPs.',
 search:'Suggest query refinement using only the user-provided words.',
 owner:'Suggest OS diagnostics and release checklists; never access infra or deploy.'
});
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const allowedArgs=value=>isObject(value)&&Object.keys(value).length>=1&&
 Object.keys(value).every(key=>['prompt','context'].includes(key))&&
 typeof value.prompt==='string'&&value.prompt.trim().length>0&&value.prompt.length<=1000&&
 (!Object.hasOwn(value,'context')||(typeof value.context==='string'&&value.context.length<=1000));
function registerAIWorkflows({tasks,aura,modelProvider,checkConsent}={}){
 if(!tasks||typeof tasks.registerAction!=='function'||!aura||typeof aura.registerTool!=='function')
  throw TypeError('AI_WORKFLOW_DEPENDENCIES_REQUIRED');
 // Fail closed: a model and an independently verified consent service are BOTH
 // required. A browser-supplied checkbox is not trusted consent.
 if(modelProvider===undefined||checkConsent===undefined)
  return Object.freeze({configured:Object.freeze([]),reason:'MODEL_AND_CONSENT_NOT_CONFIGURED'});
 if(!modelProvider||typeof modelProvider.suggest!=='function'||typeof checkConsent!=='function')
  throw TypeError('MODEL_AND_TRUSTED_CONSENT_REQUIRED');
 const ids=[...MODULES,...OWNER_MODULES];
 for(const id of ids){
  const owner=OWNER_MODULES.includes(id);
  const action='ai.guide.'+id, tool='ai.'+id+'.guide';
  tasks.registerAction({
   name:action,capability:owner?'os:health':'aura:use',maxAttempts:1,
   handler:async(payload,ctx)=>{
    // Revalidate consent at execution time, not only when a task is queued.
    // Require explicit account + workflow grant in the trusted server store.
    const allowed=await checkConsent({subject:ctx.subject,workflow:id,owner});
    if(allowed!==true)throw Error('AI_CONSENT_REQUIRED');
    const answer=await modelProvider.suggest({
     subject:ctx.subject,workflow:id,prompt:payload.prompt,
     context:payload.context||'',instruction:descriptions[id],
     mode:'advice_only',jobId:ctx.jobId
    });
    if(typeof answer!=='string'||!answer.trim()||answer.length>2500)
     throw Error('MODEL_OUTPUT_INVALID');
    return {workflow:id,suggestion:answer,executed:false,published:false,sent:false,
      broadcast:false,charged:false,origin:'configured_model'};
   }
  });
  aura.registerTool({name:tool,action,risk:'low',validateArgs:allowedArgs});
 }
 return Object.freeze({configured:Object.freeze(ids.map(id=>'ai.'+id+'.guide')),reason:'SERVER_ADAPTERS_REQUIRED'});
}
module.exports=Object.freeze({MODULES,OWNER_MODULES,descriptions,allowedArgs,registerAIWorkflows});