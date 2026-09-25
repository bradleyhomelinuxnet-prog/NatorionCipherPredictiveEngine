/* NATORION · engine/sky.js
   Sunsets, moon phases and eclipses.

   Sunsets come from Astronomy Engine (Don Cross, MIT) — the same library v12
   made its first choice. The *sampling* around it is v12's own and is kept
   exactly, because Y in HH:MM scope counts sunsets, and a different sampling
   gives a different Y:
     15 probes, three a day, from 2.5 days after the instant backwards; each
     asks for "the next sunset"; the answers are rounded to the minute, de-
     duplicated, sorted, and any gap over 1.5 days gets a midpoint filled in.
   v12 fell back to Meeus, then SunCalc, when a sampling's sunset times drifted
   more than five minutes a day (it happens near the equinox above ~55°). Those
   libraries are less accurate, so this version always keeps Astronomy Engine. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time;
  var DAY = C.MS_DAY;

  function astro() { return root.Astronomy; }

  var nextCache = new Map();
  function nextSunset(ms, lat, lon) {
    var key = ms + "|" + lat + "|" + lon;
    if (nextCache.has(key)) return nextCache.get(key);
    var A = astro(), out = null;
    try {
      var r = A.SearchRiseSet(A.Body.Sun, new A.Observer(lat, lon, 2), -1, new Date(ms), 300);
      out = r ? T.roundMinute(r.date.getTime()) : null;
    } catch (e) { out = null; }
    if (nextCache.size > 200000) nextCache.clear();
    nextCache.set(key, out);
    return out;
  }

  function sampling(ms, lat, lon) {
    var set = new Set(), start = ms + 2.5 * DAY, slice = DAY / 3;
    for (var i = 0; i < 15; i++) {
      var s = nextSunset(start - slice * i, lat, lon);
      if (s !== null) set.add(s);
    }
    var arr = Array.from(set).sort(function (a, b) { return a - b; });
    for (var k = arr.length - 1; k >= 1; k--) {
      var delta = arr[k] - arr[k - 1];
      if (delta > DAY * 1.5) arr.splice(k, 0, arr[k - 1] + Math.round(delta / 2));
    }
    return arr;
  }

  // Latest sunset at or before the instant. `shared` lets a caller reuse one
  // sampling for the before/after pair, as v12 did.
  function sunsetBefore(ms, lat, lon, shared) {
    var r = T.roundMinute(ms);
    var samp = shared && shared.length ? shared : sampling(r, lat, lon);
    if (shared && !shared.length) Array.prototype.push.apply(shared, samp);
    for (var i = samp.length - 1; i >= 0; i--) if (r >= samp[i]) return samp[i];
    for (var j = 0; j < 600; j++) { var s = nextSunset(r - j * DAY / 2, lat, lon); if (s !== null && s <= r) return s; }
    return r;
  }
  function sunsetAfter(ms, lat, lon, shared) {
    var r = T.roundMinute(ms);
    var samp = shared && shared.length ? shared : sampling(r, lat, lon);
    if (shared && !shared.length) Array.prototype.push.apply(shared, samp);
    for (var i = 0; i < samp.length; i++) if (r <= samp[i]) return samp[i];
    for (var j = 0; j < 600; j++) { var s = nextSunset(r + j * DAY / 2, lat, lon); if (s !== null && s > r) return s; }
    return r;
  }

  /* -------------------------------------------------------------- moon -- */
  // Eight phases by ecliptic elongation. The quarter names follow v12.
  var PHASES = [
    { key: "new", lon: 0, name: "New moon", field: "chart_option__show_new_moons", glyph: "\u{1F311}" },
    { key: "waxing_crescent", lon: 45, name: "Waxing crescent", field: "chart_option__show_waxing_crescent_moons", glyph: "\u{1F312}" },
    { key: "first_quarter", lon: 90, name: "First quarter", field: "chart_option__show_first_quarter_moons", glyph: "\u{1F313}" },
    { key: "waxing_gibbous", lon: 135, name: "Waxing gibbous", field: "chart_option__show_waxing_gibbous_moons", glyph: "\u{1F314}" },
    { key: "full", lon: 180, name: "Full moon", field: "chart_option__show_full_moons", glyph: "\u{1F315}" },
    { key: "waning_gibbous", lon: 225, name: "Waning gibbous", field: "chart_option__show_waning_gibbous_moons", glyph: "\u{1F316}" },
    { key: "third_quarter", lon: 270, name: "Third quarter", field: "chart_option__show_third_quarter_moons", glyph: "\u{1F317}" },
    { key: "waning_crescent", lon: 315, name: "Waning crescent", field: "chart_option__show_waning_crescent_moons", glyph: "\u{1F318}" }
  ];

  /* Phase instants within about a day of each date. A date stands for its
     whole day, so the window is centred on its noon: ±1.5 days from noon is
     "the day before, the day, or the day after". v12 used a mean-lunation
     approximation sampled once a day; these are the true instants.
     The cost follows the number of dates, not the span between them. */
  function moonPhasesNear(datesMs, wanted) {
    var A = astro(), found = [];
    if (!A) return [];
    datesMs.forEach(function (d) {
      var mid = d + DAY / 2;
      wanted.forEach(function (ph) {
        try {
          var t = A.SearchMoonPhase(ph.lon, new Date(mid - 1.5 * DAY), 3);
          if (t) {
            var ms = t.date.getTime();
            if (Math.abs(ms - mid) <= 1.5 * DAY) found.push({ kind: "moon", phase: ph, ms: ms });
          }
        } catch (e) { /* out of range */ }
      });
    });
    // Neighbouring dates find the same phase, up to a fraction of a second
    // apart (each search starts elsewhere). A phase recurs every 29.5 days, so
    // two finds of one phase less than a day apart are one event: keep the first.
    found.sort(function (a, b) { return a.ms - b.ms; });
    var last = {};
    return found.filter(function (f) {
      var prev = last[f.phase.key];
      if (prev !== undefined && f.ms - prev < DAY) return false;
      last[f.phase.key] = f.ms;
      return true;
    });
  }

  /* Every phase instant between two times, for the chosen phases. */
  function moonPhasesBetween(t0, t1, wanted) {
    var A = astro(), out = [];
    if (!A || !(t1 > t0)) return out;
    (wanted || PHASES).forEach(function (ph) {
      var t = t0;
      for (var guard = 0; guard < 5000; guard++) {
        var r;
        try { r = A.SearchMoonPhase(ph.lon, new Date(t), 40); } catch (e) { r = null; }
        if (!r) break;
        var ms = r.date.getTime();
        if (ms > t1) break;
        out.push({ kind: "moon", phase: ph, ms: ms });
        t = ms + DAY;
      }
    });
    return out.sort(function (a, b) { return a.ms - b.ms; });
  }

  function moonState(ms) {
    var A = astro();
    if (!A) {
      var age = (((ms / DAY + 2440587.5 - 2451550.1) % C.SYNODIC_MONTH) + C.SYNODIC_MONTH) % C.SYNODIC_MONTH;
      return { angle: age / C.SYNODIC_MONTH * 360, illum: (1 - Math.cos(2 * Math.PI * age / C.SYNODIC_MONTH)) / 2, age: age };
    }
    var angle = A.MoonPhase(new Date(ms));
    var illum = A.Illumination(A.Body.Moon, new Date(ms)).phase_fraction;
    return { angle: angle, illum: illum, age: angle / 360 * C.SYNODIC_MONTH };
  }
  function phaseForAngle(angle) { return PHASES[Math.floor((((angle + 22.5) % 360) + 360) % 360 / 45) % 8]; }

  /* ---------------------------------------------------------- eclipses -- */
  var decoded = null;
  function eclipses() {
    if (decoded) return decoded;
    var D = NC.ECLIPSE_DATA;
    function dec(src, body) {
      if (!src) return [];
      return src.s.split(",").map(function (b36, i) {
        var n = parseInt(b36, 36);
        return { kind: "eclipse", body: body, total: src.t[i] === "f", ms: n * 1000 };
      });
    }
    decoded = { solar: dec(D && D.solar, "solar"), lunar: dec(D && D.lunar, "lunar") };
    return decoded;
  }
  function eclipseNear(list, ms) {
    var tol = C.ECLIPSE_TOLERANCE_DAYS * DAY, lo = 0, hi = list.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, e = list[mid];
      if (ms >= e.ms - tol && ms <= e.ms + tol) return e;
      if (e.ms < ms) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }
  function eclipsesNear(datesMs, opts) {
    var E = eclipses(), out = new Map();
    datesMs.forEach(function (d) {
      [E.solar, E.lunar].forEach(function (list) {
        var e = eclipseNear(list, d);
        if (!e) return;
        var want = e.body === "solar" ? (e.total ? opts.solarTotal : opts.solarPartial) : (e.total ? opts.lunarTotal : opts.lunarPartial);
        if (want) out.set(e.body + e.ms, e);
      });
    });
    return Array.from(out.values()).sort(function (a, b) { return a.ms - b.ms; });
  }
  function nextEclipses(fromMs, count) {
    var E = eclipses(), all = E.solar.concat(E.lunar).filter(function (e) { return e.ms >= fromMs; });
    all.sort(function (a, b) { return a.ms - b.ms; });
    return all.slice(0, count || 4);
  }

  NC.sky = {
    nextSunset: nextSunset, sampling: sampling, sunsetBefore: sunsetBefore, sunsetAfter: sunsetAfter,
    PHASES: PHASES, moonPhasesNear: moonPhasesNear, moonPhasesBetween: moonPhasesBetween, moonState: moonState, phaseForAngle: phaseForAngle,
    eclipses: eclipses, eclipsesNear: eclipsesNear, nextEclipses: nextEclipses
  };
})(typeof window !== "undefined" ? window : globalThis);
