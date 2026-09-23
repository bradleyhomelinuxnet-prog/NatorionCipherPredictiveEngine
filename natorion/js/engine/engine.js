/* NATORION · engine/engine.js
   The projection itself — runOphisOnEvent() restated.

     X-Dates ── every enabled pair (Xk, Xi), k < i ──▶ Y = whole days between
     Y ── each enabled operation f ──▶ Z = f(Y), added to X1 or X2 ──▶ a Z-Date
     Z-Dates that land on the same day merge; each hit and each MSRF match of
     its Z-value scores; filters hide some; the rest are sorted.

   The order of every loop, every rounding step and both sort comparators
   follow the v12 source, because the output depends on them (tests/parity.js
   checks this against the original code). */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time, S = NC.sky, X = NC.expr;
  var DAY = C.MS_DAY;
  var round1 = NC.round1, round2 = NC.round2;

  /* -------------------------------------------------- Y between dates -- */
  function rotationsBetween(scope, olderMs, newerMs, lat, lon) {
    if (scope !== C.SCOPE.HH_MM) return round1((newerMs - olderMs) / DAY);
    // HH:MM: a day begins at sunset, so count sunsets.
    var diff = S.sunsetBefore(newerMs, lat, lon) - S.sunsetBefore(olderMs, lat, lon), rem, d;
    if (diff === 0) return 0;
    if (diff < 0) {
      if (diff >= -DAY) return -1;
      rem = diff % DAY; d = (diff - rem) / DAY;
      if (rem < -DAY / 2) d -= 1;
      return round1(d);
    }
    if (diff <= DAY) return 1;
    rem = diff % DAY; d = (diff - rem) / DAY;
    if (rem > DAY / 2) d += 1;
    return round1(d);
  }

  /* ------------------------------------------------ operations compile -- */
  function effectiveOperations(event) {
    var ops = Array.isArray(event.operations) ? event.operations : [];
    return ops.map(function (o, i) {
      var copy = { equation: o.equation, weight: Number(o.weight), enabled: o.enabled === true, index: i, fn: null, startingX: 0, errors: [] };
      if (copy.enabled) {
        var c = X.compileOperation(o.equation, i, ops);
        copy.fn = c.fn; copy.startingX = c.startingX; copy.errors = c.errors; copy.normalized = c.normalized;
      }
      return copy;
    });
  }

  function findSunsetWithin(ms, seen) {
    for (var i = 0; i < seen.length; i++) if (Math.abs(seen[i] - ms) <= C.SUNSET_DEDUPE_MS) return seen[i];
    seen.push(ms);
    return ms;
  }

  /* One pair, every operation -> operation results. */
  function runOperations(ops, scope, x1, x2, Y, lat, lon, seenSunsets, dayStartMs) {
    var out = [];
    if (Y > C.MAX_Y) Y = C.MAX_Y;
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (!o.enabled || !o.fn) continue;
      var zRaw = o.fn(Y);
      if (zRaw > C.MAX_Z) zRaw = C.MAX_Z;
      var zMs = zRaw * DAY;                      // before rounding, as v12
      var z = round2(zRaw);
      var from = o.startingX === 1 ? x1 : x2, other = o.startingX === 1 ? x2 : x1;
      var addTo = from;
      if (scope === C.SCOPE.DAYS && dayStartMs > 0) addTo += dayStartMs;
      var zAt = addTo + zMs, start, end;
      if (!Number.isFinite(zAt)) continue;       // f(Y) was not a number for this Y
      zAt = Math.trunc(zAt);                     // new Date() drops fractional ms toward zero
      if (scope === C.SCOPE.HH_MM) {
        var shared = [];
        start = findSunsetWithin(S.sunsetBefore(zAt, lat, lon, shared), seenSunsets);
        end = findSunsetWithin(S.sunsetAfter(zAt, lat, lon, shared), seenSunsets);
      } else {
        start = end = Math.floor(zAt / DAY) * DAY;   // the UTC calendar day
      }
      out.push({ zValue: z, Y: Y, z: round1(z), zExact: zAt, start: start, end: end, xFrom: addTo, xOther: other, opIndex: i, op: o });
    }
    return out;
  }

  /* --------------------------------------------------------- scoring -- */
  function maxMultiplier(msrf) {
    var m = 1.0;
    msrf.forEach(function (x) { if (x.cls.mult > m) m = x.cls.mult; });
    return m;
  }
  // Under v8+, the best MSRF class multiplies instead of adding: its first
  // match is left out of the base points.
  function msrfSubscore(msrf, system) {
    var overall = maxMultiplier(msrf), skipped = false, total = 0;
    msrf.forEach(function (x) {
      if (!skipped && x.cls.mult === overall && system === C.SCORING.GTE_V8) skipped = true;
      else total += x.cls.points;
    });
    return total;
  }
  function msrfNumberSum(msrf) { return msrf.reduce(function (s, x) { return s + x.number; }, 0); }

  function sortOperationHits(list) {
    list.sort(function (a, b) {
      var ra = a.r, rb = b.r;
      if (ra.op.weight > rb.op.weight) return -1;
      if (ra.op.weight < rb.op.weight) return 1;
      if (ra.opIndex === rb.opIndex) {
        if (a.y.x1 === b.y.x1) return a.y.x2 === b.y.x2 ? 1 : (a.y.x2 > b.y.x2 ? 1 : -1);
        return a.y.x1 > b.y.x1 ? 1 : -1;
      }
      return ra.opIndex > rb.opIndex ? 1 : -1;
    });
  }
  function sortMsrfHits(list) {
    list.sort(function (a, b) {
      if (a.cls.mult > b.cls.mult) return -1;
      if (a.cls.mult < b.cls.mult) return 1;
      return a.r.z >= b.r.z ? -1 : 1;
    });
  }

  function score(zs, ops, system) {
    zs.forEach(function (t) {
      sortOperationHits(t.ops);
      sortMsrfHits(t.msrf);
      var opScore = t.ops.reduce(function (s, h) { h.points = ops[h.r.opIndex].weight; return s + h.points; }, 0);
      var base = opScore + msrfSubscore(t.msrf, system);
      var mult = system === C.SCORING.GTE_V8 ? maxMultiplier(t.msrf) : 1;
      t.opScore = opScore;
      t.opHits = t.ops.length;
      t.base = base;
      t.multiplier = mult;
      t.score = round2(base * mult);
      t.hits = t.ops.length + t.msrf.length;
    });
  }

  /* --------------------------------------------------------- sorting -- */
  function compareBy(sortType, system) {
    var SORT = C.SORT;
    return function (a, b) {
      var order = "asc", kind = sortType, va = 0, vb = 0;
      var ma = msrfSubscore(a.msrf, system), mb = msrfSubscore(b.msrf, system);
      var na = msrfNumberSum(a.msrf), nb = msrfNumberSum(b.msrf);
      if (sortType === SORT.SCORE && a.score === b.score) kind = a.hits === b.hits ? SORT.DATE : SORT.HIT_COUNT;
      else if (sortType === SORT.MSRF && ma === mb && na === nb) kind = SORT.DATE;
      else if (sortType === SORT.OPERATIONS && a.opScore === b.opScore && a.opHits === b.opHits) kind = SORT.DATE;
      else if (sortType === SORT.HIT_COUNT && a.hits === b.hits) kind = SORT.DATE;
      if (kind === SORT.SCORE) { va = a.score; vb = b.score; order = "desc"; }
      else if (kind === SORT.DATE) { va = a.start; vb = b.start; }
      else if (kind === SORT.MSRF) { if (ma === mb) { va = na; vb = nb; } else { va = ma; vb = mb; } order = "desc"; }
      else if (kind === SORT.OPERATIONS) { va = a.opHits; vb = b.opHits; order = "desc"; }   // v12 sorts by count on both branches
      else if (kind === SORT.HIT_COUNT) { va = a.hits; vb = b.hits; order = "desc"; }
      return (va > vb ? -1 : 1) * (order === "desc" ? 1 : -1);
    };
  }
  function sortZ(list, sortType, system) {
    var SORT = C.SORT;
    var t = [SORT.DATE, SORT.SCORE, SORT.MSRF, SORT.HIT_COUNT, SORT.OPERATIONS].indexOf(sortType) >= 0 ? sortType : SORT.DATE;
    return list.slice().sort(compareBy(t, system));
  }

  /* --------------------------------------------------------- filtering -- */
  function lastEnabled(list) { for (var i = list.length - 1; i >= 0; i--) if (list[i] && list[i].enabled === true) return list[i]; return null; }

  // "Today" as the filters see it: in Days scope, the operator's own calendar
  // day read as a UTC day; in HH:MM scope, the instant itself.
  function cutoffFor(event, nowMs) {
    if (event.scope === C.SCOPE.HH_MM) return nowMs;
    var d = new Date(nowMs);
    return T.utcMs(d.getFullYear(), d.getMonth() + 1, d.getDate(), 0, 0);
  }

  function filterZ(event, zs, nowMs) {
    var hh = event.scope === C.SCOPE.HH_MM;
    var last = T.inputDateToMs(event, lastEnabled(event.x_dates || []));
    var cutoff = cutoffFor(event, nowMs);
    var tDates = (Array.isArray(event.t_dates) ? event.t_dates : []).filter(function (t) { return t && t.enabled === true; })
      .map(function (t) { return T.inputDateToMs(event, t); }).filter(function (ms) { return ms !== null; });
    var on = function (k) { return C.fieldOn(event, k); };
    var maxDays = C.fieldValue(event, "iso_event_filter_beyond_max_days");
    var minHits = C.fieldValue(event, "iso_event_filter_min_hit_count");
    var minScore = C.fieldValue(event, "iso_event_filter_min_score");
    var out = [];
    zs.forEach(function (t) {
      var keep = true, s = t.start, e = t.end;
      if (on("iso_event_filter_before_last_x_date") && (hh ? e <= last : s < last)) keep = false;
      if (on("iso_event_filter_on_last_x_date") && (hh ? (last >= s && last < e) : s === last)) keep = false;
      if (on("iso_event_filter_before_current_date") && (hh ? e <= cutoff : s < cutoff)) keep = false;
      if (on("iso_event_filter_on_current_date") && (hh ? (cutoff >= s && cutoff < e) : s === cutoff)) keep = false;
      if (tDates.length && !tDates.some(function (tm) { return hh ? (tm >= s && tm < e) : s === tm; })) keep = false;
      if (on("iso_event_filter_min_score") && t.score < minScore) keep = false;
      if (on("iso_event_filter_min_hit_count") && t.hits < minHits) keep = false;
      if (on("iso_event_filter_beyond_max_days") && Math.round((s - last) / DAY) > maxDays) keep = false;
      if (on("iso_event_filter_msrf_match") && t.msrf.length === 0) keep = false;
      t.hiddenBy = keep ? null : "filter";
      if (keep) out.push(t);
    });
    return { list: out, last: last, cutoff: cutoff };
  }

  /* ------------------------------------------------------ X-Date spread -- */
  function validateSpread(event, xs, lat, lon) {
    var errs = [];
    for (var i = 1; i < xs.length; i++) {
      if (xs[i].enabled !== true) continue;
      var k = i - 1;
      while (k >= 0 && xs[k].enabled !== true) k--;
      if (k < 0) continue;
      var a = T.inputDateToMs(event, xs[k]), b = T.inputDateToMs(event, xs[i]);
      if (a === null || b === null) { errs.push("Could not read X" + (k + 1) + " or X" + (i + 1) + "."); continue; }
      var min = i === 1 ? C.MIN_DAYS_FIRST_PAIR : C.MIN_DAYS_SUBSEQUENT;
      var y = rotationsBetween(event.scope, a, b, lat, lon);
      if (y < 0) errs.push("X" + (i + 1) + " must come after X" + (k + 1) + ".");
      else if (y === 0) errs.push("X" + (k + 1) + " and X" + (i + 1) + " must be different days" + (event.scope === C.SCOPE.HH_MM ? ", or either side of a sunset." : "."));
      else if (y < min) errs.push("X" + (i + 1) + " must be at least " + min + " day" + (min === 1 ? "" : "s") + " after X" + (k + 1) + "; found " + y + ".");
    }
    return errs;
  }

  /* ---------------------------------------------------------------- run -- */
  function run(event, options) {
    options = options || {};
    var nowMs = options.nowMs != null ? options.nowMs : T.roundMinute(Date.now());
    var errors = [], ys = [], zMap = new Map();
    var system = event.scoring_system === C.SCORING.LTE_V7 ? C.SCORING.LTE_V7 : C.SCORING.GTE_V8;
    var ops = effectiveOperations(event);
    var xs = Array.isArray(event.x_dates) ? event.x_dates : [];
    var lat = Number(event.lat), lon = Number(event.long);
    var zone = T.eventZone(event);
    var started = Date.now();

    try {
      var enabledX = xs.filter(function (x) { return x && x.enabled === true; });
      var runnable = ops.filter(function (o) { return o.enabled && o.fn; }).length;
      if (enabledX.length < C.MIN_X_DATES) errors.push("At least " + C.MIN_X_DATES + " X-Dates are required.");
      else if (event.scope === C.SCOPE.MONTHS) errors.push("Month-based projections may be supported in a future version.");
      else if (event.scope === C.SCOPE.YEARS) errors.push("Year-based projections may be supported in a future version.");
      else if (runnable < C.MIN_OPERATIONS) errors.push("At least " + C.MIN_OPERATIONS + " Operation is required.");
      else if (event.scope === C.SCOPE.HH_MM && !T.validLatLong(lat, lon)) errors.push("HH:MM scope needs a latitude within ±" + C.LAT_LIMIT + "° and a longitude within ±180°.");
      else {
        var bad = [];
        enabledX.forEach(function (x) { var e = []; if (T.inputDateToMs(event, x, e) === null) bad.push(e[0]); });
        if (bad.length) errors = bad;
        else {
          var spread = validateSpread(event, xs, lat, lon);
          if (spread.length) errors = spread;
          else generate();
        }
      }
    } catch (e) {
      errors.push(String(e && e.message || e));
    }

    function generate() {
      var seen = [];
      var dayStart = Number(event.day_scope_start_time_in_millis);
      if (!Number.isFinite(dayStart) || dayStart < 0) dayStart = 0;
      for (var i = 1; i < xs.length; i++) {
        var bi = T.inputDateToMs(event, xs[i]);
        for (var k = 0; k < i; k++) {
          if (!(xs[k].enabled === true && xs[i].enabled === true)) continue;
          var ak = T.inputDateToMs(event, xs[k]);
          var Y = rotationsBetween(event.scope, ak, bi, lat, lon);
          var results = runOperations(ops, event.scope, ak, bi, Y, lat, lon, seen, dayStart);
          var y = { index: ys.length, Y: Y, x1: k, x2: i, x1Ms: ak, x2Ms: bi, results: results };
          results.forEach(function (r) {
            var key = String(r.start), t = zMap.get(key);
            if (!t) { t = { key: key, start: r.start, end: r.end, ops: [], msrf: [], score: 0, hits: 0 }; zMap.set(key, t); }
            t.ops.push({ y: y, r: r });
            var m = NC.msrfMatch(r.z);
            if (m) t.msrf.push({ cls: m.cls, number: m.number, y: y, r: r });
          });
          ys.push(y);
        }
      }
    }

    // v12 kept Z-Dates in a plain object keyed by epoch ms. JavaScript lists
    // array-index keys (0 … 2^32-2, i.e. 1 Jan – 19 Feb 1970) first, in
    // numeric order, then the rest in insertion order. Sort ties depend on
    // that order, so it is reproduced.
    var zs = Array.from(zMap.values());
    var indexLike = zs.filter(function (t) { return t.start >= 0 && t.start <= 4294967294; }).sort(function (a, b) { return a.start - b.start; });
    if (indexLike.length) zs = indexLike.concat(zs.filter(function (t) { return !(t.start >= 0 && t.start <= 4294967294); }));
    score(zs, ops, system);

    var res = { errors: errors, ys: ys, zs: zs, ops: ops, system: system, zone: zone, byDate: [], sorted: [], last: null, cutoff: null, nowMs: nowMs };
    if (!errors.length) {
      var f = filterZ(event, zs, nowMs);
      res.last = f.last; res.cutoff = f.cutoff;
      res.byDate = sortZ(f.list, C.SORT.DATE, system);
      res.byDate.forEach(function (t, i) { t.ordinal = i; });
      res.sorted = event.z_date_sort_type && event.z_date_sort_type !== C.SORT.DATE ? sortZ(f.list, event.z_date_sort_type, system) : res.byDate.slice();
    }
    res.elapsedMs = Date.now() - started;
    return res;
  }

  NC.engine = {
    run: run, rotationsBetween: rotationsBetween, effectiveOperations: effectiveOperations,
    msrfSubscore: msrfSubscore, sortZ: sortZ, cutoffFor: cutoffFor
  };
})(typeof window !== "undefined" ? window : globalThis);
