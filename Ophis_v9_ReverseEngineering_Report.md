# Ophis v9 — Reverse Engineering Report

## 1. Packaging summary

Ophis v9 ships as a Windows Electron desktop app (32-bit build) wrapped by NSIS/electron-builder with an LZMA2 solid archive. Renderer code lives in an `app.asar` (~32 MB uncompressed) that is un-obfuscated JS — plain source, plain names, plain comments (including debugger statements and TODOs). Unpacked layout:

```
app-src/
  ophis.html                        # bootstrap DOM + serial script loader
  package.json                      # semver read at startup by init_step1
  lib/                              # third-party: math.js, chart.js, moment, luxon,
                                    #   leaflet, meeusjs, meeus-easy, lunarphase-js,
                                    #   tz_lookup_oss, papaparse, write-excel-file,
                                    #   jspdf, html2canvas, DOMPurify, sha512.min.js
                                    #   lunar_eclipses_processed.js
                                    #   solar_eclipses_processed.js
  img/                              # header skins, hit symbols, astro indicators,
                                    #   offline_map tiles (Leaflet z/x/y PNGs)
  src/                              # 22 first-party modules (see §4)
```

`ophis.html` (lines 368–413) injects each of 22 first-party JS modules as `<script async=false>` tags in strict load order, appending a random 8-digit cache-buster query string. The CSS (`ophis.css`) is injected the same way. There is no bundler, no minification of first-party code, no source map — this is dev-style loading shipped to production.

## 2. What Ophis actually does

Ophis is a **date-projection / cycle-prediction tool**. The user defines "Iso-Events" (named cycles), each containing an ordered list of **X-Dates** (input timestamps with optional lat/long). The engine computes **Z-Dates** — future output dates predicted from user-authored arithmetic operations applied to the *axial rotation count* (day-delta) between pairs of X-Dates. Z-Dates are then scored, filtered, sorted, and plotted on a Chart.js timeline overlaid with moon phases and NASA eclipse data.

The domain vocabulary (Iso-Event, X-Date, Z-Date, MSRF, "axial rotation count", "prior sunset", vortex numbers, phi/pi/curvature multipliers) is astrological / financial-astrology (Gann-style cycle work), and the app explicitly supports a `SKIN_MODE__MARKETS` alongside `SKIN_MODE__CLASSIC`. There is no live market-data feed — Markets mode just re-skins the header (`img/header_markets.png`) and window title ("Ophis Market Prediction Platform"; `ophis_view.js:37-51`).

**On the user's "Excel formulas" hunch:** half-right. What they were looking at *is* a real formula engine — users type expressions like `X2+oph_round(Y)`, `X1+(Y/2.0)xOPH_PI`, `X2+YxOPH_PHI` into a per-Iso-Event operations table (`ophis_model__params.js:65-110`). But these are **not Excel formulas**. It's a custom mini-language, validated by math.js and executed by a native `new Function("Y", ...)` at runtime (§5). Nothing round-trips as an XLSX formula string — Excel export writes precomputed numbers only (§7).

## 3. Architecture (MVC layout)

Strict layer separation, obvious from filenames:

- **Controller** — `ophis_controller.js`: mutates `appState.isoEvents` / `appState.globalOptions`, adds/removes events/x-dates/operations, triggers refreshes, calls `flushChangesToDisk()`.
- **Model** — `ophis_model__*.js` (5 files): params/defaults, input validation, sorting/filtering of Z-Dates, the actual operation-execution engine, and disk/localStorage persistence.
- **View** — `ophis_view*.js` (10 files): DOM rebuild, string formatting, chart config, chart rendering, chart dataset generation, settings UI, export UI, top-level view orchestration.
- **Cross-cutting** — `ophis_utils.js` (~800 lines of helpers), `ophis_config.js` (all constants + feature flags), `ophis_dependencies.js` (thin wrappers over Meeus/moment/tzlookup/Tipsy).
- **Entry** — `ophis_main.js`: 6-step waterfall `init()` (version → sign-in → load astro images → self-check → dependencies/listeners → appState).
- **Tests** — `ophis_unit_tests.js`: MSRF-filter self-check, runs on startup.

Global mutable state lives on `appState` (isoEvents, globalOptions, latestResults, isSignedIn, hasUnsavedChanges, etc.). No framework — vanilla DOM + jQuery for tooltips only.

## 4. Module reference

| File (under `app-src/src/`) | Role |
|---|---|
| `ophis_utils.js` | Math/date/timezone helpers, sunset lookups, `hashAccount` (SHA-512), `oph_*` runtime math functions, `xDateToNativeDate`, `axialRotationsBetweenNativeDates`, MSRF match |
| `ophis_config.js` | All constants: feature flags, serialized-field metadata, MSRF constants, `OPH_PI/PHI/CRV/HEP`, event scopes/types, screen names, hard-coded `ACCOUNT_HASHES` |
| `ophis_dependencies.js` | Wraps Meeus + optional CosineKitty astronomy for sunset; `getTimezone(lat,long)` via `tzlookup`; Tipsy tooltip config |
| `ophis_model__params.js` | 16 default operations (`X2+oph_round(Y)`, `X2+YxOPH_PHI`, …); MSRF filter arrays NORMAL (276 ints), IMPORTANT (52 ints), VORTEX (12 floats); version-branched defaults for pre-v8 vs ≥v8 |
| `ophis_model__validation.js` | Formula validation (math.js), lat/long parsing, X-date spread checks, import/save sanitization, startup MSRF self-check |
| `ophis_model__sorting.js` | `filterZDates()` and `sortZDates()` — apply per-event filter toggles and one of 5 sort types |
| `ophis_model__operations.js` | `runOphisOnEvent()` — the engine. Generates Y-structs (pairs), runs each operation, builds Z-structs, scores hits, tags MSRF matches |
| `ophis_model__persistence.js` | `.oph` save/load, autosave, `getSaveBlob()`, localStorage fallback, unsaved-changes tracking |
| `ophis_controller.js` | Add/remove/select Iso-Events, X-Dates, Operations; `refreshXDates(refreshType)` master dispatcher |
| `ophis_view__strings.js` | Readable date/rotation/MSRF/Z-value formatters, timezone-aware date rendering |
| `ophis_view__config.js` | UI constants, skin modes, screen IDs, flatpickr configs, default Dallas lat/long (32.8, -96.8) |
| `ophis_view__utils.js` | DOM helpers, dialog/toast, `showMap()`/`hideMap()` Leaflet HUD, flatpickr wiring, lat/long input validation |
| `ophis_view__rebuild.js` | Rebuilds Iso-Event and X-Date tables; panel dimension math |
| `ophis_view__output.js` | (not directly probed) output-panel rendering — loaded 14th in sequence |
| `ophis_view__settings.js` | Operations settings table — equation input + real-time validation + weight/enable |
| `ophis_view__chart_config.js` | Colors, widths, z-order; moon-phase dict; eclipse dict; async image preload |
| `ophis_view__chart.js` | Chart.js instantiation, zoom/pan, hit-test priority (labels → symbols → curve rings) |
| `ophis_view__chart_datasets.js` | Curve/point dataset generation, collision spreading, `binarySearchForEclipse`, `getLunarPhase` |
| `ophis_view__export.js` | PDF (jsPDF), CSV (Papa), XLSX (`write-excel-file`) exporters |
| `ophis_view.js` | Top-level view: screen switching, skin-mode header swap, `refreshCurrentPage()` |
| `ophis_unit_tests.js` | Startup MSRF assertions |
| `ophis_main.js` | `init()` waterfall; listener wiring; Electron/localStorage load handoff |

## 5. The formula engine

**math.js is used for validation only. Runtime evaluation is `new Function("Y", ...)` — plain V8.**

Flow:

1. User types equation into the operations settings row (`ophis_view__settings.js:renderOperations`), e.g. `X2+oph_round(Y)`.
2. `validateOperationString()` (`ophis_model__validation.js`) is called on every keystroke and again before save:
   - `normalizeOperationEquationString()` (lines 3–36): strip spaces, temporarily uppercase `oph_*` function names to protect them from the next step, replace `x` → `*` (that's the user-facing multiplication token), replace `OPH_PI` / `OPH_PHI` / `OPH_CRV` / `OPH_HEP` with numeric literals, lowercase function names back.
   - `stripOperationEquationString()` (lines 77–94): drop the mandatory `X1+` or `X2+` prefix, replace all `oph_*()` wrappers with their inner Y-expression, substitute `Y` with `SAMPLE_Y_VALUE_FOR_VALIDATION` (=10).
   - `math.parse(normalizedAndStrippedOperationEquationString)` at line 46 — syntactic check.
   - `math.evaluate(..., scope={})` at line 50 — semantic check with an empty scope. Result must be a positive number (`isValidOperationEquationResult`).
3. If valid, the code compiles a JS function directly:
   ```js
   var operationFunction = new Function("Y", "return " + operationEquationStringForFinalFunction + ";");
   ```
   at `ophis_model__validation.js:132`. This function is cached on the operation as `cached_operation_function`.
4. At compute time (`ophis_model__operations.js:199`):
   ```js
   var ithZValue_raw = ithOperation.cached_operation_function(axialRotationCountY);
   ```
   `Y` is the *axial rotation count* between two X-Dates (day delta, with sunset-aware rounding in HH:MM scope). The returned `Z` value is a day delta added to the anchor X-Date to produce the Z-Date.

**Scope exposed to formulas:** exactly one variable, `Y`. Constants (`OPH_PI` ≈ 3.14…, `OPH_PHI` ≈ 1.618…, `OPH_CRV` = curvature, `OPH_HEP`) are string-substituted, not scoped. Runtime functions available are the `oph_*` helpers defined in `ophis_utils.js`: `oph_sqrt`, `oph_abs`, `oph_floor`, `oph_ceil`, `oph_log`, `oph_sin`, `oph_cos`, `oph_tan`, `oph_exp`, `oph_round`, `oph_flip` (custom — reverses digits while preserving decimal position).

**Excel round-trip:** none. See §7.

**Security note (not exploited here):** `new Function()` from user input is an eval sink. Ophis mitigates by requiring `X1+`/`X2+` prefix and running math.js first, but the stripping pass drops `oph_*()` wrappers *and* the prefix before math.js sees it — so the math.js pass validates only the arithmetic skeleton. A crafted string that passes both filters would execute in the renderer's context. This matters more because of `nodeIntegration:true` (implied by `window.electronBridge` usage patterns; §11).

## 6. The `.oph` file format

Plain UTF-8 JSON, optionally pretty-printed when `FEATURE_FLAG__PRETTY_PRINT_OPH_FILES` is on. Top-level keys (`ophis_config.js:79-84`):

```json
{
  "app_version": "9",
  "iso_events": [ /* array of IsoEvent */ ],
  "global_options": { /* user prefs */ }
}
```

Save/load modes are gated by `SAVE_BLOB_MODE__{EVERYTHING,JUST_THE_EVENTS,JUST_THE_GLOBAL_OPTIONS}` (`ophis_model__persistence.js:getSaveBlob`). Under Electron with autosave on, disk gets just events, localStorage gets just global options; in the browser, localStorage under key `"save_blob"` gets everything.

An `IsoEvent` (per `ophis_controller.js:120-139` + serialized-field expansion):

```
name              string
scope             EVENT_SCOPE__HH_MM | __DAYS | __MONTHS | __YEARS
type              EVENT_TYPE__PERSONAL | __MARKETS  (ASTROLOGICAL enum exists but is commented out)
lat, long         numbers (rounded to DECIMAL_PRECISION__LOCATION)
location_enabled  boolean
x_dates           [ { date: "m/d/Y", time: "H:i", enabled: bool }, ... ]
operations        [ { equation: string, weight: number, enabled: bool }, ... ]
scoring_system    SCORING_SYSTEM__LTE_V7 | __GTE_V8
z_date_sort_type  SORT_TYPE__{SCORE|DATE|MSRF|HIT_COUNT|OPERATIONS}
<all SERIALIZED_FILTER_FIELDS>       booleans (+ optional numeric companion field)
<all SERIALIZED_CHART_OPTION_FIELDS> booleans
```

Transient / computed fields (`effective_operations`, `cached_operation_function`, `latestResults`) are stripped before write via `sanitizeIsoEventsForSaveOperation` (`ophis_model__validation.js:375`).

Global options include `current_file_path` (Electron), `skin_mode`, `local_time_offset_in_millis`, `current_iso_event_index`, column-hide toggles, `blur_about_screen`.

**Migrations on load** (`ophis_model__validation.js:405-523`):
- Missing/invalid `app_version` → current (9).
- Missing/invalid `scoring_system` → `SCORING_SYSTEM__GTE_V8` regardless of stored `app_version` (recent commit removed the pre-v8 fallback).
- Missing/short `operations` array → `cloneDefaultOperationsForAppVersionGte8()`.
- Invalid scope → `EVENT_SCOPE__HH_MM`.
- Lat outside `±LAT_LIMIT` (65) or long outside `±180` → defaults.

## 7. Excel and PDF export

`ophis_view__export.js` implements three export paths, all triggered from the Export screen (`renderExportZDates`, lines 2–66): `excel-export-link`, `pdf-export-link`, `csv-export-link`. Each is guarded by `validateOutputBeforeExport()` which refuses to run if `appState.latestResults.errors.length > 0`.

**Excel (`exportExcel`, lines 145–180)** uses the `write-excel-file` library. The sheet is dead simple:

| Col | Header (bold) | Cell type per row |
|---|---|---|
| 1 | Date | `type: String` — `zDateTags.z_date_readable_start_no_html` |
| 2 | Hits | `type: Number` — `zDateTags.hit_count` |
| 3 | Score | `type: Number` — `zDateTags.score` |

Rows are built by `newExcelRowForDate` (lines 131–142) and pushed in `processed_z_dates__sorted_by_date` order. **No `formula:` field is ever set** — the entire pipeline emits `type: Number` cells with computed values. There is no round-trip of the user's `X2+oph_round(Y)` expressions into `=…` formulas.

**CSV** (`exportCsv`) uses Papa Parse to emit the same three columns via `writeStringToFile` (Blob download).

**PDF (`exportPdf`, lines 190–509)** uses jsPDF in landscape ('l', line 204). Layout:
- Page 1: title, financial-astrology disclaimer, glossary of terms.
- Page 2: chart snapshot — captured via `getChartElem().toBlob(cb, "image/jpeg", 0.95)` (line 251), *not* html2canvas even though html2canvas is loaded.
- Pages 3+: paginated Iso-Event input dates + Z-Date tables, 15 rows/page (`MAX_DATE_ROWS_PER_PAGE`), styled with #dddddd/#bbbbbb backgrounds and nested tables.

Filename comes from `getFileNameForExport()` — the current Iso-Event name with spaces → underscores.

## 8. Sign-in / activation gate

Currently **disabled** but wired up.

`init_step2_signIn()` (`ophis_main.js:59-117`) runs only when both `isRunningElectron()` and `isFlagEnabled(FEATURE_FLAG__REQUIRE_SIGN_IN)` are true. The feature flag is set to `false` at `ophis_config.js:268` with the code-comment "fake security camera." Additionally, `sha512.min.js` is commented out of `ophis.html:66`, so `sha512` is undefined at runtime — if the flag were flipped without also un-commenting the script tag, `hashAccount()` (`ophis_utils.js:481`, just `return sha512(account)`) would throw a `ReferenceError`.

When enabled, the flow is: modal password dialog → `hashAccount(input)` → linear compare against the 5 hard-coded hex digests in `ACCOUNT_HASHES` (`ophis_config.js:5-11`). On match, `init_step3_loadImages()` sets `appState.isSignedIn = true` (line 134) and pings `window.electronBridge.onSignedIn()` so the Electron main process can enable File-menu items.

No server call, no license file, no device binding, no expiry, no persistence of "activated" state (every launch re-prompts). Ophis is fully offline.

## 9. Astronomy stack

Hybrid: algorithms for continuous quantities, bundled tables for discrete NASA events.

- **Sunset / rise / set / sun & moon positions** — Meeus (via `lib/meeusjs.1.0.3.min.js` wrapped by `lib/meeus-easy.js`). `mooncalcMeeus()` and `suncalcMeeus()` at `meeus-easy.js:2-44`. `ophis_dependencies.js:10-44` (`getSunsetOnNativeUtcDate_private`) tries CosineKitty's `Astronomy.SearchRiseSet('Sun', …)` first if `FEATURE_FLAG__USE_COSINE_KITTY_ASTRONOMY` is on (currently off — the astronomy.browser lib is commented out of ophis.html), else falls back to Meeus. Sampling helper `getSunsetSampling()` in `ophis_utils.js` batches lookups.
- **Moon phase** — `lunarphase-js` library. `getLunarPhase(lunarAge)` (`ophis_view__chart_datasets.js:960-969`) bucketizes by lunar age against hard-coded boundaries; synodic month = `29.53058770576` days (`ophis_config.js:SYNODIC_MONTH`). Phase-to-X/Z-Date match tolerance = 1 day (`LUNAR_DATE_MATCH_TOLERANCE_IN_DAYS`).
- **Eclipses** — pre-processed NASA catalog through year 3000, shipped as JS arrays: `lib/lunar_eclipses_processed.js` (`window.LUNAR_ECLIPSES_PROCESSED`) and `lib/solar_eclipses_processed.js` (`window.SOLAR_ECLIPSES_PROCESSED`). Chart lookup is `binarySearchForEclipse()` in `ophis_view__chart_datasets.js`. Match tolerance = 1.25 days (`ECLIPSE_DATE_MATCH_TOLERANCE_IN_DAYS`). Types encoded T+/T-/P (full/begin-end/partial); B.C. era entries are filtered out (`optimizeEclipseData`).
- **Location picker** — Leaflet 1.8.0 with an **offline tile pyramid** at `img/offline_map/map/{z}/{x}/{y}.png` (`ophis_main.js:211-214`). Map is modal (`showMap`/`hideMap` in `ophis_view__utils.js`); click captures lat/long, snaps into the current Iso-Event.
- **Timezone lookup** — `lib/tz_lookup_oss.js` provides `tzlookup(lat, long)` → IANA zone id, called from `ophis_dependencies.js:51` and used by moment-timezone to convert local X-Date strings ↔ UTC (`convertNativeLocalDateToUtc`, `convertNativeUtcDateToLocalMoment`). `FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT` forces GMT for DAYS-scope events.

The hit symbols on the chart (`img/hit_symbols/{gemini,triangle,diamond,circle}.png`) are **not zodiacal** — they encode hit count 2/3/4/5+ (`ophis_view__chart_config.js:109-117`; `ophis_view__utils.js:211-217`).

## 10. How to extend / modify

- **Add a formula variable other than Y** — currently impossible without touching two places: (a) the stripping pass in `stripOperationEquationString` (`ophis_model__validation.js:77-94`) that substitutes `Y` for validation, and (b) the `new Function("Y", ...)` compile at line 132. Change both to accept, e.g., `(Y, N)`, and update `runOperationFunction` in `ophis_model__operations.js:199` to pass the new argument. Also register any new function/constant tokens by adding to `ALL_OPH_FUNCTIONS` / `ALL_OPH_CONSTANTS` (`ophis_config.js`) so `refreshOperationRows` (`ophis_view__settings.js`) renders them.
- **Add a formula constant** — declare it in `ophis_config.js` (raw + expected-precision pair, alongside `OPH_PI`/`OPH_PHI`/`OPH_CRV`/`OPH_HEP`), add to `ALL_OPH_CONSTANTS`, and add the string substitution to `normalizeOperationEquationString` (`ophis_model__validation.js:19-23`).
- **Change the XLSX export columns** — `newExcelRowForDate` and the header-row block in `exportExcel` at `ophis_view__export.js:131-180`. If you want real `=…` formulas per row, add `type: undefined, formula: "…"` cells there — the write-excel-file library supports it.
- **Change the PDF layout** — `exportPdf` in `ophis_view__export.js:190-509`; `MAX_DATE_ROWS_PER_PAGE` at line 342 controls pagination.
- **Swap the chart type / add a series** — timeline setup is `newChart()` in `ophis_view__chart.js`; per-frame dataset build is `generateChartUpdateStruct` in `ophis_view__chart_datasets.js`. New astronomical overlays should add a `newAstroIndicatorPoint`-style factory and register in `MOON_PHASE_DICT` / `ECLIPSE_DICT` (`ophis_view__chart_config.js`) plus a preloaded image via `loadAstroIndicators`.
- **Add a filter or chart-option toggle** — append to `SERIALIZED_FILTER_FIELDS` or `SERIALIZED_CHART_OPTION_FIELDS` in `ophis_config.js` via `newSerializedFieldObject(...)`. Rendering, event listeners, persistence, and reset all iterate `ALL_SERIALIZED_FIELDS` automatically.
- **Add a scoring system** — add a `SCORING_SYSTEM__*` constant to `ophis_config.js`, add a branch in `scoreZDates` and `getMsrfScoreMultiplier` (`ophis_model__operations.js`), and update the migration default in `ophis_model__validation.js:503-523`.
- **Change default operations shipped with a new Iso-Event** — `DEFAULT_OPHIS_OPERATIONS` in `ophis_model__params.js` and the version-branch factories `cloneDefaultOperationsForAppVersionGte8` / `…Lte7`.

## 11. Notable caveats

- **`nodeIntegration:true` in the renderer (strongly implied).** `window.electronBridge` is called directly from renderer code (`saveFileAs`, `autoSaveToFile`, `openOphFile`, `onSignedIn`, `confirmCloseApp`) and the renderer freely uses global libs. Combined with the `new Function()` formula engine, any XSS-equivalent in an imported `.oph` (a crafted equation surviving the strip → math.js pass) executes in a Node-capable context. Not verified end-to-end — this is an inference from the API shape, not a preload check.
- **Sign-in gate is disabled and half-wired.** Flag off (`ophis_config.js:268`), sha512 script commented out (`ophis.html:66`). Flipping only the flag will crash init_step2. No bypass steps here — mentioning this as a maintenance hazard.
- **`SKIN_MODE__MARKETS` is a dead-end toggle.** It only swaps the header PNG and window title; no market data is fetched or overlaid. Comment at `ophis_view__config.js:4-8` calls it "the beginning of an idea that never panned out really, but no harm keeping it under the hood."
- **`EVENT_TYPE__ASTROLOGICAL` is defined but commented out of the `EVENT_TYPES` enum** (`ophis_config.js:312-318`); only PERSONAL and MARKETS are user-selectable.
- **`OPHIS_SCREEN__DEBUG` is commented out of `OPHIS_SCREENS`** (`ophis_view__config.js:122`) — the module still exists, screen just isn't reachable from the picker.
- **Air-gap intent.** Offline Leaflet tiles, bundled eclipse tables, bundled timezone data, and hard-coded (offline) password hashes all point at a "no network" deployment target. There is no telemetry, no auto-update ping, no license server.
- **Cache-buster on every load.** `ophis.html` appends `?v=<rand>` to every script and to `ophis.css`, defeating the browser cache — desirable during dev, wasteful in a shipped Electron build. Startup is measurably slower than it needs to be.
- **Version string mismatch.** `APP_VERSION = "9"` in `ophis_config.js:3` (with a TODO to sync `package.json`), but the header markup in `ophis.html` still displays "v7"; the runtime overwrites it. The `package.json` semver is the authoritative source pulled by `init_step1_getAppVersion`.
- **`debugger` statements left in.** e.g. `ophis_model__operations.js:54`, `ophis_view__chart_datasets.js:1366`. Harmless unless DevTools is open, but shipping them is a smell.
- **Commented-out dead code is pervasive** — old sunset-sampling comments, an alternative curve-fanout algorithm (`ophis_view__chart_datasets.js:1389-1426`), a pre-Astronomy-lib SunCalc block (`ophis_dependencies.js:11-12`), legacy "About screen" operations table (`ophis_view.js:486-541`), and multiple `console.log` / `printWarning` toggles. Useful history, but obscures the actual runtime path.
- **`FEATURE_FLAG__USE_COSINE_KITTY_ASTRONOMY` is defined but the library is not loaded** in `ophis.html`, so the primary sunset path is always Meeus. If someone flips the flag they'll get `Astronomy is undefined`.
- **Unverified in this pass:** exact contents of `ophis_view__output.js` (loaded 14th but not probed directly); the Electron main-process code (only the renderer-side `app-src/` was inspected — `electronBridge` shape is inferred from call sites, not read from a `preload.js`); whether any of the 5 `ACCOUNT_HASHES` correspond to guessable plaintexts.