#!/usr/bin/env node
/* Writes the worked Studio example from a sample file, with the app's own code.
     node natorion/examples/generate.js
   Same input, same settings, same "now" → the same package, byte for byte. */
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path");
const APP = path.resolve(__dirname, ".."), ROOT = path.resolve(APP, "..");
["js/vendor/astronomy.min.js", "js/vendor/tz-lookup.js", "js/data/eclipses.js", "js/data/places.js", "js/engine/core.js", "js/engine/expr.js", "js/engine/time.js",
 "js/engine/sky.js", "js/engine/engine.js", "js/engine/oph.js", "js/chronicon/chronicon.js", "js/studio/studio.js"].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(APP, f), "utf8"), { filename: f }));
const NC = globalThis.NC;

const EXAMPLES = [{
  source: "sample-eclipses-two-events.oph", event: 0, name: "The Eclipse Ledger",
  out: "eclipse-ledger_10min_v19.md",
  now: Date.UTC(2026, 9, 8, 12),                 // fixed, so the file does not drift with the clock
  settings: { length: 10, variation: 19 }
}];

EXAMPLES.forEach(x => {
  const doc = NC.oph.parse(fs.readFileSync(path.join(ROOT, x.source), "utf8"));
  if (!doc.events) throw new Error(x.source + ": " + doc.errors.join("; "));
  const ev = doc.events[x.event];
  if (x.name) ev.name = x.name;
  const res = NC.engine.run(ev, { nowMs: x.now });
  const plan = NC.studio.build(ev, res, x.settings);
  if (!plan) throw new Error(x.source + ": the event does not project");
  if (!plan.checks.ok) throw new Error(x.out + " misses the brief: " + JSON.stringify(plan.checks));
  fs.writeFileSync(path.join(__dirname, x.out), NC.studio.toMarkdown(plan));
  console.log(x.out + " — " + plan.words + " words, " + plan.paragraphs + " paragraphs, climax " + plan.star.date);
});
