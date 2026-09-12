/* ============================================================
   JIREH SCORING ENGINE
   One implementation, two runtimes. The browser scores the
   diagnostic for the visitor; the intake server re-scores the
   submitted answers so a lead value can never be forged by a
   client that edits its own payload.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JirehScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round(n) { return Math.round(n); }

  /* Collect the raw and maximum attainable value per dimension. */
  function tally(questions, answers) {
    var acc = {};
    questions.forEach(function (q) {
      var d = acc[q.dimension] || (acc[q.dimension] = { raw: 0, max: 0, answered: 0, total: 0 });
      d.total++;
      var a = answers[q.id];
      if (q.type === 'multi') {
        d.max += q.options.reduce(function (s, o) { return s + o.value; }, 0);
        if (Array.isArray(a) && a.length) {
          d.answered++;
          a.forEach(function (i) { if (q.options[i]) d.raw += q.options[i].value; });
        }
      } else {
        d.max += Math.max.apply(null, q.options.map(function (o) { return o.value; }));
        if (a !== undefined && a !== null && q.options[a]) { d.answered++; d.raw += q.options[a].value; }
      }
    });
    return acc;
  }

  /* Which tier the answers point at. Explicit hints win; ties break toward higher rank. */
  function resolveTier(questions, answers, segments) {
    var votes = {};
    questions.forEach(function (q) {
      var a = answers[q.id];
      var picks = q.type === 'multi' ? (Array.isArray(a) ? a : []) : (a === undefined || a === null ? [] : [a]);
      picks.forEach(function (i) {
        var o = q.options[i];
        if (o && o.tierHint) votes[o.tierHint] = (votes[o.tierHint] || 0) + 1;
      });
    });
    var best = null, bestN = 0;
    segments.tiers.forEach(function (t) {
      var n = votes[t.id] || 0;
      if (n > bestN || (n === bestN && n > 0 && t.rank > (best ? best.rank : 0))) { best = t; bestN = n; }
    });
    return { tier: best, votes: votes, decisive: bestN > 0 };
  }

  /* Fallback tier when no option carried a hint: infer from readiness. */
  function tierFromReadiness(readiness, segments) {
    var byId = {};
    segments.tiers.forEach(function (t) { byId[t.id] = t; });
    if (readiness < 25) return byId.emerging;
    if (readiness < 50) return byId.undercapitalized;
    if (readiness < 70) return byId.growth;
    return byId.network;
  }

  function band(readiness, bands) {
    for (var i = 0; i < bands.length; i++) if (readiness <= bands[i].max) return bands[i];
    return bands[bands.length - 1];
  }

  /**
   * @param {Object} answers  { q1: 0, q8: [0,3,5], ... }  option indices
   * @param {Object} dx       diagnostic.json
   * @param {Object} segments segments.json
   */
  function score(answers, dx, segments) {
    answers = answers || {};
    var acc = tally(dx.questions, answers);

    var dimOut = [], readNum = 0, readDen = 0, oppNum = 0, oppDen = 0;

    Object.keys(dx.dimensions).forEach(function (key) {
      var cfg = dx.dimensions[key];
      var d = acc[key] || { raw: 0, max: 1, answered: 0, total: 0 };
      var pct = d.max > 0 ? d.raw / d.max : 0;                  // raw 0..1
      var readingPct = cfg.inverse ? (1 - pct) : pct;           // capability 0..1

      if (cfg.inReadiness) { readNum += readingPct * cfg.weight; readDen += cfg.weight; }
      oppNum += pct * cfg.opportunityWeight;
      oppDen += cfg.opportunityWeight;

      dimOut.push({
        id: key,
        label: cfg.label,
        capability: round(readingPct * 100),
        raw: round(pct * 100),
        inReadiness: !!cfg.inReadiness,
        answered: d.answered,
        total: d.total
      });
    });

    var readiness = readDen > 0 ? clamp(round((readNum / readDen) * 100), 0, 100) : 0;
    var opportunity = oppDen > 0 ? clamp(round((oppNum / oppDen) * 100), 0, 100) : 0;

    var t = resolveTier(dx.questions, answers, segments);
    var tier = t.decisive ? t.tier : tierFromReadiness(readiness, segments);
    var b = band(readiness, dx.readinessBands);

    /* Held assets, translated into underwriter language. */
    var q8 = dx.questions.filter(function (q) { return q.dimension === 'assets' && q.type === 'multi'; })[0];
    var held = [];
    if (q8 && Array.isArray(answers[q8.id])) {
      answers[q8.id].forEach(function (i) {
        var o = q8.options[i];
        if (o) held.push({ label: o.label, underwriter: o.underwriter || '' });
      });
    }

    /* Expected value of the lead. */
    /* The public bundle ships tiers without their commercial fields, so fall
       back to the standing retainer and a neutral probability there. */
    var value = (tier && tier.leadValueUSD) || 28000;
    var prob = (tier && tier.closeProbability) || 0.2;
    var adjusted = clamp(prob * (0.55 + (opportunity / 100) * 0.9), 0, 0.95);

    var completeness = (function () {
      var done = 0;
      dx.questions.forEach(function (q) {
        var a = answers[q.id];
        if (q.type === 'multi' ? (Array.isArray(a) && a.length > 0) : (a !== undefined && a !== null)) done++;
      });
      return round((done / dx.questions.length) * 100);
    })();

    return {
      readiness: readiness,
      opportunity: opportunity,
      band: { id: b.id, label: b.label, verdict: b.verdict, detail: b.detail, tone: b.tone },
      tier: tier ? {
        id: tier.id, name: tier.name, posture: tier.posture, priority: tier.priority,
        routing: tier.routing, keepsThemAwake: tier.keepsThemAwake,
        actuallyBuying: tier.actuallyBuying, payoffHeadline: tier.payoffHeadline
      } : null,
      tierInferred: !t.decisive,
      dimensions: dimOut,
      heldAssets: held,
      heldAssetCount: held.length,
      completeness: completeness,
      economics: {
        leadValueUSD: value,
        baseCloseProbability: prob,
        adjustedCloseProbability: Math.round(adjusted * 100) / 100,
        expectedValueUSD: Math.round(value * adjusted)
      },
      scoredAt: new Date().toISOString(),
      engineVersion: '1.0.0'
    };
  }

  return { score: score, tally: tally, band: band, resolveTier: resolveTier };
});
