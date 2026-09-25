#!/usr/bin/env node
/* ==========================================================================
   unit.node.js — run web/tests/unit.js under Node
   --------------------------------------------------------------------------
       node web/tests/unit.node.js
   Exits non-zero on the first failing run, so it drops straight into CI.
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
// ophis.store.js keeps the session in localStorage; an in-memory one stands in.
const stored = new Map();
scope.localStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => { stored.set(key, String(value)); },
  removeItem: (key) => { stored.delete(key); }
};
const ctx = vm.createContext(scope);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel });
}

// Optional helpers, same as index.html loads them.
["lib/astronomy.browser.min.js", "lib/tz_lookup_oss.js"].forEach((rel) => {
  try { load(rel); } catch (e) { console.log("(optional) " + rel + " not loaded: " + e.message); }
});

[
  "web/js/ophis.constants.js",
  "web/js/ophis.expr.js",
  "web/js/ophis.time.js",
  "web/js/ophis.engine.js",
  "web/js/ophis.file.js",
  "web/js/ophis.store.js",
  "web/js/ui.dom.js",
  "web/js/ui.panels.js",
  "web/tests/unit.js"
].forEach(load);

const GREEN = "[32m", RED = "[31m", DIM = "[2m", RESET = "[0m";
const colour = process.stdout.isTTY;
const paint = (code, text) => (colour ? code + text + RESET : text);

let currentSuite = "";
const failures = [];

const report = {
  suite(name) { currentSuite = name; console.log("\n" + paint(DIM, name)); },
  pass(title) { console.log("  " + paint(GREEN, "✓") + " " + title); },
  fail(title, message) {
    failures.push([currentSuite, title, message]);
    console.log("  " + paint(RED, "✗") + " " + title + "\n      " + paint(RED, message));
  },
  done(passed, failed) {
    console.log("\n" + passed + " passed, " + failed + " failed");
  }
};

const result = scope.Ophis.Tests.run(report);

if (result.failed) {
  console.log("\n--- failures ---");
  failures.forEach(([suite, title, message]) => console.log(suite + " › " + title + "\n   " + message));
}
process.exit(result.failed ? 1 : 0);
