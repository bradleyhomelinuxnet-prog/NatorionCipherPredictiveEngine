# Parity with the desktop engine

How this rewrite is checked against Ophis v12, what matches, and the places it
deliberately does not.

---

## The method

The renderer extracted from the shipped `.exe` is un-obfuscated script with no
build step, so it loads into Node with a handful of browser stubs and can be
driven headless. That makes the original an **oracle**: for any event, run both
engines and compare every field.

`web/tests/parity.node.js` does exactly that.

```bash
node web/tests/parity.node.js                      # the fixed fixture set
node web/tests/parity.node.js --verbose             # plus per-row detail
node web/tests/parity.node.js --fuzz 500 --seed 19  # plus 500 random events
node web/tests/parity.node.js --fuzz 1500 --seed 1319 --quiet
```

It loads, from this repository:

- `lib/moment-with-locales.min.js`, `lib/moment-timezone-with-data.js`,
  `lib/tz_lookup_oss.js`, `lib/math.js`, `lib/astronomy.browser.min.js`
- `src/ophis_logging.js`, `ophis_utils.js`, `ophis_view__strings.js`,
  `ophis_dependencies.js`, `ophis_config.js`, `ophis_model__params.js`,
  `ophis_model__validation.js`, `ophis_model__sorting.js`,
  `ophis_model__operations.js`

then stubs the two things `ophis_main.js` would have supplied (`appState` and
`isRunningHeadless`) and calls `runOphisOnEvent()` directly. The original's
clock is pinned through its own headless hook, and the rewrite is given the
same instant, so the current-date filters line up.

> The original scripts are run in Node's own realm rather than a `vm` context:
> the bundled mathjs uses typed-function identity checks that fail across
> realms, and its validator is part of what is under test.

### What is compared

For every fixture, per Z-Date:

- the readable date label
- score, base score before the multiplier, hit count, operation score
- which operations landed there, by ordinal
- which MSRF numbers matched

and per run:

- the total number of Z-Dates generated
- the full key order after filtering, by date
- the full key order under the event's own sort type
- whether the engine refused the event at all

### The fixture set

25 fixed fixtures plus every `.oph` file in the repository root, plus however
many random events `--fuzz` asks for:

- 2–5 anchors, anchors disabled mid-list, anchors a day apart, anchors out of
  order, a single anchor
- both scoring systems
- every sort type
- every filter on, every filter off, tight filters, T-Dates, a day-scope start
  offset
- custom operations, a disabled operation, an operation that does not compile
- **HH:MM scope** at three latitudes (New York, Sydney, Stockholm), including
  X-Dates either side of a sunset
- the repository's own `test-bradley.oph`,
  `test-file-bradley-rogue-dates.oph`, and
  `7-4-26-8-20-26-3-9-27-3-16-27-8-19-27-4-1-28.oph`

### Result

```
29 fixed fixtures          29 passed, 0 failed
+ 400 random  (seed 138)  429 passed, 0 failed
+ 1500 random (seed 1319) 1529 passed, 0 failed
```

Including HH:MM scope, where this build computes sunset through the same
Astronomy Engine library the desktop app prefers but does its own timezone
handling through `Intl` rather than moment-timezone, and its own
sunset-before/after walk rather than the app's sampling — and still lands on the
same days.

---

## Deliberate divergences

### 1 · Formulas are parsed, not compiled

The desktop app validates a **stripped copy** of a formula and then compiles the
**original** with `new Function()` (`src/ophis_model__validation.js:104-160`).
The strip pass deletes the `oph_*` function names, so the string that gets
checked is not the string that gets run. That is finding #1 of the
reverse-engineering report: it is what makes a `.oph` file executable.

This build tokenises the formula into an AST that can only express the grammar
in [ENGINE.md](ENGINE.md) and walks it. There is no `eval`, no `new Function`,
and no way to name anything the grammar does not define.

Two consequences, both tested:

- **Injection payloads are syntax errors.** `constructor.constructor("…")()`,
  `globalThis`, `window`, `require`, `0;alert(1)` and a dozen others are
  rejected with a reason. `web/tests/unit.js` asserts each one, and that a
  hostile `.oph` loads with the offending operation disabled and nothing
  executed.
- **A formula the original wrongly rejects is accepted here.**
  `X2+oph_abs(Y-138)+19` strips to `(10-138)+19 = -109`, so the original judges
  it negative and refuses it, even though what it would have compiled returns
  147. The parity runner carries this as a named divergence and asserts that
  (a) the two engines really do disagree about that formula and (b) removing it
  makes them agree exactly, so the difference stays fully explained.

The reverse can also happen: a formula using JavaScript the grammar does not
have — `%`, `^`, a comparison — is accepted by the original (its stripped form
parses as maths, and `new Function` then runs it as JavaScript, where `^` is
bitwise XOR rather than a power) and rejected here. None of the shipped
operations, and nothing in any `.oph` in this repository, uses one.

### 2 · Nothing is written to disk on its own

The desktop app's `electronBridge.autoSaveToFile` writes to any path it is
given, with no validation (finding #2). A browser page cannot do that at all:
files appear only through the browser's own download, when you ask for one.

### 3 · Saved `.oph` is ordinary JSON

The desktop app runs `replaceAll(",", ", ")` over the finished JSON string,
which also rewrites commas inside event names and notes. This build writes
normal JSON. Both read either.

### 4 · Error wording

A few messages are reworded for clarity ("X2 must be later than X1" rather than
the HTML-laced original). The parity runner compares *whether* an engine
refused, not the exact sentence.

### 5 · Years 0–99 are the years written

`02/14/0033` is a valid X-Date in both builds, but they read it differently.
The desktop app's date library does not take a year below 100 as written:

- years 32–99 are read as two digits: `0033` is **2033** and `0050` is 1950;
- years 13–31 are refused (`02/14/0013` gives "Problem parsing xDate");
- years 1–12 come out with the fields moved around: `02/14/0001` is 2 January
  2014.

This build reads every year as written, so `02/14/0033` is the year 33. It
writes such years with four digits (`0033`): in the Z-Dates, in the CSV, and
in any X- or T-Date entered through its date fields. A date read from a file
keeps the text it had. The desktop app reads `0033`, `033` and `33` alike
(all as 2033), so the extra digits change nothing when it opens a file saved
here. Neither build goes past the year 9999: both read `07/04/12026` as
4 July 9999.

Every fixture and every random event in the parity run is dated well after
year 99, so the two engines still agree on all of them; `web/tests/unit.js`
pins this build's side of the difference.

---

## What is not reproduced

| Not here | Why |
|---|---|
| The sign-in screen | Client-side theatre over five hard-coded SHA-512 hashes (finding #3); `FEATURE_FLAG__REQUIRE_SIGN_IN` is already `false` in v12. |
| Month and year scopes | The desktop app refuses them too ("may be supported in a future version"). |
| PDF / XLSX export | `.oph` and CSV cover the working loop; the rest were wrappers around jsPDF and write-excel-file. |
| The map picker for lat/long | Leaflet plus an offline tile set; type the coordinates instead. |
| Multi-library sunset fallback | The app tries Astronomy Engine, then Meeus, then SunCalc. This build uses Astronomy Engine, its first choice, and says so plainly if it is missing rather than quietly using a different one. |
| Headless CLI mode | That lived in the Electron main process. |

---

## Running the checks

```bash
node web/tests/unit.node.js                           # behaviour tests, no dependencies
node web/tests/parity.node.js                         # differential against the original engine
node web/tests/parity.node.js --fuzz 500 --seed 138   # plus 500 random events, as CI runs it
```

Both exit non-zero on failure. The same behaviour tests also run in the browser
at `web/tests/index.html`, which additionally offers a formula box for trying
payloads by hand.
