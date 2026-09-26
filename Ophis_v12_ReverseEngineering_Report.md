# Ophis v12 (“PSYFR”) — Reverse-Engineering Report & Security Analysis

*Companion to the v9 report. Where v9 stopped at “the renderer implies `nodeIntegration:true` but we never read `preload.js`,” this pass cracks the shipped `.exe`, extracts the Electron **main process**, and turns that inference into a **verified** finding.*

- **Target:** `Ophis_v12_Windows.exe` (104,638,743 bytes) + the unpacked browser/renderer tree in this folder.
- **Declared version:** `12.0.0` (`package.json`), `APP_VERSION = "12.0"` (`src/ophis_config.js:3`).
- **Verdict in one line:** Un-obfuscated Electron 39 app; a malicious `.oph` file can achieve **renderer code execution** and, through an unvalidated file-write IPC, **code execution on the host** — the sign-in gate remains a self-described “fake security camera.”

---

## 0. How to read this report

The numbered sections double as a **step-by-step reverse-engineering method** you can reproduce for the paper:

1. **§1 Triage** — identify the container without running it.
2. **§2 Unwrap** — NSIS → embedded 7z → `app.asar` → source. (Exact commands.)
3. **§3 Anatomy** — what the package actually contains.
4. **§4 Behaviour** — what the software *does* (the prediction engine).
5. **§5 The v9 → v12 delta** — what changed.
6. **§6 Security analysis** — the verified exploit chain, ranked findings.
7. **§7 The browser rewrites** (PSYFR / Natori) — the portfolio UI, and its own bugs.
8. **§8 Building the hardened version** — concrete, paste-ready fixes.
9. **§9 Appendix** — file inventory, repro commands, data tables.

Everything below is cited to `file:line`. Line numbers for `main.js` / `preload.js` / `ophis.html` refer to the copies extracted from the `.exe` in §2 (preserved in the scratchpad; see §9).

---

## 1. Triage — identifying the container

Goal: learn the packaging **without executing an untrusted binary**.

| Probe | Result | Meaning |
|---|---|---|
| First 2 bytes | `4D 5A` (`MZ`) | Windows PE executable |
| PE machine field | `PE..L` → `0x14C` | **32-bit (i386/ia32)** build |
| String scan `Nullsoft` | hit at offset **81276**, `NullsoftInst` at 81928 | **NSIS** installer/stub |
| `package.json` → `win.target` | `"portable"` | electron-builder **portable** (NSIS stub that self-extracts to `%TEMP%` on run) |
| String scan `app.asar` / `Electron/` | **no hits** in the clear | Payload is **compressed**, not stored raw |

So: an NSIS **portable** wrapper around a compressed Electron distribution. The v9 report guessed 91 MB / NSIS+LZMA2; v12 is 100 MB and the same family. Confirmed 32-bit, matching v9.

> **Method note for the paper:** every fact in this section came from reading bytes, not from launching the program. That’s the correct first move on any unknown executable — establish the container format from headers and embedded magic strings before you decide whether/how to detonate it.

---

## 2. Unwrap — from `.exe` to readable source

No system 7-Zip was installed, so a standalone `7za` was pulled via npm (`7zip-bin`) and used to peel the layers. **electron-builder’s NSIS payload is itself a 7z stream**, which `7za` reads directly:

```bash
# 1. Standalone extractor (no admin install needed)
npm install 7zip-bin
ZA=node_modules/7zip-bin/win/x64/7za.exe

# 2. The NSIS .exe is a 7z container — list it
"$ZA" l Ophis_v12_Windows.exe
#   -> resources\app.asar  (32,524,448 bytes)   <-- the app
#      Ophis.exe           (210,832,384 unpacked) <-- Electron/Chromium runtime
#      ffmpeg.dll, libGLESv2.dll, icudtl.dat, locales\*.pak ...

# 3. Extract just the app bundle
"$ZA" e Ophis_v12_Windows.exe "resources/app.asar" -o./extracted

# 4. Unpack the asar (Electron's tar-like archive)
npx asar extract extracted/app.asar extracted/unpacked_full
```

That yields the full renderer tree **plus** the three files v9 never had:

```
unpacked_full/
  main.js          <-- Electron MAIN process (783 lines)  ← NEW visibility
  preload.js       <-- the electronBridge definition (36 lines) ← NEW visibility
  ophis.html       <-- the REAL bootstrap/loader (557 lines) ← NEW visibility
  package.json
  src/   (24 first-party modules, unchanged names from v9 + ophis_logging.js, scratchpad.js)
  lib/   (3rd-party libs, incl. astronomy.browser.min.js, sha512.min.js, purify.min.js)
  img/   README.txt
```

> **The whole thing is un-obfuscated.** Plain names, comments, TODOs, commented-out dead code, even `debugger;` statements. This is dev-style source shipped to production — ideal for study, and the reason a full white-box read is possible at all.

**Naming trap worth documenting:** the `OPHIS.html` sitting in *this* folder is **not** the bootstrap — it’s a v9 “Field Guide / Reverse-Engineering Codex” (byte-identical to `Ophis_v9_Explained.html`). The real loader (`ophis.html`) lives **inside** the asar and is the one cited throughout §6.

---

## 3. Anatomy of the package

| Layer | What | Notes |
|---|---|---|
| Outer | NSIS **portable** stub (32-bit PE) | Extracts to `%TEMP%` and runs `Ophis.exe` |
| Runtime | **Electron 39.2.4** (`package.json:14`), Chromium + Node, ia32 | `Ophis.exe` 210 MB unpacked; `ffmpeg.dll`, `vk_swiftshader.dll`, ICU, 56 locale paks |
| App | `resources/app.asar` (32.5 MB) | Electron’s uncompressed archive; `"main": "main.js"` |
| Renderer | `ophis.html` + 24 `src/*.js` + `lib/*` | Loaded by a hand-rolled serial `<script>` injector |

**Bootstrap loader (`ophis.html`):** 34 `<script>` tags; first-party modules are injected in strict order by a loop that appends a cache-buster (`ophis.html:549–550`):

```js
ithScriptElem.async = false;
ithScriptElem.src = "./src/" + ithSrcFile + ".js?v=" + cacheBuster;   // defeats caching every launch
```

**Content-Security-Policy (`ophis.html:72`):**

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' 'unsafe-inline' data: gap: blob:;
               script-src 'self' 'unsafe-inline' 'unsafe-eval';">
```

`script-src` includes **`'unsafe-eval'` and `'unsafe-inline'`** — i.e. the CSP **explicitly permits** the `new Function()` engine and inline handlers. It provides no mitigation against the sinks in §6; it’s a formality.

**Library changes visible in the loader:**
- `astronomy.browser.min.js` **is now loaded** (`ophis.html:39`). In v9 this (CosineKitty) lib was commented out and Meeus was the only sunset path. In v12 the `FEATURE_FLAG__USE_COSINE_KITTY_ASTRONOMY` path is live.
- `sha512.min.js` is **still commented out** (`ophis.html:67`): `<!-- <script src="./lib/sha512.min.js"></script> -->`. Consequence in §6.4.

---

## 4. What Ophis actually does (unchanged core)

Ophis is a **date-projection / cycle-prediction** tool dressed in financial-astrology (Gann-style) vocabulary. The loop:

1. **X-Dates** — the user supplies ≥2 anchor dates (optionally with time + lat/long).
2. **Y** — for each anchor *pair*, the engine counts the **axial rotations** (whole days) between them. `Y` is the single variable exposed to formulas.
3. **Operations** — each is a tiny equation, e.g. `X2+oph_round(Y)`, `X1+YxOPH_PHI`, that transforms `Y` into a day-offset. The `X1+`/`X2+` prefix chooses which anchor the offset is added to.
4. **Z-Dates** — the projected output dates. Scored, filtered, sorted; matches against the **MSRF** resonance number-sets and lunar/eclipse tables earn multipliers.
5. **Output** — a Chart.js timeline with moon-phase / eclipse overlays; export to PDF / CSV / XLSX.

**The formula mini-language** is validated by `math.js` and then compiled to a native function. Constants are string-substituted, not scoped: `OPH_PI = 3.14`, `OPH_PHI = 1.618`, `OPH_CRV = 5.08` (π·φ), `OPH_HEP = 7.01` (`ophis_config.js:410–413`). Available runtime helpers are the `oph_*` functions (`oph_round`, `oph_flip` = digit-reverse, `oph_sqrt`, trig, …).

The **MSRF sets** (extracted verbatim, `ophis_model__params.js:17–46`): NORMAL = 276 integers, IMPORTANT = 53 integers, VORTEX = 12 floats; `HIGHEST_MSRF_NUMBER = 2559`. Full arrays in §9.

There is **no live market data** — “Markets” mode only re-skins the header. Fully offline: bundled eclipse tables (to ~year 3000), bundled timezone data, offline Leaflet map tiles, offline password hashes. (README even recommends running it air-gapped.)

---

## 5. What changed, v9 → v12

| Area | v9 | v12 | Where |
|---|---|---|---|
| **Headless / CLI mode** | — | **New.** `--headless`, `--output-type`, `--output-path`, `--input-validation-mode`, `--current-epoch-millis`, `--multiple-files`; CSV output; runs windowless and writes files. | `main.js:490–529`, `ophis_config.js:23–27` |
| **Console→CLI bridge** | — | **New** `src/ophis_logging.js` overrides `console.*` → `electronBridge.logToCli` when headless. | `ophis_logging.js`, `main.js:201–203` |
| **T-Dates** | — | **New** second input-date type alongside X-Dates. | `ophis_config.js:57–58` |
| **File-input validation** | single strict path | **New** 3 modes STRICT / ORIGINAL / **LOOSE**; **GUI defaults to LOOSE** (most permissive), headless forces STRICT. | `ophis_config.js:336–344`, `ophis_main.js:29`, `ophis_view__export.js:165` |
| **Default operations** | 15 (X1 hepta off) | **16** — adds `X2+YxOPH_HEP` **enabled by default** (“from Jason … Late-December 2025”). | `ophis_model__params.js:113,137–143` |
| **Astronomy lib** | CosineKitty commented out | **Loaded** and live. | `ophis.html:39` |
| **Markets event type** | commented out of enum | **Uncommented / user-selectable.** | `ophis_config.js:361–365` |
| **Sign-in gate** | disabled, sha512 commented out | **Still disabled, sha512 still commented out** (unchanged). | `ophis_config.js:291`, `ophis.html:67` |

Net: v12 is v9 + headless CLI + T-Dates + a 16th default op + a validation-mode system whose **GUI default (LOOSE) widens the attack surface**. The security posture is otherwise unchanged — and, because of LOOSE-by-default, marginally worse.

---

## 6. Security analysis (the core of the paper)

### 6.1 The verified exploit chain

```
malicious .oph  ──▶  operation string reaches new Function()   [renderer code execution]
     (open or       (validator ≠ executor; LOOSE accepts it)
      recalc)
                └──▶  window.electronBridge.autoSaveToFile(path, data)
                          │
                          ▼   ipcMain 'autoSaveToFile' → saveToFile()
                     fs.mkdirSync(recursive) + fs.writeFile   ← NO path validation
                          │
                          ▼
                 write payload into %APPDATA%\...\Startup\evil.js
                          │
                          ▼
                 code execution at next login   [host compromise]
```

Every arrow below is cited. This chain was **inferred** in v9; with `main.js`/`preload.js` in hand it is now **confirmed**.

### 6.2 Finding #1 — `new Function()` over `.oph`-controlled strings *(Critical)*

The engine compiles each operation string to a native function:

```js
// ophis_model__validation.js:158
var operationFunction = new Function("Y", "return " + operationEquationStringForFinalFunction + ";");
```

Reachability **without any UI interaction or sign-in**: opening a file (`ipcMain 'openOphFile'` → renderer `onOphFileOpened` → `swapInNewIsoEventArray` → `refreshXDates` → `runOphisOnEvent` → `getEffectiveOperations` → `validateOperationString`) compiles **every enabled operation loaded from the file** (`ophis_model__operations.js:25–50`).

**Why the `math.js` “validation” doesn’t protect it — validator ≠ executor.** Before compiling, the string is *stripped* for the math.js check (`stripOperationEquationString`, `ophis_model__validation.js:104–121`): it removes the `X1+`/`X2+` prefix, **deletes every `oph_*` function name** (leaving the inner expression), and substitutes `Y→10`. So `math.parse`/`math.evaluate` (`:73,77`) see a *different, defanged* string than the one handed to `new Function` (`:158`), which keeps the `oph_*` names and full body. The two passes disagree by construction — the classic condition for an eval-filter bypass. And import does **no content validation** of operation strings at all (`parseOperationsForLoadedIsoEvent:620–645`, comment: *“be pretty permissive… operations array”*).

**Made worse in v12:** the GUI defaults to **`FILE_INPUT_VALIDATION_MODE__LOOSE`** (`ophis_main.js:29`), which auto-repairs structural problems (bad lat/long → defaults, too-few X-Dates → synthesised, missing event list → fresh event) instead of rejecting a hostile file — so a malformed/hostile `.oph` is *more* likely to be processed to the point of compiling operations.

### 6.3 Finding #2 — `nodeIntegration:true` **confirmed**, and an unvalidated file-write IPC *(Critical)*

v9: *“`nodeIntegration:true` strongly implied … not verified.”* Now verified:

```js
// main.js:362–370
win = new BrowserWindow({
  width: 800, height: 600, show: showWindow,
  webPreferences: {
    nodeIntegration: true,               // ← confirmed
    preload: path.join(__dirname, "preload.js"),
    // contextIsolation: (unset) → defaults to TRUE in Electron 39
    // sandbox: (unset) → false (preload + nodeIntegration)
  }
});
```

Precise reading:
- **`contextIsolation` is left unset**, so Electron 39 defaults it to **`true`**. With isolation on, the page’s *main world* does **not** receive `require`/`process` directly — Node lives in the isolated preload world, and the app talks to it through the `contextBridge` `electronBridge` API. That’s the one thing done semi-right.
- **But `nodeIntegration:true` alongside `contextIsolation:true` is incoherent** — it grants the page nothing here, yet signals intent and becomes an *immediate* full-Node exposure the day anyone flips `contextIsolation:false`. It should be `false`.
- The real Node boundary is therefore the **`electronBridge` IPC surface** — and one method is an RCE-grade primitive:

```js
// preload.js:4-6   (renderer-callable)
autoSaveToFile: async (filePath, fileContents) => { ipcRenderer.send("autoSaveToFile", filePath, fileContents); }

// main.js:113-120 + 267-283   (main process — trusts both arguments)
ipcMain.on('autoSaveToFile', (event, filePath, fileContents) => { saveToFile(filePath, fileContents, ()=>{}); });
function saveToFile(filePath, fileContents, callback) {
  var dirName = path.dirname(filePath);
  if (!fs.existsSync(dirName)) { fs.mkdirSync(dirName, { recursive: true }); }  // create arbitrary dirs
  fs.writeFile(filePath, fileContents, err => { ... });                          // write arbitrary file
}
```

**No path validation, no allowlist, no confinement.** Any code running in the renderer (e.g. the payload from Finding #1) can write **arbitrary content to an arbitrary absolute path** with the app’s privileges — drop a script into the per-user **Startup** folder, overwrite a config the user later runs, plant a DLL for search-order hijack, etc. This escalates renderer execution to **persistent host code execution** and does **not** depend on the `contextIsolation` nuance at all.

### 6.4 Finding #3 — sign-in gate is decorative *(High, by design)*

`FEATURE_FLAG__REQUIRE_SIGN_IN = false` (`ophis_config.js:291`), with the author’s own comment: *“a false sense of security anyway… like having a fake security camera.”* When enabled it does a **client-side** compare of `sha512(input)` against **5 hard-coded digests shipped in `ophis_config.js:5–11`** — unsalted, single-round SHA-512, trivially checkable offline against a wordlist, and bypassable by simply editing the flag or reading the compare. None is the empty-string hash; all distinct. (Not cracked here — flagged structurally.)

**Latent crash (unchanged from v9, still true in v12):** `hashAccount()` is `return sha512(account)` (`ophis_utils.js:664–666`), but `sha512.min.js` is **commented out of the bootstrap** (`ophis.html:67`). Flipping `REQUIRE_SIGN_IN` back on *without* also un-commenting that script throws `ReferenceError: sha512 is not defined` in `init_step2`.

### 6.5 Finding #4 — `executeJavaScript` string-building with hand-rolled escaping *(Medium)*

The main process pushes file data into the renderer by **string-concatenating JS** and calling `executeJavaScript`:

```js
// main.js:338   (escapedData = full re-stringified .oph JSON)
win.webContents.executeJavaScript('onOphFileOpened("'+filePathEscaped+'", "'+escapedData+'", '+checkForUnsavedChangesString+');');

// main.js:26-33   escaping is ONLY backslash + double-quote
function escapeString(s){ return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }
```

Because the payload is `JSON.stringify`-ed (control chars escaped) and `"`/`\` are handled, the obvious break is closed on modern V8 (which also tolerates raw U+2028/U+2029 in string literals). But this is **fragile, hand-rolled escaping on a privileged sink** (`saveFileAs`→`onSaveAsSuccess` at `:299`, open-file at `:540`, etc.); any future change to the escaper or a non-JSON payload path reopens injection. Should use `executeJavaScript` argument passing / `JSON.stringify` of the *whole* argument, or an `ipcRenderer` channel with structured data.

### 6.6 Finding #5 — CLI log forging in headless mode *(Low)*

`ophis_logging.js` routes `console.*` → `electronBridge.logToCli` → main’s `console.log(message)` (`main.js:201–203`). File-derived strings (event names, output paths, error text) reach the CLI stream **unsanitised** (`ophis_view__export.js:91,125`), so a crafted `.oph` can inject fake `OPH_ERROR:`/`OPH_INFO:` lines, newlines, or terminal escape sequences into whatever consumes headless output (a log file, a CI job). Not code execution; a log-integrity / terminal-injection issue. (Also a fidelity bug: only `args[0]` is forwarded, so multi-arg `console.log` drops everything after the first argument.)

### 6.7 Ranked findings

| # | Severity | Finding | Anchor |
|---|---|---|---|
| 1 | **Critical** | `.oph` operation string → `new Function()` renderer code execution; math.js validates a *different* string than it compiles; LOOSE default accepts hostile files | `ophis_model__validation.js:158`, `:104–121` |
| 2 | **Critical** | `nodeIntegration:true` **confirmed**; `electronBridge.autoSaveToFile` → arbitrary-path `fs.writeFile` with no validation → host persistence/RCE | `main.js:367`, `:113–120`, `:267–283`, `preload.js:4` |
| 3 | **High** | Sign-in is client-side theatre; 5 hard-coded SHA-512 hashes shipped; re-enabling crashes init (sha512 not loaded) | `ophis_config.js:291,5–11`; `ophis.html:67` |
| 4 | Medium | `executeJavaScript` built by string concat with 2-char escaper on a privileged sink | `main.js:338,26–33` |
| 5 | Low | Headless CLI log forging / terminal-escape injection from file-derived strings | `main.js:201–203`; `ophis_logging.js` |
| — | Info | CSP allows `unsafe-eval`+`unsafe-inline`; `debugger;` left in; dev-style cache-buster loader; DevTools reachable via View menu | `ophis.html:72`; `main.js:739` |

> **Threat-model caveat for the write-up.** This is an **offline, single-user, air-gapped** tool by design (README). The realistic attacker is a **malicious `.oph` file** shared in the Telegram community (“seed this preset”), double-clicked by a victim — the `.oph` extension is registered to the app (`package.json:18–23`) and `open-file`/second-instance handlers auto-load it (`main.js:304–346, 532–548`). Under that model, Findings #1+#2 chain to full host compromise from opening a shared “preset,” which is exactly how these files circulate.

---

## 7. The browser rewrites (PSYFR / Natori) — your portfolio UI

You’ve been rebuilding Ophis as **single-file, dependency-free** HTML apps. Findings:

- **`PSYFR1.html` ≡ `Natori-On-PSYFR-Main-UI.html`** — the same app saved twice (identical under whitespace-insensitive diff; PSYFR1 just has CRLF + a leading space per line). Keep one; delete/generate the other from it to avoid drift.
- **`NatoriOphis.html`** (“OPHION”) is an earlier, leaner variant of the same engine.
- **`OPHIS.html`** = the v9 Field Guide (= `Ophis_v9_Explained.html`), not an app.
- All are **100% self-contained** (only Google Fonts external), hand-rolled JDN/moon/eclipse math, **no** Chart.js/Leaflet/math.js/DOMPurify. Strong, cohesive “occult-almanac” design system (Cinzel / EB Garamond / IBM Plex Mono; dark+light; zoom; `prefers-reduced-motion`). **This is already portfolio-grade UI.**

**Two real issues to fix before it ships as a portfolio piece:**

1. **`new Function()` on user formula input** (`PSYFR1.html:739`, `NatoriOphis.html:533`, and even the `OPHIS.html:991` demo). Guarded only by a regex character-allowlist (`:736–737`) — a denylist, not a sandbox. In a browser (no Node) the blast radius is the page itself, so it’s **self-XSS**, but it’s the same anti-pattern the report criticises in the parent app.
2. **Unescaped `innerHTML` of the anchor `label`** (`PSYFR1.html:961`, op label `:982`). `a.label` comes straight from the input (`:971`) with no escaping — a label like `<img src=x onerror=…>` executes. User-controlled, and it round-trips through saved/imported JSON config.

Neither is a network-exfil risk in an offline page, but both are the exact “derived text → live compiler / innerHTML” smell your report calls out — fixing them makes the portfolio story *“I found these classes of bug and then didn’t commit them myself.”*

---

## 8. Building the hardened “our own version”

Concrete, paste-ready changes. These are the recommendations, not yet applied to your files (say the word and I’ll implement + verify).

**A. Kill the eval sink — parse instead of compile.** Replace `new Function` with a tiny shunting-yard evaluator that accepts only numbers, `Y`, the 4 constants, the `oph_*` functions, and `+ - * / ( )`. ~60 lines, no dependency, and it makes the validator and executor **the same code** (closing Finding #1). If you’d rather keep math.js in the Electron app, evaluate with a **frozen scope** and never call `new Function` on the un-stripped body.

**B. Lock down `webPreferences` (Electron app):**
```js
webPreferences: {
  nodeIntegration: false,     // page never needs Node
  contextIsolation: true,     // keep (already the default) — make it explicit
  sandbox: true,              // add — sandbox the renderer
  preload: path.join(__dirname, "preload.js"),
}
```

**C. Validate every path in the IPC handlers.** In `saveToFile`/`autoSaveToFile`, resolve the target and **confine it** to an allowed directory (e.g. the chosen output dir or the app’s data dir); reject absolute paths / `..` traversal / writes outside the jail. Prefer routing all saves through `dialog.showSaveDialog` (as `saveFileAs` already does) rather than accepting a renderer-supplied path.

**D. Tighten the CSP.** Drop `'unsafe-eval'` (possible once §8A lands) and move inline handlers out so you can drop `'unsafe-inline'`. That converts CSP from decorative to load-bearing.

**E. HTML-escape user text in the rewrites.** One helper, used at every `innerHTML` interpolation of `label`/notes:
```js
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// row.innerHTML = `<div class="lbl">${esc(a.label)} ...`;
```

**F. De-dupe the twins.** Make `Natori-On-PSYFR-Main-UI.html` the source of truth (clean LF); generate `PSYFR1.html` from it (or drop it).

**GitHub-ready:** this repo is a clean case study — commit `src/`+`lib/`+`img/`+`main.js`/`preload.js`/`ophis.html` (already un-obfuscated), this report, and the hardened rewrite. Add a `SECURITY.md` summarising §6 and a `METHOD.md` from §1–2. Don’t commit the 100 MB `.exe` — link a release asset or keep it out via `.gitignore`.

---

## 9. Appendix

### 9.1 Package contents (from `7za l`)
`resources\app.asar` (32,524,448) · `Ophis.exe` (210,832,384 unpacked, 75,741,239 compressed) · `d3dcompiler_47.dll` · `dxcompiler.dll` · `dxil.dll` · `ffmpeg.dll` · `libEGL.dll` · `libGLESv2.dll` · `vk_swiftshader.dll` · `vulkan-1.dll` · `resources.pak` · `icudtl.dat` · `chrome_100/200_percent.pak` · `resources\elevate.exe` · 56 × `locales\*.pak`.

### 9.2 Extraction artifacts (kept for repro / the paper’s figures)
Scratchpad `…/scratchpad/extracted/`: `app.asar`, `main.js`, `preload.js`, `ophis_bootstrap.html` handling, and `unpacked_full/` (full tree). Commands in §2 reproduce them from the `.exe` verbatim.

### 9.3 Constants (`ophis_config.js:410–413`)
`OPH_PI = 3.14` · `OPH_PHI = 1.618` · `OPH_CRV = 5.08` (= π·φ, rounded) · `OPH_HEP = 7.01`.

### 9.4 MSRF sets (`ophis_model__params.js:17–46`)
- **IMPORTANT (53):** 84, 126, 132, 153, 176, 186, 189, 210, 216, 252, 270, 306, 360, 378, 420, 432, 504, 540, 567, 612, 630, 648, 669, 693, 756, 780, 840, 864, 882, 945, 1008, 1080, 1134, 1224, 1260, 1296, 1344, 1404, 1428, 1440, 1512, 1584, 1656, 1728, 1800, 1890, 1980, 2016, 2070, 2160, 2268, 2448, 2520.
- **VORTEX (12 floats):** 21.7, 32.6, 43.5, 65.3, 76.2, 87.1, 217.8, 326.7, 435.6, 653.4, 762.3, 871.2.
- **NORMAL (276 ints):** see `ophis_model__params.js:17–36` (range 12 … `HIGHEST_MSRF_NUMBER = 2559`).

### 9.5 Environment
Reversed on Windows 11, Node v24.15.0, `7zip-bin` 7za 21.07, `@electron/asar` 11.12.1. Target built with electron-builder 26.0.12 / Electron 39.2.4 (ia32, portable).

---

*Prepared as the v12 successor to `Ophis_v9_ReverseEngineering_Report.md`. All claims cite extracted source; the Electron main-process files (`main.js`, `preload.js`, real `ophis.html`) were recovered from inside the shipped `.exe` per §2 and had not been examined in the v9 pass.*
