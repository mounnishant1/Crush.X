/* Crush.X AURA-X local capabilities. No network, inbox access, model inference, or sending.
 * Pure functions for safe, explainable creator and message draft assistance.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrushXAuraCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const bounded = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const count = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? Math.floor(value) : null;
  const ratio = (value, total) => total > 0 && value !== null ? (100 * value / total).toFixed(1) + '%' : null;
  function reelAnalysis(reel, options) {
    const r = reel && typeof reel === 'object' ? reel : {};
    const m = options && typeof options === 'object' ? options : {};
    const caption = bounded(r.caption, 2200).trim();
    const views = count(m.views);
    const likes = count(r.likes);
    const comments = Array.isArray(r.comments) ? r.comments.length : count(r.comments);
    const shares = count(r.shares);
    const saves = count(m.saves);
    const avgWatchSeconds = typeof m.averageWatchSeconds === 'number' && Number.isFinite(m.averageWatchSeconds) && m.averageWatchSeconds >= 0 ? m.averageWatchSeconds : null;
    const durationSeconds = typeof m.durationSeconds === 'number' && Number.isFinite(m.durationSeconds) && m.durationSeconds > 0 ? m.durationSeconds : null;
    const completionCount = count(m.completions);
    const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 20);
    const cta = /(follow|save|share|comment|tell me|thoughts\?|which|subscribe|बताओ|कमेंट|शेयर|फॉलो|सेव)/i.test(caption);
    const hook = /^(watch|wait|how|why|3 |5 |stop|did you|क्या|कैसे|क्यों|रुको|देखो|ये)/i.test(caption);
    const observations = [];
    if (!caption) observations.push('No caption is available to review.');
    else {
      observations.push('Caption: ' + caption.length + ' characters; ' + tags.length + ' hashtags.');
      if (!hook) observations.push('Consider a clearer opening hook in the first caption sentence.');
      if (!cta) observations.push('Try one relevant call to action (ask a genuine question, not engagement bait).');
      if (caption.length > 250) observations.push('Test a shorter caption with its main idea first.');
      if (tags.length > 8) observations.push('Use fewer, more relevant hashtags instead of a long list.');
    }
    const metrics = [];
    if (likes !== null) metrics.push('Likes: ' + likes + ' (sample app data; not verified live).');
    if (comments !== null) metrics.push('Comments: ' + comments + ' (sample app data; not verified live).');
    if (shares !== null) metrics.push('Shares: ' + shares + ' (sample app data; not verified live).');
    if (views !== null) {
      metrics.push('Views: ' + views + ' (provided value).');
      const engagements = [likes, comments, shares, saves].every(v => v !== null) ? likes + comments + shares + saves : null;
      if (engagements !== null) metrics.push('Engagements / views: ' + ratio(engagements, views) + ' (provided inputs, not unique people).');
      if (completionCount !== null) metrics.push('Completions / views: ' + ratio(completionCount, views) + '.');
    }
    if (avgWatchSeconds !== null && durationSeconds !== null) {
      metrics.push('Average watch / duration: ' + (100 * avgWatchSeconds / durationSeconds).toFixed(1) + '% (may exceed 100% on loops).');
    }
    const actions = [
      'Check the first 2 seconds: make the story or benefit clear immediately.',
      'Add readable captions and verify they match the audio.',
      'Try two authentic opening hooks; compare retention after real analytics are connected.'
    ];
    if (caption && !cta) actions.push('End with a specific, natural viewer question.');
    if (!bounded(r.song, 200)) actions.push('Confirm the audio attribution and licensing before publishing.');
    return {
      kind: 'reel',
      title: 'Reel review — local guidance',
      metrics,
      observations,
      actions,
      limitations: 'No video frames, audio, live views, reach, retention, audience or trend API were inspected. Sample counts are not creator insights.'
    };
  }
  function riskSignals(incoming) {
    const message = bounded(incoming, 4000);
    const signals = [];
    if (/\b(otp|one.time password|verification code|password|passcode|2fa|pin)\b|ओटीपी|पासवर्ड|पिन/iu.test(message))
      signals.push('Account-security request: never share passwords, OTPs or recovery codes.');
    if (/\b(upi|wire transfer|bank account|send money|payment link|crypto|gift card)\b|पैसे भेज|पेमेंट लिंक/iu.test(message))
      signals.push('Payment-related request: independently verify the sender before acting.');
    if (/\b(urgent|immediately|act now|last chance)\b|तुरंत|अभी करो/iu.test(message))
      signals.push('Urgency detected: check the details rather than rushing.');
    if (/\b(threat|blackmail|leak your|hurt you)\b|धमकी|ब्लैकमेल/iu.test(message))
      signals.push('Possible threatening message: consider reporting or blocking.');
    return signals;
  }
  function messageAssistance(incoming, draft, prompt) {
    const original = bounded(draft, 4000).trim();
    const received = bounded(incoming, 4000).trim();
    const instruction = bounded(prompt, 300).trim().toLowerCase();
    const risk = riskSignals(received);
    const hindi = /[\u0900-\u097f]/u.test(instruction) || /\b(hindi|hinglish)\b/i.test(instruction);
    const wantsSummary = /summari[sz]e|analyse|analy[sz]e|risk|safety|समझ|विश्लेषण|सारांश/i.test(instruction);
    const polish = /polish|rewrite|improve|professional|formal|shorter|सुधार|बेहतर|rewrite/i.test(instruction);
    const question = /\?|\b(when|where|how|why|can you|could you)\b|कब|कैसे|कहाँ/u.test(received);
    let suggestion = '';
    const observations = [];
    if (!received && !original) {
      observations.push('Enter an incoming message or write a draft first.');
    } else if (wantsSummary) {
      observations.push(received ? 'You provided an incoming message for review.' : 'Reviewing your draft only.');
      observations.push(question ? 'The message may contain a question requiring a specific response.' : 'No clear direct question was detected.');
      if (risk.length) observations.push(...risk);
    } else if (polish && original) {
      suggestion = original.replace(/\s+/g, ' ').trim().slice(0, 4000);
      if (suggestion && !/[.!?।]$/u.test(suggestion)) suggestion += hindi ? '।' : '.';
      observations.push('Light editing only; the original meaning is preserved. Review before using.');
    } else if (risk.length) {
      suggestion = hindi
        ? 'मैसेज मिला। सुरक्षा के लिए मैं कोई OTP, पासवर्ड या पेमेंट जानकारी साझा नहीं करूँगा। कृपया आधिकारिक माध्यम से पुष्टि करें।'
        : 'Thanks for your message. For security, I cannot share account codes, passwords or payment details. Please verify through an official channel.';
      observations.push(...risk);
    } else if (original) {
      suggestion = original;
      observations.push('Existing draft preserved. Ask “polish” to tidy it without changing your intent.');
    } else if (question) {
      suggestion = hindi
        ? 'आपका मैसेज मिला। मैं जानकारी देखकर पुष्टि करूँगा।'
        : 'Thanks for asking. I will check the details before confirming.';
      observations.push('This is a neutral reply, not a factual answer to the question.');
    } else {
      suggestion = hindi
        ? 'आपके मैसेज के लिए धन्यवाद। मैं देखकर जवाब दूँगा।'
        : 'Thanks for your message. I will review it and get back to you.';
    }
    if (risk.length && !observations.some(v => v.includes('security'))) observations.push(...risk);
    return {
      kind: 'message',
      title: 'Message assistant — draft only',
      suggestion,
      observations,
      risk,
      limitations: 'No live inbox was read. No message was sent, scheduled or delegated. Replies require your review and explicit action.'
    };
  }
  return Object.freeze({reelAnalysis, messageAssistance, riskSignals});
});
