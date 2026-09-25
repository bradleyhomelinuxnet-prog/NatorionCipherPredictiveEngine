# Ophis v12 — browser build

This folder is **Ophis v12 exactly as it ships inside `Ophis_v12_Windows.exe`**, running in a web
browser instead of inside Electron. It has the same functions and screens and gives the same numbers.

Live copy: <https://bradleyhomelinuxnet-prog.github.io/NatorionCipherPredictiveEngine/ophis/>

## How it was made

The `.exe` is an Electron app. All of its logic lives in `resources/app.asar`. That archive holds:

| Part of the exe | What it does | In this folder |
|---|---|---|
| `ophis.html` | The page and its script loader | `index.html`, with four small additions (below) |
| `src/*.js`, `src/ophis.css` | The whole app: engine, screens, chart, export | Copied **byte-for-byte** |
| `lib/*` | Third-party libraries (Chart.js, Leaflet, moment, jsPDF…) | Only the libraries `ophis.html` loads, copied byte-for-byte except line 1 of `suncalc.js` (below) |
| `img/*` | Icons, moon/eclipse symbols, offline world-map tiles | Copied byte-for-byte |
| `package.json` | The app's name and version | Kept. At start-up the app reads its version from it (`init_step1_getAppVersion` in `src/ophis_main.js`) |
| `main.js`, `preload.js` | Electron only: native File/Edit/View menu, open/save dialogs, calling `init()` | Replaced by `src/browser_bridge.js` |

The repository root keeps the same renderer as a study copy (`src/`, `lib/`, `img/`). This folder
matches it file for file. From the repository root:

```bash
diff -rq src ophis/src                          # lists only the two bridge files
diff -rq img ophis/img                          # no output
diff -rq lib ophis/lib | grep -v '^Only in lib' # no output (ophis/lib is a subset)
```

Two details differ from the first version of this folder:

- **Line 1 of `lib/suncalc.js`** is a comment written when the library was vendored. It now reads
  as in the root copy, which leaves out the name of the person who ran the install. The code is
  unchanged. This is the one line that differs from the archive on purpose.
- **Three zoom-5 map tiles** (`img/offline_map/map/5/12/13.png`, `5/23/18.png`, `5/31/18.png`)
  were missing and showed as grey squares at the closest zoom. They are restored from `img/`.

Only three things are new.

- **`src/browser_bridge.js`** provides `window.electronBridge`, the same object `preload.js` exposed.
  The app therefore sees itself as the desktop build and runs its desktop code paths unchanged.
  The bridge also draws the File / Edit / View menu from the same template as `main.js`, and it
  calls `init()` once the page has loaded. What a web page needs on top of that is listed under
  *What cannot be the same in a browser*.
- **`src/browser_bridge.css`** styles that menu bar.
- **`index.html`** differs from `ophis.html` in four small places. It declares UTF-8 and the page's
  language (`lang="en"`, which screen readers need), it loads the two bridge files, and it hands the
  last script tag to the bridge so `init()` runs last.

## Running it

Use the live copy above, or serve the folder over HTTP and open it in Chrome or Edge. From the
repository root:

```bash
python3 -m http.server 8790 --directory ophis
```

Then open <http://localhost:8790/>. Keep `package.json` next to `index.html`: the app shows its
version from it and writes it into the files it saves.

**Serve it; don't open it from disk.** Opening `index.html` by double-clicking loads the app, but
Export PDF fails: the browser treats the chart's images as coming from another origin, so the chart
cannot be exported. The console also shows a blocked read of `package.json`; the app then falls back
to its built-in version number.

**Window size.** The original layout needs a window at least 1,661 pixels wide at 100% zoom. On a smaller screen, zoom the browser out (Ctrl and minus, Cmd and minus on a Mac):
90% fits a window 1,536 pixels wide, 80% fits 1,366 or 1,440, and 75% fits 1,280. The app lays
itself out again and draws the chart at the screen's resolution. View › Zoom In / Zoom Out scale
the page with CSS instead, which leaves the chart blurred, so use the browser's zoom.

## The menu, item by item

| Menu item | Desktop exe | Browser build |
|---|---|---|
| File › New File (Ctrl+N) | New session, warns if unsaved | Same. Most browsers keep Ctrl+N for a new window, so use the menu |
| File › Open… (Ctrl+O) | Native open dialog, `.oph` filter | Browser file picker, `.oph` filter |
| File › Save (Ctrl+S) | Writes the current file; with no file, acts as Save As | Same. In Chrome/Edge it writes back to the file you opened or saved. Elsewhere it downloads a copy and says so |
| File › Save As… | Native save dialog | Browser save dialog in Chrome/Edge. Elsewhere it asks for a name and downloads a copy |
| File › Quit (Ctrl+Q) | Asks if unsaved, then exits | Same question, then tries to close the tab. Ctrl+Q works unless the browser keeps it for itself |
| File › Prettify / Minify .oph Files | Checkbox toggles; Minify shows its warning | Identical |
| File › Reset Program | Clears everything after confirming | Clears Ophis's saved state after confirming. Other apps on the same site keep theirs |
| Edit › Cut / Copy / Paste / Delete / Select All | Standard | Standard |
| View › Operations Col Visible | Checkbox toggle | Identical |
| View › zoom and full screen | Electron zoom | The menu items scale the page with CSS. Their shortcuts (Ctrl+=, Ctrl+-, Ctrl+0) reach the browser's own zoom, which keeps the chart sharp. Full screen is the browser's |
| View › Toggle Developer Tools | Opens DevTools | Not in the menu; press F12 |

Dropping a `.oph` file onto the window opens it. This replaces double-clicking a `.oph` file in
Windows Explorer. Other files are refused with a message.

## Verified in the browser

Checked in headless Chromium, served over HTTP, with the file dialogs scripted:

- Start-up ran all six `init` steps, the self-check and the unit tests with no console errors and
  no failed requests.
- The three sample files at the repository root opened through File › Open:
  `7-4-26-…-4-1-28.oph` (6 X-Dates, 177 Z-Dates), `test-bradley.oph` (5 X-Dates, 114 Z-Dates) and
  `test-file-bradley-rogue-dates.oph` (two events, 211 Z-Dates). Each drew its chart.
- Editing the event name changed the title to "(Not Saved)". Ctrl+S saved and changed it to "(Saved)".
  When the browser was refused permission to write, the title went back to "(Not Saved)".
- Operations Col Visible, Prettify, and Minify with its warning dialog all toggled the real options.
- Export Z-Dates produced a real CSV, an Excel workbook and a PDF with the chart image. Export
  Events produced a `.oph` file.
- All eight screens rendered: About, Z-Dates, Operations, Import Events, Export Events,
  Export Z-Dates, Event Settings and Event Data Transfer.
- The offline map opened from its bundled tiles, showed no gaps at the closest zoom, and closed
  with Escape.
- New File cleared the session. Reset Program left the other apps' saved sessions in place.

## What cannot be the same in a browser

- **Command-line headless mode is not available.** The exe's `--headless --output-path …` batch
  CSV mode belongs to Electron's main process. The CSV export on the Export Z-Dates screen produces
  the same rows for one event at a time. The `headless` URL parameters that drive that mode inside
  the exe are ignored, so a link carrying them opens the normal app.
- **No file association.** Windows cannot open `.oph` files in a browser tab. Use File › Open or
  drag the file in.
- **Firefox and Safari have no File System Access API.** There, Save and Save As download a new
  copy each time instead of writing to the file you opened, and a message says so.
- **File pickers need a fresh click.** A browser opens a file picker only right after a click or
  key press. If answering "not saved" takes more than a few seconds, File › Open asks for one more
  click.
- **One site, shared storage.** On GitHub Pages this app shares its origin, and so its
  `localStorage`, with the other apps in this repository. Reset Program clears only Ophis's own
  entry (`save_blob`).
- **Links open in a new tab.** Links in the help text, such as NASA's eclipse page, open in a new
  tab, so the session stays open.
