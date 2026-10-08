#!/usr/bin/env node
/* The single-file pages (PSYFR1, NatoriOphis, Natori-On-PSYFR-Main-UI) used to compile each
   formula with new Function(); they now parse it. This runs every page's parser beside the old
   compiler, kept below as the reference, and fails on any formula where they disagree.
     node tests/legacy-parity.node.js [--fuzz N] [--seed S] [--quiet]
   Compared per formula: both refuse it, or both accept it and give the same number (or both
   NaN) for every Y in YS. Two classes differ on purpose, and are counted, not failed: ++ and
   --, which JS took as "increment/decrement Y", and // or /*, which JS read as the start of a
   comment (X1+2//8 quietly meant X1+2). The parser refuses both. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const PAGES = ["PSYFR1.html", "NatoriOphis.html", "Natori-On-PSYFR-Main-UI.html"];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FUZZ = parseInt(arg("--fuzz", "1380"), 10), SEED = parseInt(arg("--seed", "19"), 10), QUIET = process.argv.includes("--quiet");
const YS = [0, 1, 2, 7, 16, 19, 138, 162, 1000, 1001, 2461, 12345, 0.5, 19.138, -19, 1e6 + 1];

// The compiler the pages shipped with until this test was written, verbatim.
const REFERENCE = `function compileOp(eqRaw){
  let eq=eqRaw.replace(/\\s+/g,'').replace(/×/g,'x');
  let start;
  if(eq.startsWith('X1+'))start='X1';
  else if(eq.startsWith('X2+'))start='X2';
  else throw new Error("must start with X1+ or X2+");
  let body=eq.slice(3).replace(/x/g,'*');
  let test=body.replace(/OPH_PHI|OPH_PI|OPH_CRV/g,'1').replace(/oph_(flip|round|floor|ceil|abs|sqrt)/g,'f').replace(/Y/g,'1');
  if(/[^0-9+\\-*/().f]/.test(test))throw new Error("illegal token in equation");
  let fn;
  try{fn=new Function('Y','OPH_PHI','OPH_PI','OPH_CRV','oph_flip','oph_round','oph_floor','oph_ceil','oph_abs','oph_sqrt','return '+body+';');}
  catch(e){throw new Error("syntax error");}
  let t=fn(1000,OPH_PHI,OPH_PI,OPH_CRV,oph_flip,oph_round,oph_floor,oph_ceil,oph_abs,oph_sqrt);
  if(typeof t!=='number'||!isFinite(t))throw new Error("does not evaluate to a number");
  return {start, fn:(Y)=>fn(Y,OPH_PHI,OPH_PI,OPH_CRV,oph_flip,oph_round,oph_floor,oph_ceil,oph_abs,oph_sqrt)};
}`;

// What a page needs to compile a formula: its constants, its six oph_ helpers, and its compiler.
function pageParts(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  if (/new Function|unsafe-eval/.test(src)) throw new Error(file + " still uses new Function or allows unsafe-eval");
  const consts = src.match(/^const OPH_PHI=.*$/m)[0];
  const helpers = src.split("\n").filter(l => /^function oph_(flip|round|floor|ceil|abs|sqrt)\(/.test(l)).join("\n");
  const a = src.indexOf("/* Formulas are parsed"), b = src.indexOf("\n}\n", src.indexOf("function compileOp(eqRaw){")) + 3;
  if (a < 0 || b < 3) throw new Error(file + ": parser not found");
  const ops = eval(src.match(/const DEFAULT_OPS=(\[[\s\S]*?\]);/)[1]);
  return { consts, helpers, compiler: src.slice(a, b), ops };
}
function load(parts, compiler) {
  const ctx = vm.createContext({ Math, Number, Object, parseInt, isFinite });
  vm.runInContext(parts.consts.replace(/^const /, "var ") + "\n" + parts.helpers + "\n" + compiler + "\nthis.compileOp=compileOp;", ctx);
  return ctx.compileOp;
}
function outcome(compileOp, eq) {
  let c;
  try { c = compileOp(eq); } catch (e) { return { refused: true }; }
  const vals = YS.map(Y => { try { return c.fn(Y); } catch (e) { return "throws"; } });
  return { start: c.start, vals };
}
const same = (a, b) => a.refused ? !!b.refused : !b.refused && a.start === b.start && a.vals.every((v, i) => Object.is(v, b.vals[i]) || (v !== v && b.vals[i] !== b.vals[i]));
const byDesign = eq => /\+\+|--|\/\/|\/\*/.test(eq.replace(/\s+/g, "").replace(/x/g, "*"));

// A small seeded generator (mulberry32), so a failure reproduces from --seed.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(SEED), pick = a => a[Math.floor(R() * a.length)];
const ATOMS = ["Y", "Y", "Y", "19", "138", "2", "0.5", "1.", ".5", "07", "010", "08", "09.5", "00", "OPH_PHI", "OPH_PI", "OPH_CRV"];
const FNS = ["oph_flip", "oph_round", "oph_floor", "oph_ceil", "oph_abs", "oph_sqrt"];
const BIN = ["+", "-", "x", "/", "xx", "*"];
function expr(d) {                       // mostly well-formed, so the values get compared too
  const r = R();
  if (d <= 0 || r < 0.25) return pick(ATOMS);
  if (r < 0.40) return pick(FNS) + "(" + expr(d - 1) + ")";
  if (r < 0.50) return "(" + expr(d - 1) + ")";
  if (r < 0.58) return pick(["-", "+"]) + expr(d - 1);
  return expr(d - 1) + pick(BIN) + expr(d - 1);
}
const CHARS = "Y0123456789+-x*/().f ".split("").concat(["OPH_PI", "OPH_PHI", "OPH_CRV", "oph_abs", "oph_flip("]);
function noise() { let s = ""; const n = 1 + Math.floor(R() * 9); for (let i = 0; i < n; i++) s += pick(CHARS); return s; }

const fixed = [
  // shapes JS treats specially
  "X1+-Yxx2", "X1+(-Y)xx2", "X1+2xx-1", "X1+2xx3xx2", "X1+2xx-1xx2", "X1+-(2)xx2", "X1+Y--1", "X1+--Y", "X1+Y---1", "X1+Y++", "X1++Y", "X1+2//8/3", "X1+Y/*2*/+1",
  "X1+010", "X1+08.5", "X1+07.5", "X1+00", "X1+1..5", "X1+1.2.3", "X1+2Y", "X1+Y(2)", "X1+(Y)(2)", "X1+oph_abs()", "X1+oph_abs", "X1+oph_abs+1",
  "X1+f", "X1+Yf", "X1+OPH_PIY", "X1+Y/0", "X1+0/0", "X1+oph_sqrt(Y-1000)", "X2+ Y x OPH_PHI", "X1+Y×2", "X3+Y", "X1+", "X1+()",
  // injection payloads: all must be refused
  "X1+alert(1)", "X1+(()=>1)()", "X1+constructor", "X1+Y.constructor", "X1+this", "X1+globalThis", "X1+process.exit()", "X1+require('fs')",
  "X1+Y;fetch('x')", "X1+`${1}`", "X1+[]", "X1+{}", "X1+Y||1", "X1+Y&&1", "X1+Y,1", "X1+oph_flip.call(0,1)", "X1+eval('1')",
  // the ten extras
  ...fs.readFileSync(path.join(ROOT, "ophis-xtras.txt"), "utf8").split(/\s+/).filter(s => /^X[12]\+/.test(s))
];

let pass = 0, fail = 0, refusedByDesign = 0;
const failures = [];
PAGES.forEach(file => {
  const parts = pageParts(file), mine = load(parts, parts.compiler), ref = load(parts, REFERENCE);
  const cases = [...new Set([...parts.ops, ...fixed])];
  for (let i = 0; i < FUZZ; i++) cases.push((R() < 0.5 ? "X1+" : "X2+") + (R() < 0.85 ? expr(4) : noise()));
  let p = 0, f = 0, d = 0, accepted = 0;
  cases.forEach(eq => {
    const a = outcome(ref, eq), b = outcome(mine, eq);
    if (same(a, b)) { p++; if (!a.refused) accepted++; return; }
    if (!a.refused && b.refused && byDesign(eq)) { d++; return; }
    f++; failures.push(file + "  " + JSON.stringify(eq) + "\n      v12-style " + JSON.stringify(a) + "\n      parser    " + JSON.stringify(b));
  });
  ["X1+alert(1)", "X1+constructor", "X1+Y;fetch('x')"].forEach(eq => { if (!outcome(mine, eq).refused) { f++; failures.push(file + " accepted " + eq); } });
  pass += p; fail += f; refusedByDesign += d;
  if (!QUIET) console.log("  " + (f ? "FAIL " : "ok   ") + file + ": " + p + "/" + cases.length + " identical (" + accepted + " evaluated at " + YS.length + " values of Y), " + d + " ++, --, // and /* refused by design, " + f + " different; " + parts.ops.length + " built-in formulas");
});
failures.slice(0, 19).forEach(s => console.log("  FAIL " + s));
console.log("\nlegacy parity (seed " + SEED + ", fuzz " + FUZZ + "): " + pass + " identical, " + refusedByDesign + " ++, --, // and /* refused by design, " + fail + " different");
process.exit(fail ? 1 : 0);
