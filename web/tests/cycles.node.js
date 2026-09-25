#!/usr/bin/env node
/* ==========================================================================
   cycles.node.js — tests for the cycle-echo and backtest analysis layer
   --------------------------------------------------------------------------
       node web/tests/cycles.node.js
   The chance figures are checked by simulation in two ways. The arithmetic:
   dates drawn at random from the model a figure assumes must be hit as often
   as it says. And the model itself: backtests of event series whose dates are
   pure noise must come out "above chance" no more often than a fair test
   allows, with hits adding up to what the figures expect. The first kind
   cannot catch a wrong model on its own; the second is what caught one.
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
{
  // Equal probabilities take the O(n) binomial path; it must agree with the
  // exact O(n²) distribution everywhere, tails and bulk alike.
  let worst = 0, cases = 0;
  for (const n of [1, 7, 60, 400, 1500]) {
    for (const p of [1e-4, 0.004, 0.05, 0.3, 0.5, 0.93]) {
      const probs = new Array(n).fill(p), mean = Math.round(n * p);
      for (const k of [0, 1, 2, mean, mean + 3, n]) {
        worst = Math.max(worst, Math.abs(Cycles.binomialTail(n, p, k) - Cycles.poissonBinomialTail(probs, k)));
        cases++;
      }
    }
  }
  check("the O(n) binomial tail matches the exact distribution", worst < 1e-12, cases + " cases, largest difference " + worst.toExponential(1));
  check("equal probabilities are routed to it", Cycles.tailProbability(new Array(900).fill(0.01), 14) === Cycles.binomialTail(900, 0.01, 14));
  // (1/2)^20000 underflows to 0; built in logs, the tail is still right.
  const half = Cycles.binomialTail(20000, 0.5, 10000);
  check("…and does not underflow at 20,000 trials", half > 0.5 && half < 0.51, "P(X ≥ 10000 | n = 20000, p = ½) = " + half.toFixed(4));
}

console.log("\nsettings read back from storage");
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const good = { metonic: false, phoenix: true, tolerance: 3, backtestTolerance: 7, topN: 5, allEvents: true };
  check("a valid set is kept as it is", same(Cycles.sanitizeSettings(good), good));
  check("wrong types and out-of-range values fall back to the defaults",
    same(Cycles.sanitizeSettings({ metonic: "yes", phoenix: 1, tolerance: "2", backtestTolerance: 1e6, topN: "<b>x</b>", allEvents: "true" }), Cycles.DEFAULTS));
  check("a tolerance that would stall every render is refused", Cycles.sanitizeSettings({ tolerance: 1e6 }).tolerance === Cycles.DEFAULTS.tolerance);
  check("anything that is not an object falls back to the defaults",
    [null, undefined, 5, "str", [1, 2], true].every((v) => same(Cycles.sanitizeSettings(v), Cycles.DEFAULTS)));
}

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
      console.log("        X" + (st.targetIndex + 1) + " " + st.targetLabel + " from " + st.knownCount + " known: " +
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
  // The arithmetic: move the next event to random days in the control window
  // around it, and it is hit as often as the chance figure says.
  const known = ["2004-05-01", "2006-10-12", "2009-01-30", "2011-08-08"];
  const probe = Cycles.backtestEvent(eventWith(bradley, known.concat(["2012-01-01"])), { tolerance: 1 }).pop();
  check("the control window is " + Cycles.LOCAL_CONTROL_DAYS + " days either side of the event",
    probe.controlDays === 2 * Cycles.LOCAL_CONTROL_DAYS + 1, isoOfDay(probe.controlFrom) + " to " + isoOfDay(probe.controlTo));
  const next = rng(138);
  let hits = 0; const n = 150;
  for (let t = 0; t < n; t++) {
    const day = probe.controlFrom + Math.floor(next() * probe.controlDays);
    const st = Cycles.backtestEvent(eventWith(bradley, known.concat([isoOfDay(day)])), { tolerance: 1 }).pop();
    if (st.hit) hits++;
  }
  const rate = hits / n;
  const sd = Math.sqrt(probe.chanceHit * (1 - probe.chanceHit) / n);
  check("random days near the event are hit as often as the chance figure says", Math.abs(rate - probe.chanceHit) < 3 * sd + 0.01,
        "simulated " + (100 * rate).toFixed(1) + "% vs predicted " + (100 * probe.chanceHit).toFixed(1) + "%");
}

console.log("\nthe backtest against noise: is the control fair?");
{
  // The model: series of dates that are pure noise, each gap drawn afresh
  // (exponential, mean 365 days), so no formula can know the next date. A
  // fair control flags such a series "above chance" (p < 0.05) about one time
  // in twenty, and the hits add up to about what it expects. The old control,
  // a random date anywhere in the horizon, is scored on the same series to
  // show the sample is big enough to catch that kind of error.
  // Seed 1 is the first tried; seeds 1–6, 19 and 365 all give 0.96–1.14 and
  // 1.7–5% here, against 1.61–1.86 for the old control.
  const next = rng(1);
  const SERIES = 120, EVENTS = 10;
  let observed = 0, expected = 0, expectedOld = 0, above = 0, wellAbove = 0, scored = 0;
  for (let s = 0; s < SERIES; s++) {
    let day = dayOf("1975-01-01") + Math.floor(next() * 3000);
    const iso = [isoOfDay(day)];
    for (let i = 1; i < EVENTS; i++) { day += 1 + Math.floor(-Math.log(1 - next()) * 365); iso.push(isoOfDay(day)); }
    const steps = Cycles.backtestEvent(eventWith(bradley, iso), { tolerance: 1, topN: 10 });
    const sum = Cycles.summarize(steps, 10);
    observed += sum.any.observed; expected += sum.any.expected; scored += sum.any.trials;
    steps.forEach((st) => { if (!st.error && st.inWindow) expectedOld += st.chanceHitHorizon; });
    if (sum.any.verdict.level === "some" || sum.any.verdict.level === "strong") above++;
    if (sum.any.verdict.level === "strong") wellAbove++;
  }
  const ratio = observed / expected, ratioOld = observed / expectedOld;
  console.log("      " + SERIES + " series of " + EVENTS + " noise dates, ±1 day: " + scored + " scored steps, " + observed + " hits");
  check("noise is called \"above chance\" no more often than a fair test allows (≤ 10%)", above / SERIES <= 0.10,
        (100 * above / SERIES).toFixed(1) + "% above, " + (100 * wellAbove / SERIES).toFixed(1) + "% well above");
  check("hits match the chance figure (observed / expected within 0.8–1.25)", ratio >= 0.8 && ratio <= 1.25,
        observed + " / " + expected.toFixed(1) + " = " + ratio.toFixed(2));
  check("the old whole-horizon control fails on the same series", ratioOld > 1.25,
        observed + " / " + expectedOld.toFixed(1) + " = " + ratioOld.toFixed(2));
}

console.log("\na target beyond the projection horizon is shown but not scored");
{
  // The default filter hides anything more than 2559 days past the last known
  // event, so an event 20 years later could not have been projected at all.
  const e = eventWith(bradley, ["1990-01-01", "1993-05-05", "2013-05-05"]);
  const steps = Cycles.backtestEvent(e, { tolerance: 1 });
  const st = steps[steps.length - 1];
  check("the step is flagged as beyond the horizon", st.inWindow === false && st.outside === "beyond-filter", st.windowDays + "-day window");
  const s = Cycles.summarize(steps, 10);
  check("…and left out of the score", s.any.trials === 0 && s.any.expected === 0);
  // With that filter off, the reach is the furthest projection instead, and
  // the reason given must say so rather than blame the filter.
  const open = eventWith(bradley, ["2000-01-01", "2000-03-01", "2000-05-01", "2020-01-01"]);
  open.iso_event_filter_beyond_max_days = false;
  const far = Cycles.backtestEvent(open, { tolerance: 1 }).pop();
  check("with the filter off, a later event is past the furthest projection", far.inWindow === false && far.outside === "beyond-projections" && far.horizonBy === "projections",
        "reach " + far.windowDays + " days");
}

console.log("\nHH:MM scope: an event inside a projected sunset-to-sunset day");
{
  check("the sunset library is loaded", T.sunsetAvailable());
  // New York, evening events. In summer the evening is already the next UTC
  // day, which is where counting by UTC day went wrong.
  const e = JSON.parse(JSON.stringify(bradley));
  e.scope = C.EVENT_SCOPE__HH_MM; e.lat = 40.71; e.long = -74.01; e.location_enabled = true; e.t_dates = [];
  e.x_dates = [T.newXDate("03/04/2001", "21:00"), T.newXDate("07/19/2003", "21:00"), T.newXDate("02/11/2006", "21:00")];
  const last = Cycles.enabledXInstants(e).pop();
  const res = Engine.run(e, { nowInstant: last.instant });
  const key = res.z_keys_by_date.find((k) => { const m = res.z_structs[k].z_start.getUTCMonth(); return m >= 5 && m <= 7; });
  const z = res.z_structs[key];
  const evening = new Date(z.z_start.getTime() + 90 * 60000);          // 90 minutes after the opening sunset
  const asXDate = (instant) => T.newXDate(T.formatDateOnly(instant, e.lat, e.long), T.formatTimeOnly(instant, e.lat, e.long));
  const backtestTo = (xDate) => Cycles.backtestEvent(Object.assign({}, e, { x_dates: e.x_dates.concat([xDate]) }), { tolerance: 0, topN: 10 }).pop();
  const target = asXDate(evening);
  const st = backtestTo(target);
  check("the example is one that UTC days got wrong", Cycles.dayNumber(evening) !== Cycles.dayNumber(z.z_start),
        "window " + z.z_readable_start + " → " + z.z_readable_end + ", event " + target.date + " " + target.time);
  check("an event inside the projected window is a hit on the exact day", st.hit === true && st.best.off === 0,
        st.best ? "rank " + st.best.rank + " of " + st.projected + ", off " + st.best.off + "d" : "nearest off " + (st.nearest && st.nearest.off) + "d");
  check("…and the table shows the X-Date as it was entered", st.targetLabel === target.date + " " + target.time, st.targetLabel);
  const morning = T.newXDate(T.formatDateOnly(z.z_end, e.lat, e.long), "10:00");   // the next morning, before the window closes
  const st2 = backtestTo(morning);
  check("the next morning is still that day", st2.hit === true && st2.best.off === 0, morning.date + " " + morning.time);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
