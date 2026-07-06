# METHOD — how the `.exe` came apart

The reproducible spine of the study. The discipline that matters: **identify the container from bytes before running anything.** Nothing here executes the target binary.

## 0. Environment
Windows 11 · Node v24.15.0 · `7zip-bin` (7za 21.07) · `@electron/asar` 11.12.1. All extraction is offline.

## 1. Triage — read bytes, don’t execute

| Probe | Result | Meaning |
|---|---|---|
| First 2 bytes | `4D 5A` (`MZ`) | Windows PE |
| PE machine field | `PE..L` → `0x14C` | 32-bit (ia32) |
| String scan `Nullsoft` | offset **81276** | NSIS installer/stub |
| `package.json` → `win.target` | `"portable"` | electron-builder portable (self-extracts to `%TEMP%` on run) |
| String scan `app.asar` | no hit in the clear | payload is **compressed** |

Conclusion before any execution: an **NSIS portable** wrapper around a compressed Electron distribution, 32-bit.

## 2. Recognise the NSIS payload as a 7z stream

electron-builder’s NSIS package embeds a 7z archive, which a standalone extractor reads directly — no admin install, no detonation.

```bash
npm install 7zip-bin
ZA=node_modules/7zip-bin/win/x64/7za.exe
"$ZA" l Ophis_v12_Windows.exe
```

Listing reveals the Electron distribution: `resources\app.asar` (32,524,448 bytes), `Ophis.exe` (the Chromium/Node runtime, 210 MB unpacked), `ffmpeg.dll`, `icudtl.dat`, 56 `locales\*.pak`, etc.

## 3. Extract the app bundle

```bash
"$ZA" e Ophis_v12_Windows.exe "resources/app.asar" -o./extracted
```

## 4. Unpack the asar

Electron’s `asar` is a tar-like archive; `@electron/asar` expands it into a normal tree.

```bash
npx asar extract extracted/app.asar extracted/unpacked_full
```

Yields the full renderer **plus the three files a source-only pass never sees**:

```
unpacked_full/
  main.js        # Electron MAIN process (783 lines) — BrowserWindow webPreferences, IPC handlers
  preload.js     # the electronBridge contextBridge definition (36 lines)
  ophis.html     # the REAL bootstrap/loader (557 lines) — CSP, script load order
  package.json   # "main": "main.js", Electron 39.2.4
  src/  lib/  img/  README.txt
```

## 5. Where to look first (highest signal)

- **`main.js:362–370`** — `BrowserWindow` `webPreferences`: confirms `nodeIntegration:true`; `contextIsolation`/`sandbox` posture.
- **`main.js:113–120, 267–283`** — the `autoSaveToFile` IPC handler → `fs.writeFile` with no path validation.
- **`preload.js`** — the full list of renderer-reachable privileged calls (`electronBridge`).
- **`ophis.html:72`** — the CSP (`script-src … 'unsafe-eval' 'unsafe-inline'`).
- **`src/ophis_model__validation.js:158`** — the `new Function("Y", …)` sink; and `:104–121` the strip pass that makes the math.js check inspect a *different* string than the one compiled.

## Notes / gotchas

- The `OPHIS.html` in the repo root is **not** the bootstrap — it’s a v9 field guide (byte-identical to `Ophis_v9_Explained.html`). The real loader is `ophis.html` **inside** the asar.
- The whole app is **un-obfuscated** — real names, comments, TODOs, `debugger;` statements. No deobfuscation step is needed.
- Extraction artifacts (`extracted/`, `unpacked_full/`, `*.asar`) are `.gitignore`-d because these commands regenerate them from the `.exe`.
