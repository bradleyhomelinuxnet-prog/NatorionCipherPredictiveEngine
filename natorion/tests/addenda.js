#!/usr/bin/env node
/* Addenda and the long-cycle tools (js/chronicon/addenda.js), checked against
   the first addendum (Yvonne Love, 4 Nov 2026) and against the sky.
     node natorion/tests/addenda.js */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, "..");
// Astronomy Engine attaches itself to `exports` when one exists; give it one.
const astroBox = { exports: {} };
new Function("exports", "module", fs.readFileSync(path.join(APP, "js/vendor/astronomy.min.js"), "utf8"))(astroBox.exports, astroBox);
globalThis.Astronomy = astroBox.exports.Astronomy || astroBox.exports;
["js/chronicon/chronicon.js", "js/chronicon/addenda.js"].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC, AD = NC.addenda, CH = NC.chron;

let pass = 0, fail = 0;
function check(name, ok, detail) { ok ? pass++ : fail++; console.log((ok ? "  ok   " : "  FAIL ") + name + (detail ? "  · " + detail : "")); }
const love = AD.ADDENDA.find(a => a.id === "love-1900");
const spans = AD.enabledSpans();
const span = n => AD.SPANS.find(s => s.years === n);

console.log("the addendum's arithmetic");
love.chains.forEach(ch => {
  const ys = ch.years, gaps = ys.slice(1).map((y, i) => y - ys[i]);
  const claimed = (ch.text.match(/(\d{3,4}) years/) || [])[1];
  const ok = gaps.every(g => g > 0) && (!claimed || gaps.reduce((a, b) => a + b, 0) === +claimed || gaps.every(g => g === +claimed));
  check(ys.map(AD.fmtYear).join(" → ") + ": " + gaps.join(" + "), ok);
});
check("2170 + 2170 = 4340 = 10 × 434", 2170 + 2170 === 4340 && 4340 === 10 * 434);
check("1900 years is a whole multiple of 1900, of 100 — and of 19 (1900 = 19 × 100)", AD.multiples(1900, spans).map(m => m.span.years).sort((a, b) => a - b).join() === "19,100,1900");

console.log("isometric centres");
const dates = [{ y: -4308, text: "Phoenix named" }, { y: 32, text: "32 CE" }];
const cs = AD.centres(dates, AD.ledger(CH.LEDGER, { on: { "love-1900": true } }), 100);
check("4309 BC and 32 CE meet in the middle at 2139 BC", cs.some(c => c.centre.y === -2138), cs.map(c => AD.fmtYear(c.centre.y)).join(", "));
check("with the addendum off, 2139 BC is not a ledger event", !AD.centres(dates, AD.ledger(CH.LEDGER, { on: {} }), 100).some(c => c.centre.y === -2138));

console.log("counters and chance");
const k = AD.counters({ y: -2138 }, AD.ledger(CH.LEDGER, { on: {} }), spans);
const fromLuna = k.list.find(c => c.event[0] === -4038), fromPhx = k.list.find(c => c.event[0] === -4308);
check("2139 BC is 1900 years after the Capture of Luna (4039 BC)", fromLuna && fromLuna.years === 1900 && fromLuna.multiples.some(m => m.span.years === 1900));
check("…and 2170 years after the Phoenix (4309 BC)", fromPhx && fromPhx.years === 2170 && fromPhx.multiples.some(m => m.span.years === 2170));
check("the chance figure is its neighbours' average", k.expected > 0 && k.expected < k.list.length && k.neighboursAsGood >= 0 && k.neighboursAsGood <= 1, k.flagged.length + " flagged of " + k.list.length + ", neighbours ≈ " + k.expected.toFixed(1));
const k62 = AD.counters({ y: 62 }, AD.ledger(CH.LEDGER, { on: {} }), spans), k61 = AD.counters({ y: 61 }, AD.ledger(CH.LEDGER, { on: {} }), spans);
check("62 CE scores high because the NER grid sits on years ending in 62: nearby 61 CE scores far lower", k62.flagged.length > 2 * k61.flagged.length, "62 CE: " + k62.flagged.length + ", 61 CE: " + k61.flagged.length);
check("1039 BC sits exactly midway between 4039 BC and 1962 CE, and between 2139 BC and 62 CE", AD.centres([{ y: -4038 }, { y: 1962 }, { y: -2138 }, { y: 62 }], CH.LEDGER, 50).filter(c => c.centre.y === -1038).length >= 2);
check("flag rate of 19 alone up to 1900 is 100/1900", Math.abs(AD.flagRate([span(19)], 1900) - 100 / 1900) < 1e-12);

console.log("calendars");
check("5 Feb 62 is a Julian date", AD.calendarOf({ y: 62, m: 2, d: 5 }) === "Julian");
check("5 Feb 1962 is a Gregorian date", AD.calendarOf({ y: 1962, m: 2, d: 5 }) === "Gregorian");
check("5 Feb 62 (Julian) is 3 Feb 62 on the proleptic Gregorian calendar", new Date(AD.dateMs({ y: 62, m: 2, d: 5 })).getUTCDate() === 3);
check("the 1582 switch: 4 Oct (Julian) is followed by 15 Oct (Gregorian)", AD.civilJdn(1582, 10, 15) - AD.civilJdn(1582, 10, 4) === 1);

console.log("the sky");
const s62 = AD.sky(AD.dateMs({ y: 1962, m: 2, d: 5 }), 1);
check("5 Feb 1962: all seven bodies in Aquarius", s62.stellium.sign === "Aquarius" && s62.stellium.count === 7, s62.bodies.map(b => b.body + " " + b.deg + "°" + String(b.min).padStart(2, "0")).join(" "));
const sun = s62.bodies[0], sat = s62.bodies[6];
check("the Sun at 15°4x and Saturn at 3°4x, as the addendum's ephemeris gives", sun.deg === 15 && sun.min >= 40 && sat.deg === 3 && sat.min >= 40);
check("a total solar eclipse on 5 Feb 1962", s62.solar && s62.solar.kind === "total" && new Date(s62.solar.ms).toISOString().startsWith("1962-02-05"));
const e59 = AD.solarEclipsesInYear(59);
check("59 CE had a total solar eclipse: 30 Apr 59 (Julian)", e59.some(e => e.kind === "total" && AD.civilDate(e.ms) === "30 Apr 59 CE (Julian)"), e59.map(e => e.kind + " " + AD.civilDate(e.ms)).join("; "));
const s0062 = AD.sky(AD.dateMs({ y: 62, m: 2, d: 5 }), 1);
check("5 Feb 62: the Sun is in Aquarius too, but the planets are not gathered", s0062.bodies[0].sign === "Aquarius" && s0062.stellium.count < 4, "largest group " + s0062.stellium.count + " in " + s0062.stellium.sign);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
