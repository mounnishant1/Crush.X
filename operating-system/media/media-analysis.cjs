'use strict';
const {TOPICS}=require('../recommendations/interest-engine.cjs');
const SAFE_TOPIC=new Set(TOPICS),KINDS=new Set(['reel','story','post']);
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(x);
function createMediaAnalysisService({permissions,audit,checkConsent,resolveMedia,inferMedia}={}){
 if(typeof permissions?.issue!=='function'||typeof permissions?.check!=='function'||
  typeof audit?.record!=='function'||typeof checkConsent!=='function'||
  typeof resolveMedia!=='function'||typeof inferMedia!=='function')
  throw TypeError('MEDIA_TRUSTED_ADAPTERS_REQUIRED');
 async function analyze({credential,subject,mediaId}={}){
  if(!validId(subject)||!validId(mediaId))throw Error('MEDIA_REQUEST_INVALID');
  const grant=await permissions.issue({credential,capability:'media:analyze',resourceOwner:subject});
  if(await checkConsent({subject,mediaId,scope:'media:analyze'})!==true)
   throw Error('MEDIA_CONSENT_REQUIRED');
  const media=await resolveMedia({subject,mediaId});
  if(!media||media.ownerSubject!==subject||!KINDS.has(media.kind)||
   media.id!==mediaId||media.ready!==true)
   throw Error('MEDIA_NOT_OWNED_OR_READY');
  // Only trusted backend reference is passed to an authorized inference adapter;
  // do not accept arbitrary URL/host or raw private file from browser input.
  await permissions.check(grant,'media:analyze',subject);
  await audit.record({event:'media.analysis.started',subject,capability:'media:analyze'});
  const report=await inferMedia({subject,mediaRef:mediaId,kind:media.kind,
   allowTraining:false,requestedTasks:['visual_topics','speech_captions','summary']});
  if(!report||typeof report!=='object'||typeof report.summary!=='string'||
    report.summary.length>1500||!Array.isArray(report.topics)||report.topics.length>20)
    throw Error('MEDIA_RESULT_INVALID');
  const topics=[...new Set(report.topics.filter(x=>SAFE_TOPIC.has(x)))].slice(0,8);
  const captions=typeof report.captions==='string'?report.captions.slice(0,2200):'';
  await permissions.check(grant,'media:analyze',subject);
  await audit.record({event:'media.analysis.completed',subject,capability:'media:analyze'});
  return Object.freeze({mediaId,kind:media.kind,summary:report.summary,topics:Object.freeze(topics),
   captions,verifiedDeviceExport:false,modelAnalysis:true,trainingAllowed:false});
 }
 return Object.freeze({analyze});
}
module.exports=Object.freeze({createMediaAnalysisService});