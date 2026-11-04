// Run: node --test tests/aura-x-trend-studio.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../aura-x-trend-studio.js');
const NOW = Date.UTC(2026,10,4,10,0,0);
function s(source,postId,tags,views=1000, overrides={}) {
  return {source,postId,tags,accessMode:source==='crushx'?'owned_metrics':'approved_api',
    authorized:true,publishedAt:NOW-3600000,observedAt:NOW,
    metrics:{views,likes:120,comments:10,shares:18,saves:5},...overrides};
}
test('blocks unapproved social-media access',()=>{
  const r=studio.buildTrends([s('instagram','id001',['neon'],100,{authorized:false}),s('youtube','id002',['neon'])],{now:NOW});
  assert.equal(r.acceptedSignals,1);
  assert.equal(r.drafts.length,0);
  assert.equal(r.rejected.source_not_authorized,1);
});
test('deduplicates by source and ID, latest observation wins',()=>{
  const records=[s('youtube','id001',['fruit'],500),s('youtube','id001',['fruit'],700),
    s('crushx','id002',['fruit'])];
  const r=studio.buildTrends(records,{now:NOW});
  assert.equal(r.acceptedSignals,2);
  assert.equal(r.drafts.length,1);
  assert.equal(r.trends[0].observedViews,1700);
});
test('generates validated-shape lens preset and existing game template only',()=>{
  const r=studio.buildTrends([s('youtube','id001',['fruitcut']),s('crushx','id002',['fruitcut'])],{now:NOW});
  assert.equal(r.drafts[0].creatorLensDocument.BaseLensId,'neon-mask');
  assert.equal(r.drafts[0].gameDraft.templateId,'FruitRush');
  assert.equal(r.drafts[0].creatorLensDocument.AssetLicense,'Unreviewed');
  assert.equal(r.drafts[0].publishAllowed,false);
});
test('rejects malformed, stale, unsupported and unsafe inputs',()=>{
  const a=s('youtube','id001',['neon'],100,{publishedAt:NOW-30*86400000});
  const b=s('reddit','id002',['neon']);
  const c=s('youtube','id003',['terror'],100);
  const r=studio.buildTrends([a,b,c],{now:NOW});
  assert.equal(r.acceptedSignals,0);
  assert.equal(r.rejected.outside_trend_window,1);
  assert.equal(r.rejected.unsupported_source,1);
  assert.equal(r.rejected.missing_safe_tags,1);
});
test('no false live numbers and no one-post trend',()=>{
  const r=studio.buildTrends([s('youtube','id001',['space'])],{now:NOW});
  assert.equal(r.drafts.length,0);
  assert.match(r.limitations,/No remote content fetched/);
});
test('rejects invalid access mode and missing view counts',()=>{
  const records=[s('youtube','id001',['space'],100,{accessMode:'owned_metrics'}),
    s('crushx','id002',['space'],100,{metrics:{views:-1}})];
  const r=studio.buildTrends(records,{now:NOW});
  assert.equal(r.rejected.invalid_access_mode,1);
  assert.equal(r.rejected.missing_views,1);
});
test('ranked cross-platform trend has explicit provenance and bounded score',()=>{
  const r=studio.buildTrends([s('youtube','id001',['cyber']),s('crushx','id002',['cyber']),
    s('instagram','id003',['cyber'])],{now:NOW});
  assert.deepEqual(r.trends[0].sources,['crushx','instagram','youtube']);
  assert.ok(r.trends[0].score>0 && r.trends[0].score<=100);
  assert.equal(r.trends[0].metricsProvenance,'authorized_records_only');
});

test('multilingual trend labels produce Unity-validator-compatible ASCII IDs',()=>{
  const r=studio.buildTrends([s('youtube','id001',['#फलकट']),s('crushx','id002',['#फलकट'])],{now:NOW});
  assert.equal(r.drafts.length,1);
  assert.match(r.drafts[0].creatorLensDocument.Id,/^[a-z0-9][a-z0-9-]{1,63}$/);
  assert.match(r.drafts[0].creatorLensDocument.DisplayName,/फलकट/u);
});
