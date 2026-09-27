#!/usr/bin/env node
/* Self-contained checks of the NATORION engine — no original source needed.
     node natorion/tests/self-check.js */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, "..");
["js/vendor/astronomy.min.js", "js/vendor/tz-lookup.js", "js/data/eclipses.js", "js/data/places.js", "js/engine/core.js", "js/engine/expr.js", "js/engine/time.js",
 "js/engine/sky.js", "js/engine/engine.js", "js/engine/oph.js", "js/chronicon/chronicon.js", "js/studio/studio.js"].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC, C = NC.C;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
}
const z = (eq, Y) => { const c = NC.expr.compileOperation(eq, 0, []); return c.fn ? NC.round2(c.fn(Y)) : c.errors[0]; };

console.log("equations");
check("x means multiply, constants substitute", z("X2+YxOPH_PHI", 100), 161.8);
check("oph_flip reverses digits", z("X2+oph_flip(oph_round(Y))", 138), 831);
check("oph_flip keeps the decimal point's index", NC.FUNCS.oph_flip(123.4), 432.1);
check("^ is power", z("X1+Y^2", 19), 361);
check("code is refused", /Unknown name 'alert'/.test(z("X1+alert(1)", 1)), true);
check("prototype names are refused", /Unknown name/.test(z("X1+constructor(Y)", 1)), true);
check("must start X1+ or X2+", z("Y*2", 1), "Must start with 'X1 + …' or 'X2 + …'.");
check("must be positive at Y=10", z("X1+Y-20", 1), "Z-value must resolve to a number > 0.");
check("duplicates are caught", NC.expr.compileOperation("X2 + Y x OPH_PHI", 1, [{ equation: "X2+YxOPH_PHI" }]).errors[0], "Identical to Operation 1; each Operation must be unique.");
check("sixteen defaults, all on", [C.DEFAULT_OPERATIONS.length, C.DEFAULT_OPERATIONS.every(o => o.enabled)], [16, true]);

console.log("MSRF");
const m = v => { const r = NC.msrfMatch(v); return r ? r.cls.key + ":" + r.number : null; };
check("vortex within 0.1", m(21.6), "vortex:21.7");
check("important by rounding", m(1655.6), "important:1656");
check("normal", m(138), "normal:138");
check("exact .5 matches nothing", m(137.5), null);

console.log("dates");
check("MM/DD/YYYY", NC.time.parseDate("07/04/2026"), { y: 2026, m: 7, d: 4 });
check("no 30 February", NC.time.parseDate("02/30/2026"), null);
check("leap day 2028", !!NC.time.parseDate("02/29/2028"), true);
check("Chicago wall time to UTC", new Date(NC.time.zonedToUtc(2026, 7, 4, 12, 0, "America/Chicago")).toISOString(), "2026-07-04T17:00:00.000Z");
check("zone of Giza", NC.time.zoneFor(29.98, 31.13), "Africa/Cairo");

console.log("engine");
const ev = NC.oph.newEvent("t");
ev.x_dates = ["07/04/2026", "08/20/2026", "03/09/2027"].map(d => ({ date: d, time: "00:00", enabled: true }));
ev.iso_event_filter_before_current_date = false;
const res = NC.engine.run(ev, { nowMs: Date.UTC(2026, 8, 23) });
check("three pairs, no errors", [res.errors.length, res.ys.map(y => y.Y)], [0, [47, 248, 201]]);
check("scores are sorted by date", res.sorted.every((t, i, a) => !i || a[i - 1].start < t.start), true);
const best = res.zs.slice().sort((a, b) => b.score - a.score)[0];
check("a score is (points) x multiplier", NC.round2((best.opScore + NC.engine.msrfSubscore(best.msrf, res.system)) * best.multiplier), best.score);
check("one X-Date is an error", NC.engine.run(Object.assign({}, ev, { x_dates: ev.x_dates.slice(0, 1) })).errors, ["At least 2 X-Dates are required."]);

console.log("documents");
const text = NC.oph.serialize([ev], { minify: true });
const back = NC.oph.parse(text);
check("minified save round-trips", [back.errors.length, back.events[0].x_dates.length, back.events[0].operations.length], [0, 3, 16]);
check("strict mode rejects a bad latitude", NC.oph.parse(JSON.stringify({ iso_events: [{ scope: "EVENT_SCOPE__HH_MM", lat: 88, long: 0, x_dates: [] }] }), C.VALIDATION.STRICT).events, null);
check("loose mode repairs it", NC.oph.parse(JSON.stringify({ iso_events: [{ scope: "EVENT_SCOPE__HH_MM", lat: 88, long: 0, x_dates: [] }] })).events[0].lat, C.DEFAULT_LAT);
check("CSV cells cannot start a formula", NC.oph.csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");

console.log("chronicon");
check("nineteen calendars", NC.chron.calendars(2026, 9, 23).length, 19);
check("2040 is a Phoenix node", NC.chron.cycles(2040).phoenix.into, 0);
check("AM of 2026", NC.chron.cycles(2026).am, 5920);
check("JDN of 2000-01-01", NC.chron.jdn(2000, 1, 1), 2451545);
check("palindromic date 02/02/2020", NC.chron.resonance(Date.UTC(2020, 1, 2), Date.UTC(2020, 0, 1)).palindrome, true);
check("full moon of 2026-09-26", new Date(NC.sky.moonPhasesBetween(Date.UTC(2026, 8, 20), Date.UTC(2026, 9, 1), [NC.sky.PHASES[4]])[0].ms).toISOString().slice(0, 10), "2026-09-26");
check("total solar eclipse 2027-08-02 is in the table", NC.sky.eclipses().solar.some(e => e.total && new Date(e.ms).toISOString().slice(0, 10) === "2027-08-02"), true);

console.log("studio");
const NOW = Date.UTC(2026, 8, 23, 12);
const six = NC.oph.newEvent("Six anchors");
six.x_dates = ["07/04/2026", "08/20/2026", "03/09/2027", "03/16/2027", "08/19/2027", "04/01/2028"].map(d => ({ date: d, time: "00:00", enabled: true }));
const sixRes = NC.engine.run(six, { nowMs: NOW }), plan = NC.studio.build(six, sixRes, { length: 10 });
check("a 10-minute cut meets the brief: 1,600–1,750 words, 65–80 paragraphs of 15–40 words, three etymologies, three today anchors, the CTA, the tag on every image, no shot twice running, no banned phrase", plan.checks.ok || plan.checks, true);
check("the hook drops into the first date and plants the strongest day within three paragraphs", (plan.script[0].text.includes("4 July 2026") && plan.script.slice(0, 3).some(p => p.text.includes(plan.star.date))) || plan.script.slice(0, 3).map(p => p.text), true);
check("one image per paragraph, in batches of five", [plan.images === plan.paragraphs, plan.clips === plan.paragraphs, plan.batches === Math.ceil(plan.paragraphs / 5)], [true, true, true]);
check("an image carries the chronicler's whole look card wherever she appears", plan.imagePrompts.filter(im => im.prompt.includes("THE CHRONICLER")).every(im => im.prompt.includes(plan.cast[0].card)), true);
check("the look cards keep the brief's defining features", plan.cast.every(c => /oversized/.test(c.card) && /rosy pink/.test(c.card) && /dot eyes/.test(c.card)), true);
check("the last clip returns to the first frame", /resolves back to the opening image of clip 1/.test(plan.clipPrompts[plan.clipPrompts.length - 1].prompt), true);
check("the same event gives the same package", NC.studio.toMarkdown(NC.studio.build(six, sixRes, { length: 10 })) === NC.studio.toMarkdown(plan), true);
check("a variation changes the words, not the numbers", (() => { const v = NC.studio.build(six, sixRes, { length: 10, variation: 7 }); return [v.star.date === plan.star.date, v.script.map(p => p.text).join() !== plan.script.map(p => p.text).join()]; })(), [true, true]);
check("all three lengths meet the brief for the demo, a sunset-scope copy and a two-date copy", (() => {
  const hh = Object.assign({}, six, { scope: C.SCOPE.HH_MM, lat: 29.98, long: 31.13, location_enabled: true });
  const two = Object.assign({}, six, { x_dates: six.x_dates.slice(0, 2) });
  const bad = [];
  [["days", six], ["sunset", hh], ["two", two]].forEach(([l, e]) => [5, 10, 15].forEach(L => { const p = NC.studio.build(e, NC.engine.run(e, { nowMs: NOW }), { length: L }); if (!p || !p.checks.ok) bad.push(l + " " + L + (p ? " " + JSON.stringify(p.checks) : " null")); }));
  return bad;
})(), []);
check("formulas are spoken in words", NC.studio.describeEquation("X2+oph_flip(oph_round(Y))"), "Y with its digits reversed");
check("… including ones it has never seen", NC.studio.describeEquation("X1+oph_sqrt(Y)x19"), "the square root of Y times 19");
check("a package needs projections", NC.studio.build(six, Object.assign({}, sixRes, { zs: [], byDate: [] }), { length: 10 }), null);
check("the markdown holds the script, the cards, every image with its tag, the thumbnail and the upload text", (() => {
  const md = NC.studio.toMarkdown(plan);
  return [/^§1 /m.test(md), (md.match(/Look Card:/g) || []).length === plan.cast.length, (md.match(/NOT anime\./g) || []).length === plan.images + 1, /^FINAL TITLE: /m.test(md), md.includes(NC.studio.CTA)];
})(), [true, true, true, true, true]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
