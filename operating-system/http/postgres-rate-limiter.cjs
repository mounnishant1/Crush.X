'use strict';
// Shared Postgres per-account limiter for local-PC AURA/API hosting.
// Never fall back to allow=true when PostgreSQL is unavailable.
const {createHmac}=require('node:crypto');
function createPostgresRateLimiter({pool,secret,limit=60,windowMs=60000}={}){
 if(typeof pool?.query!=='function'||!Buffer.isBuffer(secret)||secret.length!==32||
  !Number.isSafeInteger(limit)||limit<1||limit>1000||
  !Number.isSafeInteger(windowMs)||windowMs<1000||windowMs>3600000)
  throw TypeError('POSTGRES_RATE_CONFIG_REQUIRED');
 async function allow({subject,now=Date.now(),bucket='aura'}={}){
  if(typeof subject!=='string'||!subject||subject.length>128||
   !/^[a-z]{2,32}$/.test(bucket)||!Number.isSafeInteger(now)||now<0)
   throw Error('POSTGRES_RATE_INPUT_INVALID');
  const window=Math.floor(now/windowMs);
  const key=createHmac('sha256',secret).update(JSON.stringify([subject,bucket,window])).digest('hex');
  const expiresAt=new Date((window+2)*windowMs);
  const result=await pool.query('INSERT INTO cx_aura_rate_buckets (bucket_key,hits,expires_at) '+
   'VALUES($1,1,$2) ON CONFLICT(bucket_key) DO UPDATE SET '+
   'hits=cx_aura_rate_buckets.hits+1 '+
   'WHERE cx_aura_rate_buckets.hits<$3 RETURNING hits',
   [key,expiresAt,limit]);
  return result.rows?.length===1;
 }
 async function purgeExpired({limit=250}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('POSTGRES_RATE_PURGE_INVALID');
  const res=await pool.query('WITH expired AS (SELECT bucket_key FROM cx_aura_rate_buckets '+
   'WHERE expires_at<=NOW() ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT $1) '+
   'DELETE FROM cx_aura_rate_buckets r USING expired e WHERE r.bucket_key=e.bucket_key',[limit]);
  return {deleted:res.rowCount||0};
 }
 return Object.freeze({allow,purgeExpired});
}
module.exports=Object.freeze({createPostgresRateLimiter});
