/* ==========================================================================
   ophis.time.js — dates, rounding, day counting, sunset
   --------------------------------------------------------------------------
   Ported from src/ophis_utils.js, src/ophis_view__strings.js and
   src/ophis_dependencies.js.

   Two scopes, two different notions of "a day":

   DAYS   — a day is a UTC calendar day. X-Dates and Z-Dates are pinned to UTC
            midnight (the desktop app does this via FEATURE_FLAG__LOCK_DAY_
            SCOPE_TO_GMT, which forces lat/long to 0,0 for all day-scope maths).
            Y is simply (x2 - x1) / 86400000, rounded to one decimal.

   HH:MM  — a day runs sunset-to-sunset at the event's latitude/longitude, the
            way the underlying chronology treats a day. X-Dates carry a wall
            clock time interpreted in the timezone of that location, and Y is
            counted between the sunsets preceding each X-Date.

   Sunset uses the Astronomy Engine (CosineKitty), the desktop app's
   first-choice library. Its two fallbacks (Meeus, SunCalc) are not reproduced;
   if the library is absent, HH:MM scope reports that plainly rather than
   quietly computing something else.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = {};

  /* ---------------------------------------------------------- rounding --- */
  /* Port of roundNumberToPrecision(). The epsilon nudge matters: it is what
     makes 2.675 round to 2.68 instead of 2.67, and the desktop app's numbers
     depend on it. */
  T.roundToPrecision = function (value, precision) {
    var factor = Math.pow(10, precision);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };
  T.roundTime = function (v) { return T.roundToPrecision(v, C.DECIMAL_PRECISION__TIME); };          // 2dp
  T.roundRotation = function (v) { return T.roundToPrecision(v, C.DECIMAL_PRECISION__AXIAL_ROTATIONS); }; // 1dp
  T.roundLocation = function (v) { return T.roundToPrecision(v, C.DECIMAL_PRECISION__LOCATION); };  // 1dp

  /* ------------------------------------------------------ UTC builder --- */
  /* Date.UTC() reads years 0–99 as 1900–1999, so 02/14/0033 would become
     1933. Build on a four-digit year, then set the real one. */
  T.utcMillis = function (year, monthIndex, day, hours, minutes, seconds, millis) {
    var date = new Date(Date.UTC(2000, 0, 1, hours || 0, minutes || 0, seconds || 0, millis || 0));
    date.setUTCFullYear(year, monthIndex, day);
    return date.getTime();
  };
  T.roundScore = function (v) { return T.roundToPrecision(v, C.DECIMAL_PRECISION__SCORE); };        // 2dp

  T.pad2 = function (n) { return n < 10 ? "0" + n : "" + n; };

  /* --------------------------------------------------------- validation --- */
  T.isNonNegIntOrStringThereof = function (value) {
    if (value === 0 || value === "0") return true;
    if (!value) return false;
    var s = ("" + value).trim();
    if (!s) return false;
    while (s.length > 1 && s.charAt(0) === "0") s = s.substring(1);
    if (!s) return true;
    var n = Math.floor(Number(s));
    return n !== Infinity && String(n) === s && n >= 0;
  };

  /** "mm/dd/yyyy" -> {year, month, day} or null (errors pushed to errorsOut). */
  T.parseCalendarDate = function (text, errorsOut) {
    errorsOut = errorsOut || [];
    if (text === null || text === undefined) {
      errorsOut.push("Missing date.");
      return null;
    }
    var parts = ("" + text).trim().split(C.DATE_DELIMITER);
    if (parts.length !== 3) {
      errorsOut.push("'" + text + "' must be of the form " + C.X_DATE_DISPLAY_FORMAT + ".");
      return null;
    }
    for (var i = 0; i < 3; i++) {
      if (!T.isNonNegIntOrStringThereof(parts[i])) {
        errorsOut.push("'" + text + "' must be whole numbers; could not read '" + parts[i] + "'.");
        return null;
      }
      var n = parseInt(parts[i], 10);
      var ok = (i === 2) ? n >= 0 : n > 0;
      if (!ok) {
        errorsOut.push("'" + text + "' must be positive whole numbers; could not read '" + parts[i] + "'.");
        return null;
      }
    }
    if (parseInt(parts[2], 10) > C.MAX_CALENDAR_YEAR) parts[2] = "" + C.MAX_CALENDAR_YEAR;

    if (parts[2].length > 4 || parts[0].length > 2 || parts[1].length > 2) {
      errorsOut.push("'" + text + "' needs a 4-digit year and 1-2 digit month and day.");
      return null;
    }
    var month = parseInt(parts[0], 10);
    var day = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);

    if (month > 12) {
      errorsOut.push("'" + text + "' has month " + month + ".");
      return null;
    }
    if (day > T.daysInMonth(year, month)) {
      errorsOut.push("'" + text + "' has day " + day + ", but " + month + "/" + year + " has " + T.daysInMonth(year, month) + ".");
      return null;
    }
    return { year: year, month: month, day: day };
  };

  T.daysInMonth = function (year, month) {
    return new Date(T.utcMillis(year, month, 0)).getUTCDate();
  };

  /** "HH:MM" -> {hours, minutes} or null. */
  T.parseClockTime = function (text, errorsOut) {
    errorsOut = errorsOut || [];
    var parts = ("" + (text === null || text === undefined ? "" : text)).trim().split(":");
    if (parts.length !== 2) {
      errorsOut.push("'" + text + "' must be of the form " + C.X_DATE_TIME_DISPLAY_FORMAT + ", e.g. 18:30.");
      return null;
    }
    if (!T.isNonNegIntOrStringThereof(parts[0]) || !T.isNonNegIntOrStringThereof(parts[1])) {
      errorsOut.push("'" + text + "' has non-numeric hours or minutes.");
      return null;
    }
    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      errorsOut.push("'" + text + "' is out of range.");
      return null;
    }
    return { hours: hours, minutes: minutes };
  };

  T.isValidLatOrLong = function (value, which) {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) return false;
    var limit = (which === "lat") ? C.LAT_LIMIT : C.LONG_LIMIT;
    return value >= -limit && value <= limit;
  };
  T.isValidLatAndLong = function (lat, long) {
    return T.isValidLatOrLong(lat, "lat") && T.isValidLatOrLong(long, "long");
  };

  /* ---------------------------------------------------------- timezone --- */
  /* Timezone of a lat/long, via the vendored tz_lookup table when present.
     0,0 is deliberately treated as UTC: that is the pair the desktop app
     substitutes whenever it locks day-scope to GMT. */
  T.timezoneAt = function (lat, long) {
    if (lat === 0 && long === 0) return "UTC";
    if (typeof root.tzlookup === "function") {
      try { return root.tzlookup(lat, long); } catch (e) { /* fall through */ }
    }
    return null;
  };

  T.browserTimezone = function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch (e) { return "UTC"; }
  };

  /* Offset (ms) of a timezone at a given instant. Intl writes the year 0
     (1 BC) as "1" with the era "BC", so the era is read as well: without it
     the year 0000 came out as 6 BC. */
  function zoneOffsetMillis(utcMillis, timeZone) {
    var dtf = zoneOffsetMillis._cache[timeZone];
    if (!dtf) {
      dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone, hour12: false, era: "short",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      zoneOffsetMillis._cache[timeZone] = dtf;
    }
    var p = {};
    dtf.formatToParts(new Date(utcMillis)).forEach(function (part) { p[part.type] = part.value; });
    var year = parseInt(p.year, 10);
    if (/^B/.test(p.era || "")) year = 1 - year;   // 1 BC is the year 0, 2 BC the year -1
    var asUtc = T.utcMillis(
      year, parseInt(p.month, 10) - 1, parseInt(p.day, 10),
      parseInt(p.hour, 10) % 24, parseInt(p.minute, 10), parseInt(p.second, 10)
    );
    return asUtc - utcMillis;
  }
  zoneOffsetMillis._cache = {};
  T.zoneOffsetMillis = zoneOffsetMillis;

  /** Wall-clock time in `timeZone` -> UTC millis. Two-pass, DST-safe. */
  T.wallTimeToUtcMillis = function (year, month, day, hours, minutes, timeZone) {
    var naive = T.utcMillis(year, month - 1, day, hours, minutes, 0, 0);
    if (!timeZone || timeZone === "UTC") return naive;
    var guess = naive - zoneOffsetMillis(naive, timeZone);
    return naive - zoneOffsetMillis(guess, timeZone);
  };

  /** UTC instant -> wall-clock parts in `timeZone`. */
  T.utcMillisToWallTime = function (utcMillis, timeZone) {
    if (!timeZone || timeZone === "UTC") {
      var d = new Date(utcMillis);
      return {
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
        hours: d.getUTCHours(), minutes: d.getUTCMinutes()
      };
    }
    var shifted = new Date(utcMillis + zoneOffsetMillis(utcMillis, timeZone));
    return {
      year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
      hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes()
    };
  };

  /* ------------------------------------------------------- X-Date <-> JS --- */
  T.newXDate = function (date, time) {
    return { date: date, time: time || C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE, enabled: true };
  };

  /**
   * X-Date object -> a JS Date (an absolute instant, UTC inside).
   * Port of xDateToNativeDate().
   *   DAYS  : UTC midnight of the calendar date.
   *   HH:MM : the wall clock time read in the timezone at lat/long; if the
   *           location is not set, read in the browser's own timezone — the
   *           same fallback the desktop app uses.
   */
  T.xDateToInstant = function (scope, xDate, lat, long, errorsOut) {
    errorsOut = errorsOut || [];
    if (!xDate) { errorsOut.push("Missing date."); return null; }

    var timeText = (scope === C.EVENT_SCOPE__HH_MM)
      ? xDate.time
      : C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE;

    var cal = T.parseCalendarDate(xDate.date, errorsOut);
    var clock = T.parseClockTime(timeText, errorsOut);
    if (!cal || !clock) return null;

    var timeZone;
    if (scope === C.EVENT_SCOPE__HH_MM) {
      timeZone = T.isValidLatAndLong(lat, long) ? T.timezoneAt(lat, long) : T.browserTimezone();
    } else {
      timeZone = "UTC";               // FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT
    }

    var millis = T.wallTimeToUtcMillis(cal.year, cal.month, cal.day, clock.hours, clock.minutes, timeZone);
    var instant = new Date(millis);
    if (isNaN(instant.getTime())) {
      errorsOut.push("Could not read the date " + JSON.stringify(xDate) + ".");
      return null;
    }
    return instant;
  };

  /** JS Date -> X-Date object, rendered in the timezone at lat/long. */
  T.instantToXDate = function (instant, lat, long) {
    var timeZone = T.isValidLatAndLong(lat, long) ? T.timezoneAt(lat, long) : T.browserTimezone();
    var w = T.utcMillisToWallTime(instant.getTime(), timeZone);
    return T.newXDate(T.formatDateParts(w), T.pad2(w.hours) + ":" + T.pad2(w.minutes));
  };

  T.formatDateParts = function (w) {
    // Years before 1000 keep four digits (0033), as the date format promises.
    var year = w.year < 1000 ? ("000" + w.year).slice(-4) : "" + w.year;
    return T.pad2(w.month) + C.DATE_DELIMITER + T.pad2(w.day) + C.DATE_DELIMITER + year;
  };

  /** "mm/dd/yyyy" for an instant, in the timezone at lat/long (UTC if unset). */
  T.formatDateOnly = function (instant, lat, long) {
    var timeZone = T.isValidLatAndLong(lat, long) ? T.timezoneAt(lat, long) : T.browserTimezone();
    return T.formatDateParts(T.utcMillisToWallTime(instant.getTime(), timeZone));
  };
  T.formatUtcDateOnly = function (instant) {
    return T.formatDateParts(T.utcMillisToWallTime(instant.getTime(), "UTC"));
  };
  T.formatTimeOnly = function (instant, lat, long) {
    var timeZone = T.isValidLatAndLong(lat, long) ? T.timezoneAt(lat, long) : T.browserTimezone();
    var w = T.utcMillisToWallTime(instant.getTime(), timeZone);
    return T.pad2(w.hours) + ":" + T.pad2(w.minutes);
  };
  T.formatDateAndTime = function (instant, lat, long) {
    return T.formatDateOnly(instant, lat, long) + " " + T.formatTimeOnly(instant, lat, long);
  };

  /** Weekday name, for the output table. */
  T.weekdayShort = function (instant, timeZone) {
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var w = T.utcMillisToWallTime(instant.getTime(), timeZone || "UTC");
    return names[new Date(T.utcMillis(w.year, w.month - 1, w.day)).getUTCDay()];
  };

  /** Floor an instant to UTC midnight — what a DAYS-scope Z-Date snaps to. */
  T.floorToUtcMidnight = function (instant) {
    var w = T.utcMillisToWallTime(instant.getTime(), "UTC");
    return new Date(T.utcMillis(w.year, w.month - 1, w.day, 0, 0, 0, 0));
  };

  T.roundToNearestMinute = function (instant) {
    var d = new Date(instant.getTime());
    if (d.getUTCSeconds() >= 30) d.setUTCMinutes(d.getUTCMinutes() + 1);
    d.setUTCSeconds(0, 0);
    return d;
  };

  /** "Now", optionally shifted by the operator's Current Time override. */
  T.currentInstant = function (offsetMillis) {
    return T.roundToNearestMinute(new Date(Date.now() + (offsetMillis || 0)));
  };

  /* ------------------------------------------------------------ sunset --- */
  T.sunsetAvailable = function () {
    return typeof root.Astronomy !== "undefined" &&
           typeof root.Astronomy.SearchRiseSet === "function";
  };

  var sunsetCache = Object.create(null);
  function cacheKey(millis, lat, long) { return millis + "|" + lat + "|" + long; }

  /** Next sunset at or after `instant` at lat/long, or null. */
  function nextSunsetAtOrAfter(instant, lat, long) {
    if (!T.sunsetAvailable()) return null;
    var key = "N" + cacheKey(instant.getTime(), lat, long);
    if (key in sunsetCache) return sunsetCache[key];
    var result = null;
    try {
      var observer = new root.Astronomy.Observer(lat, long, C.DEFAULT_HEIGHT_IN_METERS_FOR_SUN_CALC);
      var found = root.Astronomy.SearchRiseSet("Sun", observer, -1, instant, 300);
      result = found ? T.roundToNearestMinute(found.date) : null;
    } catch (e) { result = null; }
    sunsetCache[key] = result;
    return result;
  }

  /** The most recent sunset at or before `instant`. Port of getSunsetNativeUtcDateBefore(). */
  T.sunsetBefore = function (instant, lat, long) {
    if (!T.sunsetAvailable()) return null;
    var key = "B" + cacheKey(instant.getTime(), lat, long);
    if (key in sunsetCache) return sunsetCache[key];

    var target = instant.getTime();
    var result = null;
    // Walk back a day at a time until a sunset lands at or before the instant,
    // then walk forward to the latest such sunset.
    for (var back = 1; back <= 5 && result === null; back++) {
      var probe = new Date(target - back * 1.05 * C.MILLIS_PER_DAY);
      var s = nextSunsetAtOrAfter(probe, lat, long);
      if (!s) break;
      if (s.getTime() <= target) {
        result = s;
        for (var guard = 0; guard < 4; guard++) {
          var next = nextSunsetAtOrAfter(new Date(result.getTime() + C.MILLIS_PER_MINUTE), lat, long);
          if (next && next.getTime() <= target) result = next; else break;
        }
      }
    }
    sunsetCache[key] = result;
    return result;
  };

  /** The next sunset strictly after `instant`. Port of getSunsetNativeUtcDateAfter(). */
  T.sunsetAfter = function (instant, lat, long) {
    if (!T.sunsetAvailable()) return null;
    var key = "A" + cacheKey(instant.getTime(), lat, long);
    if (key in sunsetCache) return sunsetCache[key];
    var s = nextSunsetAtOrAfter(instant, lat, long);
    if (s && s.getTime() === instant.getTime()) {
      s = nextSunsetAtOrAfter(new Date(instant.getTime() + C.MILLIS_PER_MINUTE), lat, long);
    }
    sunsetCache[key] = s;
    return s;
  };

  T.clearSunsetCache = function () { sunsetCache = Object.create(null); };

  /* Rounding-noise guard: two sunsets computed within an hour of each other are
     treated as the same sunset. Port of findAlreadyCalculatedSunset(). */
  T.reuseNearbySunset = function (sunset, alreadyCalculated) {
    var millis = sunset.getTime();
    for (var i = 0; i < alreadyCalculated.length; i++) {
      var candidate = alreadyCalculated[i].getTime();
      if (Math.abs(candidate - millis) <= C.ALREADY_CALCULATED_SUNSET_TOLERANCE_IN_MILLIS) {
        return alreadyCalculated[i];
      }
    }
    alreadyCalculated.push(sunset);
    return sunset;
  };

  /* ----------------------------------------------------- axial rotations --- */
  /**
   * Whole days between two instants — the interval the engine calls Y (and,
   * reused, Z). Port of axialRotationsBetweenNativeDates().
   *
   * DAYS  : plain difference in days, to one decimal.
   * HH:MM : difference between the sunsets preceding each instant, with the
   *         desktop app's exact rounding: anything inside the first day counts
   *         as 1 (or -1 backwards), beyond that the remainder rounds at the
   *         half-day mark.
   */
  T.axialRotationsBetween = function (scope, olderInstant, newerInstant, lat, long) {
    if (scope !== C.EVENT_SCOPE__HH_MM) {
      return T.roundRotation((newerInstant.getTime() - olderInstant.getTime()) / C.MILLIS_PER_DAY);
    }

    var olderSunset = T.sunsetBefore(olderInstant, lat, long);
    var newerSunset = T.sunsetBefore(newerInstant, lat, long);
    if (!olderSunset || !newerSunset) {
      // No sunset data: fall back to the plain difference rather than inventing one.
      return T.roundRotation((newerInstant.getTime() - olderInstant.getTime()) / C.MILLIS_PER_DAY);
    }

    var diff = newerSunset.getTime() - olderSunset.getTime();
    if (diff === 0) return 0;

    if (diff < 0) {
      if (diff >= -C.MILLIS_PER_DAY) return -1;
      var remNeg = diff % C.MILLIS_PER_DAY;
      var roundDown = remNeg < (-C.MILLIS_PER_DAY / 2);
      var daysNeg = (diff - remNeg) / C.MILLIS_PER_DAY;
      if (roundDown) daysNeg -= 1;
      return T.roundRotation(daysNeg);
    }

    if (diff <= C.MILLIS_PER_DAY) return 1;
    var rem = diff % C.MILLIS_PER_DAY;
    var roundUp = rem > (C.MILLIS_PER_DAY / 2);
    var days = (diff - rem) / C.MILLIS_PER_DAY;
    if (roundUp) days += 1;
    return T.roundRotation(days);
  };

  /* ------------------------------------------------------------- moon ---- */
  /* Lunar phase by age in days since a known new moon. Same thresholds the
     desktop app uses (getLunarPhase() in ophis_view__chart_datasets.js). */
  var LUNAR_EPOCH_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);  // new moon 2000-01-06 18:14 UT

  T.lunarAgeDays = function (instant) {
    var days = (instant.getTime() - LUNAR_EPOCH_UTC) / C.MILLIS_PER_DAY;
    var age = days % C.SYNODIC_MONTH;
    if (age < 0) age += C.SYNODIC_MONTH;
    return age;
  };

  T.lunarPhase = function (instant) {
    var age = T.lunarAgeDays(instant);
    if (age < 1.84566173161) return "NEW";
    if (age < 5.53698519483) return "WAXING_CRESCENT";
    if (age < 9.22830865805) return "FIRST_QUARTER";
    if (age < 12.91963212127) return "WAXING_GIBBOUS";
    if (age < 16.61095558449) return "FULL";
    if (age < 20.30227904771) return "WANING_GIBBOUS";
    if (age < 23.99360251093) return "LAST_QUARTER";
    if (age < 27.68492597415) return "WANING_CRESCENT";
    return "NEW";
  };

  T.MOON_GLYPHS = {
    NEW: "●", WAXING_CRESCENT: "☽", FIRST_QUARTER: "◐",
    WAXING_GIBBOUS: "◕", FULL: "○", WANING_GIBBOUS: "◔",
    LAST_QUARTER: "◑", WANING_CRESCENT: "☾"
  };
  T.MOON_NAMES = {
    NEW: "New Moon", WAXING_CRESCENT: "Waxing Crescent", FIRST_QUARTER: "First Quarter",
    WAXING_GIBBOUS: "Waxing Gibbous", FULL: "Full Moon", WANING_GIBBOUS: "Waning Gibbous",
    LAST_QUARTER: "Third Quarter", WANING_CRESCENT: "Waning Crescent"
  };

  /* ---------------------------------------------------------- eclipses --- */
  /* The bundled NASA tables (lib/*_eclipses_processed.js) are optional; when
     they are not loaded the eclipse overlays simply report as unavailable. */
  T.eclipsesAvailable = function () {
    return Array.isArray(root.SOLAR_ECLIPSES_PROCESSED) && Array.isArray(root.LUNAR_ECLIPSES_PROCESSED);
  };

  function binarySearchEclipse(table, millis) {
    var start = 0, end = table.length - 1;
    while (start <= end) {
      var mid = Math.floor((start + end) / 2);
      var at = table[mid].date_millis;
      if (millis >= at - C.ECLIPSE_DATE_MATCH_TOLERANCE && millis <= at + C.ECLIPSE_DATE_MATCH_TOLERANCE) {
        return table[mid];
      }
      if (at < millis) start = mid + 1; else end = mid - 1;
    }
    return null;
  }

  /* NASA type letters -> the app's two buckets (see getNormalizedSolarEclipseType). */
  T.eclipseAt = function (instant) {
    if (!T.eclipsesAvailable()) return null;
    var millis = instant.getTime();

    var solar = binarySearchEclipse(root.SOLAR_ECLIPSES_PROCESSED, millis);
    if (solar) {
      var st = ("" + solar.eclipse_type).charAt(0);
      if (st === "P") return { kind: "SOLAR_PARTIAL", label: "Partial Solar Eclipse", glyph: "◒", millis: solar.date_millis };
      if (st === "A" || st === "T" || st === "H") return { kind: "SOLAR_FULL", label: "Full Solar Eclipse", glyph: "●", millis: solar.date_millis };
    }
    var lunar = binarySearchEclipse(root.LUNAR_ECLIPSES_PROCESSED, millis);
    if (lunar) {
      var lt = ("" + lunar.eclipse_type).charAt(0);
      if (lt === "P") return { kind: "LUNAR_PARTIAL", label: "Partial Lunar Eclipse", glyph: "◓", millis: lunar.date_millis };
      if (lt === "T") return { kind: "LUNAR_FULL", label: "Full Lunar Eclipse", glyph: "●", millis: lunar.date_millis };
    }
    return null;
  };

  root.Ophis.Time = T;
})(typeof window !== "undefined" ? window : globalThis);
