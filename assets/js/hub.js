/* Hub page — renders every section from the offer canon.
   Nothing about the offer is hardcoded in HTML. */
(function () {
  var C = window.JIREH_CANON;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  function fill(id, html) { var el = $(id); if (el) el.innerHTML = html; }

  fill('marketStats', C.marketSize.map(function (s) {
    return '<div class="stat"><span class="n">' + esc(s.value) + '</span><span class="l">' + esc(s.label) + '</span></div>';
  }).join(''));

  fill('costStats', C.costOfInaction.map(function (s) {
    return '<div class="stat"><span class="n" style="font-size:clamp(24px,3vw,34px)">' + esc(s.value) +
      '</span><span class="l">' + esc(s.label) + '</span></div>';
  }).join(''));

  fill('incubatorAssets', C.incubatorAssets.map(function (a) {
    return '<li class="chip">' + esc(a) + '</li>';
  }).join(''));

  fill('funders', C.capitalAlreadyMoved.map(function (f) {
    return '<li class="chip">' + esc(f) + '</li>';
  }).join(''));

  fill('cascade', C.cascade.map(function (s) {
    return '<div class="step"><div><h4>' + esc(s.title) + '</h4><p>' + esc(s.detail) + '</p></div></div>';
  }).join(''));

  fill('pillars', C.pillars.map(function (p) {
    return '<div class="card card--dark card--flag">' +
      '<span class="sub">' + esc(p.shortProof) + '</span>' +
      '<h3 style="color:#fff">' + esc(p.label) + '</h3>' +
      '<p class="small" style="color:#8FA0BB;margin-bottom:14px"><em>' + esc(p.conventional) + '</em></p>' +
      '<p style="color:#DCE4EF;margin-bottom:0">' + esc(p.ours) + '</p>' +
      '</div>';
  }).join(''));

  /* scroll reveal */
  var targets = document.querySelectorAll('.card, .stat, .step, .pull');
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
  targets.forEach(function (t, i) {
    t.classList.add('reveal');
    t.style.transitionDelay = (Math.min(i % 4, 3) * 55) + 'ms';
    io.observe(t);
  });
})();
