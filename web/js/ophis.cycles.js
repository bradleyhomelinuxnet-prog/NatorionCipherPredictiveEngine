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
      projected the next one. The control is a random date in the same
      window: the fraction of that window the projections happen to cover
      is the chance of a hit by luck alone.
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
      if (instant) out.push({ index: index, xDate: xDate, instant: instant, day: dayNumber(instant) });
    });
    out.sort(function (a, b) { return a.day - b.day || a.index - b.index; });
    return out;
  }
  Cycles.enabledXInstants = enabledXInstants;

  /* ------------------------------------------------------------ statistics */

  /**
   * P(at least `observed` successes) when trial i succeeds with probability
   * probs[i], independently. Exact, by building the whole distribution.
   */
  function tailProbability(probs, observed) {
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
  Cycles.tailProbability = tailProbability;

  function repeat(p, n) { var a = []; for (var i = 0; i < n; i++) a.push(p); return a; }

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
      var day = dayNumber(z.z_start);
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
      var pValue = tailProbability(repeat(p, keys.length), observed);
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

  function horizonDays(event, lastKnownDay, keptDays) {
    if (Engine.filterEnabled(event, "iso_event_filter_beyond_max_days")) {
      var filter = null;
      C.FILTERS.forEach(function (f) { if (f.key === "iso_event_filter_beyond_max_days") filter = f; });
      var value = filter ? Engine.filterValue(event, filter) : null;
      if (typeof value === "number" && value > 0) return value;
    }
    if (!keptDays.length) return 0;
    return Math.max.apply(null, keptDays) - lastKnownDay;
  }

  function coverageOf(days, from, to, tolerance) {
    var covered = new Set();
    days.forEach(function (d) {
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
      // Standing on the day of the last known event: "now" is that day.
      var results = Engine.run(trial, { nowInstant: new Date(lastKnown.day * DAY) });
      var step = {
        eventName: event.name,
        knownCount: known.length,
        knownIndices: known.map(function (x) { return x.index; }),
        targetIndex: target.index,
        targetInstant: target.instant,
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
      var keptDays = kept.map(function (key) { return dayNumber(results.z_structs[key].z_start); });
      var topDays = ranked.slice(0, topN).map(function (key) { return dayNumber(results.z_structs[key].z_start); });

      var from = lastKnown.day + 1;
      var to = lastKnown.day + horizonDays(trial, lastKnown.day, keptDays);
      var windowDays = Math.max(0, to - from + 1);

      var best = null;
      var nearest = null;
      kept.forEach(function (key) {
        var z = results.z_structs[key];
        var off = dayNumber(z.z_start) - targetDay;
        if (nearest === null || Math.abs(off) < Math.abs(nearest.off)) nearest = { key: key, off: off, rank: rankOf[key] };
        if (Math.abs(off) <= tolerance && (!best || rankOf[key] < best.rank)) {
          best = { key: key, off: off, rank: rankOf[key], score: z.score, hits: z.hit_count, date: z.z_readable_start };
        }
      });

      step.projected = kept.length;
      step.windowFrom = from;
      step.windowTo = to;
      step.windowDays = windowDays;
      step.inWindow = targetDay >= from && targetDay <= to;
      step.hit = !!best;
      step.topHit = !!best && best.rank <= topN;
      step.best = best;
      step.nearest = nearest;
      step.chanceHit = windowDays ? coverageOf(keptDays, from, to, tolerance) / windowDays : 0;
      step.chanceTop = windowDays ? coverageOf(topDays, from, to, tolerance) / windowDays : 0;
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
