'use strict';
// Trusted server-only PostgreSQL receipt storage. The app must NOT expose save()
// to mobile clients; a separate collector must authenticate event provenance.
const ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const valid=x=>typeof x==='string'&&ID.test(x);
const ACTIONS=new Set(['view','complete','rewatch','like','save','share','follow','skip','not_interested','hide']);
const ELIGIBLE="c.status='published' AND c.moderation='approved' "+
 "AND (c.visibility='public' OR (c.visibility='self' AND c.creator_subject=$1)) "+
 "AND (c.expires_at IS NULL OR c.expires_at>NOW()) "+
 "AND NOT EXISTS (SELECT 1 FROM cx_content_blocks b WHERE b.subject=$1 "+
 "AND b.blocked_creator=c.creator_subject) "+
 "AND NOT EXISTS (SELECT 1 FROM cx_content_hides h WHERE h.subject=$1 AND h.content_id=c.content_id)";
function toReceipt(row){
 if(!row)return null;
 return Object.freeze({version:1,issuer:row.issuer,audience:row.audience,
  subject:row.subject,eventId:row.event_id,contentId:row.content_id,
  action:row.action,at:Number(row.event_at_ms),watchFraction:Number(row.watch_fraction),
  issuedAt:Number(row.issued_at_ms),signature:String(row.signature).trim()});
}
const COLUMNS='subject,event_id,content_id,action,event_at_ms,watch_fraction,'+
 'issued_at_ms,issuer,audience,signature';
function createPostgresReceiptStore({pool,validateReceipt,now=Date.now,maxAgeMs=300000}={}){
 if(!pool||typeof pool.connect!=='function'||typeof pool.query!=='function'||
  typeof validateReceipt!=='function'||typeof now!=='function'||
  !Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300000)
  throw TypeError('RECEIPT_STORE_CONFIG_REQUIRED');
 async function transaction(work){
  const client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function')
   throw Error('RECEIPT_DB_CLIENT_REQUIRED');
  try{
   await client.query('BEGIN');
   const out=await work(client);
   await client.query('COMMIT');
   return out;
  }catch(e){try{await client.query('ROLLBACK');}catch{}throw e;}
  finally{client.release();}
 }
 // Only called by trusted server-side event workers AFTER independent checks.
 async function save({receipt}={}){
  if(!receipt||validateReceipt(receipt)!==true)throw Error('RECEIPT_SIGNATURE_INVALID');
  if(!valid(receipt.subject)||!valid(receipt.contentId)||!valid(receipt.eventId)||
     receipt.eventId.length<8||!ACTIONS.has(receipt.action)||
     !Number.isSafeInteger(receipt.issuedAt)||Math.abs(now()-receipt.issuedAt)>maxAgeMs)
    throw Error('RECEIPT_INPUT_INVALID');
  return transaction(async client=>{
   // Lock the consent row: serialize issuance with revocation/history erasure.
   const p=await client.query('SELECT can_read,can_personalize FROM cx_content_preferences '+
    'WHERE subject=$1 FOR UPDATE',[receipt.subject]);
   if(p.rows?.[0]?.can_read!==true||p.rows?.[0]?.can_personalize!==true)
    throw Error('PERSONALIZATION_CONSENT_REQUIRED');
   const prior=await client.query('SELECT '+COLUMNS+' FROM cx_trusted_event_receipts '+
    'WHERE subject=$1 AND event_id=$2',[receipt.subject,receipt.eventId]);
   if(prior.rows?.[0]){
    const old=toReceipt(prior.rows[0]);
    if(JSON.stringify(old)!==JSON.stringify(receipt))throw Error('RECEIPT_ID_CONFLICT');
    return Object.freeze({stored:false,duplicate:true});
   }
   // Eligibility is checked by the backend, not from a client visibility flag.
   const eligible=await client.query('SELECT c.content_id FROM cx_content_catalog c '+
    'WHERE '+ELIGIBLE+' AND c.content_id=$2 LIMIT 1',[receipt.subject,receipt.contentId]);
   if(eligible.rows?.length!==1)throw Error('CONTENT_ACCESS_DENIED');
   const values=[receipt.subject,receipt.eventId,receipt.contentId,receipt.action,
    receipt.at,receipt.watchFraction,receipt.issuedAt,receipt.issuer,receipt.audience,
    receipt.signature,new Date(receipt.issuedAt+maxAgeMs)];
   const inserted=await client.query('INSERT INTO cx_trusted_event_receipts '+
    '('+COLUMNS+',expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) '+
    'ON CONFLICT(subject,event_id) DO NOTHING RETURNING event_id',values);
   if(inserted.rows?.length!==1){
    const concurrent=await client.query('SELECT '+COLUMNS+' FROM cx_trusted_event_receipts '+
     'WHERE subject=$1 AND event_id=$2',[receipt.subject,receipt.eventId]);
    if(JSON.stringify(toReceipt(concurrent.rows?.[0]))!==JSON.stringify(receipt))
     throw Error('RECEIPT_ID_CONFLICT');
    return Object.freeze({stored:false,duplicate:true});
   }
   return Object.freeze({stored:true,duplicate:false});
  });
 }
 // The verifier uses read() inside its own backend authorization context.
 // No arbitrary lookups through public HTTP; never returns an expired receipt.
 async function read({subject,eventId,db}={}){
  if(!valid(subject)||!valid(eventId))return null;
  // Reuse the caller's transaction for consent-locked verification; otherwise
  // a pool with one connection (or saturated concurrent writers) can deadlock.
  const queryable=db===undefined?pool:db;
  if(typeof queryable?.query!=='function')throw Error('RECEIPT_DB_CLIENT_INVALID');
  const rows=await queryable.query('SELECT r.'+COLUMNS.split(',').join(',r.')+
   ' FROM cx_trusted_event_receipts r '+
   'JOIN cx_content_preferences p ON p.subject=r.subject '+
   'AND p.can_read=TRUE AND p.can_personalize=TRUE '+
   'WHERE r.subject=$1 AND r.event_id=$2 AND r.expires_at>NOW() LIMIT 1',
   [subject,eventId]);
  return toReceipt(rows.rows?.[0]);
 }
 // Bounded maintenance job, invoked only by an authorized server worker.
 async function purgeExpired({limit=500}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('PURGE_LIMIT_INVALID');
  const res=await pool.query('WITH expired AS (SELECT ctid FROM cx_trusted_event_receipts '+
   'WHERE expires_at<=NOW() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) '+
   'DELETE FROM cx_trusted_event_receipts r USING expired e WHERE r.ctid=e.ctid',
   [limit]);
  return {deleted:res.rowCount||0};
 }
 return Object.freeze({save,read,purgeExpired});
}
module.exports=Object.freeze({createPostgresReceiptStore});
