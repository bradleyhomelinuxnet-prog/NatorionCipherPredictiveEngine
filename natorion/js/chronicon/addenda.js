/* NATORION · chronicon/addenda.js
   Addenda: community findings you can switch on and off, and the long-cycle
   tools that test findings like them. Pure functions, no DOM.

   An ADDENDUM is one write-up: who found it, its dated events, and the chains
   of years it points to ("62 CE to 1962 CE is 1900 years"). Switched on, its
   events join the Chronicon ledger and its chains show on the Isometric page.

   The tools work on astronomical years (1 BC = 0, 2 BC = −1) and, where a
   date has a month and day, on the sky over that day:
     spans      — years between two dates, flagged when a whole multiple of a
                  switched-on cycle (19, 100, 138, 434, 600, 1900, 2170 …)
     centres    — the year exactly midway between two dates: an isometric
                  centre, flagged when another date or a ledger event sits on it
     counters   — years from a date to every ledger event, flagged as above
                  (how the Chronicon reads "2170 Phoenix Year / 1900 Capture…")
     sky        — the sign and degree of the Sun, Moon and five planets, the
                  largest gathering in one sign, and any solar or lunar eclipse
                  within a few days (Astronomy Engine, the library v12 used)
   Every count comes with what chance alone would give, because with enough
   dates and enough cycles some multiple always turns up. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var DAY = 86400000, J2000 = Date.UTC(2000, 0, 1, 12);
  var SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  var BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

  /* -------------------------------------------------------------- cycles -- */
  var SPANS = [
    { id: "metonic", years: 19, label: "19 · Metonic", on: true, note: "235 lunar months; your lucky 19." },
    { id: "century", years: 100, label: "100 · century", on: true, note: "Round centuries, as in “100 years after the Flood”." },
    { id: "phoenix", years: 138, label: "138 · Phoenix", on: true, note: "The Phoenix cycle of the Archaix chronology." },
    { id: "judged", years: 434, label: "434 · Judged Time", on: true, note: "Stephen Jones' Judged Time epoch (Secrets of Time)." },
    { id: "ner", years: 600, label: "600 · NER", on: false, note: "The NER cycle; 10 of them make the 6000-year NER calendar." },
    { id: "y1900", years: 1900, label: "1900", on: true, note: "62 CE → 1962 CE; 4039 BC → 2139 BC." },
    { id: "y2170", years: 2170, label: "2170", on: true, note: "4309 BC → 2139 BC → 32 CE; 2 × 2170 = 4340 = 10 × 434." }
  ];

  /* ------------------------------------------------------------- addenda -- */
  // Dates before 15 Oct 1582 are given in the Julian calendar, as the sources
  // give them; later ones are Gregorian. y is the astronomical year.
  var ADDENDA = [
    {
      id: "love-1900",
      title: "1900 years! 62 A.D. to 1962 A.D. — an isometric projection clue",
      author: "Yvonne Love", written: "2026-11-04",
      source: "Notes on Jason Breshears' Anunnaki Homeworld (audiobook), ch. 8, Archive 7 Romanid, read by Grendel Dark",
      events: [
        { y: 59, text: "The Sun darkens over Rome (8th year of the Roman apocalypse-group of comets); a comet; lightning breaks Nero's table" },
        { y: 62, m: 2, d: 5, text: "Earthquake damages Herculaneum and Pompeii, near Vesuvius" },
        { y: 1962, m: 2, d: 5, text: "End of the 6000-year NER calendar; Sun, Moon and five planets in Aquarius; total solar eclipse" },
        { y: -2138, text: "2139 BC: the epicentral year — the Descending Passage aims at Al Cyone, “the Center” (Capt: 2141 BC); 100 years after the Flood" },
        { y: 32, text: "32 CE: 2170 years after the epicentral year; God appears again on Earth (Archaix)" }
      ],
      chains: [
        { years: [62, 1962], text: "62 CE → 1962 CE: 1900 years, and the same calendar day, 5 February" },
        { years: [59, 1962], text: "59 CE → 1962 CE: 1903 years (Charles Fort's “other Dark Year” was 1902–3)" },
        { years: [-4038, -2138], text: "4039 BC (start of the NER calendar) + 1900 years = 2139 BC" },
        { years: [-2238, -2138], text: "The Great Flood (2239 BC) + 100 years = 2139 BC" },
        { years: [62, 162], text: "Reversed: 62 CE + 100 years = 162 CE (pandemic; Han Dynasty falls)" },
        { years: [-4308, -2138, 32], text: "4309 BC → 2139 BC → 32 CE: 2170 + 2170 = 4340 years = 10 Judged Time periods of 434" }
      ]
    }
  ];

  /* ------------------------------------------------------------ calendar -- */
  function julianJdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
  }
  function gregorianJdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  // The civil calendar in force: Julian before 15 Oct 1582 (JDN 2299161).
  function civilJdn(y, m, d) { var g = gregorianJdn(y, m, d); return g >= 2299161 ? g : julianJdn(y, m, d); }
  function jdnToMs(jdn) { return (jdn - 2440588) * DAY; } // 0h UT at the start of that day (JDN n runs from JD n − 0.5)
  function dateMs(ev) { return ev.m && ev.d ? jdnToMs(civilJdn(ev.y, ev.m, ev.d)) : null; }
  function calendarOf(ev) { return ev.m && ev.d ? (gregorianJdn(ev.y, ev.m, ev.d) >= 2299161 ? "Gregorian" : "Julian") : null; }
  function fmtYear(a) { return a <= 0 ? (1 - a) + " BC" : a + " CE"; }

  /* ------------------------------------------------------------ the maths -- */
  function enabledSpans(on) { return SPANS.filter(function (s) { return on ? on[s.id] : s.on; }); }
  // Whole multiples (k ≥ 1) of each span that a gap of d years equals exactly.
  function multiples(d, spans) {
    var out = [];
    d = Math.abs(d);
    spans.forEach(function (s) { if (d >= s.years && d % s.years === 0) out.push({ span: s, k: d / s.years }); });
    return out;
  }
  // Share of whole numbers 1..maxD that are a multiple of at least one span: the
  // chance a gap picked at random in that range is flagged.
  function flagRate(spans, maxD) {
    if (!spans.length || maxD < 1) return 0;
    var hit = 0;
    for (var d = 1; d <= maxD; d++) if (spans.some(function (s) { return d % s.years === 0; })) hit++;
    return hit / maxD;
  }

  function pairs(dates, spans) {
    var out = [], maxD = 1;
    for (var i = 0; i < dates.length; i++) for (var j = i + 1; j < dates.length; j++) {
      var a = dates[i], b = dates[j], gap = Math.abs(b.y - a.y);
      maxD = Math.max(maxD, gap);
      var older = a.y <= b.y ? a : b, newer = a.y <= b.y ? b : a;
      var sameDay = a.m && b.m && a.m === b.m && a.d === b.d;
      out.push({ older: older, newer: newer, gap: gap, multiples: multiples(gap, spans), sameDay: !!sameDay,
        centre: (a.y + b.y) % 2 === 0 ? (a.y + b.y) / 2 : null });
    }
    var flagged = out.filter(function (p) { return p.multiples.length; }).length;
    return { list: out, flagged: flagged, expected: out.length * flagRate(spans, maxD) };
  }

  // Isometric centres: a midway year that is itself one of the dates or a ledger event.
  function centres(dates, ledger, minHalf) {
    var found = [], pool = dates.map(function (d) { return { y: d.y, text: d.text, own: true }; })
      .concat(ledger.map(function (x) { return { y: x[0], text: x[2], own: false }; }));
    for (var i = 0; i < dates.length; i++) for (var j = i + 1; j < dates.length; j++) {
      var a = dates[i], b = dates[j];
      if ((a.y + b.y) % 2) continue;
      var c = (a.y + b.y) / 2, half = Math.abs(b.y - a.y) / 2;
      if (half < (minHalf || 1)) continue;
      pool.forEach(function (p) { if (p.y === c && p.y !== a.y && p.y !== b.y) found.push({ a: a.y <= b.y ? a : b, b: a.y <= b.y ? b : a, centre: p, half: half }); });
    }
    return found;
  }

  // Years from one date to every ledger event, flagged when a multiple of a span.
  // Chance here is NOT a flat rate: much of the ledger sits on regular grids
  // (the 600-year NER nodes all fall on years ending in 62 CE / 39 BC), so a
  // year can score well just by sharing a grid. The fair question is whether
  // the year beats its neighbours, so "expected" is the average count for the
  // same date moved 1 to SHIFT years either way, and "rank" is the share of
  // those neighbours that score at least as well.
  var SHIFT = 60;
  function countFlags(y, ledger, spans) {
    var n = 0;
    ledger.forEach(function (x) { var d = y - x[0]; if (d && multiples(d, spans).length) n++; });
    return n;
  }
  function counters(date, ledger, spans) {
    var list = ledger.map(function (x) {
      var d = date.y - x[0];
      return { event: x, years: d, multiples: d ? multiples(d, spans) : [] };
    }).filter(function (c) { return c.years !== 0; });
    var flagged = list.filter(function (c) { return c.multiples.length; });
    var sum = 0, atLeast = 0, n = 0;
    for (var s = -SHIFT; s <= SHIFT; s++) {
      if (!s) continue;
      var c = countFlags(date.y + s, ledger, spans); sum += c; n++;
      if (c >= flagged.length) atLeast++;
    }
    return { list: list, flagged: flagged, expected: sum / n, neighboursAsGood: atLeast / n, shift: SHIFT };
  }

  /* ---------------------------------------------------------------- sky -- */
  function astro() { return root.Astronomy; }
  function ut(ms) { return (ms - J2000) / DAY; }
  function lonOf(A, body, t) {
    if (body === "Sun") return A.SunPosition(t).elon;
    if (body === "Moon") return A.EclipticGeoMoon(t).lon;
    return A.Ecliptic(A.GeoVector(A.Body[body], t, true)).elon;
  }
  function sky(ms, windowDays) {
    var A = astro(); if (!A || ms == null) return null;
    // Positions at 0h UT, the time printed ephemerides use. The Moon moves
    // about 13° a day, so it can change sign within the date.
    var w = windowDays == null ? 3 : windowDays, noon = ms + DAY / 2, t = A.MakeTime(ut(ms));
    var bodies = BODIES.map(function (b) {
      var l = ((lonOf(A, b, t) % 360) + 360) % 360, deg = l % 30;
      return { body: b, lon: l, sign: SIGNS[Math.floor(l / 30)], deg: Math.floor(deg), min: Math.floor((deg % 1) * 60) };
    });
    var bySign = {};
    bodies.forEach(function (b) { (bySign[b.sign] = bySign[b.sign] || []).push(b.body); });
    var top = Object.keys(bySign).sort(function (a, b) { return bySign[b].length - bySign[a].length; })[0];
    var out = { bodies: bodies, stellium: { sign: top, count: bySign[top].length, bodies: bySign[top] }, solar: null, lunar: null };
    try {
      var se = A.SearchGlobalSolarEclipse(A.MakeTime(ut(ms - w * DAY)));
      var seMs = J2000 + se.peak.ut * DAY;
      if (Math.abs(seMs - noon) <= (w + 0.5) * DAY) out.solar = { kind: se.kind, ms: seMs };
      var le = A.SearchLunarEclipse(A.MakeTime(ut(ms - w * DAY)));
      var leMs = J2000 + le.peak.ut * DAY;
      if (Math.abs(leMs - noon) <= (w + 0.5) * DAY) out.lunar = { kind: le.kind, ms: leMs };
    } catch (e) { /* far-past searches can fail; the positions still stand */ }
    return out;
  }
  // Solar eclipses anywhere in a calendar year (for year-only events).
  function solarEclipsesInYear(y) {
    var A = astro(); if (!A) return [];
    var from = jdnToMs(civilJdn(y, 1, 1)), to = jdnToMs(civilJdn(y + 1, 1, 1)), out = [];
    try {
      var e = A.SearchGlobalSolarEclipse(A.MakeTime(ut(from)));
      for (var i = 0; i < 6; i++) {
        var ms = J2000 + e.peak.ut * DAY;
        if (ms >= to) break;
        out.push({ kind: e.kind, ms: ms, lat: e.latitude, lon: e.longitude });
        e = A.NextGlobalSolarEclipse(e.peak);
      }
    } catch (err) { /* ignore */ }
    return out;
  }
  // The civil (Julian before 1582) calendar date of an instant, for display.
  function civilDate(ms) {
    var jdn = Math.floor(ms / DAY + 2440587.5 + 0.5);
    var y, m, d;
    if (jdn >= 2299161) { var dt = new Date(ms); dt = new Date(Date.UTC(1970, 0, 1) + Math.floor(ms / DAY) * DAY); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
    else { var c = jdn + 32082, dd = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * dd / 4), mm = Math.floor((5 * e + 2) / 153);
      d = e - Math.floor((153 * mm + 2) / 5) + 1; m = mm + 3 - 12 * Math.floor(mm / 10); y = dd - 4800 + Math.floor(mm / 10); }
    var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d + " " + MN[m - 1] + " " + fmtYear(y) + (jdn < 2299161 ? " (Julian)" : "");
  }

  /* ---------------------------------------------------- switched-on state -- */
  var KEY = "natorion.addenda.v1";
  function load() {
    var s = null;
    try { s = JSON.parse(root.localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    if (!s || typeof s !== "object") s = {};
    var on = s.on || {}, spans = s.spans || {};
    ADDENDA.forEach(function (a) { if (!(a.id in on)) on[a.id] = true; });
    SPANS.forEach(function (sp) { if (!(sp.id in spans)) spans[sp.id] = sp.on; });
    return { on: on, spans: spans };
  }
  function save(state) { try { root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window */ } }

  // The Chronicon ledger plus the events of every switched-on addendum (kind "add").
  function ledger(base, state) {
    var st = state || load(), extra = [];
    ADDENDA.forEach(function (a) {
      if (!st.on[a.id]) return;
      a.events.forEach(function (ev) { extra.push([ev.y, "add", ev.text + " — " + a.author]); });
    });
    return base.concat(extra).sort(function (x, y) { return x[0] - y[0]; });
  }

  NC.addenda = {
    SPANS: SPANS, ADDENDA: ADDENDA, SIGNS: SIGNS,
    enabledSpans: enabledSpans, multiples: multiples, flagRate: flagRate,
    pairs: pairs, centres: centres, counters: counters,
    sky: sky, solarEclipsesInYear: solarEclipsesInYear, civilDate: civilDate,
    dateMs: dateMs, calendarOf: calendarOf, civilJdn: civilJdn, fmtYear: fmtYear,
    load: load, save: save, ledger: ledger
  };
})(typeof window !== "undefined" ? window : globalThis);
