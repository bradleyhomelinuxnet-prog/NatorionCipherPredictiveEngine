#!/usr/bin/env node
/* Parity test: the ORIGINAL Ophis v12 engine (../../src + ../../lib, run
   headless in a vm sandbox) against the NATORION engine, on the sample .oph
   files and on randomly generated events.

     node natorion/tests/parity.js [randomCases=300] [seed=19138]

   It runs in UTC unless TZ is set, so "today" is the same for both engines.
   Exit code 0 when every case matches. */
"use strict";
if (!process.env.TZ) process.env.TZ = "UTC";
const vm = require("vm"), fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");

/* ---------------------------------------------------- the original -- */
function loadOriginal() {
  const noop = () => {};
  const stub = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub), apply: () => stub, construct: () => stub, set: () => true });
  const ctx = { console: { log: noop, warn: noop, error: noop, info: noop, debug: noop }, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx;
  ctx.document = stub; ctx.navigator = { userAgent: "node" }; ctx.location = { search: "" };
  ctx.localStorage = { getItem: () => null, setItem: noop }; ctx.$ = stub; ctx.jQuery = stub;
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(path.join(REPO, f), "utf8"), ctx, { filename: f });
  ["lib/moment-with-locales.min.js", "lib/moment-timezone-with-data.js", "lib/math.js", "lib/tz_lookup_oss.js", "lib/astronomy.browser.min.js",
   "lib/meuusjs.1.0.3.min.js", "lib/meeus-easy.js", "lib/suncalc.js", "lib/lunarphase-js.js",
   "src/ophis_utils.js", "src/ophis_config.js", "src/ophis_model__params.js", "src/ophis_view__strings.js", "src/ophis_dependencies.js",
   "src/ophis_model__validation.js", "src/ophis_model__operations.js", "src/ophis_model__sorting.js"].forEach(load);
  vm.runInContext(`var DEFAULT_LAT = 32.8, DEFAULT_LONG = -96.8;
    var appState = { globalOptions: { local_time_offset_in_millis: 0 }, fileInputValidationMode: FILE_INPUT_VALIDATION_MODE__LOOSE, headless_current_epoch_millis: 0 };
    function isRunningHeadless(){ return true; } function printWarning(){} function printError(){} function print(){}
    function getRowShortNameHtml(p,i){ return p + (i+1); } function convertHtmlToPlainText(s){ return String(s).replace(/<[^>]*>/g,''); }
    function toggleIsoEventLocationEnabled(e,v){ e.location_enabled = v; } function readableLatLong(a,b){ return a+','+b; }
    function __run(json, now) {
      appState.headless_current_epoch_millis = now;
      var errs = [], events = validatePotentialIsoEventImportAssumingValidJsonSyntax(JSON.parse(json), errs);
      if (errs.length) return { importErrors: errs };
      return events.map(function (ev) {
        var r = runOphisOnEvent(ev);
        return { errors: r.errors.length, y: r.y_structs.map(function (y) { return y.rotation_count_y; }),
          z: r.processed_z_dates.map(function (k) { var t = r.z_structs[k];
            return [t.z_date_readable_start_no_html + (ev.scope == EVENT_SCOPE__HH_MM ? " / " + t.z_date_readable_end_no_html : ""), t.score, t.hit_count,
                    t.msrf_match_structs.map(function (m) { return m.msrf_number; }).join("|"),
                    t.operation_match_structs.map(function (m) { return m.operation_result.operation_ordinal + ":" + m.y_struct.x_1_ordinal + "-" + m.y_struct.x_2_ordinal; }).join(",")]; }) };
      });
    }`, ctx);
  return (json, now) => ctx.__run(json, now);
}

/* ------------------------------------------------------ the rebuild -- */
function loadNatorion() {
  ["js/vendor/astronomy.min.js", "js/vendor/tz-lookup.js", "js/engine/core.js", "js/engine/expr.js", "js/engine/time.js",
   "js/engine/sky.js", "js/engine/engine.js", "js/engine/oph.js"].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
  const NC = globalThis.NC, T = NC.time;
  return (json, now) => {
    const p = NC.oph.parse(json, NC.C.VALIDATION.LOOSE);
    if (!p.events) return { importErrors: p.errors };
    return p.events.map(ev => {
      const r = NC.engine.run(ev, { nowMs: now }), hh = ev.scope === NC.C.SCOPE.HH_MM, tz = r.zone;
      const fmt = ms => T.msToDateString(ms, tz) + (hh ? " " + T.msToTimeString(ms, tz) : "");
      return { errors: r.errors.length, y: r.ys.map(y => y.Y),
        z: r.sorted.map(t => [fmt(t.start) + (hh ? " / " + fmt(t.end) : ""), t.score, t.hits, t.msrf.map(m => m.number).join("|"),
          t.ops.map(h => h.r.opIndex + ":" + h.y.x1 + "-" + h.y.x2).join(",")]) };
    });
  };
}

/* ------------------------------------------------------ random cases -- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pad = n => (n < 10 ? "0" : "") + n;
function randomEvent(R, hh) {
  const n = 2 + Math.floor(R() * (hh ? 3 : 6));
  let t = Date.UTC(1950 + Math.floor(R() * 120), Math.floor(R() * 12), 1 + Math.floor(R() * 28));
  const x = [];
  for (let i = 0; i < n; i++) {
    t += (1 + Math.floor(R() * (R() < 0.3 ? 40 : 900))) * 864e5;
    const d = new Date(t);
    x.push({ date: pad(d.getUTCMonth() + 1) + "/" + pad(d.getUTCDate()) + "/" + d.getUTCFullYear(), time: pad(Math.floor(R() * 24)) + ":" + pad(Math.floor(R() * 60)), enabled: R() > 0.08 });
  }
  const ops = globalThis.NC.C.DEFAULT_OPERATIONS.concat(R() < 0.4 ? globalThis.NC.C.EXTRA_OPERATIONS : []).map(o => ({ equation: o.equation, weight: o.weight, enabled: R() > 0.1 }));
  if (R() < 0.2) ops.push({ equation: "X1+oph_sqrt(Y)x12", weight: 0.5, enabled: true });
  if (R() < 0.2) ops.push({ equation: "X2+oph_flip(oph_round(Y/3))", weight: 1, enabled: true });
  if (R() < 0.1) ops.push({ equation: ops[0].equation, weight: 1, enabled: true });   // duplicate: must be ignored
  const sorts = ["SORT_TYPE__DATE", "SORT_TYPE__SCORE", "SORT_TYPE__MSRF", "SORT_TYPE__HIT_COUNT", "SORT_TYPE__OPERATIONS"];
  // Edge shapes v12 special-cases: a disabled first date (the "first pair"
  // minimum then applies to a later pair), two dates a day apart, and an
  // unreadable date that loose loading must drop.
  if (R() < 0.15) x[0].enabled = false;
  if (R() < 0.15 && x.length > 2) { const d = new Date(Date.UTC(+x[0].date.slice(6), +x[0].date.slice(0, 2) - 1, +x[0].date.slice(3, 5)) + 864e5); x.splice(1, 0, { date: pad(d.getUTCMonth() + 1) + "/" + pad(d.getUTCDate()) + "/" + d.getUTCFullYear(), time: "00:00", enabled: true }); }
  if (R() < 0.1) x.splice(Math.floor(R() * x.length), 0, { date: "02/30/2027", time: "00:00", enabled: true });
  // T-Dates (Days scope only: in HH:MM, Natorion deliberately reads them at
  // the event's location where v12 used the computer's own zone).
  const tds = [];
  if (!hh && R() < 0.3) {
    const last = x[x.length - 1], base = Date.UTC(+last.date.slice(6), +last.date.slice(0, 2) - 1, +last.date.slice(3, 5));
    for (let k = 0; k < 1 + Math.floor(R() * 3); k++) { const d = new Date(base + Math.floor(R() * 900) * 864e5); tds.push({ date: pad(d.getUTCMonth() + 1) + "/" + pad(d.getUTCDate()) + "/" + d.getUTCFullYear(), enabled: R() > 0.2 }); }
  }
  const ev = {
    name: "R", x_dates: x, t_dates: tds, scope: hh ? "EVENT_SCOPE__HH_MM" : "EVENT_SCOPE__DAYS",
    lat: hh ? Math.round((R() * 110 - 55) * 10) / 10 : 0, long: hh ? Math.round((R() * 340 - 170) * 10) / 10 : 0,
    operations: ops, scoring_system: R() < 0.15 ? "SCORING_SYSTEM__LTE_V7" : "SCORING_SYSTEM__GTE_V8",
    z_date_sort_type: sorts[Math.floor(R() * sorts.length)],
    iso_event_filter_before_current_date: R() < 0.5, iso_event_filter_before_last_x_date: R() < 0.7,
    iso_event_filter_on_last_x_date: R() < 0.7, iso_event_filter_on_current_date: R() < 0.3,
    iso_event_filter_beyond_max_days: R() < 0.8, iso_event_filter_beyond_max_days_value: [2559, 400, 90][Math.floor(R() * 3)],
    iso_event_filter_min_hit_count: R() < 0.2, iso_event_filter_min_hit_count_value: 1 + Math.floor(R() * 4),
    iso_event_filter_min_score: R() < 0.2, iso_event_filter_min_score_value: [0.5, 1, 1.5, 2, 3][Math.floor(R() * 5)],
    iso_event_filter_msrf_match: R() < 0.2,
    day_scope_start_time_in_millis: !hh && R() < 0.15 ? 3600000 * Math.floor(R() * 24) : 0
  };
  return JSON.stringify({ app_version: "12", iso_events: [ev] });
}

/* ------------------------------------------------------------- main -- */
const count = parseInt(process.argv[2] || "300", 10), seed = parseInt(process.argv[3] || "19138", 10);
if (new Date(0).getTimezoneOffset() !== 0) console.warn("warning: run with TZ=UTC for a like-for-like 'today'.");
const original = loadOriginal(), natorion = loadNatorion(), R = rng(seed);
const NOW = Date.UTC(2026, 8, 23, 12, 0);
// Every fifth random case also runs with "today" moved inside its own date
// range, so the on-today / before-today filters actually bite.
const cases = ["test-bradley.oph", "test-file-bradley-rogue-dates.oph", "7-4-26-8-20-26-3-9-27-3-16-27-8-19-27-4-1-28.oph"].map(f => ({ name: f, json: fs.readFileSync(path.join(REPO, f), "utf8") }));
for (let i = 0; i < count; i++) {
  const json = randomEvent(R, i % 5 === 4), c = { name: "random#" + i + (i % 5 === 4 ? " (HH:MM)" : ""), json: json };
  if (i % 5 === 2) { const xs = JSON.parse(json).iso_events[0].x_dates, d = xs[xs.length - 1].date; c.now = Date.UTC(+d.slice(6), +d.slice(0, 2) - 1, +d.slice(3, 5)) + Math.floor(R() * 200) * 864e5 + 7 * 3600000; c.name += " (today inside)"; }
  cases.push(c);
}

let pass = 0, fail = 0, zTotal = 0;
for (const c of cases) {
  const now = c.now || NOW;
  const a = JSON.stringify(original(c.json, now)), b = JSON.stringify(natorion(c.json, now));
  if (a === b) { pass++; zTotal += (a.match(/\],\[/g) || []).length; continue; }
  fail++;
  if (fail <= 5) {
    const A = JSON.parse(a), B = JSON.parse(b);
    console.log("MISMATCH", c.name);
    const ea = A[0] || A, eb = B[0] || B;
    if (ea.z && eb.z) {
      for (let k = 0; k < Math.max(ea.z.length, eb.z.length); k++) {
        if (JSON.stringify(ea.z[k]) !== JSON.stringify(eb.z[k])) { console.log("  first diff at row", k, "\n  v12:     ", JSON.stringify(ea.z[k]), "\n  natorion:", JSON.stringify(eb.z[k])); break; }
      }
      if (JSON.stringify(ea.y) !== JSON.stringify(eb.y)) console.log("  Y v12", ea.y.join(","), "\n  Y new", eb.y.join(","));
      if (ea.errors !== eb.errors) console.log("  errors", ea.errors, eb.errors);
    } else console.log("  v12:", a.slice(0, 300), "\n  new:", b.slice(0, 300));
  }
}
console.log(`parity: ${pass}/${cases.length} cases identical, ${fail} different (${zTotal} Z-Date rows compared)`);
process.exit(fail ? 1 : 0);
