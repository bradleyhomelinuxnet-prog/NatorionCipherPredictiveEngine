# Ophis Web

The Ophis v12 ("PSYFR") date-projection engine, rebuilt as a web page. Same
arithmetic, same `.oph` files, same output as the desktop build extracted from
the `.exe` — with a UI that fits on a screen and no Electron underneath.

Plain HTML, CSS and JavaScript. No framework, no build step, no package to
install, no network access of any kind.

---

## Run it

Open `web/index.html` in a browser. That is the whole procedure.

It works from `file://`, and from any static server if you prefer one:

```bash
npx http-server -p 8137 .      # then open http://127.0.0.1:8137/web/index.html
python3 -m http.server 8137    # same
```

Drop a `.oph` file anywhere on the page to open it, or use **Open**.
The repository's own `test-bradley.oph` is a good first load.

---

## What it does

You give it two or more dates an event has already happened on. It takes every
pair of them, measures the interval in days, runs a table of formulas over that
interval, and projects the results forward as candidate dates — scoring each one
by how many formulas agree on it and whether the day-count lands on one of the
resonance numbers.

[docs/ENGINE.md](docs/ENGINE.md) explains every step, with a worked example and
the `.oph` format.

### The screen

| Panel | |
|---|---|
| **X-Dates** | The input dates. Enable, disable, insert, sort, delete. |
| **Intervals** | Every pair and its day-count, with any MSRF match on the interval itself. |
| **T-Dates** | Optional target dates — with any enabled, only Z-Dates landing on them are shown. |
| **Event** | Name, notes, scope (Days or sunset-based HH:MM), location, scoring system. |
| **Timeline** | X-Dates on a time axis, an arc from each anchor to every date it produced, stems whose height is the score and whose colour is the hit count. Wheel zooms, drag pans (mouse, finger or pen), double-click fits, click or tap selects. Optional moon-phase and eclipse markers. |
| **Output** | One row per projected day. Click a column to sort, click a row for the full derivation, hover any pill to see the arithmetic behind it. |
| **Operations** | The formula table. Edit, weight, enable, add, reset. Errors show inline as you type. |
| **Filters** | The eight output filters, with live counts of shown-of-generated. |

Keyboard: `Ctrl/Cmd+O` open, `Ctrl/Cmd+S` save, `Esc` clear the selection.
Everything is kept in `localStorage`, so a reload resumes where you left off.
Opening a file replaces the session, so if you have edited since the last save
or open, the app asks first.

The page opens in the light theme; the ◑ button switches to the dark one, and
the choice is remembered.

---

## Files

```
web/
  index.html            the page
  css/
    app.css             the base stylesheet: layout, controls, the dark theme
    almanac.css         the light theme (the default) and the embedded fonts
    OFL.txt             the fonts' licence and copyright notices
  js/
    theme.js            applies the saved theme before the first paint
    ophis.constants.js  constants, MSRF tables, defaults   (ported 1:1)
    ophis.expr.js       the formula language: parse, compile, evaluate
    ophis.time.js       dates, rounding, day counting, sunset, moon, eclipses
    ophis.engine.js     the pipeline: intervals, projection, scoring, filters, sorting
    ophis.file.js       .oph reading and writing, CSV export
    ophis.store.js      session state and persistence
    ui.dom.js           DOM helpers, tooltips, modals
    ui.panels.js        input panels
    ui.output.js        the output table and the detail view
    ui.chart.js         the timeline
    app.js              wiring and bootstrap
  tests/                see below
  docs/
    ENGINE.md           what the engine computes, step by step
    PARITY.md           how it is checked against the original, and where it differs
```

The engine layer (`ophis.constants`, `ophis.expr`, `ophis.time`,
`ophis.engine`, `ophis.file`) has no DOM dependency at all — it runs in Node
unchanged, which is how the tests drive it.

### Optional extras

Four files from `../lib/`, shared with the desktop build, are loaded if present:

| File | Gives you | Without it |
|---|---|---|
| `astronomy.browser.min.js` | sunset times | HH:MM scope is disabled, and says so |
| `tz_lookup_oss.js` | timezone from latitude/longitude | HH:MM reads times as UTC, and the Event panel shows the timezone as unknown |
| `solar_eclipses_processed.js` | NASA solar eclipse catalogue | solar overlays greyed out |
| `lunar_eclipses_processed.js` | NASA lunar eclipse catalogue | lunar overlays greyed out |

Everything else — moon phases, all Days-scope arithmetic, the whole engine — is
self-contained. To move `web/` somewhere else on its own, copy those four files
next to it and point the four `<script>` tags at them.

---

## Tests

```bash
node web/tests/unit.node.js                              # behaviour tests
node web/tests/parity.node.js                            # differential against the original v12 engine
node web/tests/parity.node.js --fuzz 500 --seed 138      # plus 500 random events, reproducibly
```

The parity runner loads the extracted desktop renderer from `src/` into Node and
compares both engines field by field over 29 fixtures, including every `.oph` in
the repository; `--fuzz N` adds N randomised events, and `--seed` makes them
repeatable. Current state: all pass, with one named and fully-explained
divergence. See [docs/PARITY.md](docs/PARITY.md). GitHub Actions runs the unit
tests and the seeded fuzz run on every push (`.github/workflows/tests.yml`).

The same behaviour tests run in the browser at `web/tests/index.html`, which
also has a box for trying formulas — including injection payloads — by hand.

---

## Security posture

This rewrite exists partly because the desktop build has a reachable code-
execution path. It does not carry that path forward:

- **Formulas are parsed, never compiled.** A `.oph` operation is tokenised into
  an expression tree that can only express the documented grammar and then
  walked. No `eval`, no `new Function`. A hostile file is a syntax error.
- **No file writes.** Nothing reaches the filesystem except through the
  browser's own download, when you press the button.
- **No network.** The page declares a Content-Security-Policy with
  `default-src 'none'` and `connect-src 'none'`; there are no remote origins,
  no analytics and no inline script. The three typefaces are embedded in
  `almanac.css` as `data:` URIs rather than fetched.
- **Everything user-supplied is escaped** before it reaches the DOM — event
  names, notes, formulas, file contents — including text that ends up in a
  tooltip, which is escaped once for the markup and once for the attribute
  that carries it.

Full detail in [docs/PARITY.md](docs/PARITY.md); the findings themselves are in
the repository's [SECURITY.md](../SECURITY.md) and
[Ophis_v12_ReverseEngineering_Report.md](../Ophis_v12_ReverseEngineering_Report.md).

---

## Browser support

Any current browser. It uses `Intl.DateTimeFormat` for timezones, `canvas` for
the timeline, `color-mix()` and CSS grid for layout, and `<input type="date">`
for date entry.

---

## Fonts

`almanac.css` embeds Latin subsets of Fraunces (The Fraunces Project Authors)
and IBM Plex Sans and Mono (IBM Corp.), all under the SIL Open Font License 1.1.
The licence and the copyright notices are in [css/OFL.txt](css/OFL.txt).

---

## Note

Ophis is a worldbuilding and study instrument after the Archaix thesis of Jason
Breshears — presented as that thesis, not as established science. This rewrite
reproduces the software faithfully and takes no position on the cosmology. Not
affiliated with Archaix.
