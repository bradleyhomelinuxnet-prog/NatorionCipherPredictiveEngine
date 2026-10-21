/* ==========================================================================
   ophis.sop.js — Protocol Prime and the author's operating procedure
   --------------------------------------------------------------------------
   The author's *Ophis Definitions & SOP* and *Protocol Prime* set operating
   limits the original program never checked (natori-on-psyfr,
   docs/reverse/23 §1, §3). Everything here is advice, never a guard: the
   engine still casts exactly what it always cast, and nothing in this file
   can stop a run or change a result.

     · Objective / Subjective. Objective: dates not personally tied to the
       operator, such as a market or a team. Subjective: the operator's or a
       client's own dates, which must END with the day the projection is run,
       as the last X-Date.
     · Warnings: anchors under 6 days apart; X-Dates more than 3 years before
       the projection date; subjective, but today missing or not last.
     · 7-day windows: a way of reading the same Z-Dates as periods.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var S = {};

  /* The two kinds of projection. The field is NOT in File.newEvent's
     defaults: an absent field reads as objective, so every file written
     before this existed, and every objective event written after, stays
     byte-identical. The writer adds it only for a subjective event. */
  S.OBJECTIVE = "objective";
  S.SUBJECTIVE = "subjective";

  /** X1 and X2 should be at least this many days apart (the engine needs only 1). */
  S.MIN_DAYS_BETWEEN = 6;
  /** Best on X-Dates within this many years of the day the projection is run. */
  S.MAX_AGE_YEARS = 3;
  /** Older dates need at least this many X-Dates. */
  S.MIN_X_DATES_WHEN_OLD = 5;
  /** Results from older dates are read as windows of about this many days. */
  S.WINDOW_DAYS = 7;

  var YEAR_MS = 365.25 * C.MILLIS_PER_DAY;

  S.isSubjective = function (event) { return !!event && event.projection_kind === S.SUBJECTIVE; };

  /* A date's calendar day as one comparable number, yyyymmdd, or null. */
  function dayNumber(text) {
    var parsed = T.parseCalendarDate(text, []);
    return parsed ? parsed.year * 10000 + parsed.month * 100 + parsed.day : null;
  }

  /* "Today" as the event's own calendar reads it: the UTC day in Days scope,
     the local day at the event's location in HH:MM scope. `now` is the
     app's Current time, so the override carries through. */
  S.todayText = function (event, now) {
    return event.scope === C.EVENT_SCOPE__HH_MM
      ? T.formatDateOnly(now, event.lat, event.long)
      : T.formatUtcDateOnly(now);
  };

  /**
   * Protocol Prime: add the day the projection is run as an X-Date.
   *
   * Refuses a duplicate of an enabled X-Date. Goes in at its place in date
   * order, never simply appended, which is the LAST place whenever every
   * historical date is in the past, as the author intends.
   *
   * @returns {{added: boolean, index: number}} where today is in the list
   */
  S.addToday = function (event, now) {
    var text = S.todayText(event, now);
    var today = dayNumber(text);
    var list = event.x_dates;
    for (var i = 0; i < list.length; i++) {
      if (list[i].enabled !== false && dayNumber(list[i].date) === today) return { added: false, index: i };
    }
    var at = list.length;
    for (var k = 0; k < list.length; k++) {
      var day = dayNumber(list[k].date);
      if (day !== null && day > today) { at = k; break; }
    }
    list.splice(at, 0, T.newXDate(text, C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE));
    return { added: true, index: at };
  };

  /**
   * Non-blocking warnings for an event, in the order a reader should meet them.
   *
   * @param {object} event  an Iso-Event
   * @param {Date} now      the app's Current time
   * @returns {{id: string, text: string}[]}
   */
  S.warnings = function (event, now) {
    var out = [];
    var enabled = [];
    (event.x_dates || []).forEach(function (x, i) {
      if (x.enabled !== true) return;
      var instant = T.xDateToInstant(event.scope, x, event.lat, event.long, []);
      if (instant) enabled.push({ x: x, i: i, t: instant });
    });

    // 1 — spacing. Adjacent enabled anchors are the closest pairs; every pair
    // is an X1→X2 to the engine, so a short gap anywhere is a short Y somewhere.
    for (var n = 1; n < enabled.length; n++) {
      var a = enabled[n - 1], b = enabled[n];
      var y = T.axialRotationsBetween(event.scope, a.t, b.t, event.lat, event.long);
      if (y > 0 && y < S.MIN_DAYS_BETWEEN) {
        out.push({
          id: "spacing",
          text: "X" + (a.i + 1) + " and X" + (b.i + 1) + " are " + y + " day" + (y === 1 ? "" : "s") + " apart. The SOP asks for at " +
            "least " + S.MIN_DAYS_BETWEEN + ": 6 days apart gives a window of about 39–42 days after the " +
            "later date, 15 days about 3 months."
        });
      }
    }

    // 2 — age. Measured from the day the projection is run, not from the
    // clock, so the Current time override moves it too.
    var old = enabled.filter(function (e) { return now.getTime() - e.t.getTime() > S.MAX_AGE_YEARS * YEAR_MS; });
    if (old.length) {
      var oldest = old.reduce(function (p, q) { return q.t < p.t ? q : p; });
      var few = enabled.length < S.MIN_X_DATES_WHEN_OLD;
      out.push({
        id: "age",
        text: old.length + " X-Date" + (old.length === 1 ? " is" : "s are") + " more than " + S.MAX_AGE_YEARS + " years " +
          "old (oldest: X" + (oldest.i + 1) + ", " + oldest.x.date + "). The SOP says the method is best within " +
          S.MAX_AGE_YEARS + " years; older dates need " + S.MIN_X_DATES_WHEN_OLD + " or more X-Dates" +
          (few ? " (this event has " + enabled.length + ")" : "") +
          ", the MSRF does not apply to them, and results should be read as windows of about a week, " +
          "not exact days."
      });
    }

    // 3 — Protocol Prime. A subjective projection must END with the day it is run.
    if (S.isSubjective(event)) {
      var todayText = S.todayText(event, now);
      var today = dayNumber(todayText);
      var last = enabled.length ? enabled[enabled.length - 1] : null;
      if (!last || dayNumber(last.x.date) !== today) {
        var has = enabled.some(function (e) { return dayNumber(e.x.date) === today; });
        out.push({
          id: "protocol-prime",
          text: has
            ? "Subjective: today (" + todayText + ") is an X-Date but not the last one. Protocol Prime " +
              "wants the day the projection is run as the LAST X-Date, so later dates are outside it."
            : "Subjective: today (" + todayText + ") is not an X-Date. Protocol Prime wants the day the " +
              "projection is run as the last X-Date; ☉ Today adds it."
        });
      }
    }

    return out;
  };

  /**
   * Group Z-Dates into windows of WINDOW_DAYS, for reading results as periods.
   *
   * Chronological; a window opens at its first Z-Date and takes every later
   * one that starts less than `days` days after it, so no window is wider
   * than a week. A reading aid only: nothing is re-scored or re-ranked, and
   * each window reports its members' own numbers.
   *
   * @param {object[]} zStructs  Z-Dates from a finished run (any order)
   * @returns {{start: Date, end: Date, members: object[], hits: number, best: number}[]}
   */
  S.groupIntoWindows = function (zStructs, days) {
    var span = (days || S.WINDOW_DAYS) * C.MILLIS_PER_DAY;
    var sorted = zStructs.slice().sort(function (a, b) { return a.z_start.getTime() - b.z_start.getTime(); });
    var out = [];
    sorted.forEach(function (z) {
      var current = out[out.length - 1];
      if (current && z.z_start.getTime() - current.start.getTime() < span) {
        current.members.push(z);
        current.end = z.z_start;
        current.hits += z.hit_count;
        current.best = Math.max(current.best, z.score);
      } else {
        out.push({ start: z.z_start, end: z.z_start, members: [z], hits: z.hit_count, best: z.score });
      }
    });
    return out;
  };

  root.Ophis.Sop = S;
})(typeof window !== "undefined" ? window : globalThis);
