'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'auth-inputs-android.css'),'utf8');
const form=html.split('<form id="authForm"')[1]?.split('</form>')[0]||'';
function input(id){
 const all=[...form.matchAll(/<input\b[\s\S]*?\/>/g)].map(m=>m[0]);
 return all.filter(v=>v.includes('id="'+id+'"'));
}
test('login has exactly one username and one password input, no duplicate boxes',()=>{
 assert.equal(input('usernameInput').length,1);
 assert.equal(input('passwordInput').length,1);
 assert.equal(input('emailInput').length,1);
 assert.equal(input('resetCodeInput').length,1);
 for(const id of ['usernameInput','passwordInput','emailInput','resetCodeInput'])
  assert.match(input(id)[0],/class="cx-auth-input(?: hidden)?"/);
});
test('remove original pink focus halo from every authentication input',()=>{
 assert.doesNotMatch(form,/focus:ring-4|focus:ring-pink|focus:border-pink/);
 assert.match(css,/#authOverlay \.cx-auth-input:focus/);
 assert.match(css,/box-shadow:\s*none/);
 assert.match(css,/border:\s*2px solid #475569/);
});
test('preserve login/signup/reset native keyboard and autofill semantics',()=>{
 assert.match(input('usernameInput')[0],/autocomplete="username"/);
 assert.match(input('usernameInput')[0],/autocapitalize="none"/);
 assert.match(input('passwordInput')[0],/type="password"/);
 assert.match(input('passwordInput')[0],/autocomplete="current-password"/);
 assert.match(input('emailInput')[0],/autocomplete="email"/);
 assert.match(input('resetCodeInput')[0],/autocomplete="one-time-code"/);
 assert.match(input('resetCodeInput')[0],/inputmode="numeric"/);
 assert.match(html,/signUpMode \? 'new-password' : 'current-password'/);
});
test('hidden signup/reset fields remain hidden until the existing JS toggles them',()=>{
 assert.match(input('emailInput')[0],/class="cx-auth-input hidden"/);
 assert.match(input('resetCodeInput')[0],/class="cx-auth-input hidden"/);
 assert.match(css,/#authOverlay \.cx-auth-input\.hidden\s*\{\s*display:\s*none/);
});
test('Android autofill uses neutral background; 16px inputs avoid mobile zoom',()=>{
 assert.match(html,/href="\.\/auth-inputs-android\.css"/);
 assert.match(css,/\.cx-auth-input:-webkit-autofill/);
 assert.match(css,/-webkit-text-fill-color:\s*#0f172a/);
 assert.match(css,/-webkit-box-shadow: 0 0 0 1000px #fff inset/);
 assert.match(css,/font:\s*500 16px\/1\.35/);
 assert.match(css,/@supports \(height: 100dvh\)/);
});
