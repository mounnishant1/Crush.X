const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'story-editor.css'),'utf8');
assert.match(html, /<link rel="stylesheet" href="\.\/story-editor\.css"/);
assert.match(html, /<script src="\.\/story-editor\.js"><\/script>/);
assert.match(css,/\.ss-stage/);
assert.match(css,/\.ss-users/);

const noop = {addEventListener(){}};
const document = {
  body:{classList:{toggle(){}}},activeElement:null,
  getElementById(id){return ['cancelConfirmation','authForm','switchAuthButton','confirmButton','resendButton','forgotButton'].includes(id)?noop:null;},
  addEventListener(){},querySelectorAll(){return [];}
};
const context=vm.createContext({
  console,Date,URL,Blob,document,setTimeout,clearTimeout,
  location:{hash:''},history:{pushState(){}},
  window:{addEventListener(){},scrollTo(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}
});
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);
vm.runInContext(inline,context,{filename:'index.html'});
for(const file of ['app-improvements.js','story-editor.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run = source=>vm.runInContext(source,context);

assert.match(run('renderCreate()'),/data-open-story-studio/);
run('ssSession=ssFresh();ssDialog={innerHTML:"",querySelector(){return null;}};ssRender()');
assert.match(run('ssDialog.innerHTML'),/Add to story/);
assert.match(run('ssDialog.innerHTML'),/data-ss="camera"/);
assert.match(run('ssDialog.innerHTML'),/data-ss="collage"/);
assert.match(run('ssDialog.innerHTML'),/data-ss="multi"/);

// Delegated buttons exercise the real state machine without a browser dependency.
function click(action){context.actionForTest=action;run(`ssClick({target:{closest(selector){return selector==='[data-ss]'?{dataset:{ss:actionForTest}}:null;}}})`);}
click('templates');
assert.equal(run('ssSession.view'),'editor');
assert.equal(run('ssSession.panel'),'restyle');
click('text');
assert.match(run('ssDialog.innerHTML'),/Signature/);
assert.match(run('ssDialog.innerHTML'),/data-ss-range="textSize"/);
run('ssSession.text="<script>alert(1)</script>"');
assert.doesNotMatch(run('ssStage()'),/<script>/);
assert.match(run('ssStage()'),/&lt;script&gt;/);
for(const name of ['Stickers','Music','Restyle','Effects','Mention','Draw','Save','Label AI','More'])assert.ok(run('ssEditor()').includes(name),name);

click('mention');
assert.match(run('ssDialog.innerHTML'),/Search sample profiles/);
assert.match(run('ssDialog.innerHTML'),/Allow mentioned people to add/);
const firstUser=run('getState().users.find(u=>u.id!==getState().currentUserId).id');
context.selectedUserId=firstUser;
run(`ssClick({target:{closest(selector){return selector==='[data-ss-user]'?{dataset:{ssUser:selectedUserId}}:null;}}})`);
assert.equal(run('ssSession.mentions.length'),1);
assert.match(run('ssDialog.innerHTML'),/Add \(1\)/);

click('effects');
assert.match(run('ssDialog.innerHTML'),/Film Effects/);
assert.match(run('ssDialog.innerHTML'),/data-ss="save-effect"/);
click('save-effect');
assert.equal(run('ssSession.savedEffects.length'),1);
click('draw');
assert.match(run('ssDialog.innerHTML'),/Brush size/);
assert.equal(run('ssSession.drawing'),true);
click('audience-close');
assert.equal(run('ssSession.audience'),'Close Friends');
click('review');
assert.equal(run('ssSession.view'),'review');
assert.match(run('ssDialog.innerHTML'),/No story is published/);
assert.match(run('ssDialog.innerHTML'),/Save image/);

run('ssSession.view="gallery";ssSession.panel="";ssSession.albumOpen=true;ssRender()');
for(const option of ['Recents','Photos','Videos','All albums','Google Photos','From Meta apps'])assert.ok(run('ssDialog.innerHTML').includes(option),option);
assert.match(run('ssDialog.innerHTML'),/Not connected/);
click('collage');
assert.equal(run('ssSession.multi'),true);
assert.match(run('ssDialog.innerHTML'),/2–4 tiles/);
clearTimeout(run('ssToastTimer'));

// Device media is accepted into the session only after the shared upload validator.
context.importedFile = new Blob(['local image'],{type:'image/png'});
context.importedFile.name='test.png';
run(`ssSession.multi=false;ssChange({target:{files:[importedFile],value:'selected',matches(selector){return selector==='[data-ss-file],[data-ss-camera]';}}})`);
assert.equal(run('ssSession.view'),'editor');
assert.equal(run('ssSession.selected.length'),1);
assert.equal(run('ssSession.media[0].sample'),false);
assert.match(run('ssSession.media[0].url'),/^blob:/);
assert.match(run('ssEditor()'),/Save/);
run('ssClean()');
console.log('Story editor screen, state, security and icon checks PASS');
