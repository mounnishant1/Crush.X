/* Run on a trusted server / developer machine, never in mobile UI.
 *
 * OPENAI_API_KEY=<server_secret> node tools/aura-video-to-lens.cjs \
 *   --video ./consented-reel.mp4 --out ./work/review-lenses \
 *   --rights-confirmed --allow-frame-upload
 *
 * No automatic publishing. No remote URL input.
 */
'use strict';
const {createHash}=require('node:crypto');
const vision=require('./aura-vision-analyzer.cjs');
const factory=require('./aura-original-asset-factory.cjs');
function parseArgs(args){
  const result={rightsConfirmed:false,allowFrameUpload:false};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--rights-confirmed')result.rightsConfirmed=true;
    else if(arg==='--allow-frame-upload')result.allowFrameUpload=true;
    else if(['--video','--out','--model'].includes(arg)){
      if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+arg);
      const key=arg==='--video'?'video':arg==='--out'?'out':'model';
      if(result[key])throw new Error('Duplicate option '+arg);
      result[key]=args[++i];
    }else throw new Error('Unexpected option '+arg);
  }
  if(!result.video||!result.out)throw new Error('Both --video and --out are required');
  vision.checkConsent(result);
  return result;
}
async function createReviewDraft(options,{video=vision,art=factory}={}){
  video.checkConsent(options);
  const filename=await video.verifyLocalFile(options.video);
  const media=await video.probeVideo(filename);
  const frames=await video.extractFrames(filename,media);
  const report=await video.understandFrames(frames,{
    model:options.model||'gpt-4.1-mini',
    consent:{rightsConfirmed:options.rightsConfirmed,allowFrameUpload:options.allowFrameUpload}
  });
  const digest=createHash('sha256').update(Buffer.concat(frames.map(f=>f.bytes))).digest('hex');
  const pack=art.buildPackage(report.analysis,{sourceDigest:digest});
  const dest=await art.writePackage(options.out,pack);
  return {
    destination:dest,packageId:pack.id,status:pack.manifest.Status,
    capturedFrames:frames.length,observedDurationSeconds:media.duration,
    audioPresentButNotAnalyzed:media.audioPresent,
    analysis:report.analysis,model:report.provider,autoPublish:false,
    notes:'Original review-only procedural geometry and overlay; not activated in public LensCatalog.'
  };
}
if(require.main===module){
  Promise.resolve().then(()=>parseArgs(process.argv.slice(2))).then(createReviewDraft)
    .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(err=>{process.stderr.write('AURA-X draft pipeline blocked: '+String(err.message||'error')+'\n');process.exitCode=1});
}
module.exports={parseArgs,createReviewDraft};
