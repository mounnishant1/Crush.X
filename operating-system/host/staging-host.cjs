'use strict';
// Local/staging-only in-process runner. Not a distributed durable worker.
// To serve external devices use an authenticated TLS reverse proxy and a
// durable queue, not this direct loopback listener.
const {createServer}=require('node:http');
const {createAIHttpHandler}=require('../http/ai-handler.cjs');
function createStagingHost({system,verifyCredential,allowedOrigins=[],host='127.0.0.1',
 port=0,pollMs=50,durableAdvice=null,rateLimiter=null}={}){
 if(!system?.start||!system?.stop||!system?.tasks?.runNext||
  typeof verifyCredential!=='function'||host!=='127.0.0.1'||
  !Number.isInteger(port)||port<0||port>65535||
  !Number.isInteger(pollMs)||pollMs<20||pollMs>1000)
  throw TypeError('STAGING_HOST_CONFIG_REQUIRED');
 if(durableAdvice!==null&&typeof durableAdvice.runOne!=='function')
  throw TypeError('STAGING_DURABLE_WORKER_REQUIRED');
 const handler=createAIHttpHandler({system,verifyCredential,allowedOrigins,durableAdvice,rateLimiter});
 const http=createServer(handler);
 let started=false,busy=false,interval=null,active=Promise.resolve();
 async function worker(){
  if(!started||busy)return;
  busy=true;
  active=(async()=>{
   try{if(durableAdvice)await durableAdvice.runOne();await system.tasks.runNext();}
   catch{ /* generic failure; never log private task data */ }
  })();
  try{await active;}finally{busy=false;}
 }
 async function start(){
  if(started)throw Error('HOST_ALREADY_STARTED');
  await system.start();
  try{await new Promise((resolve,reject)=>{
   http.once('error',reject);http.listen(port,host,()=>{http.off('error',reject);resolve();});
  });}catch(e){await system.stop();throw e;}
  started=true;interval=setInterval(()=>{void worker();},pollMs);
  interval.unref?.();
  return Object.freeze({url:'http://127.0.0.1:'+http.address().port,
   stagingOnly:true,durableQueue:durableAdvice!==null,
   durableQueueConfigured:durableAdvice!==null});
 }
 async function stop(){
  if(!started)return;
  started=false;clearInterval(interval);
  await active;
  await new Promise((resolve,reject)=>http.close(err=>err?reject(err):resolve()));
  await system.stop();
 }
 return Object.freeze({start,stop,runOnce:worker});
}
module.exports=Object.freeze({createStagingHost});