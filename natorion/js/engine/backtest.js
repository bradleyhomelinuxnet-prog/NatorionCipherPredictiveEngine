/* NATORION · engine/backtest.js
   Two honest checks that sit beside the engine and never inside it. Nothing
   here changes a projected date, a match, a strength or a filter.

   1. BACKTEST. Stand on the day of an earlier anchor date, give the engine
      only the anchors up to then, and ask whether it would have projected
      the next one. Each step's chance of a lucky hit is measured near the
      real date: the share of the days within CONTROL_DAYS of it that the
      projections happen to cover. Adding those chances gives the hits luck
      alone would score; the p-value says how surprising the real count is.

   2. CYCLE ECHOES. Does a projected date sit a whole number of Metonic
      (19-year, 235 lunar months) or 138-year cycles from an anchor date?
      Every count comes with what random days in the same span would give.

   Ported from Natorion Web (web/js/ophis.cycles.js), which calibrated the
   method on pure-noise dates; the statistics are the same code. Days are
   UTC calendar days. In HH:MM · sunset scope a projected date is the sunset
   window it opens with, read on its UTC day, so a hit there can be off by
   one day; Days scope is exact. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time, DAY = 86400000;
  var TROPICAL_YEAR = 365.2421897, SYNODIC_MONTH = 29.530588853;

  var CYCLES = [
    { id: "metonic", label: "Metonic (19 years)", glyph: "☾", days: 235 * SYNODIC_MONTH,
      note: "19 years = 235 lunar months (6,939.69 days): the Moon's phase returns to almost the same calendar date." },
    { id: "phoenix", label: "138 years", glyph: "◆", days: 138 * TROPICAL_YEAR, note: "138 tropical years (50,403.4 days)." }
  ];
  // Exact-day matching is the default: with all 36 formulas on, the projections
  // cover about two-thirds of the days around any date, so a ±1-day match is
  // nearly free and tells signal from luck far less well.
  var DEFAULTS = { tolerance: 0, topN: 10, echoTolerance: 2 };
  var CHOICES = { tolerance: [0, 1, 3, 7], topN: [5, 10, 20], echoTolerance: [1, 2, 3] };
  var CONTROL_DAYS = 60;

  var dayOf = function (ms) { return Math.floor(ms / DAY); };

  /* ------------------------------------------------------------ statistics */
  // P(at least `observed` successes) when trial i succeeds with probability probs[i].
  function poissonBinomialTail(probs, observed) {
    if (observed <= 0) return 1;
    var dist = [1];
    probs.forEach(function (p) {
      var next = new Array(dist.length + 1).fill(0);
      for (var k = 0; k < dist.length; k++) { next[k] += dist[k] * (1 - p); next[k + 1] += dist[k] * p; }
      dist = next;
    });
    var tail = 0;
    for (var j = observed; j < dist.length; j++) tail += dist[j];
    return Math.min(1, Math.max(0, tail));
  }
  // The same with one shared p, in logs so thousands of trials don't underflow.
  function binomialTail(n, p, observed) {
    if (observed <= 0) return 1;
    if (observed > n || !(p > 0)) return 0;
    if (p >= 1) return 1;
    var logP = Math.log(p), logQ = Math.log1p(-p), logChoose = 0, tail = 0;
    for (var j = 0; j <= n; j++) {
      if (j >= observed) tail += Math.exp(logChoose + j * logP + (n - j) * logQ);
      if (j < n) logChoose += Math.log((n - j) / (j + 1));
    }
    return Math.min(1, Math.max(0, tail));
  }
  function tailProbability(probs, observed) {
    if (!probs.length) return observed <= 0 ? 1 : 0;
    for (var i = 1; i < probs.length; i++) if (probs[i] !== probs[0]) return poissonBinomialTail(probs, observed);
    return binomialTail(probs.length, probs[0], observed);
  }
  // Plain-English reading, deliberately conservative.
  function verdict(observed, expected, pValue, trials) {
    if (!trials) return { level: "none", text: "Nothing to judge yet." };
    if (observed <= expected) return { level: "chance", text: "No more than chance would give." };
    if (pValue < 0.01) return { level: "strong", text: "Well above chance (p < 0.01)." };
    if (pValue < 0.05) return { level: "some", text: "Above chance (p < 0.05): worth watching, not yet proof." };
    return { level: "chance", text: "Within what chance alone would give." };
  }

  /* -------------------------------------------------------------- anchors */
  function anchors(event) {
    var out = [];
    (event.x_dates || []).forEach(function (x, index) {
      if (!x || x.enabled !== true) return;
      var ms = T.inputDateToMs(event, x);
      if (ms !== null) out.push({ index: index, ms: ms, day: dayOf(ms), x: x });
    });
    return out.sort(function (a, b) { return a.ms - b.ms || a.index - b.index; });
  }

  function coverage(days, from, to, tol) {
    var covered = new Set();
    days.forEach(function (d) {
      if (d + tol < from || d - tol > to) return;
      for (var day = d - tol; day <= d + tol; day++) if (day >= from && day <= to) covered.add(day);
    });
    return covered.size;
  }

  /* ------------------------------------------------------------- backtest */
  function backtestEvent(event, opts) {
    opts = opts || {};
    var tol = opts.tolerance != null ? opts.tolerance : DEFAULTS.tolerance;
    var topN = opts.topN || DEFAULTS.topN;
    var xs = anchors(event), steps = [];
    for (var h = C.MIN_X_DATES; h < xs.length; h++) {
      var known = xs.slice(0, h), target = xs[h], last = known[known.length - 1];
      var trial = JSON.parse(JSON.stringify(event));
      trial.x_dates = known.map(function (a) { return JSON.parse(JSON.stringify(a.x)); });
      trial.t_dates = [];
      var res = NC.engine.run(trial, { nowMs: last.ms });
      var step = { eventName: event.name, known: known.length, targetIndex: target.index, targetMs: target.ms, lastMs: last.ms };
      if (res.errors.length) { step.error = res.errors.join(" "); steps.push(step); continue; }

      var kept = res.byDate;
      var ranked = NC.engine.sortZ(kept.slice(), C.SORT.SCORE, res.system);
      var rank = new Map(); ranked.forEach(function (t, i) { rank.set(t, i + 1); });
      var keptDays = kept.map(function (t) { return dayOf(t.start); });
      var topDays = ranked.slice(0, topN).map(function (t) { return dayOf(t.start); });

      // The horizon: the "beyond N days" filter when it is on, else the furthest projection.
      var horizon, by;
      if (C.fieldOn(trial, "iso_event_filter_beyond_max_days")) { horizon = C.fieldValue(trial, "iso_event_filter_beyond_max_days"); by = "filter"; }
      else { horizon = keptDays.reduce(function (m, d) { return Math.max(m, d); }, last.day) - last.day; by = "projections"; }
      var from = last.day + 1, to = last.day + horizon;

      var best = null, nearest = null;
      kept.forEach(function (t, i) {
        var off = keptDays[i] - target.day, r = rank.get(t);
        if (!nearest || Math.abs(off) < Math.abs(nearest.off)) nearest = { off: off, rank: r, start: t.start };
        if (Math.abs(off) <= tol && (!best || r < best.rank)) best = { off: off, rank: r, start: t.start, score: t.score, hits: t.hits };
      });

      step.projected = kept.length;
      step.inWindow = target.day >= from && target.day <= to;
      if (!step.inWindow) step.outside = target.day < from ? "same-day" : (by === "filter" ? "beyond-filter" : "beyond-projections");
      step.hit = !!best;
      step.topHit = !!best && best.rank <= topN;
      step.best = best; step.nearest = nearest;
      var cFrom = Math.max(from, target.day - CONTROL_DAYS), cTo = Math.min(to, target.day + CONTROL_DAYS);
      var cDays = step.inWindow ? cTo - cFrom + 1 : 0;
      step.chanceHit = cDays ? coverage(keptDays, cFrom, cTo, tol) / cDays : 0;
      step.chanceTop = cDays ? coverage(topDays, cFrom, cTo, tol) / cDays : 0;
      steps.push(step);
    }
    return steps;
  }

  function summarize(steps, topN) {
    // A target past the horizon could not have been hit whatever the formulas did, so it is not scored.
    var valid = steps.filter(function (s) { return !s.error && s.inWindow; });
    function block(hitKey, chanceKey) {
      var observed = valid.filter(function (s) { return s[hitKey]; }).length;
      var probs = valid.map(function (s) { return s[chanceKey]; });
      var expected = probs.reduce(function (a, b) { return a + b; }, 0);
      var p = tailProbability(probs, observed);
      return { observed: observed, expected: expected, trials: valid.length, pValue: p, verdict: verdict(observed, expected, p, valid.length) };
    }
    return { steps: steps.length, valid: valid.length, any: block("hit", "chanceHit"), top: block("topHit", "chanceTop"), topN: topN };
  }

  function backtest(events, opts) {
    opts = opts || {};
    var steps = [];
    events.forEach(function (e) { steps = steps.concat(backtestEvent(e, opts)); });
    return { steps: steps, summary: summarize(steps, opts.topN || DEFAULTS.topN) };
  }

  /* --------------------------------------------------------- cycle echoes */
  function echoes(event, res, opts) {
    var tol = (opts && opts.echoTolerance) || DEFAULTS.echoTolerance;
    var xs = anchors(event), zs = res && res.byDate ? res.byDate : [];
    var out = { list: [], summary: null, pairs: [], pairSummary: null, reach: [], tolerance: tol };
    var minDay = Infinity, maxDay = -Infinity;
    zs.forEach(function (t) {
      var day = dayOf(t.start), found = [];
      minDay = Math.min(minDay, day); maxDay = Math.max(maxDay, day);
      CYCLES.forEach(function (c) {
        xs.forEach(function (x) {
          var d = day - x.day, k = Math.round(d / c.days);
          if (k === 0) return;
          var r = d - k * c.days;
          if (Math.abs(r) <= tol) found.push({ cycle: c.id, glyph: c.glyph, xIndex: x.index, k: k, r: r });
        });
      });
      if (found.length) out.list.push({ z: t, echoes: found });
    });
    if (zs.length) {
      var covered = new Set();
      CYCLES.forEach(function (c) {
        xs.forEach(function (x) {
          var kLo = Math.ceil((minDay - tol - x.day) / c.days), kHi = Math.floor((maxDay + tol - x.day) / c.days);
          for (var k = kLo; k <= kHi; k++) {
            if (k === 0) continue;
            var centre = x.day + k * c.days;
            for (var day = Math.ceil(centre - tol); day <= Math.floor(centre + tol); day++) if (day >= minDay && day <= maxDay) covered.add(day);
          }
        });
      });
      var p = covered.size / (maxDay - minDay + 1), expected = zs.length * p, pv = binomialTail(zs.length, p, out.list.length);
      out.summary = { observed: out.list.length, expected: expected, trials: zs.length, pValue: pv, verdict: verdict(out.list.length, expected, pv, zs.length) };
    }
    var pairProbs = [];
    for (var i = 0; i < xs.length; i++) for (var j = i + 1; j < xs.length; j++) {
      var gap = xs[j].day - xs[i].day;
      CYCLES.forEach(function (c) {
        if (gap + tol < c.days) return;
        pairProbs.push(Math.min(1, (2 * tol + 1) / c.days));
        var k = Math.round(gap / c.days), r = gap - k * c.days;
        if (k >= 1 && Math.abs(r) <= tol) out.pairs.push({ cycle: c.id, glyph: c.glyph, older: xs[i].index, newer: xs[j].index, k: k, r: r });
      });
    }
    if (pairProbs.length) {
      var pe = pairProbs.reduce(function (a, b) { return a + b; }, 0), pp = tailProbability(pairProbs, out.pairs.length);
      out.pairSummary = { observed: out.pairs.length, expected: pe, trials: pairProbs.length, pValue: pp, verdict: verdict(out.pairs.length, pe, pp, pairProbs.length) };
    }
    var days = xs.map(function (x) { return x.day; });
    if (zs.length) { days.push(minDay, maxDay); }
    var span = days.length ? Math.max.apply(null, days) - Math.min.apply(null, days) : 0;
    CYCLES.forEach(function (c) { out.reach.push({ cycle: c.id, label: c.label, possible: span + tol >= c.days, spanYears: span / TROPICAL_YEAR }); });
    return out;
  }

  NC.backtest = {
    CYCLES: CYCLES, DEFAULTS: DEFAULTS, CHOICES: CHOICES, CONTROL_DAYS: CONTROL_DAYS,
    run: backtest, event: backtestEvent, summarize: summarize, echoes: echoes,
    stats: { poissonBinomialTail: poissonBinomialTail, binomialTail: binomialTail, tailProbability: tailProbability, verdict: verdict }
  };
})(typeof window !== "undefined" ? window : globalThis);
