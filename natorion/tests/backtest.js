#!/usr/bin/env node
/* The backtest and cycle echoes (js/engine/backtest.js), including the check
   that matters most: on dates that are pure noise, the backtest must call
   "above chance" no more often than a fair test allows.
     node natorion/tests/backtest.js [series=300] */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, "..");
["js/vendor/astronomy.min.js", "js/vendor/tz-lookup.js", "js/data/eclipses.js", "js/data/places.js", "js/engine/core.js", "js/engine/expr.js",
 "js/engine/time.js", "js/engine/sky.js", "js/engine/engine.js", "js/engine/oph.js", "js/engine/backtest.js"]
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC, B = NC.backtest, S = B.stats, DAY = 86400000;
const SERIES = +process.argv[2] || 300;

let pass = 0, fail = 0;
function check(name, ok, detail) { ok ? pass++ : fail++; console.log((ok ? "  ok   " : "  FAIL ") + name + (detail ? "  · " + detail : "")); }
const approx = (a, b, e) => Math.abs(a - b) <= e;
const fmt = ms => { const d = new Date(ms); return String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + String(d.getUTCDate()).padStart(2, "0") + "/" + d.getUTCFullYear(); };
function eventOf(msList) { const ev = NC.oph.newEvent("t"); ev.x_dates = msList.map(ms => ({ date: fmt(ms), time: "00:00", enabled: true })); return ev; }
let s = 138; const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

console.log("statistics");
check("Metonic is 235 synodic months", approx(B.CYCLES[0].days, 6939.688, 0.01), B.CYCLES[0].days.toFixed(3) + " days");
check("138-year cycle is 138 tropical years", approx(B.CYCLES[1].days, 50403.42, 0.05));
check("binomial tail (n=10, p=.5, ≥8) = 56/1024", approx(S.tailProbability(new Array(10).fill(0.5), 8), 56 / 1024, 1e-12));
check("Poisson-binomial tail (0.1, 0.5, 0.9, ≥2)", approx(S.tailProbability([0.1, 0.5, 0.9], 2), 0.1*0.5 + 0.1*0.9 + 0.5*0.9 - 2*0.1*0.5*0.9, 1e-12));
check("no underflow at 20,000 trials", (h => h > 0.5 && h < 0.51)(S.binomialTail(20000, 0.5, 10000)));

console.log("backtest");
const base = Date.UTC(2020, 0, 1);
const steady = eventOf([0, 47, 94, 141, 188, 235].map(d => base + d * DAY));
const bt = B.run([steady]);
check("one step per predictable anchor (6 anchors → 4 steps)", bt.steps.length === 4, bt.steps.length + " steps");
check("every step ran", bt.steps.every(st => !st.error));
check("an evenly spaced series is hit every step (X2 + Y lands on the next)", bt.steps.every(st => st.hit), bt.steps.map(st => st.best ? "rank " + st.best.rank : "miss").join(", "));
check("…and at the default exact-day match its hits beat chance", bt.summary.any.observed > bt.summary.any.expected && bt.summary.any.pValue < 0.05,
  bt.summary.any.observed + " of " + bt.summary.any.trials + ", " + bt.summary.any.expected.toFixed(2) + " expected, p = " + bt.summary.any.pValue.toFixed(4));
const loose = B.run([steady], { tolerance: 1 }).summary.any;
check("at ±1 day the same 4 of 4 is within chance: 36 formulas cover most nearby days", loose.observed === 4 && loose.pValue > 0.05, loose.expected.toFixed(2) + " expected, p = " + loose.pValue.toFixed(3));
check("chance per step is a share between 0 and 1", bt.steps.every(st => st.chanceHit >= 0 && st.chanceHit <= 1 && st.chanceTop <= st.chanceHit + 1e-12));

const far = eventOf([base, base + 40 * DAY, base + 90 * DAY, base + 4000 * DAY]);
const lastStep = B.run([far]).steps.pop();
check("a target past the 2559-day filter is flagged and not scored", lastStep.inWindow === false && lastStep.outside === "beyond-filter");

// Noise: each gap drawn afresh, so there is nothing to find. A fair test calls
// "above chance" (p < 0.05) about one time in twenty.
for (const tolerance of [0, 1]) {
let above = 0, obs = 0, exp = 0, scored = 0; s = 138;
for (let i = 0; i < SERIES; i++) {
  let t = Date.UTC(1990 + Math.floor(rand() * 30), 0, 1); const ms = [t];
  for (let k = 0; k < 6; k++) { t += Math.round(20 + rand() * 600) * DAY; ms.push(t); }
  const r = B.run([eventOf(ms)], { tolerance }).summary.any;
  if (r.trials && r.pValue < 0.05 && r.observed > r.expected) above++;
  obs += r.observed; exp += r.expected; scored += r.trials;
}
console.log("      ±" + tolerance + " day · " + SERIES + " noise series: " + scored + " scored steps, " + obs + " hits, " + exp.toFixed(1) + " expected by chance");
check("noise is called above chance no more often than a fair test allows (≤ 10%)", above / SERIES <= 0.10, above + " of " + SERIES);
check("noise hits match the chance figure (observed / expected within 0.75–1.3)", exp > 0 && obs / exp >= 0.75 && obs / exp <= 1.3, (obs / exp).toFixed(2));
}

console.log("cycle echoes");
const x1 = Date.UTC(2000, 5, 1), met = Math.round(B.CYCLES[0].days);
const fake = { byDate: [{ start: x1 + met * DAY, score: 1, hits: 1 }, { start: x1 + (met + 40) * DAY, score: 1, hits: 1 }] };
const ech = B.echoes(eventOf([x1, x1 + 100 * DAY]), fake);
check("a date one Metonic cycle after an anchor is an echo (k = 1)", ech.list.length === 1 && ech.list[0].echoes[0].k === 1 && ech.list[0].echoes[0].cycle === "metonic");
check("a date 40 days later is not", ech.list.every(e => e.z.start !== x1 + (met + 40) * DAY));
const pairEv = eventOf([x1, x1 + met * DAY, x1 + 2 * met * DAY]);
const pr = B.echoes(pairEv, { byDate: [] });
check("anchors a whole cycle apart are found as pairs", pr.pairs.length >= 2, pr.pairs.map(p => "X" + (p.older + 1) + "→X" + (p.newer + 1) + " ×" + p.k).join(", "));
const short = B.echoes(steady, NC.engine.run(steady, { nowMs: base + 235 * DAY }));
check("a 19-year echo is impossible across a short span, and none is claimed", short.reach[0].possible === false && short.list.every(e => e.echoes.every(x => x.cycle !== "metonic")));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
