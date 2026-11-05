#!/usr/bin/env node
/* Do the MSRF tiers help? A backtest.
     node natorion/tests/backtest-tiers.js [windows=150] [shuffles=200] [seed=138]

   For each window of real events (solar eclipses, lunar eclipses) we give the
   v12 engine four consecutive dates as X-Dates, stand on the last one, and
   ask where the NEXT real event lands in the ranked Z-Dates (a hit is a Z-Date
   within ±1 day). The same Z-Dates are ranked four ways:

     v12         the engine's own score (all 36 operations, v8+ scoring)
     tier-max    v12 score × (1 + best tier dimensions / 8)
     tier-sum    v12 score + the summed dimensions of every tiered match
     apex-first  Tier VII matches first, then v12 score

   Control 1 — scrambled tiers: the same tier sizes, but numbers dealt to tiers
   at random, many times over. If the real tiers carry information, ranking
   with them should beat ranking with scrambled ones.
   Control 2 — random events: dates with no structure at all, same spacing
   range. Whatever "hits" show up there are what chance alone gives.

   Measures: hit@10 (next event in the top ten) and MRR (mean of 1/rank; a
   miss counts 0). */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, "..");
["js/vendor/astronomy.min.js", "js/vendor/tz-lookup.js", "js/data/eclipses.js", "js/data/places.js", "js/engine/core.js", "js/engine/expr.js",
 "js/engine/time.js", "js/engine/sky.js", "js/engine/engine.js", "js/engine/oph.js", "js/engine/formulas.js"]
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC, C = NC.C, F = NC.formulas, DAY = 86400000;

const WINDOWS = +process.argv[2] || 150, SHUFFLES = +process.argv[3] || 200, SEED = +process.argv[4] || 138;
const K = 4, TOP = 10, TOL = 1;

let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

/* ---------------------------------------------------------------- data -- */
const midnight = ms => Math.floor(ms / DAY) * DAY;
function eclipseDays(body) {
  const D = NC.ECLIPSE_DATA[body];
  return D.s.split(",").map(b => midnight(parseInt(b, 36) * 1000)).filter(ms => ms >= Date.UTC(1900, 0, 1) && ms < Date.UTC(2100, 0, 1));
}
function randomDays(n) {
  // Gaps drawn uniformly from 20–400 days: no cycle, no structure.
  const out = [Date.UTC(1950, 0, 1)];
  while (out.length < n) out.push(out[out.length - 1] + Math.round(20 + rand() * 380) * DAY);
  return out;
}
const fmt = ms => { const d = new Date(ms); return String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + String(d.getUTCDate()).padStart(2, "0") + "/" + d.getUTCFullYear(); };

/* ------------------------------------------------------- run the engine -- */
function cases(days, n) {
  const out = [], step = Math.max(1, Math.floor((days.length - K - 1) / n));
  for (let i = 0; i + K < days.length && out.length < n; i += step) {
    const xs = days.slice(i, i + K), target = days[i + K];
    const ev = NC.oph.newEvent("bt");
    ev.x_dates = xs.map(ms => ({ date: fmt(ms), time: "00:00", enabled: true }));
    const res = NC.engine.run(ev, { nowMs: xs[K - 1] });
    if (res.errors.length) continue;
    // Keep only what the ranking needs: score, and each MSRF match's number.
    out.push({ target, zs: res.byDate.map(t => ({ start: t.start, score: t.score, nums: t.msrf.map(m => m.number) })) });
  }
  return out;
}

/* ------------------------------------------------------------- ranking -- */
function makeTierFn(map) { return n => map.get(n) || null; }
const REAL = makeTierFn(new Map(F.MSRF_TIERS.flatMap(t => t.numbers.map(n => [n, t])))); // last tier wins, as in formulas.js

function shuffledTierFn() {
  const pool = [...new Set(F.MSRF_TIERS.flatMap(t => t.numbers))];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const map = new Map(); let k = 0;
  F.MSRF_TIERS.forEach(t => { const size = new Set(t.numbers).size; for (let q = 0; q < size && k < pool.length; q++) map.set(pool[k++], t); });
  return makeTierFn(map);
}

const RANKERS = {
  "v12":        () => z => z.score,
  "tier-max":   tf => z => z.score * (1 + Math.max(0, ...z.nums.map(n => (tf(n) || { dims: 0 }).dims)) / 8),
  "tier-sum":   tf => z => z.score + z.nums.reduce((a, n) => a + ((tf(n) || { dims: 0 }).dims), 0),
  "apex-first": tf => z => (z.nums.some(n => { const t = tf(n); return t && t.apex; }) ? 1e6 : 0) + z.score
};

function evaluate(caseList, key) {
  // Ties broken by date, earliest first — the same for every ranker.
  let hits = 0, rr = 0;
  caseList.forEach(c => {
    const ranked = c.zs.map(z => ({ z, k: key(z) })).sort((a, b) => b.k - a.k || a.z.start - b.z.start);
    const pos = ranked.findIndex(r => Math.abs(r.z.start - c.target) <= TOL * DAY);
    if (pos >= 0) { rr += 1 / (pos + 1); if (pos < TOP) hits++; }
  });
  return { hit10: hits / caseList.length, mrr: rr / caseList.length };
}
// Random ranking of the same candidates, averaged: the floor every method must beat.
function evaluateRandom(caseList, reps) {
  let h = 0, m = 0;
  for (let r = 0; r < reps; r++) { const e = evaluate(caseList, () => rand()); h += e.hit10; m += e.mrr; }
  return { hit10: h / reps, mrr: m / reps };
}
const coverage = caseList => caseList.filter(c => c.zs.some(z => Math.abs(z.start - c.target) <= TOL * DAY)).length / caseList.length;

/* -------------------------------------------------------------- report -- */
const pct = v => (100 * v).toFixed(1).padStart(5) + "%";
const f3 = v => v.toFixed(3);
const t0 = Date.now();
const DATASETS = [
  ["Solar eclipses 1900–2100", eclipseDays("solar")],
  ["Lunar eclipses 1900–2100", eclipseDays("lunar")],
  ["Random dates (control)", randomDays(WINDOWS + K + 1)]
];
const summary = [];
DATASETS.forEach(([name, days]) => {
  const cs = cases(days, WINDOWS);
  console.log("\n" + name + " — " + cs.length + " windows, " + Math.round(cs.reduce((a, c) => a + c.zs.length, 0) / cs.length) + " Z-Dates each on average");
  console.log("  next event is among the Z-Dates at all: " + pct(coverage(cs)));
  const rnd = evaluateRandom(cs, 20);
  console.log("  " + "random order".padEnd(12) + "  hit@10 " + pct(rnd.hit10) + "   MRR " + f3(rnd.mrr));
  const row = { name, windows: cs.length, coverage: coverage(cs), random: rnd };
  Object.keys(RANKERS).forEach(rk => {
    const real = evaluate(cs, RANKERS[rk](REAL));
    let line = "  " + rk.padEnd(12) + "  hit@10 " + pct(real.hit10) + "   MRR " + f3(real.mrr);
    if (rk !== "v12") {
      // Scrambled-tier control: how often does a random tier assignment do at least as well?
      let geq = 0, sumM = 0;
      for (let i = 0; i < SHUFFLES; i++) { const e = evaluate(cs, RANKERS[rk](shuffledTierFn())); sumM += e.mrr; if (e.mrr >= real.mrr) geq++; }
      const p = (geq + 1) / (SHUFFLES + 1);
      line += "   scrambled-tier MRR " + f3(sumM / SHUFFLES) + "   p = " + p.toFixed(3);
      real.scrambledMrr = sumM / SHUFFLES; real.p = p;
    }
    row[rk] = real;
    console.log(line);
  });
  summary.push(row);
});
console.log("\nWindows of " + K + " X-Dates; hit = within ±" + TOL + " day; " + SHUFFLES + " scrambled-tier runs; seed " + SEED + "; " + ((Date.now() - t0) / 1000).toFixed(1) + " s.");
console.log("p is the share of scrambled-tier runs whose MRR matched or beat the real tiers. Small p (under 0.05) would mean the tiers carry information here; p near 0.5 means they rank no better than tiers dealt at random.");
if (process.env.BT_JSON) fs.writeFileSync(process.env.BT_JSON, JSON.stringify(summary, null, 1));
