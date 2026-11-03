'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOwnerCodingAgent,allowedPath,createGitHubAdapter}=require('../aura-owner-coding.cjs');
function fixture(){
 let head='h1',clock=100,writes=[],prs=[],logs=[];
 const github={
  async getHead(){return head;},
  async readFile(repo,path){return {sha:'file1',content:'old '+path};},
  async createBranch(repo,branch,sha){writes.push(['branch',branch,sha]);},
  async putFile(repo,branch,path,content,sha){writes.push(['file',path,content,sha]);},
  async openPullRequest(repo,body){prs.push(body);return {url:'https://github.com/example/repo/pull/42'};}
 };
 const model={async suggestChanges({files}){return {changes:[{path:files[0].path,content:'new source'}]};}};
 const authenticate=async token=>token==='owner'?{verified:true,subject:'owner',scopes:['code:read','code:propose','code:approve']}:token==='reader'?{verified:true,subject:'owner',scopes:['code:read']}:{verified:false,subject:'owner',scopes:['code:read','code:propose','code:approve']};
 const agent=createOwnerCodingAgent({authenticate,github,model,ownerSubject:'owner',now:()=>clock,audit:async e=>{logs.push(e);return true;}});
 return {agent,github,model,writes,prs,logs,advance:()=>clock+=900000,moveHead:()=>head='h2'};
}
test('deny traversal, workflows and secrets',()=>{
 for(const path of ['.github/workflows/release.yml','docs/../index.html','docs//oops.md','.env','package.json','tools/secret-key.py','UnityProjects/.git/config','frontend/android/app/src/main/assets/evil.js'])
  assert.equal(allowedPath(path),false,path);
 assert.equal(allowedPath('aura-x-core.js'),true);
 assert.equal(allowedPath('tests/aura-owner-coding.test.cjs'),true);
});
test('nonowner gets no source read or write',async()=>{
 const x=fixture();
 await assert.rejects(x.agent.inspect({credential:'user',paths:['aura-x-core.js']}),/OWNER_AUTH_REQUIRED/);
 await assert.rejects(x.agent.propose({credential:'user',task:'fix',paths:['aura-x-core.js']}),/OWNER_AUTH_REQUIRED/);
 assert.equal(x.writes.length,0);
});
test('read-only owner cannot propose',async()=>{
 const x=fixture();
 await x.agent.inspect({credential:'reader',paths:['aura-x-core.js']});
 await assert.rejects(x.agent.propose({credential:'reader',task:'fix',paths:['aura-x-core.js']}),/OWNER_AUTH_REQUIRED/);
});
test('proposal never writes until exact digest and explicit approval',async()=>{
 const x=fixture();
 const p=await x.agent.propose({credential:'owner',task:'fix bug',paths:['aura-x-core.js']});
 assert.equal(x.writes.length,0);
 assert.equal(p.files[0].content,'new source');
 await assert.rejects(x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:'wrong',approved:true}),/EXPLICIT_APPROVAL_REQUIRED/);
 await assert.rejects(x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:p.reviewDigest,approved:false}),/EXPLICIT_APPROVAL_REQUIRED/);
 const result=await x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:p.reviewDigest,approved:true});
 assert.equal(result.deployed,false);
 assert.equal(result.draft,true);
 assert.equal(result.ci,'NOT_VERIFIED');
 assert.equal(x.prs.length,1);
 assert.equal(x.prs[0].draft,true);
 assert.equal(x.prs[0].base,'feature/aura-x-consent-memory-policy-20261027');
 assert.deepEqual(x.writes.map(w=>w[0]),['branch','file']);
 await assert.rejects(x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:p.reviewDigest,approved:true}),/PROPOSAL_EXPIRED/);
});
test('proposal expires and cannot create a branch',async()=>{
 const x=fixture(),p=await x.agent.propose({credential:'owner',task:'fix',paths:['aura-x-core.js']});
 x.advance();
 await assert.rejects(x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:p.reviewDigest,approved:true}),/PROPOSAL_EXPIRED/);
 assert.equal(x.writes.length,0);
});
test('stale branch HEAD blocks code changes',async()=>{
 const x=fixture(),p=await x.agent.propose({credential:'owner',task:'fix',paths:['aura-x-core.js']});
 x.moveHead();
 await assert.rejects(x.agent.approve({credential:'owner',proposalId:p.proposalId,reviewDigest:p.reviewDigest,approved:true}),/STALE_BASE_REF/);
 assert.equal(x.writes.length,0);
});
test('untrusted model cannot write outside selected files',async()=>{
 const x=fixture();
 x.model.suggestChanges=async()=>({changes:[{path:'.github/workflows/deploy.yml',content:'bad'}]});
 await assert.rejects(x.agent.propose({credential:'owner',task:'fix',paths:['aura-x-core.js']}),/UNSAFE_MODEL_OUTPUT/);
 assert.equal(x.writes.length,0);
});
test('failed audit must block all GitHub mutations',async()=>{
 const x=fixture();
 const bad=createOwnerCodingAgent({authenticate:async()=>({verified:true,subject:'owner',scopes:['code:read','code:propose','code:approve']}),
  github:x.github,model:x.model,ownerSubject:'owner',audit:async()=>false});
 await assert.rejects(bad.propose({credential:'owner',task:'fix',paths:['aura-x-core.js']}),/AUDIT_REQUIRED/);
 assert.equal(x.writes.length,0);
});
test('GitHub adapter uses scoped server-only token and fixed HTTPS API host',async()=>{
 assert.throws(()=>createGitHubAdapter({token:''}),/Server GitHub token/);
 let url='';
 const gh=createGitHubAdapter({token:'server-token',fetchImpl:async(u,opts)=>{
  url=u;assert.equal(opts.headers.Authorization,'Bearer server-token');
  return {ok:true,status:200,json:async()=>({commit:{sha:'head-sha'}})};
 }});
 assert.equal(await gh.getHead('test/repo','feature/aura'),'head-sha');
 assert.match(url,/^https:\/\/api\.github\.com\/repos\/test\/repo\/branches\//);
});
