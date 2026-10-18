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
function clickDataset(selector,field,value){context.clickSelector=selector;context.clickField=field;context.clickValue=value;run(`ssClick({target:{closest(query){return query===clickSelector?{dataset:{[clickField]:clickValue}}:null;}}})`);}
click('templates');
assert.equal(run('ssSession.view'),'editor');
assert.equal(run('ssSession.panel'),'restyle');
click('text');
assert.match(run('ssDialog.innerHTML'),/Signature/);
assert.match(run('ssDialog.innerHTML'),/data-ss-range="textSize"/);
assert.equal(run('Object.keys(ssFonts).length'),24);
assert.equal(run('Object.keys(ssLanguages).length'),5);
for(const lang of ['English','Hindi','Hinglish','Punjabi','Haryanvi'])assert.ok(run('ssDialog.innerHTML').includes(lang));
for(const style of ['Neon','Outline','Gradient','Shadow','Typewriter','Retro'])assert.ok(run('ssDialog.innerHTML').includes(style));
assert.match(run('ssDialog.innerHTML'),/data-ss-range="textRotation"/);
assert.match(run('ssDialog.innerHTML'),/data-ss-range="textScale"/);
assert.match(run('ssDialog.innerHTML'),/data-ss-animation/);
clickDataset('[data-ss-font]','ssFont','Neon');
assert.equal(run('ssSession.font'),'Neon');
clickDataset('[data-ss-typography]','ssTypography','Outline');
assert.equal(run('ssSession.textOutline'),true);
clickDataset('[data-ss-idea]','ssIdea','0');
assert.ok(run('ssSession.text.length')>0);
run('ssSession.language="Haryanvi";ssRender()');
assert.match(run('ssDialog.innerHTML'),/माहौल/);
run('ssSession.textAnimation="Bounce";ssRender()');
assert.match(run('ssStage()'),/ss-animate-bounce/);
run('ssSession.text="<script>alert(1)</script>"');
assert.doesNotMatch(run('ssStage()'),/<script>/);
assert.match(run('ssStage()'),/&lt;script&gt;/);
for(const name of ['Stickers','Music','Restyle','Effects','Mention','Draw','Save','Label AI','More'])assert.ok(run('ssEditor()').includes(name),name);

click('stickers');
for(const name of ['GIF','Poll','Questions','Quiz','Countdown','Link'])assert.ok(run('ssDialog.innerHTML').includes(name),name);
clickDataset('[data-ss-sticker-kind]','ssStickerKind','Poll');
assert.match(run('ssStage()'),/data-ss-vote="0"/);
clickDataset('[data-ss-vote]','ssVote','1');
assert.equal(run('ssSession.stickerVote'),1);
clickDataset('[data-ss-sticker-kind]','ssStickerKind','Quiz');
assert.match(run('ssDialog.innerHTML'),/Correct answer 1/);
clickDataset('[data-ss-vote]','ssVote','0');
assert.match(run('ssStage()'),/Correct!/);
clickDataset('[data-ss-sticker-kind]','ssStickerKind','Questions');
assert.match(run('ssStage()'),/data-ss-question-reply/);
run('ssSession.stickerReplyText="Thanks!"');
click('send-reply');
assert.match(run('ssStage()'),/Preview reply: Thanks!/);
clickDataset('[data-ss-sticker-kind]','ssStickerKind','Countdown');
run('ssSession.stickerDeadline="2099-01-01T00:00"');
assert.match(run('ssStage()'),/ss-countdown/);
clickDataset('[data-ss-sticker-kind]','ssStickerKind','Link');
run('ssSession.stickerLink="javascript:alert(1)"');
assert.doesNotMatch(run('ssStage()'),/href="javascript:/);
run('ssSession.stickerLink="https://example.com/story"');
assert.match(run('ssStage()'),/href="https:\/\/example.com\/story"/);
click('music');
assert.match(run('ssDialog.innerHTML'),/Manual lyrics/);
run('ssSession.lyrics="My own lyrics"');
assert.match(run('ssStage()'),/My own lyrics/);

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
context.gifFile=new Blob(['GIF89a'],{type:'image/gif'});
context.gifFile.name='my-sticker.gif';
run(`ssChange({target:{files:[gifFile],matches(selector){return selector==='[data-ss-gif]';}}})`);
assert.equal(run('ssSession.stickerKind'),'GIF');
assert.match(run('ssSession.stickerGifUrl'),/^blob:/);
assert.match(run('ssStage()'),/ss-gif-sticker/);

run('ssSession.language="English";ssSession.text="Move me";ssSession.view="editor"');
context.mockStage={getBoundingClientRect(){return {left:0,top:0,width:300,height:500};}};
context.mockLayer={style:{},closest(selector){return selector==='.ss-stage'?context.mockStage:null;},setPointerCapture(){}};
run(`ssDrawStart({pointerId:3,preventDefault(){},target:{closest(selector){return selector==='[data-ss-textlayer]'?mockLayer:null;}}})`);
assert.equal(run('ssSession.textDragPointer'),3);
run('ssDialog.querySelector = selector => selector===\'[data-ss-textlayer]\'?mockLayer:null');
run('ssDrawMove({pointerId:3,clientX:225,clientY:250,preventDefault(){}})');
assert.equal(run('ssSession.textX'),75);
assert.equal(run('ssSession.textY'),50);
run('ssDrawEnd({pointerId:3})');
assert.equal(run('ssSession.textDragPointer'),null);

// Exercise sticker-card canvas output without relying on a browser installation.
const painted=[];
context.cardCanvasContext={
  save(){},restore(){},beginPath(){},roundRect(){},rect(){},fill(){},fillRect(){},
  fillText(value){painted.push(value);},
};
run('ssSession.stickerKind="Quiz";ssSession.stickerTitle="How are you?";ssSession.stickerVote=0');
Promise.resolve(run('ssDrawCard(cardCanvasContext)')).then(()=>{
  assert.ok(painted.includes('How are you?'));
  assert.ok(painted.some(x=>String(x).includes('Yes')));
  run('ssClean()');
  console.log('Story editor screen, state, security and icon checks PASS');
}).catch(error=>{console.error(error);process.exitCode=1;});
