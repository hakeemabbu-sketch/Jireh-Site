/* Application form — validates, attaches the diagnostic, submits to the intake API,
   and degrades to a mailto handoff if no endpoint is reachable. */
(function () {
  var C = window.JIREH_CANON, CATS = window.JIREH_CATEGORIES;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var form = $('applyForm');
  if (!form) return;

  var ENDPOINT = (window.JIREH_CONFIG && window.JIREH_CONFIG.capture && window.JIREH_CONFIG.capture.endpoint) || '/api/leads';

  /* ---- side rail from canon ---- */
  if (C) {
    $('railOfferName').textContent = C.offer.name;
    $('railPrice').textContent = C.offer.priceDisplay;
    $('railIncludes').innerHTML = C.offerComponents.map(function (c) {
      return '<li style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5">' +
        '<span style="color:var(--gold);font-weight:700">&#10003;</span><span><strong>' + esc(c.verb) + '</strong> — ' + esc(c.title) + '</span></li>';
    }).join('');
  }
  if (CATS) {
    var sel = $('f_cat');
    CATS.categories.forEach(function (c) {
      var o = document.createElement('option'); o.value = c.name; o.textContent = c.name; sel.appendChild(o);
    });
    var other = document.createElement('option'); other.value = 'Other'; other.textContent = 'Other'; sel.appendChild(other);
  }

  /* ---- attach the diagnostic if one was taken ---- */
  var dx = null;
  try { dx = JSON.parse(sessionStorage.getItem('jireh.result.v1') || 'null'); } catch (e) {}
  if (!dx) { try { var a = JSON.parse(localStorage.getItem('jireh.dx.v1') || 'null');
    if (a && a.answers && window.JirehScoring && window.JIREH_DIAGNOSTIC && window.JIREH_SEGMENTS) {
      dx = { answers: a.answers, result: window.JirehScoring.score(a.answers, window.JIREH_DIAGNOSTIC, window.JIREH_SEGMENTS) };
    } } catch (e) {} }

  if (dx && dx.result && dx.result.completeness > 0) {
    $('scoreRail').classList.remove('hidden');
    $('railScore').textContent = dx.result.readiness;
    $('railBand').textContent = dx.result.band.verdict;
    /* prefill what we can infer */
    if (dx.result.tier && !$('f_cat').value) {
      var map = { funder: 'Foundations, Family Offices & DAF Holders', network: 'Denominational Networks & Multi-Site Associations' };
      if (map[dx.result.tier.id]) $('f_cat').value = map[dx.result.tier.id];
    }
  }

  /* ---- validation ---- */
  function invalid(el, on) {
    var f = el.closest('.field');
    if (f) f.classList.toggle('invalid', !!on);
  }
  function validate() {
    var ok = true;
    [['f_name', function (v) { return v.trim().length >= 2; }],
     ['f_email', function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }],
     ['f_org', function (v) { return v.trim().length >= 2; }],
     ['f_build', function (v) { return v.trim().length >= 4; }]
    ].forEach(function (p) {
      var el = $(p[0]); var good = p[1](el.value);
      invalid(el, !good); if (!good) ok = false;
    });
    var c = $('f_consent');
    var cf = c.closest('.field');
    if (!c.checked) { cf.classList.add('invalid'); ok = false; } else { cf.classList.remove('invalid'); }
    return ok;
  }
  form.addEventListener('input', function (e) { if (e.target.id) invalid(e.target, false); });

  /* ---- payload ---- */
  function payload() {
    var g = function (id) { return ($(id).value || '').trim(); };
    return {
      contact:      { name: g('f_name'), email: g('f_email'), phone: g('f_phone'), role: g('f_role') },
      organization: { name: g('f_org'), website: g('f_web'), location: g('f_loc'), category: g('f_cat'), annualBudget: g('f_budget') },
      intent:       { capitalGap: g('f_gap'), timeline: g('f_time'), whatWouldYouBuild: g('f_build'), biggestObstacle: g('f_block') },
      diagnosticAnswers: dx ? dx.answers : null,
      consent: $('f_consent').checked,
      website_url: form.website_url.value,           /* honeypot */
      source: {
        channel: new URLSearchParams(location.search).get('from') || (dx ? 'diagnostic' : 'direct'),
        page: location.pathname,
        referrer: document.referrer || '',
        campaign: new URLSearchParams(location.search).get('c') || ''
      }
    };
  }

  function state(kind, html) { var el = $('sendState'); el.className = kind; el.innerHTML = html; }

  /* ---- submit ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      state('bad', 'A few answers are still needed. They are marked above.');
      var bad = document.querySelector('.field.invalid');
      if (bad) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var body = payload();
    $('btnSend').disabled = true;
    state('busy', 'Sending your application&hellip;');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j || res.j.ok !== true) throw new Error((res.j && res.j.error) || 'Intake refused the submission.');
        succeed(body, res.j);                     /* the server stored it and emailed it */
      })
      .catch(function () { viaRelay(body); });    /* no server here - email it from the browser */
  });

  function succeed(body, res) {
    try { sessionStorage.removeItem('jireh.result.v1'); localStorage.removeItem('jireh.dx.v1'); } catch (e) {}
    $('applyWrap').classList.add('hidden');
    $('doneWrap').classList.remove('hidden');
    if (res && res.lead && res.lead.scoring) {
      $('doneLede').textContent = 'Your application has been received, scored, and flagged for personal review. ' +
        (res.lead.scoring.temperature === 'hot' ? 'It has been marked for immediate attention.' : 'You will hear back from a person.');
    }
    $('doneSummary').innerHTML = summaryHtml(body, res);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* No intake server reachable, which is the normal case on a static host.
     Email the application straight from the browser. */
  function viaRelay(body) {
    var cfg = window.JIREH_CONFIG && window.JIREH_CONFIG.notify;
    var R = window.JirehRelay;
    if (!R || !cfg || !cfg.relay || !cfg.relay.enabled) return fallback(body);

    var lead = asLead(body);
    state('busy', 'Sending your application&hellip;');
    R.send(lead, cfg).then(function (r) {
      if (r.ok) { succeed(body, { lead: { id: 'sent', scoring: lead.scoring } }); return; }
      fallback(body);
    }).catch(function () { fallback(body); });
  }

  /* Shape the form payload the way the alert composer and the CRM expect,
     scoring it locally so the email carries the same numbers the server would. */
  function asLead(body) {
    var scored = null;
    if (dx && dx.result) scored = dx.result;
    else if (window.JirehScoring && window.JIREH_DIAGNOSTIC && window.JIREH_SEGMENTS && body.diagnosticAnswers) {
      try { scored = window.JirehScoring.score(body.diagnosticAnswers, window.JIREH_DIAGNOSTIC, window.JIREH_SEGMENTS); } catch (e) {}
    }
    return {
      id: 'web_' + Date.now().toString(36),
      contact: body.contact,
      organization: body.organization,
      intent: body.intent,
      diagnostic: scored,
      scoring: localScore(scored, body.intent, body.contact),
      source: body.source
    };
  }

  /* A compact mirror of the server's lead scoring, so an emailed lead is
     triaged the same way one that went through the API would be. */
  function localScore(d, intent, contact) {
    var reasons = [], s = 0;
    if (d) {
      s += Math.round(d.opportunity * 0.6);
      reasons.push('Diagnostic opportunity ' + d.opportunity + '/100 (' + d.completeness + '% complete)');
      if (d.tier) {
        var bump = { urgent: 14, high: 9, nurture: 2 }[d.tier.priority] || 0;
        s += bump; reasons.push('Tier "' + d.tier.name + '" carries ' + d.tier.priority + ' priority (+' + bump + ')');
      }
      if (d.heldAssetCount >= 6) { s += 6; reasons.push('Named ' + d.heldAssetCount + ' of 9 assets - substantial unpriced capacity (+6)'); }
      if (d.readiness <= 44) { s += 6; reasons.push('Readiness ' + d.readiness + '/100 - precisely the gap this offer closes (+6)'); }
    } else { s += 24; reasons.push('No diagnostic attached - scored on stated intent only'); }

    var gap = { 'Over $2M': 12, '$500,000 - $2M': 11, '$100,000 - $500,000': 7, 'Under $100,000': 3, 'We do not have a number yet': 5 };
    var gk = (intent.capitalGap || '').replace(/[\u2013\u2014]/g, '-');
    if (gap[gk] != null) { s += gap[gk]; reasons.push('Capital gap "' + intent.capitalGap + '" (+' + gap[gk] + ')'); }

    var tp = { 'Immediately': 12, 'This quarter': 9, 'Within the fiscal year': 4, 'Exploring for now': 0 };
    var tk = Object.keys(tp).filter(function (k) { return (intent.timeline || '').indexOf(k) === 0; })[0];
    if (tk) { s += tp[tk]; reasons.push('Timeline "' + intent.timeline + '" (+' + tp[tk] + ')'); }

    if ((intent.whatWouldYouBuild || '').length > 140) { s += 5; reasons.push('Wrote at length about what they would build (+5) - a strong intent signal'); }
    if (/director|ceo|founder|pastor|president|chair|owner/i.test(contact.role || '')) { s += 6; reasons.push('Role "' + contact.role + '" indicates decision authority (+6)'); }

    s = Math.max(0, Math.min(100, Math.round(s)));
    return {
      leadScore: s,
      temperature: s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cool',
      priority: s >= 70 ? 'urgent' : s >= 45 ? 'high' : 'nurture',
      expectedValueUSD: (d && d.economics && d.economics.expectedValueUSD) || Math.round(28000 * (0.10 + (s / 100) * 0.35)),
      reasons: reasons
    };
  }

  /* Absolute last resort: a fully prepared email the applicant sends themselves. */
  function fallback(body) {
    var cfg = window.JIREH_CONFIG && window.JIREH_CONFIG.notify;
    var href = window.JirehRelay ? window.JirehRelay.mailtoHref(asLead(body), cfg) : 'mailto:';

    $('btnSend').disabled = false;
    state('ok',
      '<strong>Automatic sending did not go through.</strong> Nothing is lost — ' +
      '<a href="' + href + '"><strong>open a prepared email</strong></a> with every answer already filled in, ' +
      'and it will reach Hakeem directly.');
  }

  function summaryHtml(body, res) {
    var rows = [
      ['Organization', body.organization.name],
      ['Contact', body.contact.name + (body.contact.role ? ' · ' + body.contact.role : '')],
      ['Email', body.contact.email],
      ['Capital gap', body.intent.capitalGap || 'Not stated'],
      ['Timeline', body.intent.timeline || 'Not stated']
    ];
    if (dx && dx.result) {
      rows.push(['Capital Readiness Score', dx.result.readiness + ' / 100 — ' + dx.result.band.label]);
      if (dx.result.tier) rows.push(['Tier', dx.result.tier.name]);
      rows.push(['Assets you named', dx.result.heldAssetCount + ' of 9']);
    }
    if (res && res.lead && res.lead.id) rows.push(['Reference', res.lead.id]);
    return '<div class="tw"><table><tbody>' + rows.map(function (r) {
      return '<tr><td style="width:38%"><span class="t">' + esc(r[0]) + '</span></td><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
})();
