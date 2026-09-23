/* NATORION · engine/time.js
   Dates as the .oph file writes them ("MM/DD/YYYY", "HH:MM"), turned into
   instants and back.

   Days scope is pinned to UTC, as v12 pinned it (it looked up the time zone at
   0°,0°, which is Etc/GMT). HH:MM scope reads the wall-clock time in the zone
   that contains the event's latitude/longitude — tz-lookup for the zone,
   the browser's own Intl time-zone database for the offsets (v12 used
   moment-timezone for the same job). */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isDigits(s) { return /^\d+$/.test(s); }

  function daysInMonth(y, m) { return m === 2 ? (isLeap(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /* "MM/DD/YYYY" -> {y, m, d}. Same rules as validateXDateCalendarDate(),
     plus a real day-of-month check (v12 left that to moment, which then
     produced an invalid Date). Years above 9999 clamp to 9999, as before. */
  function parseDate(text, errors) {
    errors = errors || [];
    var parts = String(text == null ? "" : text).trim().split("/");
    if (parts.length !== 3) { errors.push("'" + text + "' must be MM/DD/YYYY."); return null; }
    for (var i = 0; i < 3; i++) {
      if (!isDigits(parts[i])) { errors.push("'" + text + "' must be made of whole numbers."); return null; }
    }
    var m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (y > C.MAX_YEAR) y = C.MAX_YEAR;
    if (parts[0].length > 2 || parts[1].length > 2 || String(y).length > 4) { errors.push("'" + text + "' must be MM/DD/YYYY."); return null; }
    if (y < 1) { errors.push("'" + text + "': the year must be 1 or later."); return null; }
    if (m < 1 || m > 12) { errors.push("'" + text + "': month must be 1–12."); return null; }
    var dim = daysInMonth(y, m);
    if (d < 1 || d > dim) { errors.push("'" + text + "': that month has " + dim + " days."); return null; }
    return { y: y, m: m, d: d };
  }

  function parseTime(text, errors) {
    errors = errors || [];
    var parts = String(text == null ? "" : text).trim().split(":");
    if (parts.length !== 2 || !isDigits(parts[0]) || !isDigits(parts[1])) { errors.push("'" + text + "' must be HH:MM (24-hour)."); return null; }
    var h = parseInt(parts[0], 10), mi = parseInt(parts[1], 10);
    if (h > 23 || mi > 59) { errors.push("'" + text + "' is out of range."); return null; }
    return { h: h, mi: mi };
  }

  function utcMs(y, m, d, h, mi) {
    var dt = new Date(Date.UTC(2000, 0, 1, h || 0, mi || 0));
    dt.setUTCFullYear(y, m - 1, d);
    return dt.getTime();
  }

  /* --------------------------------------------------------- time zones -- */
  var fmtCache = {};
  function formatter(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", era: "short" });
    }
    return fmtCache[tz];
  }
  function tzSupported(tz) { try { formatter(tz); return true; } catch (e) { return false; } }

  // Wall-clock fields of an instant in a zone.
  function wall(ms, tz) {
    if (!tz || tz === "UTC") {
      var d = new Date(ms);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
    }
    var p = {}; formatter(tz).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var y = parseInt(p.year, 10); if (/^B/.test(p.era || "")) y = 1 - y;
    return { y: y, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  }
  function offsetMs(ms, tz) {
    var w = wall(ms, tz);
    var asUtc = utcMs(w.y, w.m, w.d, w.h, w.mi) + w.s * 1000;
    return asUtc - Math.floor(ms / 1000) * 1000;
  }
  // Wall-clock time in a zone -> instant. A time inside a spring-forward gap
  // moves forward, as moment-timezone does.
  function zonedToUtc(y, m, d, h, mi, tz) {
    var guess = utcMs(y, m, d, h, mi);
    if (!tz || tz === "UTC") return guess;
    var o1 = offsetMs(guess, tz), t = guess - o1, o2 = offsetMs(t, tz);
    if (o2 !== o1) { var t2 = guess - o2; t = offsetMs(t2, tz) === o2 ? t2 : Math.max(t, t2); }
    return t;
  }

  function zoneFor(lat, lon) {
    var tz = "UTC";
    try { if (typeof root.tzlookup === "function") tz = root.tzlookup(lat, lon); } catch (e) { tz = "UTC"; }
    if (tz === "Etc/GMT" || tz === "Etc/UTC") tz = "UTC";
    return tzSupported(tz) ? tz : "UTC";
  }

  function validLatLong(lat, lon) {
    return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= C.LAT_LIMIT &&
           typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= C.LONG_LIMIT;
  }

  /* The zone an event's dates are read in. */
  function eventZone(event) {
    if (event.scope === C.SCOPE.HH_MM && validLatLong(event.lat, event.long)) return zoneFor(event.lat, event.long);
    return "UTC";
  }

  /* An X-/T-Date object -> instant (ms), or null with an error pushed. */
  function inputDateToMs(event, xd, errors) {
    errors = errors || [];
    if (!xd || typeof xd !== "object") { errors.push("Missing date."); return null; }
    var date = parseDate(xd.date, errors);
    if (!date) return null;
    if (event.scope === C.SCOPE.HH_MM) {
      var tm = parseTime(xd.time == null || xd.time === "" ? "00:00" : xd.time, errors);
      if (!tm) return null;
      return zonedToUtc(date.y, date.m, date.d, tm.h, tm.mi, eventZone(event));
    }
    return utcMs(date.y, date.m, date.d, 0, 0);
  }

  function msToDateString(ms, tz) { var w = wall(ms, tz); return pad(w.m) + "/" + pad(w.d) + "/" + w.y; }
  function msToTimeString(ms, tz) { var w = wall(ms, tz); return pad(w.h) + ":" + pad(w.mi); }
  function msToInputDate(ms, tz) { return { date: msToDateString(ms, tz), time: msToTimeString(ms, tz), enabled: true }; }

  // ISO "YYYY-MM-DD" helpers for <input type=date>.
  function toIsoDate(text) { var p = parseDate(text); return p ? (String(p.y).padStart(4, "0") + "-" + pad(p.m) + "-" + pad(p.d)) : ""; }
  function fromIsoDate(iso) { var m = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? m[2] + "/" + m[3] + "/" + parseInt(m[1], 10) : ""; }

  /* Round an instant to the nearest minute, as roundDateToNearestMinute(). */
  function roundMinute(ms) {
    var d = new Date(ms), s = d.getUTCSeconds();
    var base = ms - (s * 1000 + d.getUTCMilliseconds());
    return s >= 30 ? base + C.MS_MIN : base;
  }

  function weekday(ms, tz) { var w = wall(ms, tz); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(utcMs(w.y, w.m, w.d)).getUTCDay()]; }

  NC.time = {
    pad: pad, isLeap: isLeap, daysInMonth: daysInMonth,
    parseDate: parseDate, parseTime: parseTime, utcMs: utcMs,
    wall: wall, offsetMs: offsetMs, zonedToUtc: zonedToUtc, zoneFor: zoneFor, eventZone: eventZone,
    validLatLong: validLatLong, inputDateToMs: inputDateToMs,
    msToDateString: msToDateString, msToTimeString: msToTimeString, msToInputDate: msToInputDate,
    toIsoDate: toIsoDate, fromIsoDate: fromIsoDate, roundMinute: roundMinute, weekday: weekday
  };
})(typeof window !== "undefined" ? window : globalThis);
