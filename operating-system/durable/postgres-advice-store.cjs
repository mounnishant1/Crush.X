'use strict';
// PostgreSQL 16+ durable storage for encrypted AURA-X advice-only jobs.
// Atomic lease claims are fenced by token and expiry. No public HTTP surface.
const {randomUUID}=require('node:crypto');
const ID=/^[-a-f0-9]{36}$/;
const STATUS=new Set(['completed','failed','blocked']);
const number=x=>Number.isSafeInteger(x)&&x>=0;
const sealed=v=>v===null||(v&&typeof v==='object'&&!Array.isArray(v)&&
 typeof v.iv==='string'&&typeof v.tag==='string'&&typeof v.data==='string'&&
 JSON.stringify(v).length<=10000);
const FIELDS='id,subject,workflow,input_hash,status,attempts,created_at_ms,'+
 'next_run_at_ms,due_at_ms,expires_at_ms,sealed,sealed_result,'+
 'lease_token,lease_until_ms,finished_at_ms,code';
function map(row){
 if(!row)return null;
 return {id:row.id,subject:row.subject,workflow:row.workflow,
  inputHash:row.input_hash,status:row.status,attempts:Number(row.attempts),
  createdAt:Number(row.created_at_ms),nextRunAt:Number(row.next_run_at_ms),
  dueAt:row.due_at_ms==null?null:Number(row.due_at_ms),
  expiresAt:Number(row.expires_at_ms),
  sealed:row.sealed, sealedResult:row.sealed_result,
  leaseToken:row.lease_token,leaseUntil:row.lease_until_ms==null?null:Number(row.lease_until_ms),
  finishedAt:row.finished_at_ms==null?null:Number(row.finished_at_ms),code:row.code};
}
function createPostgresAdviceStore({pool}={}){
 if(typeof pool?.query!=='function')throw TypeError('POSTGRES_ADVICE_CONFIG_REQUIRED');
 async function get(id){
  if(typeof id!=='string'||!ID.test(id))return null;
  const res=await pool.query('SELECT '+FIELDS+' FROM cx_aura_advice_jobs WHERE id=$1',[id]);
  return map(res.rows?.[0]);
 }
 async function insert(job){
  if(!job||typeof job!=='object'||!ID.test(job.id||'')||
   typeof job.subject!=='string'||!job.subject||job.subject.length>128||
   typeof job.workflow!=='string'||!job.workflow||job.workflow.length>64||
   typeof job.inputHash!=='string'||!/^[a-f0-9]{64}$/.test(job.inputHash)||
   job.status!=='queued'||job.attempts!==0||
   ![job.createdAt,job.nextRunAt,job.expiresAt].every(number)||
   job.expiresAt<=job.createdAt||!sealed(job.sealed)||job.sealed===null)
   throw Error('POSTGRES_ADVICE_JOB_INVALID');
  const res=await pool.query('INSERT INTO cx_aura_advice_jobs '+
   '(id,subject,workflow,input_hash,status,attempts,created_at_ms,next_run_at_ms,'+
   'due_at_ms,expires_at_ms,sealed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) '+
   'ON CONFLICT(id) DO NOTHING RETURNING id',
   [job.id,job.subject,job.workflow,job.inputHash,'queued',0,job.createdAt,
    job.nextRunAt,job.nextRunAt,job.expiresAt,job.sealed]);
  return res.rows?.length===1;
 }
 async function claim({now,leaseMs}={}){
  if(!number(now)||!number(leaseMs)||leaseMs<30000||leaseMs>300000)
   throw Error('POSTGRES_ADVICE_CLAIM_INVALID');
  const leaseToken=randomUUID(),end=now+leaseMs;
  const res=await pool.query('WITH candidate AS ('+
   'SELECT id FROM cx_aura_advice_jobs WHERE status IN (\'queued\',\'running\') '+
   'AND due_at_ms<=$1 AND expires_at_ms>$1 ORDER BY due_at_ms,id '+
   'FOR UPDATE SKIP LOCKED LIMIT 1) '+
   'UPDATE cx_aura_advice_jobs j SET status=\'running\',attempts=j.attempts+1,'+
   'lease_token=$2,lease_until_ms=$3,due_at_ms=$3 '+
   'FROM candidate WHERE j.id=candidate.id RETURNING '+FIELDS.split(',').map(x=>'j.'+x).join(','),
   [now,leaseToken,end]);
  return map(res.rows?.[0]);
 }
 async function settle({id,leaseToken,status,code=null,sealedResult=null,now}={}){
  if(!ID.test(id||'')||typeof leaseToken!=='string'||!leaseToken||
   !STATUS.has(status)||!number(now)||!sealed(sealedResult))
   throw Error('POSTGRES_ADVICE_SETTLE_INVALID');
  const res=await pool.query('UPDATE cx_aura_advice_jobs SET status=$3,code=$4,'+
   'sealed_result=$5,finished_at_ms=$6,sealed=NULL,lease_token=NULL,'+
   'lease_until_ms=NULL,due_at_ms=NULL '+
   "WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until_ms>$6 RETURNING id",
   [id,leaseToken,status,code,sealedResult,now]);
  return res.rows?.length===1;
 }
 async function cancel({id,subject,now}={}){
  if(!ID.test(id||'')||typeof subject!=='string'||!subject||!number(now))
   throw Error('POSTGRES_ADVICE_CANCEL_INVALID');
  const res=await pool.query("UPDATE cx_aura_advice_jobs SET status='cancelled',"+
   'finished_at_ms=$3,sealed=NULL,due_at_ms=NULL '+
   "WHERE id=$1 AND subject=$2 AND status='queued' RETURNING id",[id,subject,now]);
  return res.rows?.length===1;
 }
 async function purge({id,subject}={}){
  if(!ID.test(id||'')||typeof subject!=='string'||!subject)throw Error('POSTGRES_ADVICE_PURGE_INVALID');
  const res=await pool.query("DELETE FROM cx_aura_advice_jobs WHERE id=$1 AND subject=$2 "+
   "AND status<>'running' RETURNING id",[id,subject]);
  return res.rows?.length===1;
 }
 async function purgeExpired({now,limit=250}={}){
  if(!number(now)||!Number.isInteger(limit)||limit<1||limit>1000)
   throw Error('POSTGRES_ADVICE_PURGE_LIMIT_INVALID');
  const res=await pool.query('WITH old AS ('+
   'SELECT id FROM cx_aura_advice_jobs WHERE expires_at_ms<=$1 '+
   "AND (status<>'running' OR lease_until_ms<=$1) "+
   'ORDER BY expires_at_ms,id FOR UPDATE SKIP LOCKED LIMIT $2) '+
   'DELETE FROM cx_aura_advice_jobs j USING old WHERE j.id=old.id',[now,limit]);
  return {deleted:res.rowCount||0};
 }
 return Object.freeze({get,insert,claim,settle,cancel,purge,purgeExpired});
}
module.exports=Object.freeze({createPostgresAdviceStore});
