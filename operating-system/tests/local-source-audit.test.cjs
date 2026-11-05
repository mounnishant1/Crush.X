'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scan}=require('../tools/scan-local-ai-source.cjs');
test('local Windows source audit finds AI modules but does not claim execution',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crushx-source-'));
 try{
  const put=(rel,contents='example')=>{
   const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);
  };
  put('frontend/src/components/Camera.jsx');
  put('frontend/src/feed/Recommendations.js');
  put('operating-system/core/kernel.cjs');
  put('backend/src/consent/Privacy.ts');
  put('frontend/node_modules/notreal/Camera.jsx');
  put('frontend/dist/Recommendation.js');
  const report=scan(root);
  assert.equal(report.runtimeVerified,false);
  assert.equal(report.androidVerified,false);
  assert.equal(report.categories.camera.sampleCount,1);
  assert.equal(report.categories.feed.sampleCount,1);
  assert.equal(report.categories.operating.sampleCount,1);
  assert.equal(report.categories.safety.sampleCount,1);
  assert.equal(JSON.stringify(report).includes('node_modules'),false);
  assert.equal(JSON.stringify(report).includes('dist/'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('read-only scanner requires an absolute folder',()=>{
 assert.throws(()=>scan('relative/folder'),/SOURCE_ROOT_INVALID/);
});
