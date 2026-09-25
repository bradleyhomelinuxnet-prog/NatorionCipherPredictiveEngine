#!/usr/bin/env node
/* ==========================================================================
   parity.node.js — differential test: rewrite vs. the original v12 engine
   --------------------------------------------------------------------------
   The desktop renderer extracted from the .exe is plain, un-obfuscated script,
   so it can be loaded into a Node VM context with a handful of browser stubs
   and driven headless. That makes it an oracle: for each fixture event we run
   BOTH engines and compare every Z-Date, score, hit count, MSRF match and sort
   order.

       node web/tests/parity.node.js            # run
       node web/tests/parity.node.js --verbose  # show every compared field

   A non-zero exit status means the rewrite disagrees with the original.
   ========================================================================== */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const VERBOSE = process.argv.includes("--verbose");
const QUIET_OK = process.argv.includes("--quiet");

/* Fixed "now" so both engines apply the current-date filters identically.
   2027-01-19, because 19 is one of the house numbers. */
const NOW_MILLIS = Date.UTC(2027, 0, 19, 0, 0, 0);

/* ======================================================================== */
/* 1. The original engine, in a sandbox                                     */
/* ======================================================================== */

/* The original scripts run in Node's own realm rather than a vm context: the
   bundled mathjs uses typed-function identity checks that fail across realms,
   and its validator is part of what we are testing. Browser globals it expects
   are stubbed onto globalThis first. */
function loadOriginalEngine() {
  const quiet = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.location = { search: "" };
  try { globalThis.navigator = { userAgent: "node" }; } catch (e) { /* Node 22 defines navigator as a getter */ }
  globalThis.document = {
    createElement() {
      return {
        innerHTML: "",
        get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ""); },
        set textContent(value) { this.innerHTML = value; },
        innerText: ""
      };
    },
    getElementById: () => null,
    getElementsByClassName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };

  const realConsole = console;
  if (!VERBOSE) globalThis.console = Object.assign({}, realConsole, quiet);

  const run = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel });

  // Vendored dependencies the model layer expects to find on window.
  [
    "lib/moment-with-locales.min.js",
    "lib/moment-timezone-with-data.js",
    "lib/tz_lookup_oss.js",
    "lib/math.js",
    "lib/astronomy.browser.min.js"
  ].forEach(run);

  // Model layer. Order matters: ophis_config.js calls helpers from
  // ophis_utils.js while it is initialising its own top-level constants.
  [
    "src/ophis_logging.js",
    "src/ophis_utils.js",
    "src/ophis_view__strings.js",
    "src/ophis_dependencies.js",
    "src/ophis_config.js",
    "src/ophis_model__params.js",
    "src/ophis_model__validation.js",
    "src/ophis_model__sorting.js",
    "src/ophis_model__operations.js"
  ].forEach(run);

  // The pieces ophis_main.js would normally provide.
  globalThis.isRunningHeadless = () => true;
  globalThis.appState = {
    headless: true,
    headless_current_epoch_millis: NOW_MILLIS,
    fileInputValidationMode: "FILE_INPUT_VALIDATION_MODE__ORIGINAL",
    isSignedIn: true,
    globalOptions: { local_time_offset_in_millis: 0 }
  };

  globalThis.console = realConsole;
  return globalThis;
}

/* ======================================================================== */
/* 2. The rewrite                                                           */
/* ======================================================================== */

function loadRewrite() {
  const scope = {
    console, Intl, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite,
    Number, String, Array, Object, Error, RegExp, Set, Map, Boolean, Symbol, Promise,
    setTimeout, clearTimeout
  };
  scope.globalThis = scope;
  scope.window = scope;
  const ctx = vm.createContext(scope);

  // The same optional helpers index.html loads: sunset engine and timezone
  // lookup. Without them the rewrite disables HH:MM scope by design.
  [
    "lib/astronomy.browser.min.js",
    "lib/tz_lookup_oss.js"
  ].forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel }));

  [
    "web/js/ophis.constants.js",
    "web/js/ophis.expr.js",
    "web/js/ophis.time.js",
    "web/js/ophis.engine.js",
    "web/js/ophis.file.js"
  ].forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel }));
  return scope.Ophis;
}

/* ======================================================================== */
/* 3. Fixtures                                                              */
/* ======================================================================== */

const DEFAULT_OPERATIONS = [
  ["X2+oph_round(Y)", 1], ["X2+oph_flip(oph_round(Y))", 1], ["X2+Y/OPH_CRV", 0.5],
  ["X1+(Y/2.0)xOPH_PI", 0.5], ["X2+Y/OPH_PHI", 1], ["X2+(Y/2.0)xOPH_PHI", 1],
  ["X1+(Y/2.0)xOPH_CRV", 0.5], ["X2+(Y/2.0)xOPH_PI", 0.5], ["X2+YxOPH_PHI", 1],
  ["X1+YxOPH_PI", 1], ["X2+(Y/2.0)xOPH_CRV", 0.5], ["X2+YxOPH_PI", 0.5],
  ["X1+YxOPH_CRV", 0.5], ["X2+YxOPH_CRV", 0.5], ["X1+YxOPH_HEP", 1], ["X2+YxOPH_HEP", 1]
].map(([equation, weight]) => ({ equation, weight, enabled: true }));

function baseEvent(overrides) {
  const event = {
    name: "Fixture",
    notes: "",
    x_dates: [],
    t_dates: [],
    lat: 0,
    long: 0,
    location_enabled: false,
    scope: "EVENT_SCOPE__DAYS",
    type: "EVENT_TYPE__PERSONAL",
    operations: JSON.parse(JSON.stringify(DEFAULT_OPERATIONS)),
    scoring_system: "SCORING_SYSTEM__GTE_V8",
    iso_event_filter_before_last_x_date: true,
    iso_event_filter_on_last_x_date: true,
    iso_event_filter_before_current_date: true,
    iso_event_filter_on_current_date: false,
    iso_event_filter_beyond_max_days: true,
    iso_event_filter_beyond_max_days_value: 2559,
    iso_event_filter_min_hit_count: false,
    iso_event_filter_min_hit_count_value: 2,
    iso_event_filter_min_score: false,
    iso_event_filter_min_score_value: 1,
    iso_event_filter_msrf_match: false,
    z_date_sort_type: "SORT_TYPE__DATE",
    day_scope_start_time_in_millis: 0
  };
  return Object.assign(event, overrides || {});
}

function dates(list) {
  return list.map((entry) => {
    if (typeof entry === "string") return { date: entry, time: "00:00", enabled: true };
    return { date: entry[0], time: entry[1] || "00:00", enabled: entry[2] !== false };
  });
}

function fixturesFromRepo() {
  const out = [];
  fs.readdirSync(ROOT)
    .filter((name) => name.endsWith(".oph"))
    .sort()
    .forEach((name) => {
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8")); }
      catch (e) { return; }
      (parsed.iso_events || []).forEach((event, index) => {
        out.push({ label: name + " · event " + (index + 1), event: event });
      });
    });
  return out;
}

function syntheticFixtures() {
  return [
    {
      label: "two anchors, default operations",
      event: baseEvent({ x_dates: dates(["01/19/2020", "09/06/2023"]) })
    },
    {
      label: "five anchors (test-bradley shape)",
      event: baseEvent({
        x_dates: dates(["07/04/2026", "08/20/2026", "03/09/2027", "03/16/2027", "07/17/2027"]),
        z_date_sort_type: "SORT_TYPE__MSRF"
      })
    },
    {
      label: "a disabled anchor in the middle",
      event: baseEvent({ x_dates: dates([["01/01/2020"], ["02/19/2020", "00:00", false], ["05/07/2021"], ["11/13/2023"]]) })
    },
    {
      label: "v7 scoring",
      event: baseEvent({
        x_dates: dates(["03/03/2021", "07/21/2022", "01/09/2024"]),
        scoring_system: "SCORING_SYSTEM__LTE_V7"
      })
    },
    {
      label: "every filter off",
      event: baseEvent({
        x_dates: dates(["06/06/2018", "09/19/2019", "02/28/2021"]),
        iso_event_filter_before_last_x_date: false,
        iso_event_filter_on_last_x_date: false,
        iso_event_filter_before_current_date: false,
        iso_event_filter_beyond_max_days: false
      })
    },
    {
      label: "tight filters (min score 3, MSRF required)",
      event: baseEvent({
        x_dates: dates(["01/05/2019", "08/14/2020", "04/02/2022", "12/25/2023"]),
        iso_event_filter_min_score: true,
        iso_event_filter_min_score_value: 3,
        iso_event_filter_msrf_match: true
      })
    },
    {
      label: "min hit count 4",
      event: baseEvent({
        x_dates: dates(["02/02/2017", "10/10/2018", "06/06/2020", "03/03/2022"]),
        iso_event_filter_min_hit_count: true,
        iso_event_filter_min_hit_count_value: 4
      })
    },
    {
      label: "beyond-max-days clamped to 138",
      event: baseEvent({
        x_dates: dates(["01/19/2024", "05/06/2025"]),
        iso_event_filter_beyond_max_days_value: 138
      })
    },
    {
      label: "T-Dates narrow the output",
      event: baseEvent({
        x_dates: dates(["01/01/2020", "07/19/2021", "02/06/2023"]),
        t_dates: dates(["03/19/2027", "11/11/2027", "01/19/2028"]),
        iso_event_filter_beyond_max_days: false
      })
    },
    {
      label: "day-scope start offset of 6 hours",
      event: baseEvent({
        x_dates: dates(["04/04/2021", "09/09/2022"]),
        day_scope_start_time_in_millis: 6 * 60 * 60 * 1000
      })
    },
    {
      label: "custom operations incl. 19 and 138",
      event: baseEvent({
        x_dates: dates(["01/19/2021", "06/26/2022", "12/01/2024"]),
        operations: [
          { equation: "X2+oph_round(Y/19)x19", weight: 1, enabled: true },
          { equation: "X1+oph_round(Y/138)x138", weight: 1, enabled: true },
          { equation: "X2+oph_flip(oph_round(Y))", weight: 0.5, enabled: true },
          { equation: "X2+Yx1.618", weight: 1, enabled: true },
          { equation: "X1+oph_sqrt(Y)x19", weight: 0.5, enabled: true },
          { equation: "X2+oph_ceil(Y/2.0)", weight: 0.5, enabled: true },
          { equation: "X1+oph_floor(YxOPH_HEP)", weight: 1, enabled: true }
        ]
      })
    },
    {
      label: "one operation disabled, one broken",
      event: baseEvent({
        x_dates: dates(["05/05/2020", "01/29/2022"]),
        operations: [
          { equation: "X2+oph_round(Y)", weight: 1, enabled: true },
          { equation: "X2+Y/OPH_PHI", weight: 1, enabled: false },
          { equation: "X1+YxOPH_PI", weight: 0.5, enabled: true }
        ]
      })
    },
    {
      label: "anchors one day apart",
      event: baseEvent({ x_dates: dates(["01/19/2026", "01/20/2026"]) })
    },
    {
      label: "anchors out of order (expects an error)",
      event: baseEvent({ x_dates: dates(["09/09/2024", "01/01/2020"]) })
    },
    {
      label: "single anchor (expects an error)",
      event: baseEvent({ x_dates: dates(["01/19/2026"]) })
    },
    {
      label: "HH:MM scope · New York",
      event: baseEvent({
        scope: "EVENT_SCOPE__HH_MM",
        lat: 40.7, long: -74,
        location_enabled: true,
        x_dates: dates([["01/19/2021", "09:30"], ["06/26/2022", "16:00"], ["12/01/2024", "21:45"]])
      })
    },
    {
      label: "HH:MM scope · Sydney, either side of sunset",
      event: baseEvent({
        scope: "EVENT_SCOPE__HH_MM",
        lat: -33.9, long: 151.2,
        location_enabled: true,
        x_dates: dates([["03/03/2019", "17:30"], ["03/04/2019", "19:30"], ["11/11/2021", "05:15"]])
      })
    },
    {
      label: "HH:MM scope · high latitude, long span",
      event: baseEvent({
        scope: "EVENT_SCOPE__HH_MM",
        lat: 59.3, long: 18.1,
        location_enabled: true,
        x_dates: dates([["06/21/2018", "23:00"], ["12/21/2019", "13:00"], ["09/23/2023", "06:30"]])
      })
    },
    {
      label: "long span, 1656 days apart",
      event: baseEvent({ x_dates: dates(["01/01/2015", "07/14/2019", "02/25/2024"]) })
    }
  ];
}

/* Randomised events. Deterministic from a seed so a failure can be replayed:
       node web/tests/parity.node.js --fuzz 500 --seed 138            */
function fuzzFixtures(count, seed) {
  // xorshift32 — small, seedable, good enough to shuffle fixtures with.
  let state = seed >>> 0 || 1;
  const rnd = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

  const OPERATION_POOL = DEFAULT_OPERATIONS.map((op) => op.equation).concat([
    "X2+oph_round(Y/19)x19", "X1+oph_round(Y/138)x138", "X2+Y+19", "X1+Y+138",
    "X2+oph_flip(Y)", "X1+oph_ceil(Y/OPH_PHI)", "X2+oph_floor(YxOPH_CRV)",
    "X2+Yx360/365.2422", "X1+oph_sqrt(Y)x19", "X2+(Y/3.0)xOPH_HEP", "X1+Y/2.0"
  ]);

  const out = [];
  for (let i = 0; i < count; i++) {
    const anchors = int(2, 5);
    const startMillis = Date.UTC(int(1990, 2026), int(0, 11), int(1, 28));
    const xDates = [];
    let cursor = startMillis;
    for (let k = 0; k < anchors; k++) {
      cursor += int(1, 900) * 86400000;
      const d = new Date(cursor);
      const text = String(d.getUTCMonth() + 1).padStart(2, "0") + "/" +
                   String(d.getUTCDate()).padStart(2, "0") + "/" + d.getUTCFullYear();
      xDates.push({ date: text, time: "00:00", enabled: rnd() < 0.85 });
    }
    xDates[0].enabled = true;
    xDates[xDates.length - 1].enabled = true;

    const operationCount = int(1, 8);
    const operations = [];
    const used = {};
    for (let k = 0; k < operationCount; k++) {
      const equation = pick(OPERATION_POOL);
      if (used[equation]) continue;          // the engines both reject duplicates
      used[equation] = true;
      operations.push({ equation: equation, weight: rnd() < 0.5 ? 1 : 0.5, enabled: rnd() < 0.9 });
    }
    if (!operations.length) operations.push({ equation: "X2+oph_round(Y)", weight: 1, enabled: true });

    out.push({
      label: "fuzz #" + (i + 1),
      event: baseEvent({
        x_dates: xDates,
        operations: operations,
        scoring_system: rnd() < 0.5 ? "SCORING_SYSTEM__GTE_V8" : "SCORING_SYSTEM__LTE_V7",
        z_date_sort_type: pick(["SORT_TYPE__DATE", "SORT_TYPE__SCORE", "SORT_TYPE__MSRF", "SORT_TYPE__HIT_COUNT", "SORT_TYPE__OPERATIONS"]),
        iso_event_filter_before_last_x_date: rnd() < 0.7,
        iso_event_filter_on_last_x_date: rnd() < 0.7,
        iso_event_filter_before_current_date: rnd() < 0.6,
        iso_event_filter_on_current_date: rnd() < 0.3,
        iso_event_filter_beyond_max_days: rnd() < 0.7,
        iso_event_filter_beyond_max_days_value: pick([19, 138, 365, 1656, 2559]),
        iso_event_filter_min_hit_count: rnd() < 0.3,
        iso_event_filter_min_hit_count_value: int(1, 4),
        iso_event_filter_min_score: rnd() < 0.3,
        iso_event_filter_min_score_value: int(1, 5),
        iso_event_filter_msrf_match: rnd() < 0.25,
        day_scope_start_time_in_millis: rnd() < 0.2 ? int(0, 23) * 3600000 : 0
      })
    });
  }
  return out;
}

/* Known divergences: cases where the rewrite is deliberately not bug-compatible.
   Each one states the operation responsible and is only accepted if (a) the two
   engines really do disagree about that operation and (b) removing it makes the
   engines agree exactly — i.e. the divergence is fully explained. */
function divergenceFixtures() {
  return [
    {
      label: "validator vs. executor · oph_abs(Y-138)+19",
      note: "The desktop validator checks a stripped copy of the formula with the oph_* " +
            "function names deleted, so 'X2+oph_abs(Y-138)+19' is judged on (10-138)+19 = -109 " +
            "and rejected, while the formula it would actually compile returns 147. The rewrite " +
            "validates the expression it evaluates, so it accepts the formula. This is the same " +
            "validator/executor split that makes the original's new Function() sink reachable.",
      operation: "X2+oph_abs(Y-138)+19",
      event: baseEvent({
        x_dates: dates(["01/19/2021", "06/26/2022", "12/01/2024"]),
        operations: [
          { equation: "X2+oph_round(Y)", weight: 1, enabled: true },
          { equation: "X2+oph_abs(Y-138)+19", weight: 0.5, enabled: true }
        ]
      })
    }
  ];
}

/* Sort-order fixtures: the same event under each sort type. */
function sortFixtures() {
  return ["SORT_TYPE__DATE", "SORT_TYPE__SCORE", "SORT_TYPE__MSRF", "SORT_TYPE__HIT_COUNT", "SORT_TYPE__OPERATIONS"]
    .map((sortType) => ({
      label: "sort · " + sortType,
      event: baseEvent({
        x_dates: dates(["01/19/2019", "08/08/2020", "03/16/2022", "11/27/2023"]),
        z_date_sort_type: sortType
      })
    }));
}

/* ======================================================================== */
/* 4. Comparison                                                            */
/* ======================================================================== */

function summariseOriginal(sandbox, event) {
  const clone = JSON.parse(JSON.stringify(event));
  const results = sandbox.runOphisOnEvent(clone);

  const zStructs = {};
  Object.keys(results.z_structs).forEach((key) => {
    const z = results.z_structs[key];
    zStructs[key] = {
      readable: z.z_date_readable_start_no_html || z.z_date_readable_start,
      score: z.score,
      hits: z.hit_count,
      operations: z.operation_match_structs.map((m) => m.operation_result.operation_ordinal),
      msrf: z.msrf_match_structs.map((m) => m.msrf_number),
      operation_score: z.operation_score,
      base: z.base_score_pre_multiply
    };
  });

  return {
    errors: results.errors.map(String),
    total: Object.keys(results.z_structs).length,
    byDate: results.processed_z_dates__sorted_by_date.slice(),
    sorted: results.processed_z_dates.slice(),
    zStructs: zStructs
  };
}

function summariseRewrite(Ophis, event) {
  const clone = JSON.parse(JSON.stringify(event));
  const results = Ophis.Engine.run(clone, { nowInstant: new Date(NOW_MILLIS) });

  const zStructs = {};
  Object.keys(results.z_structs).forEach((key) => {
    const z = results.z_structs[key];
    zStructs[key] = {
      readable: z.z_readable_start,
      score: z.score,
      hits: z.hit_count,
      operations: z.operation_match_structs.map((m) => m.operation_result.operation_ordinal),
      msrf: z.msrf_match_structs.map((m) => m.msrf_number),
      operation_score: z.operation_score,
      base: z.base_score_pre_multiply
    };
  });

  return {
    errors: results.errors.map(String),
    total: results.total_z_dates,
    byDate: results.z_keys_by_date.slice(),
    sorted: results.z_keys_sorted.slice(),
    zStructs: zStructs
  };
}

function compare(label, a, b) {
  const problems = [];

  // Errors: compare whether each engine refused, not the exact wording (the
  // rewrite rewrites a few messages for clarity).
  if ((a.errors.length > 0) !== (b.errors.length > 0)) {
    problems.push("one engine errored and the other did not: original=" +
      JSON.stringify(a.errors) + " rewrite=" + JSON.stringify(b.errors));
    return problems;
  }
  if (a.errors.length > 0) return problems;   // both refused; nothing else to compare

  if (a.total !== b.total) problems.push("Z-Date count: original " + a.total + ", rewrite " + b.total);

  const keysA = Object.keys(a.zStructs).sort();
  const keysB = Object.keys(b.zStructs).sort();
  const onlyA = keysA.filter((k) => keysB.indexOf(k) < 0);
  const onlyB = keysB.filter((k) => keysA.indexOf(k) < 0);
  if (onlyA.length) problems.push("only in original: " + onlyA.slice(0, 5).map((k) => a.zStructs[k].readable).join(", "));
  if (onlyB.length) problems.push("only in rewrite: " + onlyB.slice(0, 5).map((k) => b.zStructs[k].readable).join(", "));

  keysA.filter((k) => keysB.indexOf(k) >= 0).forEach((key) => {
    const za = a.zStructs[key];
    const zb = b.zStructs[key];
    if (za.readable !== zb.readable) problems.push(key + " label: '" + za.readable + "' vs '" + zb.readable + "'");
    if (za.score !== zb.score) problems.push(za.readable + " score: " + za.score + " vs " + zb.score);
    if (za.hits !== zb.hits) problems.push(za.readable + " hits: " + za.hits + " vs " + zb.hits);
    if (za.operation_score !== zb.operation_score) problems.push(za.readable + " operation score: " + za.operation_score + " vs " + zb.operation_score);
    if (za.base !== zb.base) problems.push(za.readable + " base score: " + za.base + " vs " + zb.base);
    if (za.operations.join(",") !== zb.operations.join(",")) {
      problems.push(za.readable + " operations: [" + za.operations + "] vs [" + zb.operations + "]");
    }
    if (za.msrf.join(",") !== zb.msrf.join(",")) {
      problems.push(za.readable + " MSRF: [" + za.msrf + "] vs [" + zb.msrf + "]");
    }
  });

  if (a.byDate.join("|") !== b.byDate.join("|")) problems.push("date ordering differs");
  if (a.sorted.join("|") !== b.sorted.join("|")) problems.push("sorted ordering differs");

  return problems;
}

/* ======================================================================== */
/* 5. Run                                                                   */
/* ======================================================================== */

function main() {
  const sandbox = loadOriginalEngine();
  const Ophis = loadRewrite();

  const fuzzIndex = process.argv.indexOf("--fuzz");
  const fuzzCount = fuzzIndex > 0 ? parseInt(process.argv[fuzzIndex + 1], 10) || 0 : 0;
  const seedIndex = process.argv.indexOf("--seed");
  const seed = seedIndex > 0 ? parseInt(process.argv[seedIndex + 1], 10) || 1 : 19;

  const fixtures = [].concat(
    syntheticFixtures(), sortFixtures(), fixturesFromRepo(),
    fuzzCount ? fuzzFixtures(fuzzCount, seed) : []
  );
  const divergences = divergenceFixtures();

  let passed = 0;
  let failed = 0;
  const failures = [];

  console.log("Ophis parity — rewrite vs. original v12 engine");
  console.log("reference now: " + new Date(NOW_MILLIS).toISOString());
  console.log("fixtures: " + fixtures.length);
  console.log("");

  fixtures.forEach((fixture) => {
    let original, rewrite;
    try { original = summariseOriginal(sandbox, fixture.event); }
    catch (e) { failed++; failures.push([fixture.label, ["original engine threw: " + e.message]]); return; }
    try { rewrite = summariseRewrite(Ophis, fixture.event); }
    catch (e) { failed++; failures.push([fixture.label, ["rewrite threw: " + e.message]]); return; }

    const problems = compare(fixture.label, original, rewrite);
    if (problems.length) {
      failed++;
      failures.push([fixture.label, problems]);
      console.log("  FAIL  " + fixture.label);
    } else {
      passed++;
      const detail = original.errors.length
        ? "both refuse (" + original.errors.length + " error" + (original.errors.length === 1 ? "" : "s") + ")"
        : original.total + " Z-Dates, " + original.sorted.length + " after filters";
      if (!QUIET_OK) console.log("  ok    " + fixture.label + "  —  " + detail);
      if (VERBOSE && !original.errors.length) {
        original.sorted.slice(0, 5).forEach((key) => {
          const z = original.zStructs[key];
          console.log("          " + z.readable + "  score " + z.score + "  hits " + z.hits + "  msrf [" + z.msrf + "]");
        });
      }
    }
  });

  /* Known divergences: assert they are real, and fully explained by the one
     operation each names. */
  divergences.forEach((fixture) => {
    const problems = [];

    const errors = [];
    const compiledByOriginal = sandbox.validateOperationString(fixture.operation, 0, [], errors);
    const originalAccepts = compiledByOriginal !== sandbox.DEFAULT_OPERATION_FUNCTION;
    const rewriteAccepts = Ophis.Expr.compile(fixture.operation).ok;

    if (originalAccepts) problems.push("the original now accepts " + fixture.operation + " — the divergence is gone");
    if (!rewriteAccepts) problems.push("the rewrite now rejects " + fixture.operation);

    // With the offending operation removed, the engines must agree exactly.
    const trimmed = JSON.parse(JSON.stringify(fixture.event));
    trimmed.operations = trimmed.operations.filter((op) => op.equation !== fixture.operation);
    const agree = compare(fixture.label, summariseOriginal(sandbox, trimmed), summariseRewrite(Ophis, trimmed));
    agree.forEach((problem) => problems.push("without the operation the engines still differ: " + problem));

    if (problems.length) {
      failed++;
      failures.push([fixture.label + " (known divergence)", problems]);
      console.log("  FAIL  " + fixture.label + " (known divergence)");
    } else {
      passed++;
      console.log("  ok    " + fixture.label + "  —  known divergence, rewrite accepts, rest identical");
      if (VERBOSE) console.log("          " + fixture.note);
    }
  });

  console.log("");
  if (failures.length) {
    console.log("--- mismatches ---");
    failures.forEach(([label, problems]) => {
      console.log("\n" + label);
      problems.slice(0, 20).forEach((problem) => console.log("   · " + problem));
      if (problems.length > 20) console.log("   · … " + (problems.length - 20) + " more");
    });
    console.log("");
  }
  console.log(passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();

module.exports = { loadOriginalEngine, loadRewrite, baseEvent, dates, NOW_MILLIS };
