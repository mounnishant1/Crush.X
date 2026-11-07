'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAccountService}=require('../accounts/account-service.cjs');
const {createMemoryAccountStore}=require('../accounts/memory-store.cjs');
const {createDynamoAccountStore}=require('../accounts/dynamo-store.cjs');
const {createAccountLambdaHandler}=require('../accounts/account-http.cjs');
const {createAccountAccessGuard}=require('../accounts/account-guard.cjs');
const key=n=>'request_key_'+String(n).padStart(8,'0');
function fixture(){
 let time=Date.UTC(2026,10,7,7,0,0);
 const store=createMemoryAccountStore();
 const now=()=>time;
 const user={subject:'alice',roles:['user'],stepUpAt:time,mfaAt:null};
 const mod={subject:'mod1',roles:['moderator'],stepUpAt:time,mfaAt:time};
 const safety={subject:'safety1',roles:['safety_admin','moderator'],stepUpAt:time,mfaAt:time};
 const service=createAccountService({store,now,verifySecondApproval:async ({approvalId,actor})=>
  approvalId==='approved-by-different-admin'&&actor==='safety1'});
 return {service,store,user,mod,safety,now,tick:ms=>{time+=ms;},
  refresh:a=>({...a,stepUpAt:time,mfaAt:a.mfaAt===null?null:time})};
}
test('provisioned user begins ACTIVE, unknown account is denied',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 assert.equal((await f.service.status({actor:f.user})).status,'ACTIVE');
 await assert.rejects(f.service.status({actor:{subject:'unknown'}}),/ACCOUNT_NOT_FOUND/);
});
test('user deactivation and safe verified reactivation',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const disabled=await f.service.deactivate({actor:f.user,idempotencyKey:key(1)});
 assert.equal(disabled.status,'DEACTIVATED');
 assert.equal((await f.service.reactivate({actor:f.user,idempotencyKey:key(2)})).status,'ACTIVE');
 assert.equal(f.store.evidence().events.length,2);
 await assert.rejects(f.service.requireActive({subject:'alice',issuedAt:f.now()-1000}),/FRESH_LOGIN_REQUIRED/);
 assert.equal((await f.service.requireActive({subject:'alice',issuedAt:f.now()+1000})).status,'ACTIVE');
});
test('user cannot deactivate or reactivate on stale step-up evidence',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 f.tick(5*60000+1);
 await assert.rejects(f.service.deactivate({actor:f.user,idempotencyKey:key(1)}),/RECENT_VERIFICATION_REQUIRED/);
});
test('moderation blocks app access and self reactivation',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const s=await f.service.suspend({actor:f.mod,target:'alice',kind:'temporary',
  reasonCode:'spam',durationHours:24,idempotencyKey:key(3)});
 assert.equal(s.status,'SUSPENDED');
 await assert.rejects(f.service.reactivate({actor:f.refresh(f.user),idempotencyKey:key(4)}),
  /MODERATOR_REINSTATEMENT_REQUIRED/);
 await assert.rejects(f.service.requireActive({subject:'alice',issuedAt:f.now()+1000}),
  /ACCOUNT_RESTRICTED/);
 assert.deepEqual(f.store.evidence().outbox[0].actions,['REVOKE_SESSIONS','ACCOUNT_STATUS_NOTICE']);
});
test('temporary suspensions expire by policy without ignoring earlier user deactivation',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await f.service.deactivate({actor:f.user,idempotencyKey:key(1)});
 await f.service.suspend({actor:f.mod,target:'alice',kind:'temporary',reasonCode:'spam',
  durationHours:1,idempotencyKey:key(3)});
 f.tick(3600000);
 assert.equal((await f.service.status({actor:{subject:'alice'}})).status,'DEACTIVATED');
 await f.service.reactivate({actor:f.refresh(f.user),idempotencyKey:key(4)});
 assert.equal((await f.service.status({actor:f.user})).status,'ACTIVE');
});
test('appeal one time per case, review accepts and restores',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const s=await f.service.suspend({actor:f.mod,target:'alice',kind:'temporary',
  reasonCode:'harassment',durationHours:4,idempotencyKey:key(3)});
 await f.service.appeal({actor:{subject:'alice'},
  text:'Please review this account suspension and my previous activity.',idempotencyKey:key(5)});
 assert.equal((await f.service.status({actor:f.user})).suspension.appealStatus,'pending');
 await assert.rejects(f.service.appeal({actor:{subject:'alice'},text:'Please review again carefully now.',
  idempotencyKey:key(6)}),/APPEAL_ALREADY_SUBMITTED/);
 assert.equal((await f.service.reinstate({actor:f.mod,target:'alice',caseId:s.suspension.caseId,
  decision:'appeal_accepted',idempotencyKey:key(7)})).status,'ACTIVE');
 assert.equal(f.store.evidence().events.length,3);
 assert.equal(f.store.evidence().events[1].text,undefined);
});
test('rejecting appeal keeps suspension and can only be done once',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const s=await f.service.suspend({actor:f.mod,target:'alice',kind:'temporary',
  reasonCode:'spam',durationHours:3,idempotencyKey:key(3)});
 await f.service.appeal({actor:f.user,text:'I would like an independent review of the case.',
  idempotencyKey:key(5)});
 assert.equal((await f.service.rejectAppeal({actor:f.mod,target:'alice',
  caseId:s.suspension.caseId,idempotencyKey:key(8)})).suspension.appealStatus,'rejected');
 await assert.rejects(f.service.rejectAppeal({actor:f.mod,target:'alice',
  caseId:s.suspension.caseId,idempotencyKey:key(9)}),/PENDING_APPEAL_REQUIRED/);
});
test('only MFA-approved safety admin and separate approval can permanently ban',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await assert.rejects(f.service.suspend({actor:f.mod,target:'alice',kind:'permanent',
  reasonCode:'fraud',idempotencyKey:key(3),approvalId:'approved-by-different-admin'}),
  /SAFETY_ADMIN_REQUIRED/);
 await assert.rejects(f.service.suspend({actor:f.safety,target:'alice',kind:'permanent',
  reasonCode:'fraud',idempotencyKey:key(3),approvalId:'bad'}),/SECOND_APPROVAL_REQUIRED/);
 const ban=await f.service.suspend({actor:f.safety,target:'alice',kind:'permanent',
  reasonCode:'fraud',idempotencyKey:key(3),approvalId:'approved-by-different-admin'});
 assert.equal(ban.status,'BANNED');
 await assert.rejects(f.service.reinstate({actor:f.mod,target:'alice',
  caseId:ban.suspension.caseId,decision:'moderator_reversal',idempotencyKey:key(10)}),
  /SAFETY_ADMIN_REQUIRED/);
});
test('moderator cannot suspend self and user cannot suspend anyone',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await assert.rejects(f.service.suspend({actor:f.user,target:'alice',kind:'temporary',
  reasonCode:'spam',durationHours:5,idempotencyKey:key(3)}),/SELF_MODERATION_DENIED/);
 await assert.rejects(f.service.suspend({actor:f.user,target:'mod1',kind:'temporary',
  reasonCode:'spam',durationHours:5,idempotencyKey:key(3)}),/ACCESS_DENIED/);
});
test('idempotent retry returns identical receipt, altered intent is rejected',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const first=await f.service.deactivate({actor:f.user,idempotencyKey:key(1)});
 const replay=await f.service.deactivate({actor:f.user,idempotencyKey:key(1)});
 assert.deepEqual(replay,first);
 await assert.rejects(f.service.reactivate({actor:f.user,idempotencyKey:key(1)}),
  /IDEMPOTENCY_CONFLICT/);
 assert.equal(f.store.evidence().events.length,1);
});
test('missing, malformed and overlong appeal texts are rejected',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await assert.rejects(f.service.appeal({actor:f.user,text:'oops',idempotencyKey:key(1)}),
  /INVALID_APPEAL_TEXT/);
});
test('user cannot read another user account status',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await assert.rejects(f.service.status({actor:f.user,target:'bob'}),/ACCESS_DENIED/);
});
test('Dynamo transaction couples state, audit, outbox and idempotency records',async()=>{
 class GetCommand{constructor(x){this.input=x;}}
 class PutCommand{constructor(x){this.input=x;}}
 class TransactWriteCommand{constructor(x){this.input=x;}}
 const requests=[],client={send:async x=>{requests.push(x);return {};}};
 const store=createDynamoAccountStore({client,tableName:'CrushXAccounts',
  commands:{GetCommand,PutCommand,TransactWriteCommand}});
 await store.provision('alice',1);
 await store.commit({target:'alice',expectedVersion:1,next:{version:2},
  audit:{at:123,eventId:'event-1'},outbox:{eventId:'event-1'},
  idempotencyKey:key(1),fingerprint:'hash',response:{status:'SUSPENDED'}});
 assert.equal(requests[1].input.TransactItems.length,4);
 assert.equal(requests[1].input.TransactItems[0].Update.ConditionExpression,'#v = :oldVersion');
});
function apiFixture(f){
 return createAccountLambdaHandler({service:f.service,
  verifyCredential:async token=>token==='a'.repeat(50)?{verified:true,subject:'alice'}:
   token==='b'.repeat(50)?{verified:true,subject:'mod1'}:{verified:false},
  getSecurityContext:async ({subject})=>subject==='alice'?f.refresh(f.user):f.refresh(f.mod),
  rateLimit:async()=>true,allowedOrigins:['https://crushx.in']});
}
function event(path,method='GET',body={},token='a'.repeat(50),headers={}){
 return {rawPath:path,requestContext:{http:{method}},
  headers:{authorization:'Bearer '+token,...headers,...(method==='POST'?
   {'content-type':'application/json','idempotency-key':key(11)}:{})},
  body:method==='POST'?JSON.stringify(body):''};
}
test('HTTP auth, origin allowlist, trusted subject and action route',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 const api=apiFixture(f);
 assert.equal((await api.handle(event('/v1/account/status'))).statusCode,200);
 assert.equal((await api.handle(event('/v1/account/status','GET',{},'invalid'))).statusCode,401);
 assert.equal((await api.handle(event('/v1/account/status','GET',{},'a'.repeat(50),
  {origin:'https://evil.example'}))).statusCode,403);
 const resp=await api.handle(event('/v1/account/deactivate','POST',{}));
 assert.equal(resp.statusCode,200);
 assert.equal(JSON.parse(resp.body).status,'DEACTIVATED');
});
test('HTTP admin operation cannot be self-issued with body role spoofing',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());const api=apiFixture(f);
 const res=await api.handle(event('/v1/moderation/accounts/alice/suspend','POST',
  {kind:'temporary',reasonCode:'spam',durationHours:2,role:'safety_admin'}));
 assert.equal(res.statusCode,403);
});

test('moderator can read submitted case with MFA but ordinary users cannot',async()=>{
 const f=fixture();await f.store.provision('alice',f.now());
 await f.service.suspend({actor:f.mod,target:'alice',kind:'temporary',reasonCode:'spam',
  durationHours:2,idempotencyKey:key(19)});
 await f.service.appeal({actor:f.user,text:'I believe this suspension was a mistake, please review.',
  idempotencyKey:key(20)});
 const review=await f.service.reviewCase({actor:f.mod,target:'alice'});
 assert.equal(review.appeal.status,'pending');
 assert.equal(review.appeal.text.includes('mistake'),true);
 await assert.rejects(f.service.reviewCase({actor:f.user,target:'alice'}),/ACCESS_DENIED/);
});
test('private API gate rejects JWT older than account restriction and mismatch',async()=>{
 const iat=Math.floor(Date.now()/1000)-60;
 const encode=s=>Buffer.from(JSON.stringify(s)).toString('base64url');
 const token=encode({alg:'RS256'})+'.'+encode({sub:'alice',iat})+'.'+
  'fake-signature-long-enough-for-this-isolated-test';
 const guard=createAccountAccessGuard({verifyCredential:async input=>({
  verified:input===token,subject:'alice',expiresAt:Date.now()+3600000
 }),accountService:{requireActive:async ({subject,issuedAt})=>{
  assert.equal(subject,'alice');assert.equal(issuedAt,iat*1000);
  throw Error('ACCOUNT_RESTRICTED');
 }}});
 await assert.rejects(guard.authorize({authorization:'Bearer '+token}),/ACCOUNT_RESTRICTED/);
 await assert.rejects(guard.authorize({authorization:'Bearer wrong'}),/UNAUTHENTICATED/);
});
