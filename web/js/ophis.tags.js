/* ==========================================================================
   ophis.tags.js — optional tags: read a finished run, never change it
   --------------------------------------------------------------------------
   Everything here takes the results Engine.run() has already produced and
   returns labels keyed by Z-Date. Nothing is written back onto the run: no
   score, hit count, rank or row moves when a tag is switched on. That is the
   whole contract, and it is why these live outside ophis.engine.js — the
   parity suite pins the engine, and a tag that could reach the score would
   have to be pinned there too.

   Source: the author's *Other MSRA Filters* and *Diurnal Projections*, as
   read in natori-on-psyfr docs/reverse/23 §2 and §4. None of these lists is
   in the shipped MSRF; each tag says so.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Tags = {};

  /** The author's Fibonacci set, F. It starts at 8, not 1. */
  Tags.FIBONACCI = [8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597];

  /* The shown Z-Dates, sorted by start, for finding the one a day lands in. */
  function survivors(results) {
    return ((results && results.z_keys_by_date) || []).map(function (key) {
      var z = results.z_structs[key];
      return { key: key, start: z.z_start.getTime(), end: z.z_end.getTime() };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /**
   * The shown Z-Date a day count from an anchor lands in, or null.
   *
   * Mirrors the engine's own projection: the Days-scope start time is added to
   * the anchor, and the day is the UTC day (Days) or the sunset-to-sunset
   * window (HH:MM) the instant falls in. So a Fibonacci projection and an
   * operation's projection that land on the same day share a Z-Date.
   */
  function landsOn(list, isoEvent, baseInstant, days) {
    var addTo = baseInstant.getTime();
    var dayStart = Number(isoEvent.day_scope_start_time_in_millis) || 0;
    var isHHMM = isoEvent.scope === C.EVENT_SCOPE__HH_MM;
    if (!isHHMM && dayStart > 0) addTo += dayStart;
    var instant = addTo + days * C.MILLIS_PER_DAY;
    if (!isHHMM) instant = T.floorToUtcMidnight(new Date(instant)).getTime();

    // The last Z-Date starting at or before the instant.
    var lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid].start <= instant) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (found < 0) return null;
    var z = list[found];
    // With no sunset to bound it (the engine's polar fallback), a window is the UTC day.
    if (isHHMM) return instant < (z.end > z.start ? z.end : z.start + C.MILLIS_PER_DAY) ? z.key : null;
    return z.start === instant ? z.key : null;
  }

  /**
   * The Fibonacci Sequence Filter, Operations 1 and 2.
   *
   *   Op 1: if Y (X1→X2) is in F, project every member of F forward from X2.
   *   Op 2: project every member of F forward from X1 and from X2.
   *
   * A projection that lands on a SHOWN Z-Date tags it. Op 2 from X2 covers
   * the same days as Op 1 whenever Op 1 fires; both are reported, because the
   * author names them as separate operations and the tooltip says which fired.
   *
   * @returns {Object.<string, {op: number, x1: number, x2: number, from: string, n: number, y: number}[]>}
   *          keyed by Z-Date key; ordinals are 0-based, as in y_structs
   */
  Tags.fibonacci = function (results, isoEvent) {
    var out = {};
    var list = survivors(results);
    if (!list.length) return out;

    var seen = {};
    function hit(yStruct, op, from, n) {
      var key = landsOn(list, isoEvent, from === "X1" ? yStruct.x_1_instant : yStruct.x_2_instant, n);
      if (key === null) return;
      var id = key + "|" + op + "|" + yStruct.x_1_ordinal + "|" + yStruct.x_2_ordinal + "|" + from + "|" + n;
      if (seen[id]) return;
      seen[id] = true;
      (out[key] = out[key] || []).push({
        op: op, x1: yStruct.x_1_ordinal, x2: yStruct.x_2_ordinal, from: from, n: n, y: yStruct.rotation_count_y
      });
    }

    (results.y_structs || []).forEach(function (yStruct) {
      if (Tags.FIBONACCI.indexOf(yStruct.rotation_count_y) >= 0) {
        Tags.FIBONACCI.forEach(function (n) { hit(yStruct, 1, "X2", n); });
      }
      Tags.FIBONACCI.forEach(function (n) {
        hit(yStruct, 2, "X1", n);
        hit(yStruct, 2, "X2", n);
      });
    });
    return out;
  };

  /**
   * One Fibonacci hit, in words, for a tooltip whose row is already labelled
   * with the op. The anchor is named by its own X-label, not "X2": in pair
   * X1→X5 the pair's second anchor is X5, and "X2 + 34" would point at the
   * wrong date.
   */
  Tags.describeFibonacci = function (t) {
    var pair = "X" + (t.x1 + 1) + "→X" + (t.x2 + 1);
    var anchor = "X" + ((t.from === "X1" ? t.x1 : t.x2) + 1);
    return t.op === 1
      ? "Y(" + pair + ") = " + t.y + ", in F · " + anchor + " + " + t.n + " days"
      : pair + " · " + anchor + " + " + t.n + " days";
  };

  /* ------------------------------------------- Geodetic (138) and Diurnal */

  /**
   * How close a rotation count must be to a list value to be tagged, in days.
   *
   * One tenth of a day: rotation_count_z is itself rounded to one decimal, and
   * the author writes these lists to one decimal too (2016.1 for 2016.18). So
   * a count within one display step of the exact value is the same number as
   * far as either side can tell. The 1e-9 is there so 138.1 against 138 is
   * decided by this rule and not by IEEE-754 — unlike the MSRF's vortex check,
   * which is pinned to raw floating point and must stay that way.
   */
  Tags.TOLERANCE_DAYS = 0.1;
  var SLACK = 1e-9;

  /**
   * The largest value any list runs to: (365.25 ÷ 3.14) × 22 = 2559.08, the
   * last entry of the author's own ÷ 3.14 series and the shipped 2559-day
   * window. Every × series below is generated up to this and no further, which
   * reproduces the author's ranges without typing them: 138 × 18 = 2484,
   * 365.25 × 1.38 × 5 = 2520.2, 365.25 × 7 = 2556.75.
   */
  Tags.LIST_CEILING = (365.25 / 3.14) * 22;

  /** Truncate to one decimal, as the author's lists are written (2016.18 → 2016.1). */
  Tags.shownValue = function (v) { return Math.trunc(v * 10 + SLACK) / 10; };

  function entry(id, label, k, value) {
    return { series: id, label: label, k: k, value: value, shown: Tags.shownValue(value) };
  }

  /* Every k × base up to the ceiling. */
  function series(id, label, base) {
    var out = [];
    for (var k = 1; k * base <= Tags.LIST_CEILING + SLACK; k++) out.push(entry(id, label, k, k * base));
    return out;
  }

  /**
   * 365.25 ÷ (1.38 × k), the author's descending Geodetic values. The author
   * lists six, k = 1 to 6, and writes them ≈264, 132, 88, 66, 53, 44; they are
   * generated here, and the author's figures kept beside them for the tooltip.
   */
  Tags.GEODETIC_DIVIDED_AS_WRITTEN = [264, 132, 88, 66, 53, 44];
  function dividedSeries() {
    return Tags.GEODETIC_DIVIDED_AS_WRITTEN.map(function (written, i) {
      var e = entry("÷1.38", "365.25 ÷ (1.38 × k)", i + 1, 365.25 / (1.38 * (i + 1)));
      e.written = written;
      return e;
    });
  }

  /** Geodetic Chronometry (138): multiples of 138, 365.25 × 1.38k, and 365.25 ÷ 1.38k. */
  Tags.GEODETIC = [].concat(
    series("138", "138 × k", 138),
    series("×1.38", "365.25 × 1.38 × k", 365.25 * 1.38),
    dividedSeries()
  );

  /** The Diurnal (Annular Chronometric) series. */
  Tags.DIURNAL = [].concat(
    series("year", "365.25 × k", 365.25),
    series("×phi", "365.25 × 1.618 × k", 365.25 * 1.618),
    series("÷phi", "365.25 ÷ 1.618 × k", 365.25 / 1.618),
    series("×pi", "365.25 × 3.14 × k", 365.25 * 3.14),
    series("÷pi", "365.25 ÷ 3.14 × k", 365.25 / 3.14)
  );

  /**
   * Tag every shown Z-Date one of whose contributors' rotation counts — the
   * days from that operation's anchor to the Z-Date, the very number the MSRF
   * probes — is within TOLERANCE_DAYS of a list value.
   *
   * @returns {Object.<string, {entry: object, rc: number, ordinal: number, x1: number, x2: number}[]>}
   */
  Tags.listTags = function (results, list) {
    var out = {};
    ((results && results.z_keys_by_date) || []).forEach(function (key) {
      var hits = [];
      results.z_structs[key].operation_match_structs.forEach(function (match) {
        var r = match.operation_result;
        list.forEach(function (e) {
          if (Math.abs(r.rotation_count_z - e.value) <= Tags.TOLERANCE_DAYS + SLACK) {
            hits.push({ entry: e, rc: r.rotation_count_z, ordinal: r.operation_ordinal, x1: match.y_struct.x_1_ordinal, x2: match.y_struct.x_2_ordinal });
          }
        });
      });
      if (hits.length) out[key] = hits;
    });
    return out;
  };

  /** One list hit, in words, for a tooltip. */
  Tags.describeListHit = function (h) {
    var exact = Math.round(h.entry.value * 100) / 100;
    return h.entry.label.replace("k", "" + h.entry.k) + " = " + exact +
      (h.entry.written !== undefined ? " (the author writes ≈" + h.entry.written + ")" : "") + " · " +
      "O" + (h.ordinal + 1) + "(X" + (h.x1 + 1) + "→X" + (h.x2 + 1) + ") counts " + h.rc;
  };

  /**
   * Every tag that is switched on, for one run, or null when all are off.
   * `options` is Store.globalOptions (tag_fibonacci, tag_geodetic, tag_diurnal).
   */
  Tags.forRun = function (results, isoEvent, options) {
    if (!options.tag_fibonacci && !options.tag_geodetic && !options.tag_diurnal) return null;
    return {
      fibonacci: options.tag_fibonacci ? Tags.fibonacci(results, isoEvent) : {},
      geodetic: options.tag_geodetic ? Tags.listTags(results, Tags.GEODETIC) : {},
      diurnal: options.tag_diurnal ? Tags.listTags(results, Tags.DIURNAL) : {}
    };
  };

  root.Ophis.Tags = Tags;
})(typeof window !== "undefined" ? window : globalThis);
