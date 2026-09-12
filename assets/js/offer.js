/* Offer page — every figure and claim rendered from the canon. */
(function () {
  var C = window.JIREH_CANON, P = window.JIREH_PAYOFFS;
  if (!C || !P) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function fill(id, h) { var el = $(id); if (el) el.innerHTML = h; }

  $('oPrice').textContent = C.offer.priceDisplay;

  fill('oExclusions', C.offer.exclusions.map(function (x) {
    return '<li style="display:flex;gap:11px;align-items:flex-start;color:#DCE4EF;font-size:14.5px;line-height:1.55">' +
      '<span style="color:var(--gold);flex:0 0 auto;font-weight:700">&#10003;</span><span>' + esc(x) + '</span></li>';
  }).join(''));

  /* anchor comparison, ours highlighted */
  var rows = C.costOfInaction
    .filter(function (r) { return /^\$/.test(r.value); })
    .map(function (r) { return { label: r.label, amt: r.value, us: false }; });
  rows.unshift({ label: 'The Capital Partnership — a full retained year', amt: C.offer.priceDisplay, us: true });
  fill('oAnchor', rows.map(function (r) {
    return '<div class="row' + (r.us ? ' us' : '') + '"><span style="color:' + (r.us ? '#fff' : '#B9C6DA') + ';font-size:15px">' +
      esc(r.label) + '</span><span class="amt">' + esc(r.amt) + '</span></div>';
  }).join(''));

  fill('oComponents', C.offerComponents.map(function (c, i) {
    return '<div class="card card--flag"><span class="sub">' + esc(c.order) + ' &middot; ' + esc(c.verb) + '</span>' +
      '<h3>' + esc(c.title) + '</h3><p class="mb0">' + esc(c.body) + '</p></div>';
  }).join(''));

  fill('oPayoffs', P.payoffs.map(function (p) {
    return '<div class="payoff"><div class="seq">' + String(p.sequence).padStart(2, '0') + '</div><div>' +
      '<span class="tag">' + esc(p.component) + ' &middot; ' + esc(p.timing) + '</span>' +
      '<h3>' + esc(p.headline) + '</h3>' +
      '<p class="gets">' + esc(p.youGet) + '</p>' +
      '<p class="chg">' + esc(p.whatChanges) + '</p>' +
      '<p class="emo">' + esc(p.emotionalPayoff) + '</p>' +
      '</div></div>';
  }).join(''));

  fill('oStack', P.outcomeStack.map(function (s) {
    return '<div class="s"><div><b>' + esc(s.label) + '</b><span>' + esc(s.detail) + '</span></div></div>';
  }).join(''));

  fill('oTranslations', C.assetTranslations.map(function (t) {
    return '<tr><td><span class="t">' + esc(t.expense) + '</span></td><td>' + esc(t.capacity) + '</td></tr>';
  }).join(''));

  fill('oObjections', P.objections.map(function (o) {
    return '<details class="obj"><summary>' + esc(o.objection) + '</summary>' +
      '<div class="body">' + esc(o.answer) + '</div></details>';
  }).join(''));

  /* reveal */
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .05, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.payoff, .card, .stack .s').forEach(function (t) { t.classList.add('reveal'); io.observe(t); });
})();
