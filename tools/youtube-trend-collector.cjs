/* Server-side official YouTube Data API collector for AURA-X Trend Studio.
 * No browser embedding; no scraping; no OAuth/user session access.
 * Uses video metadata, never downloads or claims to watch video frames.
 */
'use strict';
const studio = require('../aura-x-trend-studio.js');
function tokens(video) {
  const snippet = video && video.snippet || {};
  const raw = Array.isArray(snippet.tags) ? snippet.tags.slice(0,12) : [];
  const text = [snippet.title, snippet.description].filter(v=>typeof v==='string').join(' ').slice(0,3000);
  raw.push(...(text.match(/#[\p{L}\p{N}_-]{3,40}/gu) || []));
  const tags = new Set();
  for (const word of raw) {
    const result = studio.normalizeSignal({
      source:'youtube',postId:'tag-check',tags:[word],
      authorized:true,accessMode:'approved_api',
      publishedAt:1,observedAt:1,metrics:{views:1}
    },1);
    if (!result.error) for (const tag of result.tags) tags.add(tag);
  }
  return [...tags].slice(0,12);
}
async function collectYouTubePopular({
  apiKey, approved, regionCode='IN', maxResults=50, now=Date.now(),
  fetchImpl=typeof fetch === 'function' ? fetch : undefined
}={}) {
  if (approved !== true) throw new Error('Operator approval required for external trend collection');
  if (typeof apiKey!=='string' || !apiKey || typeof fetchImpl!=='function')
    throw new Error('Server-only YouTube API credential and fetch implementation required');
  if (!/^[A-Z]{2}$/.test(regionCode) || !Number.isInteger(maxResults) || maxResults<1 || maxResults>50)
    throw new RangeError('Invalid region or request size');
  if (!Number.isSafeInteger(now) || now<=0) throw new RangeError('Invalid observation clock');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  for (const [k,v] of Object.entries({
    part:'snippet,statistics',chart:'mostPopular',regionCode,
    maxResults:String(maxResults),key:apiKey
  })) url.searchParams.set(k,v);
  const res = await fetchImpl(url.toString(),{method:'GET',headers:{Accept:'application/json'}});
  if (!res || !res.ok) throw new Error('YouTube metadata request failed; status=' + (res && res.status || 'unknown'));
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.items)) throw new Error('YouTube returned invalid metadata');
  const records = [];
  for (const video of payload.items.slice(0,maxResults)) {
    if (!video || typeof video.id!=='string') continue;
    const tags = tokens(video);
    if (!tags.length) continue;
    const publishedAt = Date.parse(video.snippet && video.snippet.publishedAt);
    const stats = video.statistics || {};
    const views = Number(stats.viewCount);
    if (!Number.isSafeInteger(views) || views<=0) continue;
    const metrics = {views};
    for (const [target,source] of [['likes','likeCount'],['comments','commentCount']]) {
      if (Object.prototype.hasOwnProperty.call(stats,source)) {
        const value=Number(stats[source]);
        if (Number.isSafeInteger(value)&&value>=0) metrics[target]=value;
      }
    }
    const record = {source:'youtube',postId:video.id,tags,accessMode:'approved_api',
      authorized:true,publishedAt,observedAt:now,metrics};
    if (!studio.normalizeSignal(record,now).error) records.push(record);
  }
  return records;
}
module.exports={collectYouTubePopular,tokens};
if(require.main===module) {
  collectYouTubePopular({
    apiKey:process.env.YOUTUBE_API_KEY,
    approved:process.env.TREND_COLLECTION_APPROVED==='true',
    regionCode:process.env.TREND_REGION || 'IN'
  }).then(records=>{
    const result=studio.buildTrends(records);
    process.stdout.write(JSON.stringify({source:'youtube',signals:records.length,
      trends:result.trends,drafts:result.drafts},null,2)+'\n');
  }).catch(error=>{process.stderr.write(String(error.message||'Trend collector failed')+'\n');process.exitCode=1});
}
