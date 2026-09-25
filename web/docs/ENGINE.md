# The engine, end to end

What Ophis actually computes, in the order it computes it. Every rule here is
ported from the v12 renderer extracted from the shipped `.exe`; file and line
references point at `src/` in this repository.

---

## Vocabulary

| Term | What it is |
|---|---|
| **X-Date** | A date the event is known to have happened. The input. |
| **Y** | The interval, in whole days, between a *pair* of X-Dates. |
| **Operation** | A one-line formula turning Y into a day-offset, anchored on one of the pair. |
| **Z-Value** | What an operation returns: a number of days. |
| **Z-Date** | An anchor X-Date plus a Z-Value — a projected date. The output. |
| **MSRF** | "Master Sequence Resonance Filter" — three tables of numbers. A Z-Value landing on one is a resonance hit. |
| **Hit** | One operation landing on a day, or one MSRF match on that day. |
| **Score** | `(operation weights + MSRF points) × the strongest MSRF multiplier`. |
| **Scope** | Whether a "day" is a UTC calendar day (**Days**) or runs sunset to sunset at a location (**HH:MM**). |
| **Iso-Event** | One whole working set: X-Dates, operations, filters, chart options. A `.oph` file holds one or more. |

---

## 1 · Pairs become intervals

Every ordered pair of **enabled** X-Dates, earlier first, produces one interval.
`n` enabled X-Dates make `n(n−1)/2` of them.

```
X1 = 07/04/2026     Y1 = X1 → X2 =  47 days
X2 = 08/20/2026     Y2 = X1 → X3 = 248 days
X3 = 03/09/2027     Y3 = X2 → X3 = 201 days
```

The count is rounded to one decimal (`DECIMAL_PRECISION__AXIAL_ROTATIONS`).

- **Days scope** — X-Dates are pinned to UTC midnight, so the interval is a
  plain difference in days. The desktop app forces latitude/longitude to `0,0`
  for all day-scope arithmetic (`FEATURE_FLAG__LOCK_DAY_SCOPE_TO_GMT`); this
  build computes in UTC directly, which is the same thing.
- **HH:MM scope** — a day runs sunset to sunset at the event's location. The
  interval is counted between the sunsets *preceding* each X-Date, with the
  desktop app's exact rounding: anything inside the first day counts as 1, and
  beyond that the remainder rounds at the half-day mark
  (`ophis_utils.js:904`).

X-Dates must run forwards and be at least one day apart, or the run stops with
an error instead of producing output.

---

## 2 · Operations turn an interval into an offset

An operation is arithmetic over `Y`, anchored on `X1` or `X2` — meaning the
*earlier* or the *later* member of the pair being worked on, not the first and
second rows of the list.

```
X2 + oph_round(Y)          the isometric date itself
X2 + oph_flip(oph_round(Y))  Y with its digits reversed
X1 + (Y/2.0)xOPH_PI        half the interval, times pi
X2 + YxOPH_HEP             the hepta-cycle
```

The language is small and closed:

| | |
|---|---|
| Values | numbers, `Y` |
| Constants | `OPH_PI` 3.14 · `OPH_PHI` 1.618 · `OPH_CRV` 5.08 (pi × phi) · `OPH_HEP` 7.01 |
| Functions | `oph_round` `oph_flip` `oph_floor` `oph_ceil` `oph_abs` `oph_sqrt` `oph_sin` `oph_cos` `oph_tan` `oph_log` `oph_exp` |
| Operators | `+` `-` `*` `/` and parentheses; the letter `x` also means multiply |

Two details that matter:

- **The constants are the spoken values, not the mathematical ones.** Pi is
  3.14 and phi is 1.618 because that is how they are said out loud in the
  source material (`ophis_config.js`). Using `Math.PI` here would move every
  projection.
- **`oph_flip` reverses the digits and puts the decimal point back at the same
  *index*.** `1319 → 9131`, `13.19 → 91.31`, and — because the index is what is
  preserved, not the place value — `1.38 → 8.31`.

A formula must start with `X1+` or `X2+`, and must evaluate to a number greater
than zero at `Y = 10`, or it is rejected.

**This build parses formulas; it does not compile them.** See
[PARITY.md](PARITY.md) for the one behavioural difference this causes, and
`js/ophis.expr.js` for why it matters.

---

## 3 · Offsets become dates

```
Z-Value            = operation(Y)                        rounded to 2 decimals
Z-Date             = anchor X-Date + Z-Value days
```

The milliseconds are taken from the *unrounded* value and the value is rounded
afterwards, in that order — the desktop app is deliberate about it
(`ophis_model__operations.js`, `runOperations`).

- **Days scope**: the Z-Date is the UTC calendar day the result lands in.
  Everything that lands on that day collapses into one row.
- **HH:MM scope**: the Z-Date is the sunset-to-sunset window the result lands
  in, so a row shows a range, `from` → `to`.

Z-Values above 36,500 days (about a century) are clamped.

The day-count from the anchor to the Z-Date, rounded to one decimal, is what
gets matched against the MSRF tables.

---

## 4 · Resonance matching

Three tables, checked in this order (`ophis_utils.js:148`):

| Table | Count | Points | Multiplier |
|---|---|---|---|
| **Vortex** | 12 | 2 | ×2.0 |
| **Important** | 53 | 2 | ×2.0 |
| **Normal** | 325 | 1 | ×1.5 |

1. **Vortex** numbers (21.7, 32.6, 43.5, 65.3, 76.2, 87.1 and their ×10s) match
   within a tolerance of 0.1 days.
2. A count sitting **exactly on a half day** — anything ending `.5` — is
   deliberately no match at all. It has to lean towards a whole number.
3. Otherwise the count is rounded to a whole number and looked up in
   **Important**, then **Normal**.

---

## 5 · Scoring

Each Z-Date collects its hits, then:

```
operation points = sum of the weights of the operations that landed there
                   (weight 1 = "alpha", 0.5 = "beta")
MSRF points      = sum of the points of its MSRF matches
score            = (operation points + MSRF points) × multiplier
```

Under the **v8 and later** system (the default), the single strongest MSRF
match becomes the multiplier *instead of* contributing its points. Under
**v7 and earlier**, everything is additive and there is no multiplier.

Worked example, from the three X-Dates above:

```
pair        X1 → X3,  Y = 248 days
operation   O5 = X2 + Y/OPH_PHI        (anchored on the later date, X3)
Z-Value     248 / 1.618 = 153.28 days
Z-Date      03/09/2027 + 153.28 days  →  08/09/2027
count       153.3 days from X3  →  rounds to 153  →  Important MSRF

v8 score    (1 operation point + 0 MSRF points) × 2   = 2
v7 score     1 operation point + 2 MSRF points        = 3
```

The score is rounded to two decimals. Hit count is operations plus MSRF
matches — 2 in the example above.

---

## 6 · Filters

Eight filters, all off-by-default except where noted, applied after scoring
(`ophis_model__sorting.js`, `filterZDates`):

| | Hides | Default |
|---|---|---|
| **F1** | everything before the last X-Date | on |
| **F2** | anything landing on the last X-Date | on |
| **F3** | everything before the current date | on |
| **F4** | anything landing on the current date | off |
| **F5** | anything more than *n* days after the last X-Date | on, n = 2559 |
| **F6** | rows with fewer than *n* hits | off, n = 2 |
| **F7** | rows scoring below *n* | off, n = 1 |
| **F8** | rows with no MSRF match at all | off |

**T-Dates** are a separate narrowing: with any T-Date enabled, only Z-Dates
landing on one of them survive.

"Current date" is whatever the status bar says, which can be moved for
backtesting.

---

## 7 · Sorting

Five orders: **Date** (ascending), **Score**, **Hits**, **MSRF**, **Operations**
(all descending). Ties fall back the way the desktop app falls back: score ties
break on hits, then date; MSRF ties break on the sum of the numbers matched,
then date; everything else breaks on date.

The `Z₁, Z₂ …` ordinals are always assigned in **date** order, whatever the
display sort, so a row keeps its name when you re-sort.

---

## 8 · The `.oph` file

Plain JSON. Files written here open in the desktop app and vice versa.

```jsonc
{
  "app_version": "12",
  "iso_events": [{
    "name": "Event 1",
    "notes": "",
    "x_dates": [
      { "date": "07/04/2026", "time": "00:00", "enabled": true }
    ],
    "t_dates": [],
    "lat": 0, "long": 0, "location_enabled": false,

    "scope": "EVENT_SCOPE__DAYS",            // or EVENT_SCOPE__HH_MM
    "type": "EVENT_TYPE__PERSONAL",
    "scoring_system": "SCORING_SYSTEM__GTE_V8",  // or ..._LTE_V7
    "z_date_sort_type": "SORT_TYPE__DATE",
    "day_scope_start_time_in_millis": 0,

    "operations": [
      { "equation": "X2+oph_round(Y)", "weight": 1, "enabled": true }
    ],

    "iso_event_filter_before_last_x_date": true,
    "iso_event_filter_on_last_x_date": true,
    "iso_event_filter_before_current_date": true,
    "iso_event_filter_on_current_date": false,
    "iso_event_filter_beyond_max_days": true,
    "iso_event_filter_beyond_max_days_value": 2559,
    "iso_event_filter_min_hit_count": false,
    "iso_event_filter_min_hit_count_value": 2,
    "iso_event_filter_min_score": false,
    "iso_event_filter_min_score_value": 1,
    "iso_event_filter_msrf_match": false,

    "chart_option__show_chart": true,
    "chart_option__show_dates": true,
    "chart_option__show_full_moons": false,
    "chart_option__full_solar_eclipses": false
    // …one field per moon phase and eclipse type
  }]
}
```

Dates are `mm/dd/yyyy`, times are 24-hour `HH:MM`. Anything missing falls back
to the default in the table above; anything unreadable is reported rather than
guessed at.

Two notes on the format as the desktop app writes it:

- It runs a global `replaceAll(",", ", ")` over the finished JSON string, which
  also rewrites commas *inside* event names and notes. This build writes
  ordinary JSON; both load fine either way.
- `day_scope_start_time_in_millis` shifts every day-scope Z-Date by that much
  before it is snapped to a day. Leave it at zero unless you know you need it.

---

## 9 · CSV export

One row per Z-Date in date order, with the desktop app's columns:

```
IsoEvent,Date,Hits,Score,MSRF,Operations,ErrorStatus,ErrorMessage
Event 1,07/22/2027,2,1.5,129,OP05,None,None
```

`MSRF` lists the matched numbers highest first; `Operations` lists the
operations that landed there as `OP01`-style labels, lowest first. A run that
produced nothing writes one row carrying `NO_RESULTS`; a run that failed writes
one row per error carrying `GENERAL_FAILURE`.

---

## Where each rule lives

| Rule | This build | Desktop original |
|---|---|---|
| Constants, MSRF tables, defaults | `js/ophis.constants.js` | `src/ophis_config.js`, `src/ophis_model__params.js` |
| Formula language | `js/ophis.expr.js` | `src/ophis_model__validation.js` |
| Dates, day counting, sunset | `js/ophis.time.js` | `src/ophis_utils.js`, `src/ophis_dependencies.js` |
| Pipeline, MSRF, scoring, filters, sorting | `js/ophis.engine.js` | `src/ophis_model__operations.js`, `src/ophis_model__sorting.js` |
| `.oph` and CSV | `js/ophis.file.js` | `src/ophis_model__persistence.js`, `src/ophis_view__export.js` |
