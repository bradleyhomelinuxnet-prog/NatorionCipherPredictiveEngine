# Studio examples

Production packages written by the Studio from the repo's own sample files, so you can read what it makes before opening the app.

| File | Source | Settings | Climax |
|---|---|---|---|
| [`eclipse-ledger_10min_v19.md`](eclipse-ledger_10min_v19.md) | [`sample-eclipses-two-events.oph`](../../sample-eclipses-two-events.oph), Event 1: seven eclipses, 12 Aug 2026 – 22 Jul 2028, renamed “The Eclipse Ledger” | 10-minute cut, variation 19, “now” fixed at 8 Oct 2026 | 7 November 2028 |

Nothing here is hand-edited. [`generate.js`](generate.js) loads the app's own engine and Studio code into Node, runs the sample and writes the Markdown that **Save .md** would. It refuses to write a package that misses the brief.

```bash
node natorion/examples/generate.js
git diff --exit-code natorion/examples   # the Tests workflow does this: a change to the Studio that alters the example shows up as a diff
```

To add one, add an entry to `EXAMPLES` in `generate.js` and a row above.
