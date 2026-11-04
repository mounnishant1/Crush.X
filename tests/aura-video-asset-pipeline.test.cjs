// node --test tests/aura-video-asset-pipeline.test.cjs
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const zlib=require('node:zlib');
const vision=require('../tools/aura-vision-analyzer.cjs');
const art=require('../tools/aura-original-asset-factory.cjs');
const cli=require('../tools/aura-video-to-lens.cjs');
const invoke=promisify(execFile);
const a={visualStyle:'neon',motion:'swipe',gameTemplate:'FruitRush',
  palette:['#fa239a','#12b4cf','#ffc428'],
  observedEffects:['bright concentric ring'],frameEvidence:['first sample has a pink highlight']};
const digest='1'.repeat(64);
const jpeg=Buffer.from([0xff,0xd8,...Array(108).fill(6),0xff,0xd9]);
test('model label policy rejects unsupported and oversized visual output',()=>{
  assert.throws(()=>vision.validateVision({...a,gameTemplate:'execute-shell'}),/unsupported/);
  assert.throws(()=>vision.validateVision({...a,palette:['red','#000000','#ffffff']}),/palette/);
  assert.throws(()=>vision.validateVision({...a,frameEvidence:['a'.repeat(200)]}),/visual observations/);
  assert.equal(vision.validateVision(a).palette[0],'#fa239a');
});
test('file and upload consent must be explicit',()=>{
  assert.throws(()=>vision.checkConsent({rightsConfirmed:true,allowFrameUpload:false}),/approval/);
  assert.throws(()=>cli.parseArgs(['--video','foo.mp4','--out','output']),/approval/);
  assert.throws(()=>cli.parseArgs(['--video','https://x.example/m.mp4','--out','output','--rights-confirmed','--allow-frame-upload','--bad']),/Unexpected/);
  assert.equal(cli.parseArgs(['--video','x.mp4','--out','x','--rights-confirmed','--allow-frame-upload']).rightsConfirmed,true);
});
test('vision API request uses four actual JPEGs, structured JSON, store:false',async()=>{
  const frames=vision.frameTimes(10).map(time=>({time,bytes:jpeg}));
  let inspected=false;
  const r=await vision.understandFrames(frames,{
    consent:{rightsConfirmed:true,allowFrameUpload:true},apiKey:'TEST_SERVER_SIDE_KEY',
    fetchImpl:async(url,request)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      const body=JSON.parse(request.body);
      assert.equal(body.store,false);
      assert.equal(body.text.format.type,'json_schema');
      assert.equal(body.input[0].content.filter(x=>x.type==='input_image').length,4);
      assert.match(body.input[0].content[2].image_url,/^data:image\/jpeg;base64,/);
      inspected=true;
      return {ok:true,json:async()=>({status:'completed',output:[{
        content:[{type:'output_text',text:JSON.stringify(a)}]
      }]})};
    }
  });
  assert.equal(inspected,true);
  assert.equal(r.analysis.visualStyle,'neon');
  assert.match(r.analysis.limitations,/no audio/);
});
test('provider failure blocks; does not echo secrets',async()=>{
  const frames=vision.frameTimes(10).map(time=>({time,bytes:jpeg}));
  await assert.rejects(vision.understandFrames(frames,{
    consent:{rightsConfirmed:true,allowFrameUpload:true},apiKey:'SENSITIVE_KEY',
    fetchImpl:async()=>({ok:false,status:403})
  }),error=>/403/.test(String(error))&&!String(error).includes('SENSITIVE_KEY'));
  await assert.rejects(vision.understandFrames(frames,{apiKey:'SENSITIVE_KEY'}),/approval/);
});
test('real original PNG is valid and OBJ faces use existing vertices',()=>{
  const png=art.makeTexture(a);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
  const idatLength=png.readUInt32BE(33);
  const raw=zlib.inflateSync(png.subarray(41,41+idatLength));
  assert.equal(raw.length,256*(1+4*256));
  assert.ok([...raw].some((v,index)=>index%4===0 && v>0));
  const obj=art.makeOrnamentObj(a).toString();
  const verts=obj.split('\n').filter(x=>x.startsWith('v '));
  const faces=obj.split('\n').filter(x=>x.startsWith('f '));
  assert.equal(verts.length,98);
  assert.equal(faces.length,192);
  for(const face of faces){
    const refs=face.split(' ').slice(1);
    assert.equal(refs.length,3);
    assert.ok(refs.every(ref=>Number(ref.split('/')[0])<=verts.length));
  }
});
test('package has valid CreatorLens base asset and is blocked from publishing',async()=>{
  const pkg=art.buildPackage(a,{sourceDigest:digest});
  assert.match(pkg.id,/^aura-neon-[a-f0-9]{12}$/);
  const preset=JSON.parse(pkg.blobs['creator-lens.json']);
  assert.equal(preset.BaseLensId,'cyber-visor');
  assert.deepEqual(preset.RequiredAssets,['procedural:cyber-visor']);
  assert.equal(pkg.manifest.AutoPublish,false);
  assert.equal(pkg.manifest.Status,'DRAFT_REVIEW_REQUIRED');
  assert.equal(pkg.manifest.FileHashes.length,4);
  for(const f of pkg.manifest.FileHashes)
    assert.equal(art.sha(pkg.blobs[f.Name]),f.Sha256);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crushx-aura-'));
  try{
    const out=await art.writePackage(dir,pkg);
    assert.equal((await fs.readFile(path.join(out,'overlay.png'))).length,pkg.blobs['overlay.png'].length);
    await assert.rejects(art.writePackage(dir,pkg));
    assert.equal((await fs.readdir(dir)).length,1);
  }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('mocked pipeline composes analysis and actual files without real provider calls',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'crushx-review-'));
  const fake={
    checkConsent:vision.checkConsent,verifyLocalFile:async()=>'/approved/local.mp4',
    probeVideo:async()=>({duration:2,width:64,height:64,audioPresent:false}),
    extractFrames:async()=>vision.frameTimes(2).map(time=>({time,bytes:jpeg})),
    understandFrames:async()=>({analysis:a,provider:'mock-provider',frameCount:4})
  };
  try{
    const result=await cli.createReviewDraft({video:'fake.mp4',out:root,
      rightsConfirmed:true,allowFrameUpload:true},{video:fake});
    assert.equal(result.status,'DRAFT_REVIEW_REQUIRED');
    assert.equal(result.autoPublish,false);
    assert.equal((await fs.readdir(result.destination)).length,5);
  }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('FFmpeg extracts four real frames from a generated local 2-second video',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crushx-ffmpeg-'));
  try{
    const output=path.join(dir,'synthetic.mp4');
    try{await invoke('ffmpeg',['-y','-v','error','-f','lavfi','-i',
      'testsrc2=size=160x120:rate=12','-t','2','-c:v','mpeg4',output],
      {timeout:15000,maxBuffer:100000});
    }catch(error){if(error.code==='ENOENT'){t.skip('ffmpeg not installed');return;}throw error}
    const real=await vision.verifyLocalFile(output);
    const info=await vision.probeVideo(real);
    assert.ok(info.duration>=1.5);
    assert.equal(info.width,160);
    const frames=await vision.extractFrames(real,info);
    assert.equal(frames.length,4);
    assert.ok(frames.every(f=>f.bytes[0]===0xff && f.bytes[1]===0xd8));
  }finally{await fs.rm(dir,{recursive:true,force:true})}
});
