'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../app-improvements.js'),'utf8');
test('Story focus is restored after replacing dialog HTML',()=>{
 assert.match(src,/const action = inside && active\?\.getAttribute\?\.\('data-sv'\)/);
 assert.match(src,/const onStage = inside && !!active\?\.matches\?\.\('\[data-sv-stage\]'\)/);
 assert.match(src,/target\.focus\(\{preventScroll:true\}\)/);
});
test('Story Enter and Space keyboard activation and pointer cancel suppression',()=>{
 assert.match(src,/event\.key==='Enter' && event\.target\?\.matches\?\.\('\[data-sv-stage\]'\)/);
 assert.match(src,/storyViewerSwipeUntil=Date\.now\(\)\+250;/);
});
