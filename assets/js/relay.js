/* ============================================================
   EMAIL RELAY
   A static host has no server, so the page emails the lead itself.
   One implementation, used by the application form and by the
   intake server, so the message Hakeem receives is identical
   whichever path delivered it.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JirehRelay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function decodeEmail(cfg) {
    if (!cfg) return '';
    if (cfg.ownerEmailB64) {
      try {
        return typeof atob === 'function'
          ? atob(cfg.ownerEmailB64)
          : Buffer.from(cfg.ownerEmailB64, 'base64').toString('utf8');
      } catch (e) { /* fall through */ }
    }
    return cfg.ownerEmail || '';
  }

  function endpoint(cfg) {
    var r = cfg && cfg.relay;
    if (!r || !r.enabled || !r.endpointTemplate) return '';
    return r.endpointTemplate.replace('{email}', encodeURIComponent(decodeEmail(cfg)));
  }

  /* The alert body. Written to be actioned from a phone without
     opening anything else. */
  function compose(lead) {
    var s = lead.scoring || {}, d = lead.diagnostic || {},
        c = lead.contact || {}, o = lead.organization || {}, i = lead.intent || {};
    var money = function (n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); };
    var L = [
      c.name + (c.role ? ', ' + c.role : ''),
      o.name + (o.location ? ' - ' + o.location : ''),
      '',
      'Lead score       ' + (s.leadScore != null ? s.leadScore + '/100' : '-') +
        '   (' + String(s.temperature || 'cool').toUpperCase() + ' - ' + (s.priority || 'nurture') + ')',
      'Readiness        ' + (d.readiness != null ? d.readiness + '/100' : 'no diagnostic taken') +
        (d.band ? '   ' + d.band.label : ''),
      'Tier             ' + ((d.tier && d.tier.name) || 'Not diagnosed'),
      'Assets named     ' + (d.heldAssetCount != null ? d.heldAssetCount + ' of 9' : '-'),
      'Expected value   ' + money(s.expectedValueUSD),
      '',
      'Capital gap      ' + (i.capitalGap || '-'),
      'Timeline         ' + (i.timeline || '-'),
      'Budget           ' + (o.annualBudget || '-'),
      'Category         ' + (o.category || '-'),
      '',
      'WHAT THEY WOULD BUILD',
      '  ' + (i.whatWouldYouBuild || '-'),
      '',
      'WHAT HAS STOPPED IT',
      '  ' + (i.biggestObstacle || '-'),
      '',
      'REPLY TO         ' + c.email + (c.phone ? '   ' + c.phone : ''),
      'Website          ' + (o.website || '-'),
      'Source           ' + ((lead.source && lead.source.channel) || 'direct'),
      'Reference        ' + (lead.id || 'pending')
    ];
    if (d.heldAssets && d.heldAssets.length) {
      L.push('', 'ASSETS THEY NAMED, IN UNDERWRITER LANGUAGE');
      d.heldAssets.forEach(function (a) { L.push('  - ' + a.label + ': ' + a.underwriter); });
    }
    if (s.reasons && s.reasons.length) {
      L.push('', 'WHY IT SCORED WHERE IT DID');
      s.reasons.forEach(function (r) { L.push('  - ' + r); });
    }
    return L.join('\n');
  }

  function subject(lead) {
    var hot = (lead.scoring || {}).temperature === 'hot';
    return (hot ? '[HOT] ' : '') + 'Standing-position application - ' + ((lead.organization || {}).name || 'unknown organization');
  }

  /* FormSubmit's ajax endpoint takes a flat JSON object and emails it.
     _subject, _template and _captcha are its own directives. */
  function payload(lead, cfg) {
    return {
      _subject: subject(lead),
      _template: 'box',
      _captcha: 'false',
      name: (lead.contact || {}).name || '',
      email: (lead.contact || {}).email || '',
      organization: (lead.organization || {}).name || '',
      score: String((lead.scoring || {}).leadScore || ''),
      temperature: String((lead.scoring || {}).temperature || ''),
      message: compose(lead)
    };
  }

  /**
   * Deliver a lead by email. Resolves { ok, provider, status, detail }.
   * Never throws — the caller decides what to show.
   */
  function send(lead, cfg) {
    var url = endpoint(cfg);
    if (!url) return Promise.resolve({ ok: false, skipped: 'relay not configured' });

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload(lead, cfg))
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          /* FormSubmit answers 200 with success:"true" once the address is
             confirmed, and 200 with a confirmation notice before that. */
          var confirmed = String(j.success) === 'true';
          var pending = /activat|confirm/i.test(JSON.stringify(j || {}));
          return {
            ok: r.ok && (confirmed || pending),
            pendingActivation: !confirmed && pending,
            provider: (cfg.relay || {}).provider,
            status: r.status,
            detail: j.message || j.error || ''
          };
        });
      })
      .catch(function (e) {
        return { ok: false, provider: (cfg.relay || {}).provider, error: String(e && e.message) };
      });
  }

  /* Last resort: a fully prepared email the applicant sends themselves,
     so an application is never lost even with no network path at all. */
  function mailtoHref(lead, cfg) {
    return 'mailto:' + encodeURIComponent(decodeEmail(cfg)) +
      '?subject=' + encodeURIComponent(subject(lead)) +
      '&body=' + encodeURIComponent(compose(lead));
  }

  return { send: send, compose: compose, subject: subject, mailtoHref: mailtoHref, decodeEmail: decodeEmail, endpoint: endpoint };
});
