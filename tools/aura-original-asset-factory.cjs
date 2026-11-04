/* AURA-X original procedural art factory.
 * Creates original RGBA PNG + low-poly OBJ + a Unity-compatible preset.
 * No third-party video image is copied. Packages are REVIEW ONLY.
 */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const zlib=require('node:zlib');
const {createHash,randomUUID}=require('node:crypto');
const vision=require('./aura-vision-analyzer.cjs');
const BASES=Object.freeze({
  neon:['cyber-visor','SciFi','ColorCut'],
  cosmic:['celestial-halo','Aesthetic','TargetTap'],
  playful:['cat-ears','Animals','SmileRush'],
  minimal:['holo-crown','Fantasy','MemoryPairs'],
  nature:['butterfly','Beauty','ExpressionCombo'],
  retro:['robo-helmet','SciFi','TargetTap'],
  unknown:['cat-ears','Animals','TargetTap']
});
function sha(data){return createHash('sha256').update(data).digest('hex')}
const table=Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function crc32(data){let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(type,data){
  const name=Buffer.from(type,'ascii'),size=Buffer.alloc(4),sum=Buffer.alloc(4);
  size.writeUInt32BE(data.length);sum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,sum]);
}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function rgba(hex){return [1,3,5].map(p=>parseInt(hex.slice(p,p+2),16))}
function makeTexture(analysis,size=256){
  const a=vision.validateVision(analysis);
  if(!Number.isInteger(size)||size<32||size>512)throw new RangeError('Texture size must be 32–512');
  const colors=a.palette.map(rgba),image=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++){
    const offset=y*(size*4+1);image[offset]=0;
    for(let x=0;x<size;x++){
      const nx=(x+.5)/size*2-1,ny=(y+.5)/size*2-1;
      const r=Math.sqrt(nx*nx+ny*ny),angle=Math.atan2(ny,nx);
      const peaks=a.visualStyle==='cosmic'?8:a.visualStyle==='playful'?5:12;
      const ring=Math.abs(r-(.56+.08*Math.sin(peaks*angle)));
      const center=Math.max(0,1-r/.47);
      const halo=Math.exp(-ring*ring*500);
      const accent=Math.exp(-Math.pow(r-.82,2)*160)*(.5+.5*Math.cos(angle*8));
      const alpha=clamp(Math.round(255*(.80*halo+.44*center+.40*accent)),0,235);
      const w=clamp((.5+.5*Math.sin(3*angle+5*r)),0,1),pixel=offset+1+x*4;
      for(let c=0;c<3;c++)
        image[pixel+c]=clamp(Math.round(colors[0][c]*(1-w)+colors[1][c]*w*.65+colors[2][c]*w*.35),0,255);
      image[pixel+3]=alpha;
    }
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
  ihdr[8]=8;ihdr[9]=6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(image,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function makeOrnamentObj(analysis){
  const a=vision.validateVision(analysis);
  const segments=48,vertices=[],uv=[],faces=[];
  for(let i=0;i<=segments;i++){
    const angle=i/segments*2*Math.PI,peaks=a.visualStyle==='cosmic'?8:5;
    const inner=.34,outer=.51+.08*Math.sin(peaks*angle);
    for(const radius of [inner,outer]){
      vertices.push([Math.cos(angle)*radius,Math.sin(angle)*radius,0.03*Math.cos(3*angle)]);
      uv.push([.5+Math.cos(angle)*radius*.5,.5+Math.sin(angle)*radius*.5]);
    }
  }
  for(let i=0;i<segments;i++){
    const v=i*2+1;
    faces.push([v,v+1,v+2],[v+1,v+3,v+2]);
  }
  const lines=['# Original procedural AURA-X ornament, no external 3D model','o CrushXAuraOrnament'];
  vertices.forEach(v=>lines.push('v '+v.map(n=>n.toFixed(6)).join(' ')));
  uv.forEach(v=>lines.push('vt '+v.map(n=>n.toFixed(6)).join(' ')));
  for(const f of faces){
    lines.push('f '+f.map(n=>n+'/'+n).join(' '));
    lines.push('f '+f.slice().reverse().map(n=>n+'/'+n).join(' '));
  }
  return Buffer.from(lines.join('\n')+'\n');
}
function makeCreatorPreset(a,id){
  const [base,category]=BASES[a.visualStyle];
  return {
    SchemaVersion:1,Revision:1,Id:id,DisplayName:'AURA '+a.visualStyle+' original',
    BaseLensId:base,Category:category,Author:'Crush.X AURA-X',
    Description:'Original procedural draft over the installed '+base+' lens; 3D ornament is a separate review-only preview until runtime integration.',
    AssetLicense:'Unreviewed',ThumbnailReference:'',Shader:'Installed',
    RequiredAssets:['procedural:'+base],
    Parameters:{Scale:1,OffsetX:0,OffsetY:0,OffsetZ:0,
      RotationX:0,RotationY:0,RotationZ:0,OverrideTint:false,
      TintRed:1,TintGreen:1,TintBlue:1,PulseAmplitude:.04,PulseHz:.8},
    ExpressionRules:[]
  };
}
function buildPackage(analysis,{sourceDigest='unknown'}={}){
  const a=vision.validateVision(analysis);
  if(!/^(?:[0-9a-f]{64}|unknown)$/.test(sourceDigest))throw new Error('Invalid source digest');
  const fingerprint=sha(JSON.stringify({a,sourceDigest})).slice(0,12);
  const id='aura-'+a.visualStyle+'-'+fingerprint;
  const texture=makeTexture(a),mesh=makeOrnamentObj(a);
  const preset=Buffer.from(JSON.stringify(makeCreatorPreset(a,id),null,2)+'\n');
  const game=Buffer.from(JSON.stringify({
    status:'DRAFT_REVIEW_REQUIRED',gameTemplateId:a.gameTemplate,
    originalVisualStyle:a.visualStyle,originalMotionHint:a.motion,
    usesExistingUnityGameCore:true,notes:'Theme suggestion only; game mechanics and Unity scene hookup require review.'
  },null,2)+'\n');
  const blobs={'overlay.png':texture,'ornament.obj':mesh,'creator-lens.json':preset,'game-theme.json':game};
  const files=Object.entries(blobs).map(([Name,blob])=>({Name,Sha256:sha(blob),SizeBytes:blob.length}));
  const manifest={
    SchemaVersion:1,Id:id,Status:'DRAFT_REVIEW_REQUIRED',AutoPublish:false,
    ProductionReady:false,SourceDigest:sourceDigest,
    VisualStyle:a.visualStyle,MotionHint:a.motion,Provider:'external_opt_in_visual_model',
    SourceFramesCopied:false,OriginalProceduralArt:true,
    Important:'Preview-only OBJ/PNG. Runtime LensCatalog registration and exact-hash review required before publishing.',
    FileHashes:files,
    ReviewGates:['source_rights','human_visual_review','asset_licence','moderation',
      'Unity_import','Android_device_QA','owner_approval','trusted_publish_receipt']
  };
  blobs['manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  return {id,blobs,manifest};
}
async function writePackage(outputRoot,packageData,{filesystem=fs}={}){
  if(!packageData||!/^aura-[a-z]+-[a-f0-9]{12}$/.test(packageData.id)||
     !packageData.blobs||typeof outputRoot!=='string'||!outputRoot.trim())
    throw new Error('Invalid output package');
  const root=path.resolve(outputRoot);
  await filesystem.mkdir(root,{recursive:true});
  const final=path.join(root,packageData.id);
  const tmp=path.join(root,'.'+packageData.id+'-'+randomUUID()+'.tmp');
  await filesystem.mkdir(tmp,{recursive:false});
  try{
    for(const [name,bytes] of Object.entries(packageData.blobs)){
      if(!['overlay.png','ornament.obj','creator-lens.json','game-theme.json','manifest.json'].includes(name)||
         !Buffer.isBuffer(bytes)||bytes.length>2*1024*1024)
        throw new Error('Unexpected or oversized asset');
      await filesystem.writeFile(path.join(tmp,name),bytes,{flag:'wx'});
    }
    await filesystem.rename(tmp,final);
  }catch(error){
    await filesystem.rm(tmp,{recursive:true,force:true});
    throw error;
  }
  return final;
}
module.exports={BASES,sha,crc32,makeTexture,makeOrnamentObj,makeCreatorPreset,buildPackage,writePackage};
