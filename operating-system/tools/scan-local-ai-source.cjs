'use strict';
// Read-only source inventory. Never opens source content or reads credentials.
const fs=require('node:fs'),path=require('node:path');
const SKIP=new Set(['.git','node_modules','Library','Temp','build','dist','.gradle','.next','Pods','.venv']);
const CODE=/\.(?:js|jsx|mjs|cjs|ts|tsx|java|cs|py)$/i;
const GROUPS=Object.freeze({
  aura:/aura|assistant|agent|workflow/i,
  operating:/operating.system|kernel|permission|task.engine|audit/i,
  feed:/feed|recommend|rank|interest|reels/i,
  media:/media|video|transcript|inference|landmark/i,
  camera:/camera|lens|tracking|arcore|mediapipe/i,
  safety:/moderation|safety|consent|privacy/i
});
function scan(root,{maxFiles=25000}={}){
 if(typeof root!=='string'||!root||!path.isAbsolute(root)||!fs.statSync(root).isDirectory())
  throw Error('SOURCE_ROOT_INVALID');
 const results=Object.fromEntries(Object.keys(GROUPS).map(k=>[k,[]]));
 const q=[{dir:root,depth:0}];let visited=0,truncated=false;
 while(q.length){
  const {dir,depth}=q.shift();
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(entry.isSymbolicLink())continue;
   const file=path.join(dir,entry.name);
   if(entry.isDirectory()){
    if(depth<8&&!SKIP.has(entry.name))q.push({dir:file,depth:depth+1});
    continue;
   }
   if(!entry.isFile()||!CODE.test(entry.name))continue;
   visited++;
   if(visited>maxFiles){truncated=true;q.length=0;break;}
   const rel=path.relative(root,file).replaceAll('\\','/');
   for(const [group,pattern] of Object.entries(GROUPS)){
    if(pattern.test(rel)&&results[group].length<30)results[group].push(rel);
   }
  }
 }
 return {sourceRootChecked:true,scannedSourceFiles:Math.min(visited,maxFiles),truncated,
  runtimeVerified:false,androidVerified:false,
  categories:Object.fromEntries(Object.entries(results).map(([key,files])=>
   [key,{sampleCount:files.length,samplePaths:files}]))};
}
if(require.main===module){
 const i=process.argv.indexOf('--root');
 if(i<0||!process.argv[i+1]){console.error('Usage: node scan-local-ai-source.cjs --root <absolute-source-folder>');process.exitCode=2;}
 else try{console.log(JSON.stringify(scan(path.resolve(process.argv[i+1])),null,2));}
 catch{console.error('SOURCE_ROOT_NOT_ACCESSIBLE');process.exitCode=2;}
}
module.exports=Object.freeze({scan});
