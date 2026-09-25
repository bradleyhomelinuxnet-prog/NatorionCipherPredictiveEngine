# Ophis v12 (“PSYFR”) — Reverse-Engineering Case Study

<img src="PSYFR.jpg" alt="PSYFR poster: a hooded figure and a white rabbit before a glowing gate onto a future city" width="200" align="right">

> **Live site: [bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/)** — three browser apps, the report and the Hardened Engine Lab. Nothing to install, and nothing leaves your machine.

A white-box reverse-engineering study of **Ophis v12**, an offline Electron date-projection / cycle-prediction tool, taken apart as an educational study of `.exe` packaging and Electron attack surface — then rebuilt more safely.

> **Authorization.** This is the owner’s own software, studied with permission for a portfolio write-up. All work is white-box on artifacts in this repo; nothing here targets third-party systems.

## The apps

| App | What it is | Open |
|---|---|---|
| **Natorion Cipher** · [`natorion/`](natorion/) | The flagship: the Ophis v12 engine rebuilt front-end-only and joined to the Chronicon's clocks, cycles and calendars. | [live](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/natorion/) · [quick start](natorion/README.md) · [manual](natorion/MANUAL.md) |
| **Ophis Web** · [`web/`](web/) | The same v12 engine with a new interface and no Chronicon: plain HTML, CSS and JavaScript, no build step. | [live](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/web/) · [README](web/README.md) · [how it works](web/docs/ENGINE.md) |
| **Ophis v12, in a browser** · [`ophis/`](ophis/) | The original `.exe`'s own renderer, copied out of `app.asar`, with Electron replaced by a small browser bridge. It behaves like the desktop app, including its `new Function()` evaluator, so open only `.oph` files you trust. The bridge saves only to files you pick, or as a download. | [live](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/ophis/) · [README](ophis/README.md) |

Both rebuilds parse formulas instead of running them as code, and each is checked against the original v12 engine by a parity test that runs both on the same events and compares every result (see [Tests](#tests)). Natorion Cipher and Ophis Web also open straight from their `index.html` with no server; the
`ophis/` build wants one for PDF export (see its README). The landing page is [`index.html`](index.html); [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes the site on every push to `main`.

---

## What Ophis is

You give it ≥2 anchor dates (**X-Dates**); it counts the whole days between each pair (**Y**), runs a table of small formulas that turn `Y` into day-offsets, and projects **Z-Dates** that it scores against resonance number-sets (“MSRF”) and bundled eclipse/moon tables. It’s Gann-style cycle work in astronomical dress — fully offline, no live data, no telemetry. Branded **PSYFR**; the codebase calls itself Ophis v12.

## The headline finding

The app is **un-obfuscated Electron 39** and ships its own source, so a full read was possible. A crafted `.oph` preset chains to host code execution:

```
malicious .oph  →  operation string hits new Function()  →  renderer code execution
   (open/recalc)     (math.js validates a *stripped* string, not the compiled body;
                      v12 GUI defaults to the permissive LOOSE mode)
                →  electronBridge.autoSaveToFile(path, data)  →  fs.writeFile, NO path check
                →  drop payload in the Startup folder  →  code execution at next login
```

`nodeIntegration:true` is **confirmed** (`main.js:367`) — recovered by extracting the Electron main process from inside the shipped `.exe` (see [METHOD.md](METHOD.md)). The v9 pass could only infer it.

## Repo contents

| Path | What |
|---|---|
| [`natorion/`](natorion/), [`web/`](web/), [`ophis/`](ophis/) | The three apps (above). |
| [`index.html`](index.html) | The site's landing page. |
| [`Ophis_v12_ReverseEngineering_Report.md`](Ophis_v12_ReverseEngineering_Report.md) | **The paper.** Full method, anatomy, v9→v12 delta, ranked findings, hardening, appendix. |
| `Ophis_v12_ReverseEngineering_Report.html` | The report as a polished, self-contained page — [read it on the site](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/Ophis_v12_ReverseEngineering_Report.html). |
| `Ophis_v12_Hardened_Engine_Lab.html` | **Proof-of-fix.** A sandboxed parser replacing `new Function()`; it checks parity and injection resistance in the browser — [run it on the site](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/Ophis_v12_Hardened_Engine_Lab.html). |
| [`METHOD.md`](METHOD.md) | Reproducible `.exe` → source extraction (NSIS → 7z → asar). |
| [`SECURITY.md`](SECURITY.md) | Findings, threat model, remediation status. |
| `src/`, `lib/`, `img/`, [`package.json`](package.json), [`README.txt`](README.txt) | The original v12 renderer as extracted: 24 first-party modules, the third-party libraries, the images, and the app's own manifest and README, kept byte-for-byte. `lib/` also holds files the app never loads (the full eclipse tables `*_orig.js`, `solar.csv`, `lunar.csv`, an unminified `chart.js`). |
| `OPHIS-Natorion-Cipher.html` | The single-file build: an earlier ground-up rebuild of Ophis in one self-contained HTML file — [open it on the site](https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/OPHIS-Natorion-Cipher.html). |
| `PSYFR1.html`, `PSYFR2.html`, `NatoriOphis.html`, `Natori-On-PSYFR-Main-UI.html` | Earlier single-file browser experiments (the chronology engine and its field guide), kept for lineage. |
| `Ophis_v9_*`, `OPHIS.html` | The prior v9 report and field guides, kept for lineage. `OPHIS.html` is the same page as `Ophis_v9_Explained.html` (the report's “naming trap”). |
| `*.oph` | Sample Ophis files. Both parity tests also run them as fixtures. |
| `chronicon-clocks-calendrics.txt`, `ophis-xtras.txt`, `PSYFR.jpg` | Source material: the Chronicon page the clocks were built from, ten extra operations (numbered 17–26), and the PSYFR poster. |
| [`.github/`](.github/) | The Pages and Tests workflows, and Dependabot for the actions they use. |

## Tests

```bash
# Natorion Cipher
node natorion/tests/self-check.js     # engine and Chronicon checks, no dependencies
node natorion/tests/browser.js        # the real app in headless Chromium (needs Playwright; see natorion/README.md)
node natorion/tests/parity.js 300     # against the original v12 code: the sample files plus 300 random events

# Ophis Web
node web/tests/unit.node.js                            # behaviour tests, no dependencies
node web/tests/cycles.node.js                          # cycle echoes and the backtest, no dependencies
node web/tests/parity.node.js --fuzz 500 --seed 138    # against the original v12 code, plus 500 random events
```

The parity tests load the extracted renderer from `src/` into Node and run it side by side with each rebuild.
[`.github/workflows/tests.yml`](.github/workflows/tests.yml) runs all of the above on every push and pull request.

## Reproduce the extraction

Run this in a scratch folder outside the repository: the repo's `package.json` is the original app's manifest, so
installing inside it would pull in Electron as well.

```bash
mkdir -p ~/ophis-extract && cd ~/ophis-extract
npm install 7zip-bin
ZA=$(node -p "require('7zip-bin').path7za")                                  # 7za for this OS
"$ZA" e /path/to/Ophis_v12_Windows.exe "resources/app.asar" -o./extracted     # the NSIS payload is a 7z stream
npx @electron/asar extract extracted/app.asar extracted/unpacked_full         # → main.js, preload.js, ophis.html, src/
```

Full walkthrough and what each layer is: [METHOD.md](METHOD.md). The 100 MB `.exe` itself is not committed
(see [`.gitignore`](.gitignore)); attach it to a GitHub Release if it needs to be shared.

## Findings at a glance

| # | Severity | Finding |
|---|---|---|
| 1 | 🔴 Critical | `.oph` operation string → `new Function()` renderer code execution (validator ≠ executor; LOOSE default) |
| 2 | 🔴 Critical | `nodeIntegration:true` confirmed + `autoSaveToFile` arbitrary-path write → host persistence |
| 3 | 🟠 High | Sign-in is client-side theatre; 5 hard-coded SHA-512 hashes; re-enabling crashes init |
| 4 | 🟡 Medium | `executeJavaScript` built by string concat with a 2-char escaper |
| 5 | 🟢 Low | Headless CLI log forging from file-derived strings |

Detail with `file:line` citations: [SECURITY.md](SECURITY.md) / the report §6.

## Note

Ophis is a **worldbuilding & study instrument** after the Archaix thesis of Jason Breshears — presented as that thesis, not as established science. This repository studies the *software*, not the cosmology. Not affiliated with Archaix.

## License

No open-source license has been chosen yet, so the default applies: the author reserves all rights to the study, the
reports and the rebuilds. The third-party libraries in `lib/` (and their copies in `ophis/lib/` and
`natorion/js/vendor/`) belong to their authors and keep their own licenses; the fonts embedded in Ophis Web are under the
SIL Open Font License 1.1 ([`web/css/OFL.txt`](web/css/OFL.txt)).
