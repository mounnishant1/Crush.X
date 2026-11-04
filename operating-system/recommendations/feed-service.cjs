'use strict';
const {createInterestEngine}=require('./interest-engine.cjs');
const FEEDS=new Set(['home','reels','explore','stories','posts']);
function createFeedService({permissions,audit,checkConsent,readCatalog,readExclusions,now=Date.now}={}){
 if(!permissions||typeof permissions.issue!=='function'||typeof permissions.check!=='function'||
  !audit||typeof audit.record!=='function'||typeof checkConsent!=='function'||
  typeof readCatalog!=='function'||typeof readExclusions!=='function')
  throw TypeError('FEED_TRUSTED_ADAPTERS_REQUIRED');
 const engine=createInterestEngine({checkConsent,now});
 async function authorize(credential,subject){
  const grant=await permissions.issue({credential,capability:'feed:personalize',resourceOwner:subject});
  const actor=await permissions.check(grant,'feed:personalize',subject);
  if(actor.subject!==subject)throw Error('ACCESS_DENIED');
  return grant;
 }
 async function record({credential,subject,event}={}){
  const grant=await authorize(credential,subject);
  if(await checkConsent(subject)!==true)throw Error('INTEREST_CONSENT_REQUIRED');
  await audit.record({event:'feed.event.accepted',subject,capability:'feed:personalize'});
  await permissions.check(grant,'feed:personalize',subject);
  return engine.record(subject,event);
 }
 async function recommend({credential,subject,feed='reels',limit=20}={}){
  const grant=await authorize(credential,subject);
  if(!FEEDS.has(feed))throw Error('FEED_TYPE_INVALID');
  const [catalog,exclusions]=await Promise.all([
   readCatalog({subject,feed}),readExclusions({subject,feed})
  ]);
  if(!exclusions||!Array.isArray(exclusions.blockedCreators)||
   !Array.isArray(exclusions.hiddenIds))throw Error('FEED_EXCLUSIONS_UNAVAILABLE');
  await permissions.check(grant,'feed:personalize',subject);
  const result=await engine.rank(subject,catalog,{
   blockedCreators:exclusions.blockedCreators,hiddenIds:exclusions.hiddenIds,limit
  });
  await audit.record({event:'feed.recommendation',subject,capability:'feed:personalize'});
  return Object.freeze({feed,...result});
 }
 async function erase({credential,subject}={}){
  const grant=await authorize(credential,subject);
  // Erasure works even after personalization consent is withdrawn.
  await audit.record({event:'feed.history.erased',subject,capability:'feed:personalize'});
  await permissions.check(grant,'feed:personalize',subject);
  return engine.erase(subject);
 }
 return Object.freeze({record,recommend,erase});
}
module.exports=Object.freeze({createFeedService,FEEDS});