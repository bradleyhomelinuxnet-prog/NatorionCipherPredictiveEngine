/* ==========================================================================
   ophis.cycles.js — cycle echoes and the backtest
   --------------------------------------------------------------------------
   An analysis layer that sits beside the engine and never inside it. It
   reads what Engine.run returns and reports on it; nothing here changes a
   Z-Date, a hit, a score or a filter, so Ophis still reproduces the desktop
   program exactly.

   Two questions, each answered against chance rather than on its own:

   1. Cycle echoes. Does a projected Z-Date sit a whole number of cycles
      from one of your X-Dates? The Metonic cycle is 19 years = 235 lunar
      months = 6,939.69 days: after it, the Moon's phase returns to almost
      the same calendar date, so an echo lands on the same day of the year
      under the same Moon. The 138-year cycle is 138 tropical years.
      Every count comes with the number you would expect if the Z-Dates had
      fallen on random days in the same span — more cycles checked means
      more matches by coincidence, and only the difference means anything.

   2. The backtest. Stand on the day of an earlier known event, give the
      engine only the events up to then, and ask whether it would have
      projected the next one. The control is chance near the real date: the
      share of the days within LOCAL_CONTROL_DAYS of it that the projections
      happen to cover is the chance of a hit by luck alone.

   Days are counted the way the engine keys Z-Dates: the UTC calendar day in
   Days scope, and in HH:MM scope the sunset-to-sunset day, named by the local
   date of the sunset that opens it.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Engine = root.Ophis.Engine;

  var DAY = C.MILLIS_PER_DAY;
  var TROPICAL_YEAR = 365.2421897;

  var Cycles = {};

  Cycles.DEFINITIONS = [
    {
      id: "metonic",
      label: "Metonic",
      short: "19y",
      glyph: "☾",
      days: 235 * C.SYNODIC_MONTH,
      note: "19 years = 235 lunar months (6,939.69 days): the Moon's phase returns to almost the same calendar date."
    },
    {
      id: "phoenix",
      label: "138-year",
      short: "138y",
      glyph: "◆",
      days: 138 * TROPICAL_YEAR,
      note: "138 tropical years (50,403.4 days)."
    }
  ];

  Cycles.DEFAULTS = { metonic: true, phoenix: true, tolerance: 2, backtestTolerance: 1, topN: 10, allEvents: false };

  /* The values each setting may take. Settings are read back from browser
     storage, where a hand-edited or damaged entry could hold anything; a
     tolerance of a million days would stall every render. */
  Cycles.CHOICES = { tolerance: [1, 2, 3], backtestTolerance: [0, 1, 3, 7] };
  Cycles.TOP_N_MAX = 50;

  function validSetting(key, value) {
    if (typeof Cycles.DEFAULTS[key] === "boolean") return typeof value === "boolean";
    if (Cycles.CHOICES[key]) return Cycles.CHOICES[key].indexOf(value) >= 0;
    if (key === "topN") return typeof value === "number" && value % 1 === 0 && value >= 1 && value <= Cycles.TOP_N_MAX;
    return false;
  }

  /** Every setting, each one kept only if it is one of its allowed values. */
  Cycles.sanitizeSettings = function (saved) {
    var source = (saved && typeof saved === "object" && !Array.isArray(saved)) ? saved : {};
    var out = {};
    Object.keys(Cycles.DEFAULTS).forEach(function (key) {
      var value = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
      out[key] = validSetting(key, value) ? value : Cycles.DEFAULTS[key];
    });
    return out;
  };

  function definition(id) {
    for (var i = 0; i < Cycles.DEFINITIONS.length; i++) if (Cycles.DEFINITIONS[i].id === id) return Cycles.DEFINITIONS[i];
    return null;
  }
  Cycles.definition = definition;

  function enabledDefinitions(settings) {
    return Cycles.DEFINITIONS.filter(function (d) { return settings[d.id] === true; });
  }

  /** UTC day number of an instant: whole days since 1970-01-01. */
  function dayNumber(instant) { return Math.floor(instant.getTime() / DAY); }
  Cycles.dayNumber = dayNumber;

  function isHHMM(event) { return event.scope === C.EVENT_SCOPE__HH_MM; }

  /** Day number of the local calendar date of an instant, at the event's place. */
  function localDayNumber(event, instant) {
    var zone = T.isValidLatAndLong(event.lat, event.long) ? T.timezoneAt(event.lat, event.long) : T.browserTimezone();
    var wall = T.utcMillisToWallTime(instant.getTime(), zone);
    return Math.round(T.utcMillis(wall.year, wall.month - 1, wall.day) / DAY);
  }

  /**
   * The day a moment belongs to. Days scope: its UTC calendar day, like a
   * Z-Date's. HH:MM scope: the sunset-to-sunset day opened by the latest
   * sunset at or before it, which is the sunset that opens the Z-Date window
   * the moment falls in, so an event inside a projected window is on that
   * Z-Date's day.
   */
  function dayOfInstant(event, instant) {
    if (!isHHMM(event)) return dayNumber(instant);
    var opening = T.sunsetBefore(instant, event.lat, event.long);
    return opening ? dayOfSunset(event, opening) : localDayNumber(event, instant);
  }
  Cycles.dayOfInstant = dayOfInstant;

  /**
   * A sunset-day is named by the local date twelve hours before the sunset
   * that opens it. Sunsets fall between about 14:00 and 01:00 local time, so
   * this never crosses midnight. Naming it by the sunset's own date would give
   * two sunset-days the same number wherever summer sunsets come just after
   * midnight, as in Fairbanks or Reykjavik.
   */
  function dayOfSunset(event, sunset) {
    return localDayNumber(event, new Date(sunset.getTime() - DAY / 2));
  }

  /** The day of a Z-Date. In HH:MM scope its window opens at z_start, a sunset. */
  function dayOfZDate(event, zStruct) {
    return isHHMM(event) ? dayOfSunset(event, zStruct.z_start) : dayNumber(zStruct.z_start);
  }
  Cycles.dayOfZDate = dayOfZDate;

  /** Moon ages within this many days of each other count as the same phase. */
  var SAME_MOON_DAYS = 1.5;
  function sameMoon(a, b) {
    var diff = Math.abs(T.lunarAgeDays(a) - T.lunarAgeDays(b));
    return Math.min(diff, C.SYNODIC_MONTH - diff) <= SAME_MOON_DAYS;
  }

  /** The enabled X-Dates of an event as instants, oldest first, keeping their X-number. */
  function enabledXInstants(event) {
    var out = [];
    (event.x_dates || []).forEach(function (xDate, index) {
      if (xDate.enabled !== true) return;
      var instant = T.xDateToInstant(event.scope, xDate, event.lat, event.long, []);
      if (instant) out.push({ index: index, xDate: xDate, instant: instant, day: dayOfInstant(event, instant) });
    });
    out.sort(function (a, b) { return a.day - b.day || a.index - b.index; });
    return out;
  }
  Cycles.enabledXInstants = enabledXInstants;

  /* ------------------------------------------------------------ statistics */

  /**
   * P(at least `observed` successes) when trial i succeeds with probability
   * probs[i], independently. Exact, by building the whole distribution:
   * O(n²), which is fine for a backtest's few dozen steps.
   */
  function poissonBinomialTail(probs, observed) {
    if (observed <= 0) return 1;
    var dist = [1];
    probs.forEach(function (p) {
      var next = new Array(dist.length + 1).fill(0);
      for (var k = 0; k < dist.length; k++) {
        next[k] += dist[k] * (1 - p);
        next[k + 1] += dist[k] * p;
      }
      dist = next;
    });
    var tail = 0;
    for (var j = observed; j < dist.length; j++) tail += dist[j];
    return Math.min(1, Math.max(0, tail));
  }
  Cycles.poissonBinomialTail = poissonBinomialTail;

  /**
   * The same when every trial has the same probability p: the binomial tail,
   * in O(n). Each term is built in logs, so nothing underflows when n runs to
   * thousands of Z-Dates.
   */
  function binomialTail(n, p, observed) {
    if (observed <= 0) return 1;
    if (observed > n || !(p > 0)) return 0;
    if (p >= 1) return 1;
    var logP = Math.log(p), logQ = Math.log1p(-p);
    var logChoose = 0;                     // log C(n, j), starting at j = 0
    var tail = 0;
    for (var j = 0; j <= n; j++) {
      if (j >= observed) tail += Math.exp(logChoose + j * logP + (n - j) * logQ);
      if (j < n) logChoose += Math.log((n - j) / (j + 1));
    }
    return Math.min(1, Math.max(0, tail));
  }
  Cycles.binomialTail = binomialTail;

  /** P(at least `observed` successes), taking the O(n) path when it can. */
  function tailProbability(probs, observed) {
    if (!probs.length) return observed <= 0 ? 1 : 0;
    var p = probs[0];
    for (var i = 1; i < probs.length; i++) if (probs[i] !== p) return poissonBinomialTail(probs, observed);
    return binomialTail(probs.length, p, observed);
  }
  Cycles.tailProbability = tailProbability;

  /** Plain-English reading of a p-value, deliberately conservative. */
  Cycles.verdict = function (observed, expected, pValue, trials) {
    if (!trials) return { level: "none", text: "Nothing to judge yet." };
    if (observed <= expected) return { level: "chance", text: "No more than chance would give." };
    if (pValue < 0.01) return { level: "strong", text: "Well above chance (p < 0.01)." };
    if (pValue < 0.05) return { level: "some", text: "Above chance (p < 0.05) — worth watching, not yet proof." };
    return { level: "chance", text: "Within what chance alone would give." };
  };

  /* ---------------------------------------------------------- cycle echoes */

  /**
   * Every whole-cycle echo between one day and a set of X-Dates. k is the
   * number of cycles (negative when the day is before the X-Date), r the
   * residual in days.
   */
  function echoesOfDay(day, instant, xs, defs, tolerance) {
    var found = [];
    defs.forEach(function (def) {
      xs.forEach(function (x) {
        var d = day - x.day;
        var k = Math.round(d / def.days);
        if (k === 0) return;
        var r = d - k * def.days;
        if (Math.abs(r) <= tolerance) {
          found.push({ cycle: def.id, xIndex: x.index, k: k, r: r, sameMoon: sameMoon(instant, x.instant) });
        }
      });
    });
    return found;
  }

  /** Days in [from, to] that sit within `tolerance` of a whole-cycle echo of any X-Date. */
  function echoCoverage(from, to, xs, defs, tolerance) {
    var covered = new Set();
    defs.forEach(function (def) {
      xs.forEach(function (x) {
        var kLo = Math.ceil((from - tolerance - x.day) / def.days);
        var kHi = Math.floor((to + tolerance - x.day) / def.days);
        for (var k = kLo; k <= kHi; k++) {
          if (k === 0) continue;
          var centre = x.day + k * def.days;
          for (var day = Math.ceil(centre - tolerance); day <= Math.floor(centre + tolerance); day++) {
            if (day >= from && day <= to) covered.add(day);
          }
        }
      });
    });
    return covered.size;
  }

  /**
   * Cycle echoes for the current results.
   * @returns {{byKey, list, summary, pairs, pairSummary, reach}}
   */
  Cycles.analyze = function (event, results, settings) {
    settings = settings || Cycles.DEFAULTS;
    var defs = enabledDefinitions(settings);
    var tolerance = settings.tolerance;
    var xs = enabledXInstants(event);
    var keys = (results && results.z_keys_by_date) || [];
    var zStructs = (results && results.z_structs) || {};

    var out = {
      byKey: {},
      list: [],
      pairs: [],
      summary: null,
      pairSummary: null,
      reach: [],
      defs: defs,
      tolerance: tolerance
    };
    if (!defs.length) return out;

    /* Z-Dates that echo an X-Date. */
    var minDay = Infinity, maxDay = -Infinity;
    keys.forEach(function (key) {
      var z = zStructs[key];
      var day = dayOfZDate(event, z);
      if (day < minDay) minDay = day;
      if (day > maxDay) maxDay = day;
      var echoes = echoesOfDay(day, z.z_start, xs, defs, tolerance);
      if (echoes.length) {
        out.byKey[key] = echoes;
        out.list.push({ key: key, zStruct: z, echoes: echoes });
      }
    });

    if (keys.length) {
      var spanDays = maxDay - minDay + 1;
      var p = echoCoverage(minDay, maxDay, xs, defs, tolerance) / spanDays;
      var observed = out.list.length;
      var expected = keys.length * p;
      var pValue = binomialTail(keys.length, p, observed);
      out.summary = {
        observed: observed, expected: expected, trials: keys.length, chancePerDate: p, pValue: pValue,
        verdict: Cycles.verdict(observed, expected, pValue, keys.length)
      };
    }

    /* Pairs of X-Dates that are themselves a whole number of cycles apart. */
    var pairProbs = [];
    for (var i = 0; i < xs.length; i++) {
      for (var j = i + 1; j < xs.length; j++) {
        var d = xs[j].day - xs[i].day;
        defs.forEach(function (def) {
          if (d + tolerance < def.days) return;
          // A gap of random length lands within ±tolerance of a whole cycle
          // this often.
          pairProbs.push(Math.min(1, (2 * tolerance + 1) / def.days));
          var k = Math.round(d / def.days);
          var r = d - k * def.days;
          if (k >= 1 && Math.abs(r) <= tolerance) {
            out.pairs.push({ cycle: def.id, older: xs[i].index, newer: xs[j].index, k: k, r: r,
                             sameMoon: sameMoon(xs[i].instant, xs[j].instant) });
          }
        });
      }
    }
    if (pairProbs.length) {
      var pairExpected = pairProbs.reduce(function (a, b) { return a + b; }, 0);
      var pairP = tailProbability(pairProbs, out.pairs.length);
      out.pairSummary = {
        observed: out.pairs.length, expected: pairExpected, trials: pairProbs.length, pValue: pairP,
        verdict: Cycles.verdict(out.pairs.length, pairExpected, pairP, pairProbs.length)
      };
    }

    /* Can a cycle occur at all across what is on screen? */
    var allDays = xs.map(function (x) { return x.day; });
    if (keys.length) { allDays.push(minDay); allDays.push(maxDay); }
    var reachDays = allDays.length ? Math.max.apply(null, allDays) - Math.min.apply(null, allDays) : 0;
    defs.forEach(function (def) {
      out.reach.push({ cycle: def.id, possible: reachDays + tolerance >= def.days, spanYears: reachDays / TROPICAL_YEAR });
    });

    return out;
  };

  /* --------------------------------------------------------------- backtest */

  /**
   * Chance is judged near the event, not across the whole horizon. The
   * projections are not spread evenly over the years ahead: they crowd the
   * weeks and months after the last known event, and so do real next events.
   * Measured against a random date anywhere in the seven-year horizon, series
   * of pure-noise dates came out "above chance" in up to a third of cases, and
   * in most of them with the horizon filter off. Asking instead how much of the
   * days either side of the real date the projections happen to cover compares
   * like with like: the same noise is then flagged no more often than a fair
   * test allows (web/tests/cycles.node.js checks this). The verdicts hardly
   * move between 30 and 90 days; 60 holds a representative stretch of
   * projections while still following how their density changes.
   *
   * One known limit: when events are only weeks apart, the top-N figure is a
   * little generous. Noise with gaps of 30 days on average was called "above
   * chance" in about 7% of 960 series, not 5%, while the any-hit figure stayed
   * fair. A window scaled to the typical gap between the events would correct
   * it.
   */
  var LOCAL_CONTROL_DAYS = 60;
  Cycles.LOCAL_CONTROL_DAYS = LOCAL_CONTROL_DAYS;

  /** How far ahead the engine was allowed to project, and what set that limit. */
  function horizonOf(event, lastKnownDay, keptDays) {
    if (Engine.filterEnabled(event, "iso_event_filter_beyond_max_days")) {
      var filter = null;
      C.FILTERS.forEach(function (f) { if (f.key === "iso_event_filter_beyond_max_days") filter = f; });
      var value = filter ? Engine.filterValue(event, filter) : null;
      if (typeof value === "number" && value > 0) return { days: value, by: "filter" };
    }
    // Without that filter, the horizon is simply the furthest projection.
    var furthest = keptDays.reduce(function (max, d) { return d > max ? d : max; }, lastKnownDay);
    return { days: furthest - lastKnownDay, by: "projections" };
  }

  function coverageOf(days, from, to, tolerance) {
    var covered = new Set();
    days.forEach(function (d) {
      if (d + tolerance < from || d - tolerance > to) return;
      for (var day = d - tolerance; day <= d + tolerance; day++) if (day >= from && day <= to) covered.add(day);
    });
    return covered.size;
  }

  /**
   * Walk forward through one event: for each known event from the third on,
   * cast from the ones before it and see whether it was projected.
   */
  Cycles.backtestEvent = function (event, options) {
    options = options || {};
    var tolerance = options.tolerance != null ? options.tolerance : Cycles.DEFAULTS.backtestTolerance;
    var topN = options.topN || Cycles.DEFAULTS.topN;
    var xs = enabledXInstants(event);
    var steps = [];

    for (var h = C.MINIMUM_NUMBER_OF_X_DATES; h < xs.length; h++) {
      var known = xs.slice(0, h);
      var target = xs[h];
      var trial = JSON.parse(JSON.stringify(event));
      trial.x_dates = known.map(function (x) { return JSON.parse(JSON.stringify(x.xDate)); });
      trial.t_dates = [];

      var lastKnown = known[known.length - 1];
      // Standing at the last known event: "now" is that moment.
      var results = Engine.run(trial, { nowInstant: lastKnown.instant });
      var step = {
        eventName: event.name,
        knownCount: known.length,
        knownIndices: known.map(function (x) { return x.index; }),
        targetIndex: target.index,
        targetInstant: target.instant,
        // The date as the X-Date gives it, so the table shows what was entered.
        targetLabel: target.xDate.date + (isHHMM(event) ? " " + target.xDate.time : ""),
        lastKnownInstant: lastKnown.instant
      };

      if (results.errors && results.errors.length) {
        step.error = results.errors.join(" ");
        steps.push(step);
        continue;
      }

      var kept = results.z_keys_by_date || [];
      var ranked = Engine.sortZDates(kept, results.z_structs, C.Z_DATE_SORT_TYPE__SCORE, Engine.scoringSystem(trial));
      var rankOf = {};
      ranked.forEach(function (key, i) { rankOf[key] = i + 1; });

      var targetDay = target.day;
      var keptDays = kept.map(function (key) { return dayOfZDate(trial, results.z_structs[key]); });
      var topDays = ranked.slice(0, topN).map(function (key) { return dayOfZDate(trial, results.z_structs[key]); });

      var horizon = horizonOf(trial, lastKnown.day, keptDays);
      var from = lastKnown.day + 1;
      var to = lastKnown.day + horizon.days;
      var windowDays = Math.max(0, to - from + 1);

      var best = null;
      var nearest = null;
      kept.forEach(function (key, i) {
        var z = results.z_structs[key];
        var off = keptDays[i] - targetDay;
        if (nearest === null || Math.abs(off) < Math.abs(nearest.off)) nearest = { key: key, off: off, rank: rankOf[key] };
        if (Math.abs(off) <= tolerance && (!best || rankOf[key] < best.rank)) {
          best = { key: key, off: off, rank: rankOf[key], score: z.score, hits: z.hit_count, date: z.z_readable_start };
        }
      });

      step.projected = kept.length;
      step.windowFrom = from;
      step.windowTo = to;
      step.windowDays = windowDays;
      step.horizonBy = horizon.by;
      step.inWindow = targetDay >= from && targetDay <= to;
      // Why a target could not be scored: on the day the cast stands on, or
      // past the horizon (set by the "Hide beyond N days" filter, or else by
      // the furthest projection).
      if (!step.inWindow) step.outside = targetDay < from ? "same-day" : (horizon.by === "filter" ? "beyond-filter" : "beyond-projections");
      step.hit = !!best;
      step.topHit = !!best && best.rank <= topN;
      step.best = best;
      step.nearest = nearest;

      // The control: how much of the days around the real date the
      // projections cover (see LOCAL_CONTROL_DAYS), for any hit and for a hit
      // among the top N.
      var controlFrom = Math.max(from, targetDay - LOCAL_CONTROL_DAYS);
      var controlTo = Math.min(to, targetDay + LOCAL_CONTROL_DAYS);
      var controlDays = step.inWindow ? controlTo - controlFrom + 1 : 0;
      step.controlFrom = controlFrom;
      step.controlTo = controlTo;
      step.controlDays = controlDays;
      step.chanceHit = controlDays ? coverageOf(keptDays, controlFrom, controlTo, tolerance) / controlDays : 0;
      step.chanceTop = controlDays ? coverageOf(topDays, controlFrom, controlTo, tolerance) / controlDays : 0;
      // The share of the whole horizon covered: the control this used before.
      // Not scored; kept so the calibration test can show it understates luck.
      step.chanceHitHorizon = windowDays ? coverageOf(keptDays, from, to, tolerance) / windowDays : 0;
      steps.push(step);
    }
    return steps;
  };

  Cycles.summarize = function (steps, topN) {
    // A target beyond the projection horizon could not have been hit whatever
    // the projections were, so it says nothing either way and is not scored.
    var valid = steps.filter(function (s) { return !s.error && s.inWindow !== false; });
    function block(hitKey, chanceKey) {
      var observed = valid.filter(function (s) { return s[hitKey]; }).length;
      var probs = valid.map(function (s) { return s[chanceKey]; });
      var expected = probs.reduce(function (a, b) { return a + b; }, 0);
      var pValue = tailProbability(probs, observed);
      return { observed: observed, expected: expected, trials: valid.length, pValue: pValue,
               verdict: Cycles.verdict(observed, expected, pValue, valid.length) };
    }
    return { steps: steps.length, valid: valid.length, any: block("hit", "chanceHit"), top: block("topHit", "chanceTop"), topN: topN };
  };

  /** Backtest one event or every event, with a combined summary. */
  Cycles.backtest = function (events, options) {
    options = options || {};
    var steps = [];
    events.forEach(function (event) { steps = steps.concat(Cycles.backtestEvent(event, options)); });
    return { steps: steps, summary: Cycles.summarize(steps, options.topN || Cycles.DEFAULTS.topN) };
  };

  root.Ophis.Cycles = Cycles;
})(typeof window !== "undefined" ? window : globalThis);
