# MSRF Formulas

Two formulas added beside the Ophis v12 engine. They read the engine's numbers and **never change its scores**: the parity tests against the original v12 still pass unchanged.

- **Page:** [`formulas.html`](formulas.html) ([live](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/natorion/formulas.html))
- **Code:** [`js/engine/formulas.js`](js/engine/formulas.js) (`NC.formulas`)
- **Test:** [`tests/formulas.js`](tests/formulas.js)
- **In the app:** the Operations try-it box now prints the tier and the phi shadow under the MSRF match.

## 1 · MSRF Magnitude (the tiers)

The numbers of the MSRF are arranged in a hierarchy by orders of magnitude. A number's tier is set by how many **dimensions of arithmetic** it appears in across the six MSRF filters (Annular Chronometric, Geodetic Chronometry, Hydrogen Spacing Angle, Fibonacci Sequence, Intra-Decimal Matrix, Vortex Holography). The dimension count is the **magnitude**.

| Tier | Dimensions | Numbers | Notes |
|---|---|---|---|
| I | 2 | 280 | listed as 281: 468 appears twice |
| II | 3 | 139 | includes 138 |
| III | 4 | 75 | |
| IV | 5 | 27 | |
| V | 6 | 14 | |
| VI | 7 | 13 | includes 360 |
| VII ceta [lesser] | 8+ | 5 | 930, 1080, 1134, 1440, 1800 |
| VII beta | 8+ | 5 | 840, 1242, 1296, 1680, 2160 |
| VII alpha [greater] | 8+ | 7 | 504, 1008, 1224, 1260, 1512, 2016, 2520 |

Tier VII are the **Apex Projections**: an Apex Projection that targets a date also targeted by a lower-tier projection overrides the Core Algorithm's projected dates.

`NC.formulas.magnitude(z)` returns the v12 app class (Normal / Important / Vortex, from the engine's own `msrfMatch`) together with the tier, rank (1–9) and dimension count. When v12 finds no match, including its rule that a value ending in exactly .5 never matches, the nearest whole number's tier is still given and marked `exact: false`.

The paper's suggested reading order: 1) note the score, 2) look at the MSRF number, 3) note the app class, 4) read the strength from its dimensions.

### Data notes, kept as found

- **480** is listed in both Tier I and Tier III. The higher tier (III) is used.
- **468** is listed twice in Tier I and is counted once.
- **63 numbers in the v12 MSRF table have no tier yet.** They are the 12 vortex decimals, the paper's 61 "missing" numbers (which include the vortex decimals), plus 2558 and 2559. In the paper's words, they are probably recent findings not yet assigned. The calculator reports them as "no tier assigned".
- The tier lists hold 237 numbers that are not in v12's MSRF table at all, so a number can have a tier and no app class.

## 2 · Phi Shadow

> Take any number and divide it by phi. The difference between the answer and the root number is the shadow. Divide the answer by phi again and the answer is the shadow.

```
138 ÷ 1.618 = 85.29      138 − 85.29 = 52.71      85.29 ÷ 1.618 = 52.71
670 ÷ 1.618 = 414.09     670 − 414.09 = 255.91    414.09 ÷ 1.618 = 255.93
```

**Why it works for every number.** φ is the one number where 1 − 1/φ = 1/φ². Multiply both sides by x:

```
x − x/φ  =  x/φ²
```

So the shadow is always the root divided by φ twice. With the true φ (1.6180339887…) the two routes give exactly the same number. With Ophis' rounded `OPH_PHI = 1.618` they differ in the third decimal (52.710 against 52.714 for 138), which is the only difference you'll see.

**The ladder.** Keep dividing: x, x/φ, x/φ², x/φ³ … Each rung is the shadow of the rung two above it. `NC.formulas.phiLadder(x, steps, phi)` returns the rungs, each checked against the MSRF table.

A neat one: **360 → 222.49 → 137.51**. The shadow of a full circle is the golden angle, 137.5°. Its nearest whole is **138** (Tier II, a v12 Normal number), but v12 itself would not score 137.5, because a value ending in exactly .5 never matches.

### As an Operation

The shadow fits the Operations grammar as it is. Paste any of these into the try-it box or add them as extra operations:

```
X1+Y/OPH_PHI/OPH_PHI
X2+Y/OPH_PHI/OPH_PHI
X1+Y-Y/OPH_PHI
```

## Sources and credit

The datasets, filter definitions and tier work are **Jason Breshears' (Archaix)**, from the original Ophis website and the Ophis 2.0 beta data dump; the original MSRF table image was posted by Jason on X on 6 December 2024. The tier compilation and the magnitude reading come from the community paper *Ophis MSRF Details: Sources for the MSRF Magnitude Calculator*. The phi-shadow observation was shared in the PSYFR/Ophis community. The filter descriptions are the source's claims, restated here; this repo makes no claim that they predict anything. It is a pattern tool for study, not a betting tool.
