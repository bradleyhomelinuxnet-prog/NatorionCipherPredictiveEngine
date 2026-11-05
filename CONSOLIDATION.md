# One app: Natorion

**Natorion** (`natorion/`) is the one app. New work lands there. Everything else is either a reference copy that must stay as it is, or an earlier build kept so old links and files still work.

## Where each piece stands

| Piece | Status | Why it stays |
|---|---|---|
| **Natorion** · `natorion/` | **The app** | — |
| The original v12 · `ophis/`, `src/` | Reference, never changed | The parity tests check Natorion against it, run for run. |
| Natorion Web · `web/` | Archived (banner on the page) | Its own engine tests still run in CI. Its unique features are being ported into Natorion (below). |
| Single-file build · `OPHIS-Natorion-Cipher.html` | Archived (banner) | In live use off-repo; old links. |
| `PSYFR1.html`, `PSYFR2.html`, `Natori-On-PSYFR-Main-UI.html`, `NatoriOphis.html` | Archived (banner) | Earlier builds; old links. |
| v12 Field Guide, reports, Hardened Engine Lab | Reference | Studies of the original program. |
| **natori-on-psyfr** (separate repo and site) | Companion (banner points here) | Holds tools not yet ported: see below. |

## Porting into Natorion

Done
- **MSRF tiers and the phi shadow** (Nov 2026): `natorion/formulas.html`, and in the Formulas try-it box.
- **Backtest and cycle echoes**, from Natorion Web (Nov 2026): the **Test it** panel under the projected dates. Same method and statistics; checked on pure-noise dates by `natorion/tests/backtest.js`. Natorion's default is an exact-day match, because with all 36 formulas on, the projections cover about two-thirds of the days near any date, so a ±1-day match is nearly free.

Still to port, most useful first
1. **Intervals panel** (Natorion Web): every pair of anchor dates, its gap, and any resonance match on the gap itself.
2. **"Why is the table empty?"** (Natorion Web): when every projected date is filtered out, name the filter whose removal alone would bring rows back.
3. **7-day windows** view of the results (Natorion Web).
4. **Map picker** for HH:MM · sunset scope (natori-on-psyfr): choose the place on an offline map instead of typing latitude and longitude.
5. **PDF report** export (natori-on-psyfr).
6. **Lab and Audit** screens (natori-on-psyfr).
7. **Objective / Subjective protocol and the author's optional tags** (Natorion Web, natori-on-psyfr): rules from the author's later documents, off by default.

When the list is empty, `web/` and natori-on-psyfr's app can be retired to read-only archives, keeping their URLs so links still resolve.
