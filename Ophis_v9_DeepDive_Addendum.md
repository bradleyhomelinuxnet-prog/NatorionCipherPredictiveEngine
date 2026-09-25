# Ophis v9 — Deep Dive Addendum

## Preface

This document extends the main reverse-engineering report with three targeted deep-dives: a complete end-to-end trace of the compute cycle for a representative event, a mathematical reference for all sixteen default operations, and an exhaustive analysis of the three MSRF filter arrays. Each part stands alone but shares terminology, constants, and source-file citations with the others; read together they cover the full path from `runOphisOnEvent` entry to scored Z-Date output.

## Part I — End-to-end Compute Trace

# Ophis Compute Cycle: End-to-End Trace

**Scenario:** `Test-Bitcoin-Halving-Cycle` — MARKETS, DAYS scope, Dallas (32.8, -96.8), X1=2012-11-28, X2=2016-07-09, GTE_V8 scoring, all 16 default operations at weight 1.0.

Note on operation count: the source at `src/ophis_model__params.js` (`DEFAULT_OPHIS_OPERATIONS`) actually declares **15** operations — 14 legacy operations plus the new Hepta-Cycle operation. For this addendum we treat all 16 as enabled at weight 1.0; where the 16th would be, we use the `OPH_HEP` operation `X1+YxOPH_HEP` (declared but shipped with `enabled = OPERATION_ENABLED_FALSE` at `src/ophis_model__params.js` line for op #16). Under the GTE_V8 clone path (`cloneDefaultOperationsForAppVersionGte8`, same file) all ops are force-enabled and both `OPERATION_EQUATION_FOR_RADIUS_PROJECTION` and `OPERATION_EQUATION_FOR_ORIGINAL_BETA_PHI_6` are re-weighted to ALPHA (1.0). For this trace we assume the prompt's "all 16 at weight 1.0" — i.e. every operation is ALPHA.

---

## 0) Entry: `runOphisOnEvent(isoEvent)`

Defined at `src/ophis_model__operations.js:31`.

- `effectiveXDates = getEffectiveXDates(isoEvent)` → both X-Dates enabled → array of length 2. (`ophis_model__operations.js:3`)
- `effectiveOperations = getEffectiveOperations(isoEvent)` → 16 cloned operations, each with `cached_operation_function` compiled via `validateOperationString` (`ophis_model__operations.js:22`).
- Branch checks (`ophis_model__operations.js:44-63`):
  - `effectiveXDates.length (2) >= MINIMUM_NUMBER_OF_X_DATES (2)` → pass.
  - `isoEvent.scope == EVENT_SCOPE__DAYS` — neither the MONTHS nor YEARS blockers fire; enter the else branch.
  - `effectiveOperations.length (16) >= MINIMUM_OPERATIONS_REQUIRED (1)` → pass.
  - `validateXDateSpread` — X1 and X2 are ~1319 days apart, well above `MINIMUM_DAYS_BETWEEN_FIRST_TWO_X_DATES = 1` → pass.
- Calls `generateYAndZStructs(isoEvent, effectiveOperations, yStructsArray, zStructsDict)` (`ophis_model__operations.js:64`).

After it returns, `scoringSystem = getScoringSystem(isoEvent)` → `SCORING_SYSTEM__GTE_V8` (`ophis_model__operations.js:16`).

Final results object built at `ophis_model__operations.js:74`:
```js
{ errors: [], y_structs: [...], z_structs: {...}, selected_y_struct_for_details: 0 }
```

---

## 1) Pair generation: `generateYAndZStructs`

Defined at `src/ophis_model__operations.js:83`.

Loop structure at `:88-93`: `for i in [1..n)`, inner `for k in [0..i)`. With `n=2`, the only pair is `(k=0, i=1)` → `(X1, X2)`.

**Native-date conversion** — `xDateToNativeDate(isoEvent.scope, ithXDate, lat, long)` at `src/ophis_utils.js` (`xDateToNativeDate`). Because `eventScope == EVENT_SCOPE__DAYS`:
- `timeToUse = TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE = "0:00"` — the local times 16:34 / 16:46 are DISCARDED.
- `FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT === true` (`ophis_config.js`) → lat/long forced to 0/0 and timezone becomes GMT.

So the natives are interpreted as **midnight UTC** on their calendar date:
- `x1NativeDate = 2012-11-28T00:00:00Z` → millis `1354060800000`
- `x2NativeDate = 2016-07-09T00:00:00Z` → millis `1467993600000`

**Rotation count** — `axialRotationsBetweenNativeDates(scope=DAYS, older=x1, newer=x2, lat=32.8, long=-96.8)` at `src/ophis_utils.js` (function `axialRotationsBetweenNativeDates`).

Because `eventScope != EVENT_SCOPE__HH_MM`, the sunset branch is skipped — the else clause runs:
```
millisDifferenceManual = newerNativeDate.getTime() - olderNativeDate.getTime()
                        = 1467993600000 - 1354060800000
                        = 113932800000
dayDifferenceManual = round(113932800000 / 86400000) at axial-rotation precision (1dp)
                    = 1319.0
```

**axialRotationCountY = 1319 days.** (Sunset-adjustment is a no-op for DAYS scope: it's already been locked to 00:00 GMT for both endpoints.)

Then `runOperations(effectiveOperations, DAYS, x1Native, x2Native, 1319, 32.8, -96.8, alreadyCalculatedSunsets)` is called at `ophis_model__operations.js:99`.

A single `yStruct` is pushed (`ophis_model__operations.js:105-111`):
```js
{ y_ordinal: 0, rotation_count_y: 1319, x_1_ordinal: 0, x_2_ordinal: 1, operation_results: [...16 results...] }
```

`tagZDates(yStruct, operationResults, zStructsDict_out)` runs immediately after (`:113`).

---

## 2) Sixteen operations: applying `cached_operation_function(Y=1319)`

Constants (from `src/ophis_config.js`):
- `OPH_PI = 3.14`  (`FEATURE_FLAG__USE_EXPECTED_CONSTANTS_PRECISION` true → `PI_TO_2_DECIMAL_PLACES_AS_EXPECTED`)
- `OPH_PHI = 1.618` (three-decimal exception noted in comment)
- `OPH_CRV = 5.08` (two-decimal)
- `OPH_HEP = 7.01`

The core loop is `runOperations` at `ophis_model__operations.js:172`:
- Guard at `:175`: 1319 ≤ 36500, no clamp.
- Per op (`:180`): `ithZValue_raw = op.cached_operation_function(1319)`; guard against `MAXIMUM_ROTATION_COUNT_Z=36500` at `:184`; convert to millis at `:192` (BEFORE rounding); then round to time precision (2 dp) at `:193`.
- `getStartingX` (`ophis_model__operations.js:129`) inspects the equation's `"X1+"` / `"X2+"` prefix to pick the anchor date.
- `FEATURE_FLAG__SUNSET__ADD_Z_VALUE_TO_X_DATE_PRIOR_SUNSET = false` → `dateToWhichToAddZValue_native = startingXDate_native` (unchanged) (`:210`).
- Z-millis = anchor.getTime() + `ithZValue_raw * MILLIS_PER_DAY` (unrounded product, `:192, :215`).

For each op below: Y=1319 → raw Z (days) → rounded Z → anchor + Z (in whole days for the readable Z-date).

Anchor bases (00:00 GMT):
- X1 = 2012-11-28
- X2 = 2016-07-09

| # | Equation | Anchor | Raw Y-comp | Z (days, rounded 2dp) | Round to whole days | Z-Date (native start) |
|---|---|---|---|---|---|---|
| 1 | `X2+oph_round(Y)` | X2 | round(1319)=1319 | 1319.00 | 1319 | 2020-02-19 |
| 2 | `X2+oph_flip(oph_round(Y))` | X2 | flip(1319)=9131 | 9131.00 | 9131 | 2041-07-04 |
| 3 | `X2+Y/OPH_CRV` | X2 | 1319/5.08=259.6457 | 259.65 | 260 | 2017-03-26 |
| 4 | `X1+(Y/2.0)xOPH_PI` | X1 | 659.5·3.14=2070.83 | 2070.83 | 2071 | 2018-08-01 |
| 5 | `X2+Y/OPH_PHI` | X2 | 1319/1.618=815.204 | 815.20 | 815 | 2018-10-02 |
| 6 | `X2+(Y/2.0)xOPH_PHI` | X2 | 659.5·1.618=1067.071 | 1067.07 | 1067 | 2019-06-11 |
| 7 | `X1+(Y/2.0)xOPH_CRV` | X1 | 659.5·5.08=3350.26 | 3350.26 | 3350 | 2022-01-27 |
| 8 | `X2+(Y/2.0)xOPH_PI` | X2 | 659.5·3.14=2070.83 | 2070.83 | 2071 | 2022-03-11 |
| 9 | `X2+YxOPH_PHI` | X2 | 1319·1.618=2134.142 | 2134.14 | 2134 | 2022-05-13 |
| 10 | `X1+YxOPH_PI` | X1 | 1319·3.14=4141.66 | 4141.66 | 4142 | 2024-03-11 |
| 11 | `X2+(Y/2.0)xOPH_CRV` | X2 | 659.5·5.08=3350.26 | 3350.26 | 3350 | 2025-09-11 |
| 12 | `X2+YxOPH_PI` | X2 | 1319·3.14=4141.66 | 4141.66 | 4142 | 2027-11-13 |
| 13 | `X1+YxOPH_CRV` | X1 | 1319·5.08=6700.52 | 6700.52 | 6701 | 2031-03-25 |
| 14 | `X2+YxOPH_CRV` | X2 | 1319·5.08=6700.52 | 6700.52 | 6701 | 2034-11-04 |
| 15 | `X1+YxOPH_HEP` | X1 | 1319·7.01=9246.19 | 9246.19 | 9246 | 2038-02-25 |
| 16 | *(dup placeholder — see note)* | — | — | — | — | — |

For DAYS scope the `zDate_native_start`/`_end` are collapsed to the day-boundary via `nativeDateToXDate` → `xDateToNativeDate` round-trip at `ophis_model__operations.js:224-232` (with `lat=0, long=0` because `FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT` is enabled). Start == End for DAYS.

**`rotation_count_z`** is computed at `:246` as `roundNumberToAxialRotationPrecision(ithZValue_raw)` — i.e. 1-decimal rounding of the same Z-value (e.g. row 3: 259.6, row 4: 2070.8). This is what feeds the MSRF filter.

---

## 3) Hit-count scoring: `scoreZDates` + `tagZDates`

Tagging (`tagZDates`, `ophis_model__operations.js:400`):
- For each op result, `ithOperationResultDictKey = zDate_native_start.getTime() + ""`.
- If no zStruct exists at that key, a fresh one is created (`:416`) with empty `operation_match_structs`, `msrf_match_structs`, `score=0`, `hit_count=0`.
- Each operation result appends an `operationMatchStruct = { y_struct, operation_result }` (`:434`).
- Then `getMsrfMatch(rotation_count_z)` is called on the 1-dp Z-rotation; if non-null, an `msrfMatchStruct` is appended (`:436-441`).

Note the collision behavior: rows 4 & 8 (2071 days), 7 & 11 (3350), 10 & 12 (4142), 13 & 14 (6701) each round to the same integer day count from **different anchors**, so their millis keys differ — they DO NOT merge. Each Z-Date bucket in `zStructsDict` therefore ends up with one operation hit apiece — 15 distinct z-buckets (or 16 if the placeholder resolves to a different key).

Scoring (`scoreZDates`, `ophis_model__operations.js:322`):
- Sort operation and MSRF matches (`:329-330`).
- `operationSubscore = getOperationScore(effectiveOperations, operation_match_structs)` (`ophis_model__operations.js:395`): for each match, look up the operation's `weight` (1.0 here), stamp it into the match struct's `points`, and accumulate. With 1 op-hit per bucket at weight 1.0 → operationSubscore = 1.0.
- `msrfMatchSubscore = sumUpMsrfMatchSubscore(msrf_match_structs, GTE_V8)` (`:346`): under GTE_V8 the FIRST msrf-match whose multiplier equals the overall winning multiplier is EXCLUDED from the additive base (it becomes the multiplier instead). Any remaining msrf matches contribute their `points`.
- `finalScore = operationSubscore + msrfMatchSubscore`, then under GTE_V8 (`ophis_model__operations.js:348`) multiplied by `getMsrfScoreMultiplier(msrf_match_structs)`.
- Fields written back onto the z-struct (`:363-368`): `operation_score`, `operation_hit_count`, `score`, `base_score_pre_multiply`, `hit_count = operation_hit_count + msrf_hit_count`.

For our scenario, single-op-hit-per-bucket means `operation_hit_count = 1` and `hit_count = 1 + msrfHitCount`.

---

## 4) MSRF match check: `getMsrfMatch`

Defined at `src/ophis_utils.js` (`getMsrfMatch`). Input: `ithRotationCountZ` (1-dp).

Order of checks:
1. **VORTEX first** — iterate `MSRF_FILTER__VORTEX = [21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2]`; a match requires `areEqualWithinTolerance(vortexNumber, Z, VORTEX_FILTER_MATCH_TOLERANCE)` where `VORTEX_FILTER_MATCH_TOLERANCE = 0.1` (`ophis_config.js`). Multiplier 2.0, points 2.
2. **".5" rejection** — if the Z (as string) ends in `.5`, return null (Jason's rule: exact midpoints don't count).
3. **IMPORTANT exact match** on `oph_round(Z)` (whole integer) against `MSRF_FILTER__IMPORTANT`. Multiplier 2.0, points 2.
4. **NORMAL exact match** on `oph_round(Z)` against `MSRF_FILTER__NORMAL`. Multiplier 1.5, points 1.

Multipliers under GTE_V8: `SCORE_MULTIPLIER__NORMAL_MSRF_MATCH = 1.5`, `SCORE_MULTIPLIER__IMPORTANT_MSRF_MATCH = 2.0`, `SCORE_MULTIPLIER__VORTEX_MSRF_MATCH = 2.0` (`ophis_model__params.js`).

Checking our 16 z-rotations against the filter lists (`ophis_model__params.js`):

| # | Z rotation (1dp) | Rounded whole | Match? |
|---|---|---|---|
| 1 | 1319.0 | 1319 | none |
| 2 | 9131.0 | 9131 | none |
| 3 | 259.6 | 260 | **NORMAL 260** — multiplier 1.5, +1 pt |
| 4 | 2070.8 | 2071 | none |
| 5 | 815.2 | 815 | none |
| 6 | 1067.1 | 1067 | none |
| 7 | 3350.3 | 3350 | none |
| 8 | 2070.8 | 2071 | none |
| 9 | 2134.1 | 2134 | none |
| 10 | 4141.7 | 4142 | none |
| 11 | 3350.3 | 3350 | none |
| 12 | 4141.7 | 4142 | none |
| 13 | 6700.5 | — | ".5" rejection at 1-dp → null |
| 14 | 6700.5 | — | ".5" rejection → null |
| 15 | 9246.2 | 9246 | none |

Only bucket #3 (2017-03-26) gets an MSRF tag: NORMAL, msrf_number=260, points=1.

**Bucket #3 final score under GTE_V8:**
- `operationSubscore = 1.0`
- `msrfMatchSubscore`: 1 msrf, its multiplier (1.5) equals overall winner (1.5) → excluded from additive base → `msrfMatchSubscore = 0`
- `finalScore = (1.0 + 0) * 1.5 = 1.5`
- `hit_count = 1 (op) + 1 (msrf) = 2`

Every other bucket: `finalScore = 1.0 * 1.0 = 1.0`, `hit_count = 1`.

---

## 5) Sunset adjustment (`sunsetOnZDate`)

For this scenario, sunset is effectively a **no-op**, and here's the exact why in the source:

- The gating branch is at `ophis_model__operations.js:218`: `if ( eventScope == EVENT_SCOPE__HH_MM && isFlagEnabled(FEATURE_FLAG__SUNSET__CALCULATE_BEFORE_N_AFTER) )`. Our scope is DAYS, so we take the else branch at `:229`.
- In the else branch (`:230-238`): `FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT` is true, so `lat/long` are forced to 0/0, then `nativeDateToXDate` → `xDateToNativeDate` collapses the Z-date to 00:00 GMT of that calendar day. `zDate_native_start === zDate_native_end`.
- Similarly `FEATURE_FLAG__SUNSET__ADD_Z_VALUE_TO_X_DATE_PRIOR_SUNSET = false` (`ophis_config.js`), so at `:210` the anchor stays exactly at the X-Date millis (no "back up to prior sunset" happens).

Where sunset **does** matter: `findAlreadyCalculatedSunset` (`ophis_model__operations.js:143`) exists so trigonometric rounding drift between neighboring sunset computations gets snapped into a single canonical sunset (tolerance `ALREADY_CALCULATED_SUNSET_TOLERANCE_IN_MILLIS = MILLIS_PER_HOUR`). It only runs in the HH:MM branch.

For DAYS-scope Dallas Halving runs, the location and local times are informationally recorded on the isoEvent but do not affect the produced dates.

---

## 6) Final Z-Date record shape

Two objects to distinguish. Per-operation `operationResult` (built at `ophis_model__operations.js:270`):
```
z_value                        // rounded Z (2dp days)
rotation_count_y               // 1319
rotation_count_z               // 1-dp Z rotation used for MSRF
z_date_native                  // raw Date at anchor + Z*MILLIS_PER_DAY
z_date_native_start            // day-collapsed native (== end for DAYS)
z_date_native_end
z_date_readable_start          // formatted date-only for DAYS
z_date_readable_end
z_date_readable_start_no_html
z_date_readable_end_no_html
x_date_native_start            // the anchor (X1 or X2 native)
x_date_native_other            // the other X-Date
operation_ordinal              // index into effectiveOperations
operation                      // the operation object itself
hash                           // "" + i + x1millis + x2millis + zStartMillis
hash_without_ordinal           // "" + anchorMillis + zStartMillis
z_date_dict_key                // zStartMillis (bucket key in zStructsDict)
```

Aggregated `zStruct` (bucket in `zStructsDict`, built at `ophis_model__operations.js:416` and finalized in `scoreZDates`):
```
z_date_native, z_date_native_start, z_date_native_end
z_date_readable_start, z_date_readable_end
z_date_readable_start_no_html, z_date_readable_end_no_html
operation_match_structs        // [{ y_struct, operation_result, points }, ...]
msrf_match_structs             // [{ msrf_filter, msrf_number, points, css_class, readable_name, y_struct, operation_result }, ...]
operation_score                // sum of op weights
operation_hit_count            // len(operation_match_structs)
score                          // final, post-multiplier
base_score_pre_multiply        // operationSubscore + msrfSubscore
hit_count                      // operation_hit_count + msrf_hit_count
```

---

## 7) Downstream flow after `runOphisOnEvent` returns

`runOphisOnEvent` returns to its caller with `{ errors, y_structs, z_structs, selected_y_struct_for_details }`. The source files provided don't include the renderer layer, so I'm not going to fabricate function names. Based on the field names it exposes, the downstream consumers are the ones that read these keys:

- `y_structs` — driven by `selected_y_struct_for_details` (an index into the array), consumed by the Y-details panel / X-pair selector.
- `z_structs` — the sortable Z-Date table; the sort keys enumerated in `ophis_config.js` (`Z_DATE_SORT_TYPE__SCORE / DATE / MSRF / HIT_COUNT / OPERATIONS`) map directly to fields on each z-struct (`score`, `z_date_native_start`, `msrf_match_structs`, `hit_count`, `operation_match_structs`).
- The chart layer consumes the same z-structs plus the `SERIALIZED_CHART_OPTION_FIELDS` (moon phases, eclipses) checked against `LUNAR_DATE_MATCH_TOLERANCE` / `ECLIPSE_DATE_MATCH_TOLERANCE`.
- The filter layer applies `SERIALIZED_FILTER_FIELDS` (before/after X-Date, min hit count, min score, MSRF-required, beyond-N-days) to hide z-structs from the visible table.
- `errors` — surfaced to the top-of-event error banner.

The exact renderer function names (e.g. table-rendering, chart-drawing) are not in the provided source, so I'll stop short of naming them.

---

## Quick reference: constants used

| Constant | Value | Source |
|---|---|---|
| `OPH_PI` | 3.14 | `ophis_config.js` (`PI_TO_2_DECIMAL_PLACES_AS_EXPECTED`) |
| `OPH_PHI` | 1.618 | `ophis_config.js` (`PHI_TO_3_DECIMAL_PLACES_AS_EXPECTED` — intentional 3dp exception) |
| `OPH_CRV` | 5.08 | `ophis_config.js` (`CURVATURE_TO_2_DECIMAL_PLACES_AS_EXPECTED`) |
| `OPH_HEP` | 7.01 | `ophis_config.js` |
| `MILLIS_PER_DAY` | 86,400,000 | `ophis_config.js` |
| `MAXIMUM_ROTATION_COUNT_Y/Z` | 36,500 | `ophis_config.js` |
| `VORTEX_FILTER_MATCH_TOLERANCE` | 0.1 | `ophis_config.js` |
| `DECIMAL_PRECISION__TIME` | 2 | `ophis_config.js` |
| `DECIMAL_PRECISION__AXIAL_ROTATIONS` | 1 | `ophis_config.js` |

Source paths referenced (absolute where useful):
- `src/ophis_model__operations.js` — `runOphisOnEvent`, `generateYAndZStructs`, `runOperations`, `tagZDates`, `scoreZDates`, `getMsrfScoreMultiplier`, `sumUpMsrfMatchSubscore`, `getOperationScore`
- `src/ophis_model__params.js` — `DEFAULT_OPHIS_OPERATIONS`, `MSRF_FILTER__NORMAL/IMPORTANT/VORTEX`, `SCORE_MULTIPLIER__*`, `POINTS__*`
- `src/ophis_utils.js` — `xDateToNativeDate`, `axialRotationsBetweenNativeDates`, `getMsrfMatch`, `getSunsetNativeUtcDateBefore/After`, `findAlreadyCalculatedSunset` (in operations.js), `roundNumberToAxialRotationPrecision`, `roundNumberToTimePrecision`, `oph_flip`, `oph_round`
- `src/ophis_config.js` — all constants and feature flags cited above

## Part II — All 16 Default Operations, Mathematically

# Ophis Default Operations — Complete Reference

## 1) Constants

Sourced from `ophis_config.js`. With `FEATURE_FLAG__USE_EXPECTED_CONSTANTS_PRECISION = true` and `DECIMAL_PRECISION__TIME = 2`, the shipped values are:

| Constant | Effective Value | Raw / Derivation | Notes |
|---|---|---|---|
| `OPH_PI` | **3.14** | `Math.PI` rounded to 2dp | Circle constant. |
| `OPH_PHI` | **1.618** | `1.61803398875` (kept at 3dp intentionally, since Jason often says "1.618") | Golden ratio. |
| `OPH_CRV` | **5.08** | `PI * PHI = 5.0831…` rounded to 2dp | "Curvature" — π·φ product. |
| `OPH_HEP` | **7.01** | Hard-coded literal | "Hepta-cycle" constant, added early-August 2025. Approx. 2π + 0.73 or 7-ish; not a standard mathematical constant. |

---

## 2) Helper Functions (`ophis_utils.js`)

All are thin wrappers around `Math.*` except `oph_flip`.

| Function | Implementation | Purpose |
|---|---|---|
| `oph_sqrt(x)` | `Math.sqrt(x)` | Square root — harmonic/Gann-square scaling. |
| `oph_abs(x)` | `Math.abs(x)` | Absolute value. |
| `oph_floor(x)` | `Math.floor(x)` | Round down. |
| `oph_ceil(x)` | `Math.ceil(x)` | Round up. |
| `oph_log(x)` | `Math.log(x)` | Natural log. |
| `oph_sin(x)` | `Math.sin(x)` | Sine (radians). |
| `oph_cos(x)` | `Math.cos(x)` | Cosine (radians). |
| `oph_tan(x)` | `Math.tan(x)` | Tangent (radians). |
| `oph_exp(x)` | `Math.exp(x)` | e^x. |
| `oph_round(x)` | `Math.round(x)` | Round to nearest integer (wrapped so it can be swapped later). |
| `oph_flip(x)` | custom | Reverses the digits while preserving decimal-point column position. |

### `oph_flip` worked examples

The algorithm:
1. Stringify the number.
2. Note the index of `.` in that string (before removal).
3. Remove the `.`, reverse the digits.
4. Reinsert `.` at the **same string-index** it was at originally.
5. Parse back to a Number.

Because the decimal is reinserted at the **original position from the left**, not the equivalent position from the right, results are non-obvious:

| Input | Stringified | Decimal index | After digit reverse | Reinsert `.` at index | Result |
|---|---|---|---|---|---|
| `123` | `"123"` | –1 (none) | `"321"` | no insert | **321** |
| `100` | `"100"` | –1 | `"001"` | no insert | **1** (leading zeros drop on parse) |
| `12.5` | `"12.5"` | 2 | `"521"` | `"52.1"` | **52.1** |
| `3.14` | `"3.14"` | 1 | `"413"` | `"4.13"` | **4.13** |
| `100.5` | `"100.5"` | 3 | `"5001"` | `"500.1"` | **500.1** |
| `0.25` | `"0.25"` | 1 | `"520"` | `"5.20"` | **5.2** |

So `oph_flip` is a *digit reversal with a positional decimal*, not a true numeric reflection — used in Gann/Bradley traditions as a "mirror" projection.

---

## 3) The 16 Default Operations

Each operation is defined by `newOperation(equation, weight, enabled)`. Note that the `newOperation` function **always sets `enabled: true`** regardless of the third argument (a shipped quirk — see `ophis_utils.js` line where `enabled: true` is hard-coded). Then `cloneDefaultOperationsForAppVersionGte8` also promotes two β-weight operations to α-weight. Below are the **shipped v≥8 defaults**.

Weights: **α = 1.0** (`POINTS__ALPHA_OPERATION_MATCH`), **β = 0.5** (`POINTS__BETA_OPERATION_MATCH`).

Effective behavior uses **Y = 100 days**. Where an equation uses `X1` or `X2` (prior anchor dates in milliseconds/days from epoch), the numeric answer is expressed as `X_ + delta`.

---

### Op 1 — Isometric Date (Y + X2)

- **Raw equation:** `X2+oph_round(Y)`
- **Standard notation:** \(Z = X_2 + \operatorname{round}(Y)\)
- **What it computes:** Adds the whole-day count Y directly to the second anchor date X2. The "isometric" or 1:1 projection.
- **Cycle-theory meaning:** The most fundamental Gann-style operation — a **plain time projection**. If X1→X2 took Y days, X2→Z takes another Y days. This is the "square of time" identity operation and the baseline against which all curved projections are measured.
- **Effective behavior (Y=100):** Z = X2 + 100 days.
- **Weight / enabled (v≥8):** α (1.0) / true.

### Op 2 — Holographic / Digit-flipped Isometric

- **Raw equation:** `X2+oph_flip(oph_round(Y))`
- **Standard notation:** \(Z = X_2 + \operatorname{flip}(\operatorname{round}(Y))\)
- **What it computes:** Reverses the digits of Y and adds that to X2.
- **Cycle-theory meaning:** Called the **"Holo-"** projection in the source comment. This is a **Gann/Bradley "mirror" or "reflection"** technique — the belief that the digit-reverse of a cycle length is itself a resonant cycle length. Metaphysically it's the "as above, so below" mirror. Mathematically it's opaque and coordinate-system-dependent (base-10-specific), which is why it's philosophically distinct from the constant-scaled operations.
- **Effective behavior (Y=100):** flip(100) = 1, so Z = X2 + 1 day.
- **Weight / enabled (v≥8):** α (1.0) / true.

### Op 3 — Curvature Division from X2

- **Raw equation:** `X2+Y/OPH_CRV`
- **Standard notation:** \(Z = X_2 + \dfrac{Y}{\pi\varphi}\)
- **What it computes:** Divides Y by curvature (~5.08) and adds to X2.
- **Cycle-theory meaning:** OPH_CRV = π·φ combines the two dominant cycle constants into a single "curvature." Dividing by it *contracts* the cycle — this is a **harmonic sub-cycle projection**. Not a standard Gann term, but consistent with the π·φ "master curve" ideas in modern financial-astrology practice.
- **Effective behavior (Y=100):** 100 / 5.08 ≈ 19.685, so Z ≈ X2 + 19.7 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 4 — Half-Cycle Radius Projection from X1

- **Raw equation:** `X1+(Y/2.0)xOPH_PI`
- **Standard notation:** \(Z = X_1 + \dfrac{Y}{2}\cdot\pi\)
- **What it computes:** Half of Y times π, added to X1.
- **Cycle-theory meaning:** Classic **circumference-from-radius** logic — if Y is a diameter, then (Y/2)·π is a semicircle arc, i.e. a **half-rotation** of the cycle. Gann's "squaring the circle" family. Rooted at X1 (the origin), so this is projecting the arc from the start of the cycle.
- **Effective behavior (Y=100):** 50 × 3.14 = 157, so Z = X1 + 157 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 5 — Golden Ratio Division from X2

- **Raw equation:** `X2+Y/OPH_PHI`
- **Standard notation:** \(Z = X_2 + \dfrac{Y}{\varphi}\)
- **What it computes:** Y divided by φ (≈0.618·Y), added to X2.
- **Cycle-theory meaning:** The **Fibonacci golden-ratio retracement/extension** — the 61.8% projection that is ubiquitous in technical analysis. Explicitly Fibonacci/PHI tradition; the single most well-known cycle operation in Western technical trading.
- **Effective behavior (Y=100):** 100 / 1.618 ≈ 61.805, so Z ≈ X2 + 61.8 days.
- **Weight / enabled (v≥8):** α (1.0) / true.

### Op 6 — Half-Cycle Golden Projection from X2 (`OPERATION_EQUATION_FOR_ORIGINAL_BETA_PHI_6`)

- **Raw equation:** `X2+(Y/2.0)xOPH_PHI`
- **Standard notation:** \(Z = X_2 + \dfrac{Y}{2}\cdot\varphi\)
- **What it computes:** Half of Y multiplied by φ, added to X2.
- **Cycle-theory meaning:** A **half-cycle golden projection** — treats Y as a full cycle, cuts it in half, then extends by φ. Combines the "half-cycle" tradition with Fibonacci scaling. Promoted from β to α weight in v≥8, signaling Jason's increased confidence in it.
- **Effective behavior (Y=100):** 50 × 1.618 = 80.9, so Z ≈ X2 + 80.9 days.
- **Weight / enabled (v≥8):** α (1.0) / true. *(Promoted from β in v≥8.)*

### Op 7 — Half-Cycle Curvature from X1

- **Raw equation:** `X1+(Y/2.0)xOPH_CRV`
- **Standard notation:** \(Z = X_1 + \dfrac{Y}{2}\cdot(\pi\varphi)\)
- **What it computes:** Half of Y times curvature, added to X1.
- **Cycle-theory meaning:** A **half-cycle curved (π·φ) projection** from the origin X1. Combines the "diameter→arc" logic of Op 4 with the golden factor of φ. Rooted at X1 (start of cycle), suggesting a fresh semicircle traced from origin, curved by φ.
- **Effective behavior (Y=100):** 50 × 5.08 = 254, so Z = X1 + 254 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 8 — Half-Cycle Radius from X2

- **Raw equation:** `X2+(Y/2.0)xOPH_PI`
- **Standard notation:** \(Z = X_2 + \dfrac{Y}{2}\cdot\pi\)
- **What it computes:** Semicircle-arc distance added to X2 rather than X1.
- **Cycle-theory meaning:** Same as Op 4 but anchored at X2 — X2 is now the "hub" of a new half-cycle rotation. Continuation logic vs. Op 4's fresh-start logic. Both are legitimate π-based rotational projections.
- **Effective behavior (Y=100):** 50 × 3.14 = 157, so Z = X2 + 157 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 9 — Full Golden Extension from X2

- **Raw equation:** `X2+YxOPH_PHI`
- **Standard notation:** \(Z = X_2 + Y\cdot\varphi\)
- **What it computes:** Y multiplied by the golden ratio, added to X2.
- **Cycle-theory meaning:** The **1.618 Fibonacci extension** — the second-most-famous Fibonacci projection level. Standard TA fare. Strongly principled in the Fibonacci tradition. Its α weighting reflects widespread acceptance.
- **Effective behavior (Y=100):** 100 × 1.618 = 161.8, so Z = X2 + 161.8 days.
- **Weight / enabled (v≥8):** α (1.0) / true.

### Op 10 — Full Radius (π) Projection from X1 (`OPERATION_EQUATION_FOR_RADIUS_PROJECTION`)

- **Raw equation:** `X1+YxOPH_PI`
- **Standard notation:** \(Z = X_1 + Y\cdot\pi\)
- **What it computes:** Y times π, added to X1.
- **Cycle-theory meaning:** The **full circumference projection** — if Y is a radius, then Y·π is half the full circumference (or Y·2π is the whole circle). Deep Gann tradition: converting between linear time (Y days) and rotational time (arc). Promoted to α weight in v≥8 — Jason believes X1-rooted radius projections are more reliable than the code originally treated them.
- **Effective behavior (Y=100):** 100 × 3.14 = 314, so Z = X1 + 314 days.
- **Weight / enabled (v≥8):** α (1.0) / true. *(Promoted from β in v≥8.)*

### Op 11 — Half-Cycle Curvature from X2

- **Raw equation:** `X2+(Y/2.0)xOPH_CRV`
- **Standard notation:** \(Z = X_2 + \dfrac{Y}{2}\cdot(\pi\varphi)\)
- **What it computes:** Half of Y times curvature, added to X2.
- **Cycle-theory meaning:** Same as Op 7 but anchored at X2 — the second anchor becomes the pivot of a new curved half-cycle. Consistent with Ophis's "everything comes in an X1-rooted and X2-rooted flavor" design pattern.
- **Effective behavior (Y=100):** 50 × 5.08 = 254, so Z = X2 + 254 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 12 — Full Radius (π) from X2

- **Raw equation:** `X2+YxOPH_PI`
- **Standard notation:** \(Z = X_2 + Y\cdot\pi\)
- **What it computes:** Y times π, added to X2.
- **Cycle-theory meaning:** X2-rooted counterpart to Op 10. Same π-rotational logic; continuation semantics rather than fresh-origin.
- **Effective behavior (Y=100):** 100 × 3.14 = 314, so Z = X2 + 314 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 13 — Full Curvature from X1

- **Raw equation:** `X1+YxOPH_CRV`
- **Standard notation:** \(Z = X_1 + Y\cdot(\pi\varphi)\)
- **What it computes:** Y times π·φ (~5.08), added to X1.
- **Cycle-theory meaning:** The **full-magnitude curvature projection** from origin. This is the "master cycle" projection: it treats Y as a linear measure and blows it up by both the rotational constant π AND the harmonic constant φ. It's the longest projection in the natural set — a 5x-plus expansion of the input cycle.
- **Effective behavior (Y=100):** 100 × 5.08 = 508, so Z = X1 + 508 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 14 — Full Curvature from X2

- **Raw equation:** `X2+YxOPH_CRV`
- **Standard notation:** \(Z = X_2 + Y\cdot(\pi\varphi)\)
- **What it computes:** Same as Op 13, anchored at X2.
- **Cycle-theory meaning:** The X2-rooted "master curvature" — treats the second anchor as pivot. Together with Op 13, this is the outer boundary of the natural set.
- **Effective behavior (Y=100):** 100 × 5.08 = 508, so Z = X2 + 508 days.
- **Weight / enabled (v≥8):** β (0.5) / true.

### Op 15 — Golden Half-Cycle from X2 *(same equation appears twice)*

Note: This entry is the second occurrence of `X2+(Y/2.0)xOPH_PHI` — cross-check `newOperation(OPERATION_EQUATION_FOR_ORIGINAL_BETA_PHI_6, …)` at index 5 vs. this array element. Looking at the array carefully, positions 5 (`// 7.`) and this operation are the same equation — the DEFAULT_OPHIS_OPERATIONS array as posted has 15 entries prefixed with `// 2.` through `// 15.` plus the Hepta-cycle, for a **total of 16**. The equation for "Y div. 2 X 1.618 + X2" appears **once**. My numbering above tracked the array indices; the source comment numbering (2–15) is a legacy labeling artifact. Total array length = 16.

*(Corrected: no duplicate. There are 15 pre-Hepta ops + Hepta = 16, all unique equations.)*

### Op 16 — Hepta-Cycle from X1 (New, Aug 2025)

- **Raw equation:** `X1+YxOPH_HEP`
- **Standard notation:** \(Z = X_1 + Y\cdot 7.01\)
- **What it computes:** Y multiplied by ~7.01, added to X1.
- **Cycle-theory meaning:** The **"Hepta-Cycle"** — a 7-based projection. 7 is a sacred/harmonic number across esoteric traditions (7 planets in classical astrology, 7-day week, 7 chakras) and shows up in Gann's own writings as a preferred cycle count. The `.01` offset is unexplained in the source — possibly an empirical tune. This is the newest and least conventional formula; it is **α-weighted but disabled by default** in the raw defaults array, then force-enabled by the v≥8 clone function.
- **Effective behavior (Y=100):** 100 × 7.01 = 701, so Z = X1 + 701 days.
- **Weight / enabled (raw):** α (1.0) / **false** (raw); **true** (v≥8 clone forces enabled=true on all).

---

### Complete Y=100 summary table

| # | Equation | Weight | Z – anchor (Y=100) |
|---|---|---|---|
| 1 | `X2+oph_round(Y)` | α | +100.0 (X2) |
| 2 | `X2+oph_flip(oph_round(Y))` | α | +1.0 (X2) |
| 3 | `X2+Y/OPH_CRV` | β | +19.69 (X2) |
| 4 | `X1+(Y/2.0)xOPH_PI` | β | +157.0 (X1) |
| 5 | `X2+Y/OPH_PHI` | α | +61.80 (X2) |
| 6 | `X2+(Y/2.0)xOPH_PHI` | α (promoted) | +80.9 (X2) |
| 7 | `X1+(Y/2.0)xOPH_CRV` | β | +254.0 (X1) |
| 8 | `X2+(Y/2.0)xOPH_PI` | β | +157.0 (X2) |
| 9 | `X2+YxOPH_PHI` | α | +161.8 (X2) |
| 10 | `X1+YxOPH_PI` | α (promoted) | +314.0 (X1) |
| 11 | `X2+(Y/2.0)xOPH_CRV` | β | +254.0 (X2) |
| 12 | `X2+YxOPH_PI` | β | +314.0 (X2) |
| 13 | `X1+YxOPH_CRV` | β | +508.0 (X1) |
| 14 | `X2+YxOPH_CRV` | β | +508.0 (X2) |
| 15 | *(see caveat above — array is 15 unique entries + Hepta = 16)* | | |
| 16 | `X1+YxOPH_HEP` | α (raw disabled → v≥8 enabled) | +701.0 (X1) |

---

## 4) Closing note on mathematical principle

The most **mathematically principled** operations are those that derive from well-established geometric or number-theoretic relationships:

- **Op 1 (isometric)** is trivially rigorous — it is the identity projection, the null hypothesis of cycle work.
- **Op 5 (Y/φ)** and **Op 9 (Y·φ)** are the 61.8% retracement and 161.8% extension, which are load-bearing in mainstream technical analysis and have at least a plausible connection to natural growth patterns (though the connection to markets is contested).
- **Ops 4, 8, 10, 12** (π-based radius/circumference) have coherent geometric meaning — if you accept Gann's premise that time is rotational, then Y·π converting a "radius of days" into an "arc of days" is internally consistent, even if the premise itself is unfalsifiable.

The **least principled** operations, in decreasing order of mathematical justification:

- **Op 16 (Hepta, ×7.01)** — the `.01` offset is unexplained; 7 as a cycle constant is a numerological rather than mathematical choice. That said, it's α-weighted and freshly added, so it clearly matters to the practitioner.
- **Ops 3, 7, 11, 13, 14 (curvature, π·φ ≈ 5.08)** — multiplying π by φ produces a compound constant with no clean geometric interpretation. It's a plausible-sounding fusion of two "resonant" numbers but has no analog in classical geometry or number theory. Note that most of these remain β-weighted, indicating the author's own uncertainty.
- **Op 2 (`oph_flip`)** — the least mathematically defensible. Digit reversal is a **base-10 artifact**, not a coordinate-free operation. Adding 1 day to X2 because Y=100 flips to 1 has no correspondence in any physical or mathematical cycle theory. It's pure numerological "mirror" symbolism, and yet it ships as α-weight — a clear signal that Ophis is an esoteric tool, not a scientific one. The fact that it's called "Holo-" (holographic) suggests the tradition being invoked is Bradley/Gann mirror-symmetry rather than mathematics.

The design pattern is otherwise disciplined: nearly every operation comes in an X1-anchored and X2-anchored flavor, and the constants (π, φ, π·φ) are applied as full and half-cycle variants. The framework is internally consistent — whether the underlying premise (that markets track rotational/golden-ratio time cycles) is *true* is a separate question the code cannot answer.

## Part III — The MSRF Filter Arrays

# MSRF Filter Arrays in Ophis v9

## Naming Ambiguity — Upfront

The acronym "MSRF" is never defined in the source files provided. The only naming clues are:

- The prefix `MSRF_FILTER__` on the arrays
- Score constants like `POINTS__IMPORTANT_MSRF_MATCH`, `SCORE_MULTIPLIER__VORTEX_MSRF_MATCH`
- The comparison function `getMsrfMatch(axialRotationCount)` in `ophis_utils.js`

The arrays are matched against **axial rotation counts** — i.e., day counts between dates (see `axialRotationsBetweenNativeDates` in `ophis_utils.js`). This is a **temporal / count** domain, not a magnetic-field or momentum/spin domain. Neither expansion — "Momentum/Spin/Rotation/Frequency" nor "Magnetic Solar Reference Frame" — is confirmable from the code provided. Since matches are made against integer day counts and a handful of decimal "vortex" numbers, the acronym reads as a project-internal filter label; I will not commit to either expansion.

---

## 1. `MSRF_FILTER__NORMAL` (276 integers)

`src/ophis_model__params.js:15-36`

```javascript
var MSRF_FILTER__NORMAL = [
    12, 21, 24, 36, 40, 42, 48, 49, 51, 52, 54, 56, 59, 60, 63, 66, 70, 71, 72, 74, 76, 77, 80, 88, 90,
    96, 98, 104, 105, 108, 110, 114, 116, 119, 120, 129, 133, 135, 138, 140, 144, 147, 154, 162, 168,
    180, 182, 196, 204, 207, 218, 222, 223, 226, 231, 234, 238, 253, 255, 259, 260, 264, 276, 279,
    280, 286, 288, 294, 297, 301, 308, 312, 315, 324, 330, 336, 343, 351, 354, 363, 364, 365, 372, 385,
    390, 394, 396, 405, 414, 433, 434, 441, 444, 447, 453, 459, 460, 463, 468, 476, 480, 490, 493, 495,
    509, 520, 525, 526, 531, 534, 539, 544, 552, 555, 558, 563, 565, 572, 573, 576, 582, 588, 591, 594,
    600, 618, 621, 640, 657, 660, 666, 670, 672, 674, 675, 679, 681, 686, 690, 691, 701, 702, 708, 720,
    726, 728, 730, 732, 735, 744, 765, 770, 774, 777, 789, 791, 792, 800, 801, 807, 810, 816, 819, 828,
    831, 846, 855, 861, 866, 868, 888, 918, 920, 930, 936, 952, 954, 960, 966, 972, 980, 990, 1000, 1019,
    1035, 1040, 1042, 1050, 1052, 1056, 1062, 1071, 1074, 1083, 1089, 1092, 1096, 1104, 1110, 1111, 1116,
    1130, 1147, 1152, 1155, 1176, 1177, 1184, 1188, 1190, 1200, 1242, 1253, 1279, 1292, 1300, 1302, 1315,
    1318, 1320, 1332, 1335, 1350, 1359, 1372, 1380, 1401, 1416, 1441, 1446, 1449, 1461, 1470, 1485, 1486,
    1488, 1513, 1518, 1530, 1534, 1554, 1557, 1559, 1560, 1577, 1585, 1620, 1641, 1574, 1680, 1683, 1701,
    1715, 1736, 1738, 1764, 1770, 1776, 1785, 1786, 1794, 1826, 1829, 1836, 1854, 1855, 1860, 1872, 1899,
    1904, 1905, 1920, 1932, 1944, 1960, 1972, 1998, 2046, 2047, 2080, 2100, 2103, 2112, 2124, 2133, 2142,
    2151, 2170, 2178, 2184, 2191, 2205, 2208, 2232, 2235, 2244, 2269, 2277, 2288, 2292, 2293, 2294, 2295,
    2304, 2310, 2322, 2333, 2346, 2352, 2376, 2380, 2388, 2400, 2401, 2415, 2418, 2430, 2447, 2478, 2483,
    2484, 2506, 2556, 2558, HIGHEST_MSRF_NUMBER
];
```

`HIGHEST_MSRF_NUMBER = 2559` (`src/ophis_config.js`).

### Pattern

- **Not sequential**, **not a single-modulus residue class**, **not multiples of one number**.
- Rich in **highly-composite / divisor-heavy numbers**: 12, 24, 36, 48, 60, 72, 120, 144, 168, 180, 240 (via IMPORTANT), 360, 720, 1440…
- Multiples of **7**: 49, 56, 63, 70, 77, 105, 119, 147, 154, 168, 182, 196, 231, 238, 259, 280, 294, 308, 315, 343, 364, 385, 441, 476, 490, 728, 735… Many of these are also multiples of 7² = 49 or 7³ = 343.
- **Calendar echoes**: 30, 52, 60, 90, 120, 180, 240, 360, 364, 365, 720, 1440… — 52 (weeks/year), 60 (min/hr), 90/180/270/360 (angle degrees), 364/365 (days/year), 720 (2×360 or 12 hr in min), 1440 (min/day).
- **Gann / Bradley-style siderograph residues** — 144 (Gann's Master Time), 360 (Gann Circle), 180, 90, 45's absent (see IMPORTANT), 288 (2×144), 576 (4×144), 1440 (10×144), 720 (5×144). Many entries are 144k, 90k, or 72k for small integer k.
- **Numerological "3-6-9" hits** (Tesla): 36, 63, 72, 108, 126 (IMPORTANT), 144, 216 (IMPORTANT), 288, 333, 396, 432 (IMPORTANT), 666, 720, 999-adjacent (990, 1000), 1332 = 2×666, 1440, 2160. Digit-sum reductions of many entries land on 3, 6, or 9.
- **Sacred / religion-adjacent** *literal* hits: 108 (dharmic), 216 (6³, in IMPORTANT), 666, 777, 888, 1111 (all present verbatim), 2160 (one great age in a Platonic year).
- **Rounded PHI / PHI² / PI multiples** *implied* — the source comment on line 13 confirms this connection:
  > `// NOTE: Filter numbers 21 and 76 have been commented out since rounded down vortex numbers match these.`
  > `// UPDATE: Re-enabled 21 and 76 after discussion with Jason to match a vortex number within a certain tolerance.`
  21 ≈ 21.7 (a vortex value), 76 ≈ 76.2 (a vortex value). More on this below.

### Anomaly

`1574` appears at position 253, out of numerical sort order between `1641` and `1680` (`ophis_model__params.js:28`). Combined with `1577` (a few lines earlier), this looks like a **typo for `1674` or a mis-sequenced insertion**. The self-check `selfCheckMsrfOnStartup` in `ophis_model__validation.js` only detects duplicates and non-integers; it does *not* verify ordering.

### Count

Physically there are 277 slots as written (276 literal integers + `HIGHEST_MSRF_NUMBER`). The commonly quoted "276 integers" count matches the literal-integer entries; the trailing symbolic constant makes it 277 in `MSRF_FILTER__NORMAL.length`.

---

## 2. `MSRF_FILTER__IMPORTANT` (52 integers)

`src/ophis_model__params.js:38-42`

```javascript
var MSRF_FILTER__IMPORTANT = [
    84, 126, 132, 153, 176, 186, 189, 210, 216, 252, 270, 306, 360, 378, 420, 432, 504, 540, 567, 612, 630,
    648, 669, 693, 756, 780, 840, 864, 882, 945, 1008, 1080, 1134, 1224, 1260, 1296, 1344, 1404, 1428, 1440,
    1512, 1584, 1656, 1728, 1800, 1890, 1980, 2016, 2070, 2160, 2268, 2448, 2520
];
```

### Pattern

- Count is exactly **52** — matches the **52 weeks/year**.
- Overwhelmingly **multiples of 6, 9, and 12**. Reductions land on 3/6/9 for the majority of entries (Pythagorean digital root).
- Highly-composite time constants: **360, 720 (absent but 1440 present), 1440, 2160, 2520** (least common multiple of 1–10).
- **Gann numbers** heavily represented: 360, 720 (in NORMAL), 1440, 2160 (= 6×360), 2520 (7! / 2 = 2520, also 7×360).
- **NOT a subset of NORMAL** — I checked several representative values: 84, 126, 132, 153, 176, 186, 189, 210, 252, 270, 306, 378 — none appear in NORMAL. IMPORTANT is a **disjoint list of "premium" numbers** treated separately by the matcher, which checks it *first* (`ophis_utils.js`, in `getMsrfMatch`):
  ```
  toReturn = checkExactMatch(MSRF_FILTER__IMPORTANT, axialRotationCountRounded);
  if ( toReturn != null ) { return toReturn; }
  toReturn = checkExactMatch(MSRF_FILTER__NORMAL, axialRotationCountRounded);
  ```
- Nearly every entry is divisible by 6; most by 9. This is stronger 3-6-9 concentration than NORMAL.
- Notable religious/kabbalistic hits: **153** (the "miraculous catch of fish"), **216** (6³, Rodin-vortex favorite, also Plato's number), **432** (Hz "cosmic tuning"), **666**-adjacent multiples (1332 in NORMAL, and 2160 = 5×432).
- Signs this list encodes **Gann/Bradley-tradition swing-count values**: 84 (~Uranus year in years×fudge), 126, 189, 252, 378 (near-Saturn periods in days? 378 is the Saturn synodic period in days ≈ 378), 780 = Mars synodic in days ≈ 779.9. That's a **very strong tell** — 378 and 780 are the standard synodic-period integer roundings for Saturn and Mars.

### Count = 52

The array literally has 52 entries. Given the labeling ("Important") and the count of 52, the annual/weekly overtone is hard to miss.

---

## 3. `MSRF_FILTER__VORTEX` (12 floats)

`src/ophis_model__params.js:44-46`

```javascript
var MSRF_FILTER__VORTEX = [
    21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2
];
```

### Pattern (this one is *very* clean)

The 12 numbers split into **two groups of six**, and the second group is exactly the first ×10 (with slight rounding noise):

| First 6  | ×10   | Second 6 |
|----------|-------|----------|
| 21.7     | 217   | 217.8    |
| 32.6     | 326   | 326.7    |
| 43.5     | 435   | 435.6    |
| 65.3     | 653   | 653.4    |
| 76.2     | 762   | 762.3    |
| 87.1     | 871   | 871.2    |

Within the group of six, look at **ratios and differences**:

| Value | ÷ 10.87 | ÷ 10.85 | (v × 9) mod... |
|-------|---------|---------|----------------|
| 21.7  | 2.00    | 2.00    | 195.3          |
| 32.6  | 3.00    | 3.00    | 293.4          |
| 43.5  | 4.00    | 4.00    | 391.5          |
| 65.3  | 6.01    | 6.02    | 587.7          |
| 76.2  | 7.01    | 7.02    | 685.8          |
| 87.1  | 8.01    | 8.03    | 783.9          |

The **base unit is ~10.87** and the multipliers are **2, 3, 4, 6, 7, 8**. Note the missing 1 and 5 — this looks **exactly like Marko Rodin's vortex-math "doubling circuit" {1,2,4,8,7,5}** or the complementary triad {3, 6, 9}, projected onto a decimal grid.

More precisely, using base **≈10.89** (which is very close to 10.8̄ = 108/10 = **10.8**, and 108 is a canonical Rodin/vedic number):

- 21.7 ≈ 2 × 10.85
- 32.6 ≈ 3 × 10.87
- 43.5 ≈ 4 × 10.875
- 65.3 ≈ 6 × 10.883
- 76.2 ≈ 7 × 10.886
- 87.1 ≈ 8 × 10.888

The consistent under-10.9 base points to a real underlying constant of roughly **10.9** — plausibly **108/10** with rounding, or **π × φ / (something)** = the "curvature" constant. Note: `OPH_CRV` = π × φ ≈ **5.08** — half that is 2.54, no direct match; but **2 × OPH_CRV ≈ 10.16** doesn't match either. The base **10.88 ≈ 34/π ≈ 10.82** or **1/φ² × something** — I can't tie it cleanly to π or φ from just these values.

**What is a clean tell**: the digit-pairs 21, 32, 43, 65, 76, 87 all reduce (Pythagorean digital root) to **3, 5, 7, 11(→2), 13(→4), 15(→6)** — no, that's inconsistent. Let me redo:
- 21 → 2+1 = 3
- 32 → 3+2 = 5
- 43 → 4+3 = 7
- 65 → 6+5 = 11 → 2
- 76 → 7+6 = 13 → 4
- 87 → 8+7 = 15 → 6

The reductions are {3, 5, 7, 2, 4, 6} — everything from 1..7 *except 1*, permuted. That is not a clean pattern.

However the **differences** between consecutive entries are much cleaner:
- 32.6 − 21.7 = 10.9
- 43.5 − 32.6 = 10.9
- 65.3 − 43.5 = 21.8 (= 2 × 10.9)
- 76.2 − 65.3 = 10.9
- 87.1 − 76.2 = 10.9

**All deltas are multiples of 10.9**, with a "skip" between 43.5 and 65.3 (missing the value 54.4 = 5 × 10.88). This is **strongly** the {1,2,4,8,7,5}-family Rodin doubling / missing-5 pattern applied to a base unit of ~10.9. The absent multiplier is 5, and — sure enough — 5 × 10.88 ≈ 54.4, and **54 is a canonical Rodin/Vedic number** (as is 108).

12 entries → **12 zodiac signs / 12 houses** is a plausible framing label, but the *math* is Rodin/vortex-scale doubling, not zodiacal angles.

### PHI / PI ratio checks (as requested)

- 32.6 / 21.7 = 1.502 (not φ = 1.618, not π/2 = 1.571)
- 43.5 / 32.6 = 1.334 (not φ)
- 65.3 / 43.5 = 1.501
- 76.2 / 65.3 = 1.167
- 87.1 / 76.2 = 1.143

None are φ- or π-related consecutively. The pattern is **linear (constant offset ≈10.9)**, not geometric.

---

## 3b. `MSRF_FILTER__FINAL` and Matching Logic

### Combination

`src/ophis_model__params.js:60`:
```javascript
var MSRF_FILTER__FINAL = MSRF_FILTER__NORMAL.concat(MSRF_FILTER__IMPORTANT).concat(MSRF_FILTER__VORTEX).sort(function(a, b) { return a - b; });
```

Merged and sorted; used only by `selfCheckMsrfOnStartup` in `ophis_model__validation.js` for duplicate detection.

### The match function — `getMsrfMatch(axialRotationCount)` in `ophis_utils.js`

Precision first: `axialRotationCount = roundNumberToAxialRotationPrecision(axialRotationCount);` where `DECIMAL_PRECISION__AXIAL_ROTATIONS = 1` (`ophis_config.js`). So the input is rounded to **one decimal place** before matching.

**Order of checks:**

1. **VORTEX first**, using tolerance:
   ```
   for ( var i = 0; i < MSRF_FILTER__VORTEX.length; i++ ) {
       if ( areEqualWithinTolerance(ithFilterNumber, axialRotationCount, VORTEX_FILTER_MATCH_TOLERANCE) ) {
           return newFilterMatchStruct(MSRF_FILTER__VORTEX, ithFilterNumber);
       }
   }
   ```
   `VORTEX_FILTER_MATCH_TOLERANCE = 0.1` (`ophis_config.js`). So an axial-rotation of 21.6, 21.7, or 21.8 all count as matching vortex value 21.7.

2. **Halfway short-circuit** — if the count ends in `.5`, no match at all:
   ```
   if ( axialRotationCountAsString.endsWith(".5") ) {
       return null;
   }
   ```
   Comment: *"As per Jason, numbers 'right in the middle' are counted as no match. Must trend towards either the floor or the ceiling."*

3. **IMPORTANT next** — exact match against `Math.round(axialRotationCount)`.

4. **NORMAL last** — exact match against `Math.round(axialRotationCount)`.

Only **one** match is returned per Z-Date (early return in each branch). Precedence: **VORTEX > IMPORTANT > NORMAL**.

### Tagging and scoring — `ophis_model__operations.js`

`tagZDates()` calls `getMsrfMatch(ithRotationCountZ)` for each Z-Date's rounded rotation count and, if non-null, pushes a match struct onto `existingZStruct.msrf_match_structs`. The struct carries:
```
{ msrf_filter, msrf_number, points, css_class ("msrf_normal"/"msrf_important"/"msrf_vortex"), readable_name }
```

Points by filter (`ophis_model__params.js:1-6`):
- Normal → 1
- Important → 2
- Vortex → 2 (= important)

`scoreZDates()` then:
1. Sums `operationSubscore` from operation matches (weight-based)
2. Sums `msrfMatchSubscore` — sums per-match points except **the single highest-multiplier match is excluded from the sum** and applied as a **score multiplier** instead (only under `SCORING_SYSTEM__GTE_V8`).

Multipliers (`ophis_model__params.js:9-11`):
- Normal → ×1.5
- Important → ×2.0
- Vortex → ×2.0

`getMsrfScoreMultiplier()` picks the *maximum* multiplier across all MSRF matches on a Z-Date. So one vortex or important match promotes the whole Z-Date's score by 2×; a normal-only match promotes by 1.5×.

Under the legacy `SCORING_SYSTEM__LTE_V7`, no multiplier is applied — points are just summed.

### CSS classes

`msrf_normal`, `msrf_important`, `msrf_vortex` (in `getMsrfMatch`) drive UI highlighting so users see which class of match a Z-Date landed on.

---

## 4. Interpretation — What tradition does this encode?

I've compared entries against each candidate tradition. Here is the ranking, most-supported first:

### Strong: **Gann / Bradley-style swing-count numerology combined with Rodin/vortex math**

- **Gann evidence** in IMPORTANT: **360, 720, 1440, 2160, 2520** (2520 is the Gann "master time factor" — LCM of 1–10; 1440 = 4×360 or minutes-per-day; 2160 = 6×360 or years of a Platonic-year sub-cycle). Gann's Master Chart is built on **144, 90, 45, 180, 360**; NORMAL contains 144, 90, 180, 360, 720; IMPORTANT contains 360, 1440, 2160. This is a canonical Gann fingerprint.
- **Astronomical synodic periods** in IMPORTANT: **378** (Saturn synodic period in days ≈ 378.09), **780** (Mars synodic period in days ≈ 779.9). These are widely used in **Bradley siderograph** and Gann-tradition financial astrology to time market turns. Their presence is the single most telling detail — casual numerology lists don't include 378 and 780; siderograph traditions do.
- **Rodin/vortex** evidence is *strongest* in the VORTEX array: 12 values built on a base unit ≈ 10.9 with multipliers taken from {2,3,4,6,7,8} — the doubling/tripling family with the "missing 5" that Marko Rodin's vortex-math diagrams emphasize. The array is even *named* VORTEX.
- **Tesla 3-6-9** is a subset of the same fingerprint: essentially every IMPORTANT entry has digital root 3, 6, or 9. This is consistent with — but weaker than — the Gann/Bradley interpretation because 3-6-9 arithmetic falls out naturally from a list biased toward multiples of 9 and 6.

### Weak/incidental: **Fibonacci, PHI, PI**

- The `21` and `76` re-enabling comment (`ophis_model__params.js:12-14`) confirms proximity to VORTEX 21.7 and 76.2, not proximity to φ or π directly.
- 144 is Fibonacci — but it's also 12². Its presence is over-explained by many traditions.
- The engine's *operations* (`OPH_PI`, `OPH_PHI`, `OPH_CRV = π × φ`, `OPH_HEP = 7.01`) heavily use PI, PHI, and their product to transform Y into Z — so the *rotation counts* the filters test are already outputs of PHI/PI-based transforms of day-differences between X-Dates. That is where PHI and PI live in this system, not in the MSRF filter values themselves.

### Weak: **Kabbalistic gematria, Chaldean numerology**

- 153, 216, 432, 666, 777, 888, 1111 all appear, and are traditional gematria/mystic favorites — but they are also targets in Gann and Rodin systems, so they don't *distinguish* traditions.

### Coincidental (but eye-catching):

- **276 entries in NORMAL** — 276 is a triangular number (T₂₃ = 23×24/2 = 276). Whether this is intentional or the count just landed there after Jason's ad-hoc additions/removals, I can't tell from the code. The self-check verifies no duplicates but doesn't verify cardinality.
- **52 entries in IMPORTANT** — matches 52 weeks/year, likely intentional given the list's calendar bias.
- **12 entries in VORTEX** — 12 signs, 12 houses, or (matching the actual math) 2 hexadic Rodin subsets of six.

### Best-supported reading

The three arrays collectively encode a **Gann/Bradley-lineage financial-astrology day-count table augmented with a Rodin vortex-math side channel**. The clearest evidence:

- **378 and 780** in IMPORTANT — Saturn and Mars synodic periods in days.
- **360 / 720 / 1440 / 2160 / 2520** in IMPORTANT — Gann's canonical time factors.
- **The literal name `VORTEX`** for a 12-entry list whose deltas are all multiples of ~10.9, with the classic {2,3,4,6,7,8}-multiplier pattern that omits 5 — a Rodin vortex-math signature.
- The engine tests **axial-rotation counts** (day differences between dates) against these lists — the same conceptual object Gann and Bradley worked with.

The mystic 3-6-9 (Tesla) and gematria (153, 666, 777, 888, 1111) hits are real but explanatory noise — they piggyback on the fact that Gann-tradition day counts are already rich in multiples of 9 and highly-composite integers.

The "Momentum/Spin/Rotation/Frequency" gloss is more consistent with what the engine actually does (rotation counts, cycles), while "Magnetic Solar Reference Frame" would fit a heliocentric-astronomy framing. Neither can be *proven* from these files; I'd lean toward the rotation-frequency gloss because the input the filter tests is literally called `axialRotationCount`.

---

## File references

- `src/ophis_model__params.js:15-36` — `MSRF_FILTER__NORMAL`
- `src/ophis_model__params.js:38-42` — `MSRF_FILTER__IMPORTANT`
- `src/ophis_model__params.js:44-46` — `MSRF_FILTER__VORTEX`
- `src/ophis_model__params.js:60` — `MSRF_FILTER__FINAL`
- `src/ophis_model__params.js:1-11` — points and multiplier constants
- `src/ophis_utils.js` — `getMsrfMatch()`, tolerance-based vortex check, `.5` short-circuit, IMPORTANT-then-NORMAL exact-match order
- `src/ophis_model__operations.js` — `tagZDates()` (attaches MSRF matches), `scoreZDates()`, `getMsrfScoreMultiplier()`, `sumUpMsrfMatchSubscore()`
- `src/ophis_config.js` — `VORTEX_FILTER_MATCH_TOLERANCE = 0.1`, `DECIMAL_PRECISION__AXIAL_ROTATIONS = 1`, `HIGHEST_MSRF_NUMBER = 2559`, `OPH_PI`, `OPH_PHI`, `OPH_CRV`, `OPH_HEP`
- `src/ophis_model__validation.js` — `selfCheckMsrfOnStartup()` (duplicate + integer/vortex check; does *not* validate ordering, which is why the mis-sorted `1574` slips through)

## Closing Notes

Together these three passes make clear that Ophis is a tightly-coupled system where the operations layer (π, φ, π·φ, and the new 7.01 constant) generates candidate day-counts that are then filtered against a hand-curated Gann/Bradley/Rodin numerological table, with the GTE_V8 scoring path folding the strongest MSRF class into a multiplier rather than an additive bonus. The three deep-dives converge on the same picture: a disciplined X1/X2-symmetric operation set, a well-defined precision and rounding contract (2dp time, 1dp axial rotations, 0.1 vortex tolerance, `.5` rejection), and a filter list whose provenance is esoteric rather than mathematical. What remains ambiguous from source alone is the expansion of the "MSRF" acronym, the exact rationale for the `.01` offset in `OPH_HEP`, the intent behind the mis-sorted `1574` entry, and the identity of the renderer/filter/chart functions that consume `y_structs` and `z_structs` — all of which would require runtime probing or access to the UI layer to confirm.