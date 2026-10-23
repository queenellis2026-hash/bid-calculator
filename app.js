/* Flat Bid Calculator v2 — math + UI (vanilla JS, no frameworks).
   Pure math is exported for the Node QA gate (qa.js). v2 adds: multiple
   materials lines with per-line markup, sales-tax pass-through, markup vs
   margin done right, a labor-burden helper, bid rounding, saved jobs and
   crew presets (localStorage), and a printable client-safe bid summary. */
'use strict';

/* ---------- Pure bid math (Chris Babcock's calibration) ---------- */
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/* Markup % -> margin %: a 20% markup is a 16.67% margin. Not the same number. */
function markupToMargin(markupPct) {
  var m = num(markupPct);
  return m <= -100 ? 0 : round2(100 * m / (100 + m));
}
/* Price a cost so the result carries the target margin %. */
function priceFromMargin(cost, marginPct) {
  var g = num(marginPct);
  if (g >= 100) return 0;
  return round2(num(cost) / (1 - g / 100));
}
/* True burdened labor rate: $20 wage + 20.65% burden = $24.13 (the packs'
   Labor Burden sheet: 7.65 payroll tax + 8 comp + 5 other). */
function burdenedRate(wage, burdenPct) {
  return round2(num(wage) * (1 + num(burdenPct) / 100));
}

function normalizeLines(inp) {
  if (inp.materialsLines && inp.materialsLines.length) return inp.materialsLines;
  /* v1 input shape */
  return [{ cost: num(inp.materialsBase), markupPct: (inp.markupPct === undefined ? null : num(inp.markupPct)) }];
}

/* inputs: { crew, hoursPerPerson, rate,
             materialsLines: [{cost, markupPct|null}], defaultMarkupPct,
             taxOn, taxPct, hauloff, other, depositPct, smallJobWaiver,
             roundTo (0|10|50) }  — legacy v1 fields still accepted. */
function computeBid(inp) {
  var crew = num(inp.crew), hpp = num(inp.hoursPerPerson), rate = num(inp.rate);
  var crewHours = round2(crew * hpp);
  var labor = round2(crewHours * rate);
  var defMk = inp.defaultMarkupPct === undefined ? num(inp.markupPct) : num(inp.defaultMarkupPct);
  var taxOn = !!inp.taxOn, taxPct = num(inp.taxPct);
  var materialsCost = 0, materialsMarked = 0, materialsTax = 0, materialsProfit = 0;
  normalizeLines(inp).forEach(function (ln) {
    var cost = num(ln.cost);
    var mk = (ln.markupPct === null || ln.markupPct === undefined || ln.markupPct === '') ? defMk : num(ln.markupPct);
    var marked = round2(cost * (1 + mk / 100));
    var tax = taxOn ? round2(cost * taxPct / 100) : 0; /* tax passes through at cost */
    materialsCost = round2(materialsCost + cost);
    materialsMarked = round2(materialsMarked + marked + tax);
    materialsTax = round2(materialsTax + tax);
    materialsProfit = round2(materialsProfit + round2(marked - cost));
  });
  var pricedPreTax = round2(materialsMarked - materialsTax);
  var materialsMarginPct = pricedPreTax > 0 ? round2(100 * materialsProfit / pricedPreTax) : 0;
  var hauloff = round2(num(inp.hauloff));
  var other = round2(num(inp.other));
  var bidRaw = round2(labor + materialsMarked + hauloff + other);
  var rt = num(inp.roundTo);
  var bid = rt > 0 ? round2(Math.round(bidRaw / rt) * rt) : bidRaw;
  var deposit = 0;
  if (!(inp.smallJobWaiver && bid <= 500)) {
    deposit = round2(bid * num(inp.depositPct) / 100);
  }
  var balance = round2(bid - deposit);
  var effectiveRate = crewHours > 0 ? round2(bid / crewHours) : 0;
  return { crewHours: crewHours, labor: labor, materialsCost: materialsCost,
           materialsMarked: materialsMarked, materialsTax: materialsTax,
           materialsProfit: materialsProfit, materialsMarginPct: materialsMarginPct,
           hauloff: hauloff, other: other, bidRaw: bidRaw, bid: bid,
           deposit: deposit, balance: balance, effectiveRate: effectiveRate };
}

/* Change order: the deposit set from the original bid stays as the amount
   collected up front; the balance absorbs the change. */
function applyChangeOrder(bidResult, changeAmount) {
  var revisedTotal = round2(bidResult.bid + num(changeAmount));
  var revisedBalance = round2(revisedTotal - bidResult.deposit);
  return { revisedTotal: revisedTotal, revisedBalance: revisedBalance };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, computeBid: computeBid, applyChangeOrder: applyChangeOrder,
                     markupToMargin: markupToMargin, priceFromMargin: priceFromMargin,
                     burdenedRate: burdenedRate };
}

/* ---------- Browser UI (v2) ---------- */
if (typeof document !== 'undefined') {
  var KEY = 'flatBidCalculator.v2', JKEY = KEY + '.jobs', PKEY = KEY + '.presets';
  var SCALARS = ['jobName', 'bizName', 'bizPhone', 'crew', 'hoursPerPerson', 'rate',
                 'defaultMarkupPct', 'taxPct', 'hauloff', 'other', 'depositPct',
                 'roundTo', 'changeAmount', 'wage', 'burdenPct'];
  var state = { jobName: '', bizName: 'Gulf Coast All Around Service', bizPhone: '(850) 380-8409',
                crew: 2, hoursPerPerson: 8, rate: 35, defaultMarkupPct: 15,
                taxOn: false, taxPct: 0, lines: [{ name: '', cost: '', markup: '' }],
                hauloff: '', other: '', depositPct: 50, smallJobWaiver: true,
                roundTo: 0, changeAmount: '', wage: '', burdenPct: '' };

  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function read(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

  function readState() {
    SCALARS.forEach(function (f) { if ($(f)) state[f] = $(f).value; });
    state.taxOn = $('taxOn').checked;
    state.smallJobWaiver = $('smallJobWaiver').checked;
    state.lines = [];
    var rows = document.querySelectorAll('#lines .line-row');
    for (var i = 0; i < rows.length; i++) {
      state.lines.push({ name: rows[i].querySelector('.ln-name').value,
                         cost: rows[i].querySelector('.ln-cost').value,
                         markup: rows[i].querySelector('.ln-markup').value });
    }
    if (!state.lines.length) state.lines = [{ name: '', cost: '', markup: '' }];
  }
  function bidInputs() {
    return { crew: state.crew, hoursPerPerson: state.hoursPerPerson, rate: state.rate,
             materialsLines: state.lines.map(function (l) {
               return { cost: l.cost, markupPct: l.markup === '' ? null : l.markup };
             }),
             defaultMarkupPct: state.defaultMarkupPct, taxOn: state.taxOn, taxPct: state.taxPct,
             hauloff: state.hauloff, other: state.other, depositPct: state.depositPct,
             smallJobWaiver: state.smallJobWaiver, roundTo: state.roundTo };
  }
  function lineRow(l) {
    var div = document.createElement('div');
    div.className = 'line-row';
    div.innerHTML = '<input class="ln-name" type="text" placeholder="Item (e.g. mulch, blades)">' +
      '<input class="ln-cost" type="number" inputmode="decimal" min="0" step="1" placeholder="Cost $">' +
      '<input class="ln-markup" type="number" inputmode="decimal" min="0" step="1" placeholder="Markup %">' +
      '<button type="button" class="ln-del" aria-label="Remove line">×</button>';
    div.querySelector('.ln-name').value = l.name || '';
    div.querySelector('.ln-cost').value = l.cost;
    div.querySelector('.ln-markup').value = l.markup;
    div.querySelector('.ln-del').addEventListener('click', function () { div.remove(); render(); });
    return div;
  }
  function writeState() {
    SCALARS.forEach(function (f) { if ($(f)) $(f).value = state[f]; });
    $('taxOn').checked = !!state.taxOn;
    $('smallJobWaiver').checked = !!state.smallJobWaiver;
    var box = $('lines'); box.innerHTML = '';
    state.lines.forEach(function (l) { box.appendChild(lineRow(l)); });
  }
  function render() {
    readState(); store(KEY, state);
    var r = computeBid(bidInputs());
    $('outLabor').textContent = money(r.labor);
    $('outMaterials').textContent = money(r.materialsMarked);
    $('outMaterialsNote').textContent = r.materialsCost > 0
      ? 'cost ' + money(r.materialsCost) + ' · markup profit ' + money(r.materialsProfit) +
        ' · that profit is a ' + r.materialsMarginPct + '% margin (markup ≠ margin)'
      : '';
    $('outCrewHours').textContent = r.crewHours + ' crew-hrs';
    $('outBid').textContent = money(r.bid);
    $('outDeposit').textContent = money(r.deposit);
    $('outBalance').textContent = money(r.balance);
    $('outEffective').textContent = money(r.effectiveRate) + '/hr';
    var co = applyChangeOrder(r, state.changeAmount);
    $('outRevisedTotal').textContent = money(co.revisedTotal);
    $('outRevisedBalance').textContent = money(co.revisedBalance);
    $('waiverNote').style.display = (state.smallJobWaiver && r.bid <= 500 && r.bid > 0) ? 'block' : 'none';
    var b = burdenedRate(state.wage, state.burdenPct);
    $('burdenOut').textContent = num(state.wage) > 0 ? money(b) + '/hr true cost' : '—';
    buildPrint(r, co);
  }
  function buildPrint(r, co) {
    var d = new Date();
    var rows = '<div class="row"><span>Labor</span><strong>' + money(r.labor) + '</strong></div>';
    state.lines.forEach(function (l, i) {
      var cost = num(l.cost); if (cost <= 0) return;
      var mk = l.markup === '' ? num(state.defaultMarkupPct) : num(l.markup);
      var t = round2(cost * (1 + mk / 100)) + (state.taxOn ? round2(cost * num(state.taxPct) / 100) : 0);
      rows += '<div class="row"><span>' + (l.name || 'Materials &amp; supplies') + '</span><strong>' + money(round2(t)) + '</strong></div>';
    });
    if (r.hauloff > 0) rows += '<div class="row"><span>Haul-off &amp; disposal</span><strong>' + money(r.hauloff) + '</strong></div>';
    if (r.other > 0) rows += '<div class="row"><span>Equipment &amp; supplies</span><strong>' + money(r.other) + '</strong></div>';
    $('printSheet').innerHTML =
      '<h1>' + (state.bizName || 'Estimate') + '</h1>' +
      '<p>' + (state.bizPhone || '') + (state.jobName ? ' · Job: ' + state.jobName : '') + '<br>' +
      d.toLocaleDateString('en-US') + '</p>' + rows +
      '<div class="row big"><span>FLAT BID</span><strong>' + money(r.bid) + '</strong></div>' +
      '<div class="row"><span>Deposit due before work starts</span><strong>' + money(r.deposit) + '</strong></div>' +
      '<div class="row"><span>Balance on completion</span><strong>' + money(r.balance) + '</strong></div>' +
      (num(state.changeAmount) !== 0
        ? '<div class="row"><span>Revised total (with change order)</span><strong>' + money(co.revisedTotal) + '</strong></div>' +
          '<div class="row"><span>Revised balance due</span><strong>' + money(co.revisedBalance) + '</strong></div>' : '') +
      '<p class="terms">Estimate valid 30 days. Deposit due before work starts; balance on ' +
      'completion. Any change to the work is priced and approved in writing before the ' +
      'changed work starts.</p>' +
      '<p class="credit">Prepared with the Flat Bid Calculator · All Around Paperwork — payhip.com/allaroundpaperwork</p>';
  }
  function refreshJobs() {
    var jobs = read(JKEY) || [], sel = $('jobsSelect');
    sel.innerHTML = '<option value="">Saved jobs…</option>';
    jobs.forEach(function (j, i) { var o = document.createElement('option'); o.value = i; o.textContent = j.name; sel.appendChild(o); });
  }
  function refreshPresets() {
    var ps = read(PKEY) || [], sel = $('presetsSelect');
    sel.innerHTML = '<option value="">Crew presets…</option>';
    ps.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o); });
  }
  function migrate() {
    var old = read('flatBidCalculator.v1');
    if (old && !read(KEY)) {
      state.crew = old.crew; state.hoursPerPerson = old.hoursPerPerson; state.rate = old.rate;
      state.defaultMarkupPct = old.markupPct === undefined ? 15 : old.markupPct;
      state.lines = [{ name: '', cost: old.materialsBase || '', markup: '' }];
      state.hauloff = old.hauloff || ''; state.other = old.other || '';
      state.depositPct = old.depositPct; state.smallJobWaiver = old.smallJobWaiver;
    }
  }
  document.addEventListener('DOMContentLoaded', function () {
    var saved = read(KEY);
    if (saved) { for (var k in state) if (k in saved) state[k] = saved[k]; } else { migrate(); }
    writeState(); render(); refreshJobs(); refreshPresets();
    document.querySelector('main').addEventListener('input', render);
    document.querySelector('main').addEventListener('change', render);
    $('addLineBtn').addEventListener('click', function () {
      $('lines').appendChild(lineRow({ name: '', cost: '', markup: '' })); render();
    });
    $('useRateBtn').addEventListener('click', function () {
      readState(); $('rate').value = burdenedRate(state.wage, state.burdenPct); render();
    });
    $('saveJobBtn').addEventListener('click', function () {
      readState();
      var name = (state.jobName || '').trim() || ('Job ' + new Date().toLocaleDateString('en-US'));
      var jobs = read(JKEY) || [];
      jobs = jobs.filter(function (j) { return j.name !== name; });
      var snap = JSON.parse(JSON.stringify(state)); snap.name = name;
      jobs.push(snap); store(JKEY, jobs); refreshJobs();
      $('jobName').value = name; state.jobName = name; store(KEY, state);
    });
    $('loadJobBtn').addEventListener('click', function () {
      var jobs = read(JKEY) || [], i = $('jobsSelect').value;
      if (i === '' || !jobs[i]) return;
      state = jobs[i]; writeState(); render();
    });
    $('delJobBtn').addEventListener('click', function () {
      var jobs = read(JKEY) || [], i = $('jobsSelect').value;
      if (i === '') return;
      jobs.splice(i, 1); store(JKEY, jobs); refreshJobs();
    });
    $('savePresetBtn').addEventListener('click', function () {
      readState();
      var name = ($('presetName').value || '').trim(); if (!name) return;
      var ps = read(PKEY) || [];
      ps = ps.filter(function (p) { return p.name !== name; });
      ps.push({ name: name, crew: state.crew, rate: state.rate, defaultMarkupPct: state.defaultMarkupPct,
                depositPct: state.depositPct, taxOn: state.taxOn, taxPct: state.taxPct, roundTo: state.roundTo });
      store(PKEY, ps); refreshPresets(); $('presetName').value = '';
    });
    $('applyPresetBtn').addEventListener('click', function () {
      var ps = read(PKEY) || [], i = $('presetsSelect').value;
      if (i === '' || !ps[i]) return;
      var p = ps[i];
      ['crew', 'rate', 'defaultMarkupPct', 'depositPct', 'taxPct', 'roundTo'].forEach(function (f) { state[f] = p[f]; });
      state.taxOn = p.taxOn; writeState(); render();
    });
    $('delPresetBtn').addEventListener('click', function () {
      var ps = read(PKEY) || [], i = $('presetsSelect').value;
      if (i === '') return;
      ps.splice(i, 1); store(PKEY, ps); refreshPresets();
    });
    $('printBtn').addEventListener('click', function () { render(); window.print(); });
    $('resetBtn').addEventListener('click', function () {
      var biz = { bizName: state.bizName, bizPhone: state.bizPhone };
      state = { jobName: '', bizName: biz.bizName, bizPhone: biz.bizPhone, crew: 2, hoursPerPerson: 8,
                rate: 35, defaultMarkupPct: 15, taxOn: false, taxPct: 0,
                lines: [{ name: '', cost: '', markup: '' }], hauloff: '', other: '', depositPct: 50,
                smallJobWaiver: true, roundTo: 0, changeAmount: '', wage: '', burdenPct: '' };
      writeState(); render();
    });
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () {}); }
  });
}
