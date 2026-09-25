#!/usr/bin/env node
/* Mutation test of tests/browser.js: does the browser test FAIL when the app
   is broken? Each mutant below is one deliberate break, applied by exact
   text replacement to a scratch copy of the app (the replacement must match
   exactly once, so a mutant can never silently do nothing). browser.js then
   runs against the copy and must exit non-zero.

     node natorion/tests/mutants.js            # all mutants, four at a time
     node natorion/tests/mutants.js csv-       # only mutants whose id contains "csv-"

   A mutant that survives means the test has a blind spot — or the mutant is
   equivalent (the change makes no observable difference). Needs Playwright,
   like browser.js. */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), { spawn } = require("child_process");
const APP = path.resolve(__dirname, "..");
const only = process.argv[2] || "";

// [id, file under natorion/, exact text to find once, replacement]
const MUTANTS = [
  ["append-flatten", "js/ui/dom.js", "if (Array.isArray(c)) { append(node, c); return; }", ""],
  ["parser-allows-names", "js/engine/expr.js", "function isFunc(name) { return Object.prototype.hasOwnProperty.call(NC.FUNCS, name); }", "function isFunc(name) { return true; }"],
  ["score-sort-inverted", "js/engine/engine.js", 'if (kind === SORT.SCORE) { va = a.score; vb = b.score; order = "desc"; }', 'if (kind === SORT.SCORE) { va = a.score; vb = b.score; order = "asc"; }'],
  ["score-tiebreak-gone", "js/engine/engine.js", "if (sortType === SORT.SCORE && a.score === b.score) kind = a.hits === b.hits ? SORT.DATE : SORT.HIT_COUNT;", ""],
  ["search-noop", "js/ui/cipher.js", "rows = rows.filter(function (t) {", "rows = rows.filter(function (t) { return true;"],
  ["eighteen-calendars", "js/chronicon/chronicon.js", 'add("Unix", ', "void ("],
  ["no-persist", "js/ui/store.js", 'try { root.localStorage.setItem(KEY, JSON.stringify({ events: state.events, current: state.current, settings: state.settings })); emit("saved", true); }', 'try { emit("saved", true); }'],
  ["today-override-ignored", "js/ui/store.js", "if (o && /^\\d{4}-\\d{2}-\\d{2}$/.test(o)) {", "if (false && o) {"],
  ["css-overflow", "css/natorion.css", ".work > *, .rail > * { min-width: 0; }", ""],   // equivalent: other rules cover it
  ["csv-header", "js/engine/oph.js", 'var header = ["Rank",', 'var header = ["Position",'],
  ["csv-header-only", "js/engine/oph.js", "return [t.header].concat(t.rows).map(", "return [t.header].map("],
  ["oph-drops-dates", "js/engine/oph.js", "if (!opts.minify) return ev;", "ev.x_dates = []; if (!opts.minify) return ev;"],
  ["import-first-only", "js/engine/oph.js", "if (errors.length) return { events: null, errors: errors, warnings: warnings, appVersion: appVersion };", "events = events.slice(0, 1); if (errors.length) return { events: null, errors: errors, warnings: warnings, appVersion: appVersion };"],
  ["zone-utc", "js/engine/time.js", "function zoneFor(lat, lon) {", 'function zoneFor(lat, lon) { return "UTC";'],
  ["sunset-midnight", "js/engine/sky.js", "function sunsetBefore(ms, lat, lon, shared) {", "function sunsetBefore(ms, lat, lon, shared) { return Math.floor(ms / DAY) * DAY;"],
  ["msrf-never", "js/engine/core.js", "function msrfMatch(z) {", "function msrfMatch(z) { return null;"],
  ["extras-none", "js/engine/core.js", 'op("X2+Yx0.360", B, false)\n  ];', 'op("X2+Yx0.360", B, false)\n  ].slice(0, 0);'],
  ["extras-off", "js/ui/operations.js", "ops().push({ equation: x.equation, weight: x.weight, enabled: true }); added++;", "ops().push({ equation: x.equation, weight: x.weight, enabled: false }); added++;"],
  ["chart-throws", "js/ui/chart.js", 'cv.addEventListener("wheel", function (e) {', 'cv.addEventListener("wheel", function (e) { throw new Error("mutant");'],
  ["chart-no-wheel", "js/ui/chart.js", 'cv.addEventListener("wheel", function (e) {', 'cv.addEventListener("wheel_off", function (e) {'],
  ["chart-no-draw", "js/ui/chart.js", "  function draw() {\n    if (!ctx) return;", "  function draw() {\n    if (!ctx) return; if (ctx) return;"],
  ["paste-filename-style", "js/ui/cipher.js", "if (/^\\d{1,2}-\\d{1,2}-\\d{2}(-\\d{1,2}-\\d{1,2}-\\d{2})+$/.test(", "if (false && /^\\d{1,2}-\\d{1,2}-\\d{2}(-\\d{1,2}-\\d{1,2}-\\d{2})+$/.test("],
  ["drawer-no-open", "js/ui/cipher.js", 'if (!$("detailDialog").open) $("detailDialog").showModal();', ""],
  ["polar-lat-stored", "js/ui/cipher.js", 'if (!ok) { D.toast("Latitude must be within ±" + C.LAT_LIMIT + "° and longitude within ±180°.", true); return; }', 'if (!ok) { D.toast("Latitude must be within ±" + C.LAT_LIMIT + "° and longitude within ±180°.", true); }'],
  ["phoenix-residue", "js/chronicon/chronicon.js", "var PHX = { residue: 108,", "var PHX = { residue: 107,"],
  ["clocks-frozen", "js/ui/chronicon-view.js", "ticker = setInterval(tick, 1000);", "ticker = null;"],
  ["bridge-month-off", "js/ui/chronicon-view.js", "setAstro(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());", "setAstro(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());"],
  ["hash-listener-gone", "js/ui/app.js", 'root.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (SCREENS.indexOf(h) >= 0) go(h, true); });', ""],
  ["select-noop", "js/ui/app.js", "S.select(parseInt(this.value, 10));", "S.scheduleRun(true);"],
  ["msrf-sets-empty", "js/ui/app.js", 'D.fill($("msrfSets"), [p("Vortex, within 0.1", C.MSRF_VORTEX), p("Important", C.MSRF_IMPORTANT), p("Normal", C.MSRF_NORMAL)]);', 'D.fill($("msrfSets"), [p("Vortex, within 0.1", []), p("Important", []), p("Normal", [])]);']
];

const base = fs.mkdtempSync(path.join(os.tmpdir(), "natorion-mutants-"));
function copyApp(dir) {
  fs.cpSync(APP, dir, { recursive: true, filter: p => !/node_modules|[\\/]tests[\\/]|[\\/]docs[\\/]/.test(p) || /[\\/]tests[\\/]?$/.test(p) });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.cpSync(path.join(APP, "tests", "browser.js"), path.join(dir, "tests", "browser.js"));
  fs.cpSync(path.join(APP, "tests", "fixtures"), path.join(dir, "tests", "fixtures"), { recursive: true });
}
function prep([id, file, from, to]) {
  const dir = path.join(base, id);
  copyApp(dir);
  const f = path.join(dir, file), src = fs.readFileSync(f, "utf8"), n = src.split(from).length - 1;
  if (n !== 1) return { id, applied: false, why: "pattern found " + n + " times" };
  fs.writeFileSync(f, src.replace(from, to));
  return { id, applied: true, dir };
}
function run(m) {
  return new Promise(res => {
    if (!m.applied) return res(m);
    const p = spawn(process.execPath, [path.join(m.dir, "tests", "browser.js")], { env: Object.assign({}, process.env, { NODE_PATH: path.join(APP, "node_modules") }) });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => res(Object.assign(m, { code, fails: (out.match(/^  FAIL .*/mg) || []).map(x => x.slice(7)), crash: code && !/FAIL/.test(out) ? out.trim().split("\n").slice(-3).join(" ").slice(0, 200) : "" })));
  });
}
(async () => {
  const control = await run(prep(["control", "js/ui/dom.js", "function $(id)", "function $(id)"]));
  console.log("control (no mutation): " + (control.code === 0 ? "passes" : "FAILS — fix the app or the test before reading the rest"));
  if (control.code !== 0) { fs.rmSync(base, { recursive: true, force: true }); process.exit(2); }
  const list = MUTANTS.filter(m => m[0].includes(only)).map(prep), out = [];
  for (let i = 0; i < list.length; i += 4) out.push(...await Promise.all(list.slice(i, i + 4).map(run)));
  let caught = 0, survived = [];
  for (const r of out) {
    if (!r.applied) { console.log("??       " + r.id.padEnd(24) + " NOT APPLIED (" + r.why + ")"); continue; }
    const ok = r.code !== 0; if (ok) caught++; else survived.push(r.id);
    console.log((ok ? "caught   " : "SURVIVED ") + r.id.padEnd(24) + " exit " + r.code + "  " + (r.fails.join(" | ") || r.crash));
  }
  console.log("\n" + caught + "/" + out.length + " mutants caught" + (survived.length ? "; survived: " + survived.join(", ") : ""));
  fs.rmSync(base, { recursive: true, force: true });
  process.exit(survived.filter(id => id !== "css-overflow").length ? 1 : 0);
})();
