# Do the MSRF tiers help? · Backtest, 5 Nov 2026

**Short answer: no, not on the data tested.** Ranking Z-Dates by MSRF tier never beat v12's own ranking. Two of the three ways of using the tiers made it worse, and the real tiers did no better than tiers dealt out at random. The v12 score itself does carry signal on eclipse sequences.

Script: [`tests/backtest-tiers.js`](tests/backtest-tiers.js) · run it with `node natorion/tests/backtest-tiers.js 400 1000 138`

## What was tested

Each test takes **four consecutive real events** as X-Dates and stands on the last one. It runs the engine (all 36 operations, v8+ scoring, the usual filters) and asks where the **next real event** lands among the ranked Z-Dates. A hit is a Z-Date within ±1 day of the next event.

There are 400 tests per dataset. The same Z-Dates are ranked five ways:

| Ranking | How |
|---|---|
| random order | the floor: what shuffling the candidates gives |
| **v12** | the engine's own score |
| tier-max | v12 score × (1 + best tier's dimensions ÷ 8) |
| tier-sum | v12 score + the dimensions of every tiered match |
| apex-first | any Tier VII match first, then v12 score |

**Controls**
- **Scrambled tiers:** the same tier sizes, with the numbers dealt to tiers at random, 1,000 times. *p* is the share of scrambled runs that did as well as or better than the real tiers. A small *p* (under 0.05) would mean the real tiers know something. Near 0.5 means they are no better than random. Near 1 means they are worse than random.
- **Random dates:** event dates with no pattern at all (gaps of 20–400 days), so any hits there come from chance alone.

**Measures**
- **hit@10:** the share of tests where the next event made the top ten.
- **MRR:** the average of 1 ÷ rank; a miss counts as 0.

## Results (seed 138; seed 19 gave the same picture)

| | Solar eclipses | | Lunar eclipses | | Random dates | |
|---|---|---|---|---|---|---|
| | hit@10 | MRR | hit@10 | MRR | hit@10 | MRR |
| next event among the Z-Dates at all | 68.3% | | 49.5% | | 35.0% | |
| random order | 6.2% | 0.031 | 4.4% | 0.023 | 2.9% | 0.015 |
| **v12** | **22.3%** | **0.077** | **15.3%** | **0.057** | 5.3% | 0.020 |
| tier-max | 16.0% | 0.066 (*p* 0.96) | 11.3% | 0.049 (*p* 1.00) | 4.8% | 0.017 |
| tier-sum | 9.0% | 0.052 (*p* 0.61) | 6.8% | 0.042 (*p* 0.63) | 4.0% | 0.016 |
| apex-first | 22.3% | 0.077 (*p* 0.34) | 15.3% | 0.057 (*p* 0.39) | 5.3% | 0.018 |

## What it means

1. **v12 ranks real sequences well above chance.** On eclipses its top ten held the next event about 3½ times as often as random ordering. On patternless dates the edge nearly disappears. Eclipses run on regular cycles (the saros, the eclipse season), so this shows the engine picks up on genuine periodicity. It does not show the engine can predict events that have no such cycle.
2. **Adding tier weight makes ranking worse.** tier-max and tier-sum both fell below plain v12, and below the scrambled-tier average too. Boosting by tier pulls the far-off, many-hit dates up the list ahead of the near, correct ones.
3. **The Apex override changes almost nothing.** Tier VII matches are rare enough that putting them first barely moves the ranking, and the real Tier VII numbers did no better than random ones.
4. **So: no tier-weighted scoring mode for now.** The MSRF Formulas page stays a reading aid. It shows a number's tier and dimensions but does not change the scores.

## Limits, so this isn't over-read

- Eclipses are astronomy. The tiers were built for **human events**, and those may behave differently. Running this same test on a real log of personal or historical events is the fair next test, and the planned personal events journal would supply exactly that data.
- One setup only: four X-Dates, all 36 operations, a ±1-day hit. Other window sizes or the 16 default operations could shift the numbers; the script takes those as easy edits.
- 400 tests per dataset is enough to see differences this size, though not tiny ones.
