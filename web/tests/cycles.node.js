#!/usr/bin/env node
/* ==========================================================================
   cycles.node.js — tests for the cycle-echo and backtest analysis layer
   --------------------------------------------------------------------------
       node web/tests/cycles.node.js
   The chance figures are not just asserted: they are checked against
   simulation, so a wrong baseline cannot pass by looking plausible.
   ========================================================================== */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const scope = {
  console, Intl, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite,
  Number, String, Array, Object, Error, RegExp, Set, Map, Boolean, Symbol, Promise,
  setTimeout, clearTimeout
};
scope.globalThis = scope;
scope.window = scope;
const ctx = vm.createContext(scope);
const load = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel });

["lib/astronomy.browser.min.js", "lib/tz_lookup_oss.js"].forEach((rel) => { try { load(rel); } catch (e) { /* optional */ } });
["web/js/ophis.constants.js", "web/js/ophis.expr.js", "web/js/ophis.time.js",
 "web/js/ophis.engine.js", "web/js/ophis.file.js", "web/js/ophis.cycles.js"].forEach(load);

const { C, Time: T, Engine, File, Cycles } = scope.Ophis;
const DAY = C.MILLIS_PER_DAY;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✓ " + name + (detail ? "  — " + detail : "")); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  — " + detail : "")); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

/* A seeded generator, so simulation results are repeatable. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function loadEvents(file) {
  const parsed = File.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  if (parsed.errors && parsed.errors.length) throw new Error(file + ": " + parsed.errors.join(" "));
  return parsed.events;
}

/** An event with day-scope X-Dates, based on a file's event for its operations and filters. */
function eventWith(base, isoDates) {
  const e = JSON.parse(JSON.stringify(base));
  e.x_dates = isoDates.map((iso) => {
    const [y, m, d] = iso.split("-");
    return T.newXDate(m + "/" + d + "/" + y, "00:00");
  });
  e.t_dates = [];
  e.scope = C.EVENT_SCOPE__DAYS;
  return e;
}
const dayOf = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const isoOfDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);

const bradley = loadEvents("test-bradley.oph")[0];

console.log("\ncycle definitions");
const met = Cycles.definition("metonic");
check("Metonic is 235 synodic months", approx(met.days, 6939.688, 0.01), met.days.toFixed(3) + " days");
check("138-year cycle is 138 tropical years", approx(Cycles.definition("phoenix").days, 50403.42, 0.05));

console.log("\nstatistics");
check("tail probability matches the binomial (n=10, p=.5, ≥8)", approx(Cycles.tailProbability(new Array(10).fill(0.5), 8), 56 / 1024, 1e-12));
check("tail probability of ≥0 is 1", Cycles.tailProbability([0.2, 0.3], 0) === 1);
check("a Poisson-binomial tail (0.1, 0.5, 0.9, ≥2)", approx(Cycles.tailProbability([0.1, 0.5, 0.9], 2), 0.1*0.5 + 0.1*0.9 + 0.5*0.9 - 2*0.1*0.5*0.9, 1e-12));

console.log("\ncycle echoes on your own file");
{
  const results = Engine.run(bradley, { nowInstant: new Date(Date.UTC(2026, 8, 25)) });
  const a = Cycles.analyze(bradley, results, Cycles.DEFAULTS);
  check("test-bradley.oph runs clean", results.errors.length === 0, results.z_keys_by_date.length + " Z-Dates");
  const r = a.reach.find((x) => x.cycle === "metonic");
  check("a 19-year echo is reported as impossible across a 7-year span", r.possible === false, r.spanYears.toFixed(1) + " years on screen");
  check("so no Metonic echoes are claimed", a.list.every((i) => i.echoes.every((e) => e.cycle !== "metonic")));
}

console.log("\na known Metonic echo");
{
  // 1969-07-20 plus exactly one Metonic cycle.
  const x = dayOf("1969-07-20");
  const echoDay = Math.round(x + met.days);
  const e = eventWith(bradley, ["1969-07-20", "1978-03-01", "1983-11-11"]);
  const fake = { z_keys_by_date: ["z1", "z2"], z_structs: {
    z1: { z_start: new Date(echoDay * DAY) },
    z2: { z_start: new Date((echoDay + 40) * DAY) }
  } };
  const a = Cycles.analyze(e, fake, { metonic: true, phoenix: false, tolerance: 2 });
  const hit = a.byKey.z1 && a.byKey.z1[0];
  check("a date one Metonic cycle after an X-Date is found", !!hit, hit ? isoOfDay(echoDay) + " = X1 + 1 cycle, off " + hit.r.toFixed(2) + "d" : "");
  check("…with k = 1", hit && hit.k === 1);
  check("…under the same Moon", hit && hit.sameMoon === true);
  check("a date 40 days later is not an echo", !a.byKey.z2);
}

console.log("\nX-Dates that are themselves a cycle apart");
{
  const x1 = "1988-03-18";
  const x2 = isoOfDay(Math.round(dayOf(x1) + met.days));
  const x3 = isoOfDay(Math.round(dayOf(x1) + 2 * met.days) + 1);
  const e = eventWith(bradley, [x1, "1999-01-01", x2, x3]);
  const a = Cycles.analyze(e, { z_keys_by_date: [], z_structs: {} }, { metonic: true, phoenix: false, tolerance: 2 });
  check("two Metonic-linked pairs found", a.pairs.length >= 2, a.pairs.map((p) => "X" + (p.older + 1) + "→X" + (p.newer + 1) + " ×" + p.k).join(", "));
  check("the pair baseline is small", a.pairSummary && a.pairSummary.expected < 0.01, a.pairSummary && a.pairSummary.expected.toFixed(5) + " expected");
}

console.log("\nthe chance baseline, checked by simulation");
{
  const e = eventWith(bradley, ["1970-01-10", "1981-06-02", "1994-09-30", "2001-02-14"]);
  const from = dayOf("2010-01-01"), to = dayOf("2045-12-31");
  const next = rng(19);
  const trials = 1500, n = 100;
  let observedSum = 0, expectedSum = 0;
  for (let t = 0; t < trials; t++) {
    const keys = [], structs = {};
    for (let i = 0; i < n; i++) {
      const day = from + Math.floor(next() * (to - from + 1));
      keys.push("k" + i); structs["k" + i] = { z_start: new Date(day * DAY) };
    }
    // Two pinned dates fix the span so every trial is measured over the same
    // window; they are not random, so they are taken back out of both counts.
    keys.push("lo"); structs.lo = { z_start: new Date(from * DAY) };
    keys.push("hi"); structs.hi = { z_start: new Date(to * DAY) };
    const a = Cycles.analyze(e, { z_keys_by_date: keys, z_structs: structs }, { metonic: true, phoenix: true, tolerance: 2 });
    observedSum += a.summary.observed - (a.byKey.lo ? 1 : 0) - (a.byKey.hi ? 1 : 0);
    expectedSum += a.summary.chancePerDate * n;
  }
  const obs = observedSum / trials, exp = expectedSum / trials;
  const sd = Math.sqrt(exp / trials);           // rare events: Poisson spread of the mean
  check("random dates echo as often as the baseline says", Math.abs(obs - exp) < 3 * sd,
        "simulated " + obs.toFixed(3) + " vs predicted " + exp.toFixed(3) + " per " + n + " random dates (3σ = " + (3 * sd).toFixed(3) + ")");
}

console.log("\nthe backtest on your files");
{
  const files = ["test-bradley.oph", "test-file-bradley-rogue-dates.oph", "7-4-26-8-20-26-3-9-27-3-16-27-8-19-27-4-1-28.oph"];
  files.forEach((file) => {
    const events = loadEvents(file);
    const bt = Cycles.backtest(events, { tolerance: 1, topN: 10 });
    const s = bt.summary;
    const expectedSteps = events.reduce((n, ev) => n + Math.max(0, Cycles.enabledXInstants(ev).length - C.MINIMUM_NUMBER_OF_X_DATES), 0);
    check(file + ": one step per predictable event", bt.steps.length === expectedSteps, bt.steps.length + " steps");
    check(file + ": every step ran", bt.steps.every((st) => !st.error), bt.steps.filter((st) => st.error).map((st) => st.error).join("; "));
    console.log("      hit ±1d: " + s.any.observed + " of " + s.any.trials + " (chance " + s.any.expected.toFixed(2) + ", p=" + s.any.pValue.toFixed(3) + ")  ·  top-10: " +
                s.top.observed + " (chance " + s.top.expected.toFixed(2) + ")  →  " + s.any.verdict.text);
    bt.steps.forEach((st) => {
      if (st.error) return;
      console.log("        X" + (st.targetIndex + 1) + " " + st.targetInstant.toISOString().slice(0, 10) + " from " + st.knownCount + " known: " +
        (st.hit ? "HIT rank " + st.best.rank + "/" + st.projected + " (off " + st.best.off + "d)" : "miss, nearest off " + (st.nearest ? st.nearest.off + "d" : "—")) +
        "  · chance " + (100 * st.chanceHit).toFixed(1) + "%" + (st.inWindow ? "" : "  · target outside the window"));
    });
  });
}

console.log("\nthe backtest recognises a real hit");
{
  // Cast from three dates, take the top-scoring projection as the "next event",
  // and the backtest must report it as a hit at rank 1.
  const known = ["2001-03-04", "2003-07-19", "2006-02-11"];
  const e = eventWith(bradley, known);
  const res = Engine.run(e, { nowInstant: new Date(dayOf(known[2]) * DAY) });
  const ranked = Engine.sortZDates(res.z_keys_by_date, res.z_structs, C.Z_DATE_SORT_TYPE__SCORE, Engine.scoringSystem(e));
  const topIso = isoOfDay(Math.floor(res.z_structs[ranked[0]].z_start.getTime() / DAY));
  const bt = Cycles.backtestEvent(eventWith(bradley, known.concat([topIso])), { tolerance: 0, topN: 10 });
  const last = bt[bt.length - 1];
  check("the planted event is a hit", last.hit === true, topIso);
  check("…at rank 1", last.best && last.best.rank === 1);
}

console.log("\nthe backtest's chance figure, checked by simulation");
{
  const known = ["2004-05-01", "2006-10-12", "2009-01-30", "2011-08-08"];
  const e = eventWith(bradley, known);
  const probe = Cycles.backtestEvent(eventWith(bradley, known.concat(["2012-01-01"])), { tolerance: 1 }).pop();
  const next = rng(138);
  let hits = 0; const n = 150;
  for (let t = 0; t < n; t++) {
    const day = probe.windowFrom + Math.floor(next() * probe.windowDays);
    const st = Cycles.backtestEvent(eventWith(bradley, known.concat([isoOfDay(day)])), { tolerance: 1 }).pop();
    if (st.hit) hits++;
  }
  const rate = hits / n;
  const sd = Math.sqrt(probe.chanceHit * (1 - probe.chanceHit) / n);
  check("random targets hit as often as the chance figure says", Math.abs(rate - probe.chanceHit) < 3 * sd + 0.01,
        "simulated " + (100 * rate).toFixed(1) + "% vs predicted " + (100 * probe.chanceHit).toFixed(1) + "%");
}

console.log("\na target beyond the projection horizon is shown but not scored");
{
  // The default filter hides anything more than 2559 days past the last known
  // event, so an event 20 years later could not have been projected at all.
  const e = eventWith(bradley, ["1990-01-01", "1993-05-05", "2013-05-05"]);
  const steps = Cycles.backtestEvent(e, { tolerance: 1 });
  const st = steps[steps.length - 1];
  check("the step is flagged as beyond the horizon", st.inWindow === false, st.windowDays + "-day window");
  const s = Cycles.summarize(steps, 10);
  check("…and left out of the score", s.any.trials === 0 && s.any.expected === 0);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
