# Ophis v12 (“PSYFR”) — Reverse-Engineering Case Study

A white-box reverse-engineering study of **Ophis v12**, an offline Electron date-projection / cycle-prediction tool, taken apart as an educational study of `.exe` packaging and Electron attack surface — then rebuilt more safely.

> **Authorization.** This is the owner’s own software, studied with permission for a portfolio write-up. All work is white-box on artifacts in this repo; nothing here targets third-party systems.

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
| [`Ophis_v12_ReverseEngineering_Report.md`](Ophis_v12_ReverseEngineering_Report.md) | **The paper.** Full method, anatomy, v9→v12 delta, ranked findings, hardening, appendix. |
| [`Ophis_v12_ReverseEngineering_Report.html`](Ophis_v12_ReverseEngineering_Report.html) | The report as a polished, self-contained page (portfolio format). |
| [`Ophis_v12_Hardened_Engine_Lab.html`](Ophis_v12_Hardened_Engine_Lab.html) | **Proof-of-fix.** A sandboxed parser replacing `new Function()`; self-verifies parity + injection resistance in-browser. |
| [`METHOD.md`](METHOD.md) | Reproducible `.exe` → source extraction (NSIS → 7z → asar). |
| [`SECURITY.md`](SECURITY.md) | Findings, threat model, remediation status. |
| `src/`, `lib/`, `img/` | The un-obfuscated renderer (24 first-party modules + third-party libs). |
| `PSYFR1.html`, `NatoriOphis.html`, … | Single-file browser rewrites of the engine (the portfolio UI). |
| `Ophis_v9_*` | The prior v9 report + field guides, kept for lineage. |

## Reproduce the extraction

```bash
npm install 7zip-bin
ZA=node_modules/7zip-bin/win/x64/7za.exe
"$ZA" e Ophis_v12_Windows.exe "resources/app.asar" -o./extracted   # NSIS payload is a 7z stream
npx asar extract extracted/app.asar extracted/unpacked_full         # → main.js, preload.js, ophis.html, src/
```

Full walkthrough and what each layer is: [METHOD.md](METHOD.md).

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

Study artifact — add your own license before publishing. Don’t commit the 100 MB `.exe` (see [`.gitignore`](.gitignore)); attach it as a Release asset if needed.
