#!/usr/bin/env node
/* Checks of the MSRF tiers and the phi shadow (js/engine/formulas.js).
     node natorion/tests/formulas.js */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, "..");
["js/engine/core.js", "js/engine/expr.js", "js/engine/formulas.js"].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC, F = NC.formulas, C = NC.C;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
}
const r = (v, d) => +v.toFixed(d);

console.log("tiers");
check("nine tiers, counts as published (Tier I less the duplicate 468)", F.MSRF_TIERS.map(t => t.numbers.length), [280, 139, 75, 27, 14, 13, 5, 5, 7]);
check("dimensions 2…7 then 8 for the apex", F.MSRF_TIERS.map(t => t.dims), [2, 3, 4, 5, 6, 7, 8, 8, 8]);
check("no number listed twice inside a tier", F.MSRF_TIERS.every(t => new Set(t.numbers).size === t.numbers.length), true);
check("480 resolves to the higher tier", F.tierOf(480).key, "III");
check("138 is Tier II", F.tierOf(138).name, "Tier II");
check("360 is Tier VI", F.tierOf(360).dims, 7);
check("2520 is apex alpha", [F.tierOf(2520).key, F.tierOf(2520).rank], ["VIIa", 9]);
check("19 has no tier", F.tierOf(19), null);

console.log("magnitude");
check("138: Normal, Tier II, 3 dims", (m => [m.appClass, m.tier, m.dims, m.exact])(F.magnitude(138)), ["Normal", "Tier II", 3, true]);
check("504: Important, apex alpha", (m => [m.appClass, m.apex])(F.magnitude(504)), ["Important", "alpha [greater]"]);
check("21.7: Vortex, no tier", (m => [m.appClass, m.tier])(F.magnitude(21.72)), ["Vortex", null]);
check("137.5: no v12 match, nearest 138 Tier II", (m => [m.appClass, m.number, m.tier, m.exact])(F.magnitude(137.5)), [null, 138, "Tier II", false]);
check("every Important number is tiered", C.MSRF_IMPORTANT.every(n => F.tierOf(n)), true);
const untiered = [...C.MSRF_NORMAL, ...C.MSRF_IMPORTANT, ...C.MSRF_VORTEX].filter(n => !F.tierOf(n));
check("63 v12 numbers have no tier yet", untiered.length, 63);

console.log("phi shadow");
check("138 ÷ 1.618 → shadow 52.71 both ways", (s => [r(s.answer, 2), r(s.shadow, 2), r(s.shadowByPhi, 2)])(F.phiShadow(138, 1.618)), [85.29, 52.71, 52.71]);
check("670 ÷ 1.618 → 414.09, shadow 255.91", (s => [r(s.answer, 2), r(s.shadow, 2)])(F.phiShadow(670, 1.618)), [414.09, 255.91]);
check("true φ: x − x/φ equals x/φ² for any x", [19, 138, 360, 1.5, 2520, 7e6].every(x => { const s = F.phiShadow(x); return Math.abs(s.shadow - s.shadowByPhi) < 1e-9 * Math.max(1, x); }), true);
check("360's shadow is the golden angle", r(F.phiShadow(360).shadow, 3), 137.508);
check("ladder: each rung is the shadow of the one two above", (L => L.slice(2).every((x, i) => Math.abs(x.value - F.phiShadow(L[i].value).shadow) < 1e-9))(F.phiLadder(2520, 8)), true);
check("shadow equations parse in the Operations grammar", F.SHADOW_EQUATIONS.map(q => !!NC.expr.compileOperation(q, 0, []).fn), [true, true, true]);
check("X1+Y/OPH_PHI/OPH_PHI on Y=138", r(NC.expr.compileOperation(F.SHADOW_EQUATIONS[0], 0, []).fn(138), 2), 52.71);

console.log("formula sets");
const setEqs = id => C.OPERATION_SETS.find(s => s.id === id).ops.map(o => o.equation);
check("138 & 360 is extras 19, 20 and 26", setEqs("s138"), [C.ALL_OPERATIONS[18], C.ALL_OPERATIONS[19], C.ALL_OPERATIONS[25]].map(o => o.equation));
check("every set formula compiles", C.OPERATION_SETS.every(s => s.ops.every(o => !!NC.expr.compileOperation(o.equation, 0, []).fn)), true);
check("Lucky 19 on Y = 100: 190, 190, 19", setEqs("s19").map(q => NC.expr.compileOperation(q, 0, []).fn(100)), [190, 190, 19]);
check("Metonic adds 6,939.69 days whatever the gap", setEqs("metonic").map(q => NC.expr.compileOperation(q, 0, []).fn(1234)), [6939.69, 6939.69]);
check("the 36 defaults are unchanged", C.ALL_OPERATIONS.length, 36);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
