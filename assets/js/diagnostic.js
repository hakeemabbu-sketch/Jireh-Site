/* The Capital Readiness Diagnostic — one question at a time, score before capture. */
(function () {
  var DX = window.JIREH_DIAGNOSTIC, SEG = window.JIREH_SEGMENTS;
  if (!DX || !SEG) return;

  var qs = DX.questions, answers = {}, idx = 0;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var STORE = 'jireh.dx.v1';
  try { var saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved && saved.answers) { answers = saved.answers; idx = Math.min(saved.idx || 0, qs.length - 1); } } catch (e) {}
  function persist() { try { localStorage.setItem(STORE, JSON.stringify({ answers: answers, idx: idx })); } catch (e) {} }

  /* ---------- render questions ---------- */
  $('dxQuestions').innerHTML = qs.map(function (q, i) {
    var opts = q.options.map(function (o, j) {
      var type = q.type === 'multi' ? 'checkbox' : 'radio';
      return '<label class="opt" data-q="' + q.id + '" data-i="' + j + '">' +
        '<input type="' + type + '" name="' + q.id + '" value="' + j + '">' +
        '<span>' + esc(o.label) + '</span></label>';
    }).join('');
    return '<div class="q" data-idx="' + i + '" id="q_' + q.id + '">' +
      '<span class="num">Question ' + (i + 1) + '</span>' +
      '<h2>' + esc(q.prompt) + '</h2>' +
      (q.hint ? '<p class="qhint">' + esc(q.hint) + '</p>' : '') +
      '<div class="opts">' + opts + '</div>' +
      '<p class="err" id="err_' + q.id + '" style="display:none">Choose an answer to continue.</p>' +
      '</div>';
  }).join('');

  /* restore previous selections */
  qs.forEach(function (q) {
    var a = answers[q.id];
    if (a === undefined || a === null) return;
    var picks = q.type === 'multi' ? (Array.isArray(a) ? a : []) : [a];
    picks.forEach(function (j) {
      var el = document.querySelector('input[name="' + q.id + '"][value="' + j + '"]');
      if (el) { el.checked = true; el.closest('.opt').classList.add('sel'); }
    });
  });

  /* ---------- interaction ---------- */
  $('dxQuestions').addEventListener('change', function (e) {
    var input = e.target;
    if (!input.name) return;
    var q = qs.filter(function (x) { return x.id === input.name; })[0];
    if (!q) return;
    var group = document.querySelectorAll('input[name="' + q.id + '"]');

    if (q.type === 'multi') {
      var sel = [];
      group.forEach(function (g) { g.closest('.opt').classList.toggle('sel', g.checked); if (g.checked) sel.push(+g.value); });
      answers[q.id] = sel;
    } else {
      group.forEach(function (g) { g.closest('.opt').classList.toggle('sel', g.checked); });
      answers[q.id] = +input.value;
      setTimeout(function () { if (idx === qs.indexOf(q)) advance(1); }, 230);
    }
    $('err_' + q.id).style.display = 'none';
    document.getElementById('q_' + q.id).classList.remove('invalid');
    persist();
  });

  function answered(q) {
    var a = answers[q.id];
    return q.type === 'multi' ? (Array.isArray(a) && a.length > 0) : (a !== undefined && a !== null);
  }

  function show(i) {
    document.querySelectorAll('.q').forEach(function (el) { el.classList.toggle('on', +el.dataset.idx === i); });
    $('progLabel').textContent = 'Question ' + (i + 1) + ' of ' + qs.length;
    var pct = Math.round((i / qs.length) * 100);
    $('progPct').textContent = pct + '%';
    $('progFill').style.width = pct + '%';
    $('btnBack').disabled = i === 0;
    $('btnNext').textContent = i === qs.length - 1 ? 'See my score →' : 'Continue →';
    persist();
  }

  function advance(step) {
    var q = qs[idx];
    if (step > 0 && !answered(q)) {
      $('err_' + q.id).style.display = 'block';
      document.getElementById('q_' + q.id).classList.add('invalid');
      return;
    }
    var next = idx + step;
    if (next < 0) return;
    if (next >= qs.length) return finish();
    idx = next; show(idx);
    var top = $('progWrap').getBoundingClientRect().top + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  $('btnNext').addEventListener('click', function () { advance(1); });
  $('btnBack').addEventListener('click', function () { advance(-1); });

  /* ---------- result ---------- */
  function finish() {
    var r = window.JirehScoring.score(answers, DX, SEG);
    try { sessionStorage.setItem('jireh.result.v1', JSON.stringify({ result: r, answers: answers })); } catch (e) {}

    $('dxForm').classList.add('hidden');
    $('progWrap').classList.add('hidden');
    $('dxEyebrow').textContent = 'Diagnostic complete';
    $('dxTitle').textContent = 'Here is what the capital markets would see.';
    $('dxLede').textContent = 'This score is yours. It is accurate to what you told us, and it is the same instrument used on every organization we assess.';
    $('dxResult').classList.remove('hidden');

    /* gauge */
    var arc = $('gArc'), CIRC = 578;
    setTimeout(function () { arc.style.strokeDashoffset = String(CIRC - (CIRC * r.readiness / 100)); }, 90);
    var n = 0, target = r.readiness;
    var tick = setInterval(function () { n += Math.max(1, Math.ceil((target - n) / 8)); if (n >= target) { n = target; clearInterval(tick); } $('rScore').textContent = n; }, 26);

    var toneClass = { hot: 'badge--hot', warm: 'badge--warm', cool: 'badge--cool' }[r.band.tone] || '';
    $('rBand').className = 'badge ' + toneClass;
    $('rBand').textContent = r.band.label;
    $('rVerdict').textContent = r.band.verdict;
    $('rDetail').textContent = r.band.detail;

    /* dimensions */
    $('rDims').innerHTML = r.dimensions.map(function (d) {
      var cls = d.capability < 34 ? 'low' : d.capability < 67 ? 'mid' : 'high';
      var note = d.inReadiness ? '' : ' <span style="color:var(--ink-soft);font-weight:400">(context, not scored)</span>';
      return '<div class="dim"><div class="top"><b>' + esc(d.label) + note + '</b><span>' + d.capability + '</span></div>' +
        '<div class="track"><div class="lvl ' + cls + '" data-w="' + d.capability + '"></div></div></div>';
    }).join('');
    setTimeout(function () { document.querySelectorAll('.dim .lvl').forEach(function (el) { el.style.width = el.dataset.w + '%'; }); }, 160);

    /* tier */
    if (r.tier) {
      $('rTierLabel').textContent = r.tierInferred ? 'Your tier (inferred)' : 'Your tier';
      $('rTierName').textContent = r.tier.name;
      $('rTierPain').textContent = r.tier.keepsThemAwake;
      $('rTierBuy').textContent = r.tier.actuallyBuying;
    }

    /* held assets */
    if (r.heldAssetCount) {
      $('rAssetCount').textContent = r.heldAssetCount;
      $('rAssetRows').innerHTML = r.heldAssets.map(function (a) {
        return '<tr><td><span class="t">' + esc(a.label) + '</span></td><td>' + esc(a.underwriter) + '</td></tr>';
      }).join('');
    } else {
      $('rAssetsCard').classList.add('hidden');
    }

    /* CTA copy follows the tier */
    var head = r.tier ? r.tier.payoffHeadline : 'This is the gap. Here is what closes it.';
    $('rCtaHead').textContent = head;
    $('rCtaBody').textContent = r.tier
      ? 'Organizations in your tier are buying one thing: ' + r.tier.actuallyBuying.charAt(0).toLowerCase() + r.tier.actuallyBuying.slice(1)
      : 'One retained annual partnership. One fixed and legible figure.';
    $('rCtaPrimary').href = './offer.html';

    $('btnSaveScore').addEventListener('click', function () { window.location.href = './apply.html?from=diagnostic'; });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.history.replaceState) window.history.replaceState(null, '', '#result');
  }

  show(idx);
})();
