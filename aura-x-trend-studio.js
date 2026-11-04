/* Crush.X AURA-X Trend-to-Lens/Game Studio.
 * Data-only trend recommendations over licensed/authorized metrics.
 * Does NOT scrape, fetch user feeds, run models, import assets or publish.
 * Node CommonJS + browser UMD; no dependencies.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrushXAuraTrendStudio = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const SOURCES = Object.freeze(['crushx', 'youtube', 'instagram', 'tiktok', 'snapchat']);
  const GRANTS = Object.freeze(['approved_api', 'owned_metrics', 'creator_consent']);
  const MAX_SIGNALS = 1000, MAX_AGE_MS = 14 * 86400000;
  const denyTheme = /\b(?:weapon|terror|sexual|nude|blood|suicide|selfharm|hate|racist|gore)\b/iu;
  const idPattern = /^[a-zA-Z0-9_.:-]{2,100}$/;
  function count(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 1e12 ? value : null;
  }
  function tag(value) {
    if (typeof value !== 'string') return '';
    const v = value.trim().replace(/^#/, '').toLowerCase();
    return /^[\p{L}\p{N}_-]{3,40}$/u.test(v) && !denyTheme.test(v) ? v : '';
  }
  function normalizeSignal(input, now) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {error:'invalid_record'};
    if (!SOURCES.includes(input.source)) return {error:'unsupported_source'};
    if (!GRANTS.includes(input.accessMode) || input.authorized !== true) return {error:'source_not_authorized'};
    if (input.source === 'crushx' && input.accessMode === 'approved_api') return {error:'invalid_access_mode'};
    if (input.source !== 'crushx' && input.accessMode === 'owned_metrics') return {error:'invalid_access_mode'};
    if (typeof input.postId !== 'string' || !idPattern.test(input.postId)) return {error:'invalid_post_id'};
    const publishedAt = Number(input.publishedAt), observedAt = Number(input.observedAt);
    if (!Number.isSafeInteger(publishedAt) || !Number.isSafeInteger(observedAt) ||
        publishedAt < 1 || observedAt < publishedAt || observedAt > now + 60000 ||
        publishedAt > now + 60000 || now - publishedAt > MAX_AGE_MS) return {error:'outside_trend_window'};
    const m = input.metrics || {};
    const views = count(m.views);
    if (views === null || views === 0) return {error:'missing_views'};
    const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).slice(0,30)
      .map(tag).filter(Boolean))].slice(0,12);
    if (!tags.length) return {error:'missing_safe_tags'};
    const metrics = {};
    for (const key of ['views','likes','comments','shares','saves']) {
      const v = count(m[key]);
      metrics[key] = v === null ? (key === 'views' ? views : null) : v;
    }
    let velocity = null;
    if (count(m.previousViews) !== null && Number.isSafeInteger(m.previousObservedAt) &&
        m.previousObservedAt >= publishedAt && m.previousObservedAt < observedAt &&
        views >= m.previousViews) {
      const hours = (observedAt - m.previousObservedAt) / 3600000;
      if (hours >= 0.25) velocity = Math.min(1e8, (views - m.previousViews) / hours);
    }
    return {source:input.source, postId:input.postId, observedAt, publishedAt, tags, metrics, velocity};
  }
  function themeFor(keyword) {
    if (/cat|kitten|pet|purr|cute/u.test(keyword))
      return {baseLensId:'cat-ears',category:'Animals',gameTemplateId:'SmileRush',family:'lens'};
    if (/fox|animal|wild/u.test(keyword))
      return {baseLensId:'fox',category:'Animals',gameTemplateId:'BlinkCatch',family:'lens'};
    if (/fruit|slice|cut|chop/u.test(keyword))
      return {baseLensId:'neon-mask',category:'SciFi',gameTemplateId:'FruitRush',family:'lens'};
    if (/quiz|math|brain|puzzle|memory/u.test(keyword))
      return {baseLensId:'holo-crown',category:'Fantasy',gameTemplateId:'MemoryPairs',family:'puzzle'};
    if (/space|star|galaxy|moon|cosmic/u.test(keyword))
      return {baseLensId:'celestial-halo',category:'Aesthetic',gameTemplateId:'TargetTap',family:'lens'};
    if (/cyber|neon|robot|tech|glow/u.test(keyword))
      return {baseLensId:'cyber-visor',category:'SciFi',gameTemplateId:'ColorCut',family:'lens'};
    if (/butterfly|beauty|sparkle|fashion/u.test(keyword))
      return {baseLensId:'butterfly',category:'Beauty',gameTemplateId:'ExpressionCombo',family:'lens'};
    return {baseLensId:'cat-ears',category:'Animals',gameTemplateId:'TargetTap',family:'lens'};
  }
  function buildTrends(rawSignals, {now = Date.now(), minPosts = 2, maxDrafts = 10} = {}) {
    if (!Array.isArray(rawSignals) || rawSignals.length > MAX_SIGNALS) throw new RangeError('Expected at most 1000 authorized signals');
    if (!Number.isSafeInteger(now) || now <= 0 || !Number.isInteger(minPosts) || minPosts < 2 ||
        minPosts > 20 || !Number.isInteger(maxDrafts) || maxDrafts < 1 || maxDrafts > 20)
      throw new RangeError('Invalid trend analysis options');
    const rejected = Object.create(null), dedup = new Map();
    for (const raw of rawSignals) {
      const item = normalizeSignal(raw, now);
      if (item.error) { rejected[item.error] = (rejected[item.error] || 0) + 1; continue; }
      const key = item.source + ':' + item.postId;
      const previous = dedup.get(key);
      if (!previous || previous.observedAt < item.observedAt) dedup.set(key, item);
    }
    const groups = new Map();
    for (const item of dedup.values()) {
      for (const word of item.tags) {
        if (!groups.has(word)) groups.set(word, []);
        groups.get(word).push(item);
      }
    }
    const ranked = [];
    for (const [keyword, items] of groups) {
      if (items.length < minPosts) continue;
      const sources = [...new Set(items.map(v => v.source))].sort();
      let weighted = 0, activity = 0;
      for (const item of items) {
        const m = item.metrics;
        const engagement = ((m.likes || 0) + (m.comments || 0) + 2 * (m.shares || 0) + 2 * (m.saves || 0)) / m.views;
        const ageHours = Math.max(0,(now - item.publishedAt) / 3600000);
        const freshness = Math.exp(-ageHours / 144);
        const velocityBonus = item.velocity === null ? 0 : Math.min(1, Math.log1p(item.velocity) / 13);
        weighted += 45 * Math.min(1,engagement) + 28 * freshness + 27 * velocityBonus;
        activity += m.views;
      }
      const score = Math.min(100,Math.round(weighted/items.length * 0.65 +
        Math.min(20, items.length * 4) + Math.min(15, (sources.length - 1) * 7.5)));
      ranked.push({keyword, score, samplePosts:items.length, sources, observedViews:activity,
        metricsProvenance:'authorized_records_only'});
    }
    ranked.sort((a,b)=>b.score-a.score || b.samplePosts-a.samplePosts || a.keyword.localeCompare(b.keyword));
    const drafts = ranked.slice(0,maxDrafts).map((t,index) => {
      const type = themeFor(t.keyword);
      const id = ('trend-' + t.keyword.replace(/[^\p{L}\p{N}-]+/gu,'-').replace(/^-|-$/g,'')).slice(0,54);
      const label = t.keyword.replace(/[-_]/g,' ').slice(0,40);
      return {
        id: id + '-' + String(index + 1),
        status:'DRAFT_REVIEW_REQUIRED',
        trend:t,
        creatorLensDocument: {
          SchemaVersion:1, Revision:1, Id:id, DisplayName:label + ' Vibe',
          BaseLensId:type.baseLensId, Category:type.category, Author:'AURA-X draft',
          Description:'Original Crush.X prototype inspired by the general ' + label + ' trend; no third-party assets copied.',
          AssetLicense:'Unreviewed', ThumbnailReference:'', Shader:'Installed',
          RequiredAssets:[], Parameters:{Scale:1,OffsetX:0,OffsetY:0,OffsetZ:0,RotationX:0,
            RotationY:0,RotationZ:0,OverrideTint:false,TintRed:1,TintGreen:1,TintBlue:1,
            PulseAmplitude:0.04,PulseHz:0.8}, ExpressionRules:[]
        },
        gameDraft: {
          templateId:type.gameTemplateId, family:type.family, title:label + ' Challenge',
          implementation:'EXISTING_TEMPLATE_ONLY', themeTag:t.keyword,
          note:'The existing Unity game logic runs unchanged until an approved themed asset pack is installed.'
        },
        reviewGates:['source_rights','asset_licence','moderation','creator_validation',
          'Unity_Android_QA','owner_approval'],
        publishAllowed:false
      };
    });
    return {
      kind:'aura-x-trend-lens-draft-batch', version:1, generatedAt:now,
      acceptedSignals:dedup.size, rejected, trends:ranked.slice(0,50), drafts,
      limitations:'No remote content fetched or inspected. Tags and metrics are supplied by authorized connectors; these are draft suggestions, not live published AR effects.'
    };
  }
  return Object.freeze({SOURCES, GRANTS, normalizeSignal, buildTrends, themeFor});
});
