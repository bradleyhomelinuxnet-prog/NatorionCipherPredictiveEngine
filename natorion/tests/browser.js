#!/usr/bin/env node
/* Browser test: drives the real app in headless Chromium through Playwright
   and checks what a person would do with it — every screen, the projection,
   opening a v12 file (and refusing one with no events), managing events,
   pasting dates, editing operations, the Chronicon bridge, the skip link,
   exports, HH:MM scope, persistence, the timeline and phone width.

     node natorion/tests/browser.js                 # run the checks
     node natorion/tests/browser.js --shots out/    # also save screenshots
     node natorion/tests/browser.js --headed        # watch it run

   Needs Playwright: `npm i -D playwright && npx playwright install --with-deps chromium`
   (inside natorion/; --with-deps fetches Chromium's system libraries on Linux),
   or a global install. Exit code 0 when every check passes. */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), url = require("url");
const { execSync } = require("child_process");

const APP = path.resolve(__dirname, "..");
const PAGE = url.pathToFileURL(path.join(APP, "index.html")).href;
const argv = process.argv.slice(2);
const shotsAt = argv.findIndex(a => a === "--shots" || a.startsWith("--shots="));
const shotsVal = shotsAt < 0 ? null : argv[shotsAt].includes("=") ? argv[shotsAt].split("=")[1] : (argv[shotsAt + 1] && !argv[shotsAt + 1].startsWith("--") ? argv[shotsAt + 1] : "shots");
const SHOTS = shotsVal == null ? null : path.resolve(shotsVal);
const HEADED = argv.includes("--headed");

/* ------------------------------------------------------ playwright -- */
function loadPlaywright() {
  const tries = [() => require("playwright"), () => require(path.join(APP, "node_modules", "playwright"))];
  tries.push(() => require(path.join(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), "playwright")));
  for (const t of tries) { try { return t(); } catch (e) { /* next */ } }
  console.error("Playwright is not installed. In natorion/: npm i -D playwright && npx playwright install --with-deps chromium");
  process.exit(2);
}
const { chromium } = loadPlaywright();

/* ---------------------------------------------------------- checks -- */
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  ok ? pass++ : (fail++, failures.push(name));
  console.log((ok ? "  ok   " : "  FAIL ") + name + (!ok && detail !== undefined ? "\n         " + String(detail).slice(0, 400) : ""));
}
async function shot(page, name, opts) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot(Object.assign({ path: path.join(SHOTS, name + ".png") }, opts || {}));
}

// Page errors fail the run. Requests to Google Fonts are cut off before they
// leave the browser, so a network that silently drops them cannot stall the
// run, and their failure is the one console error that is ignored. A missing
// local file still counts.
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
async function prepare(ctx) {
  await ctx.route(FONT_HOSTS, r => r.abort());
  // Start the browser's clock on the date the checks assume; time still moves on from there.
  if (ctx.clock && ctx.clock.install) await ctx.clock.install({ time: new Date("2026-09-23T12:00:00") });
}
// A dialog the next step expects (a RegExp its message must match). It is
// accepted once; any other dialog counts as an error.
let expectDialog = null;
function watchErrors(page, bucket) {
  page.on("pageerror", e => bucket.push("pageerror: " + e.message));
  page.on("console", m => {
    if (m.type() !== "error") return;
    if (FONT_HOSTS.test((m.location() && m.location().url) || "")) return;
    bucket.push("console: " + m.text() + " @ " + ((m.location() && m.location().url) || ""));
  });
  page.on("dialog", d => {
    if (expectDialog && expectDialog.test(d.message())) expectDialog = null;
    else bucket.push("dialog: " + d.type() + " " + d.message());
    d.accept();
  });
}

// Wait until the engine has run after the last change: the status line
// drops its busy flag and the store holds results.
async function settle(page) {
  await page.waitForTimeout(260);
  await page.waitForFunction(() => {
    const s = document.getElementById("status");
    return s && !s.classList.contains("busy") && window.NC && NC.store.state.results;
  }, null, { timeout: 30000 });
}
const text = (page, sel) => page.textContent(sel).then(t => (t || "").replace(/\s+/g, " ").trim());
const go = async (page, screen) => { await page.click(`#tabs button[data-screen="${screen}"]`); await page.waitForTimeout(150); };

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "natorion-"));
  const errors = [];
  try {
    /* ============================================== desktop, dark theme */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark", acceptDownloads: true });
    await prepare(ctx);
    const page = await ctx.newPage();
    watchErrors(page, errors);
    await page.goto(PAGE);
    await settle(page);

    console.log("first open");
    // Pin "today" (Files → Settings) so filters and marks do not drift as the calendar moves on.
    const ymd = () => page.evaluate(() => { const d = new Date(NC.store.nowMs()); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("-"); });
    await go(page, "files");
    await page.fill("#todayOverride", "2030-01-15");
    await page.dispatchEvent("#todayOverride", "change");
    await settle(page);
    check("today can be pinned in Settings", (await ymd()) === "2030-1-15", await ymd());
    await page.fill("#todayOverride", "2026-09-23");
    await page.dispatchEvent("#todayOverride", "change");
    await go(page, "cipher");
    await settle(page);
    check("… and moved again", (await ymd()) === "2026-9-23", await ymd());
    const rows0 = await page.$$eval("#resultsBody tr[data-key]", r => r.length);
    check("the demo event projects Z-Dates", rows0 > 0, rows0);
    check("the status line counts Y-pairs", /15\s*Y-pairs/.test(await text(page, "#status")), await text(page, "#status"));
    check("marks render as text, never as [object …]", !/\[object /.test(await text(page, "#resultsBody")));
    const inked = () => page.$eval("#chart", c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    check("the timeline is drawn (inked pixels)", (await inked()) > 5000, await inked());
    await shot(page, "cipher");

    for (const s of ["operations", "chronicon", "files", "guide"]) {
      await go(page, s);
      const visible = await page.$eval(`.screen[data-screen="${s}"]`, n => n.dataset.active === "true" && n.offsetHeight > 0);
      check("the " + s + " screen opens", visible);
      await shot(page, s);
    }
    check("the guide lists the three MSRF sets with their counts", await page.evaluate(() => {
      const t = document.getElementById("msrfSets").textContent, n = re => +((re.exec(t) || [])[1] || 0);
      return n(/Vortex, within 0\.1 \((\d+)\)/) === NC.C.MSRF_VORTEX.length && n(/Important \((\d+)\)/) === NC.C.MSRF_IMPORTANT.length && n(/Normal \((\d+)\)/) === NC.C.MSRF_NORMAL.length && NC.C.MSRF_NORMAL.length > 0;
    }));

    console.log("the derivation drawer");
    await go(page, "cipher");
    await page.click("#resultsBody tr[data-key]");
    await page.waitForSelector("#detailDialog[open]");
    const detail = await text(page, "#detailBody");
    check("clicking a row opens its derivation", /score/.test(detail) && /Y = /.test(detail), detail.slice(0, 120));
    await shot(page, "detail");
    await page.keyboard.press("Escape");
    check("Escape closes the drawer", !(await page.$("#detailDialog[open]")));

    console.log("a known projection (the manual's worked example)");
    await page.click("#xPasteBtn");
    await page.fill("#pasteDates", "07/04/2026, 08/20/2026");
    await page.click("#pasteOk");
    await settle(page);
    const golden = await page.$$eval("#resultsBody tr[data-key]", rows => {
      const r = rows.find(x => x.querySelector("td.date").textContent.startsWith("11/04/2026"));
      return r ? { score: r.querySelector("td.score").textContent, hits: r.querySelector("td.hits").textContent.trim(), msrf: Array.from(r.querySelectorAll("td .pill.normal, td .pill.important, td .pill.vortex")).map(p => p.textContent).join("|"), key: r.dataset.key } : null;
    });
    check("X1 07/04/2026 + X2 08/20/2026 project 11/04/2026", !!golden, "row missing");
    check("… scoring 1.5 with 2 hits and MSRF 76", !!golden && golden.score === "1.5" && golden.hits === "2" && golden.msrf === "76", JSON.stringify(golden));
    if (golden) {
      await page.click(`#resultsBody tr[data-key="${golden.key}"]`);
      await page.waitForSelector("#detailDialog[open]");
      const d = await text(page, "#detailBody");
      check("… and its derivation shows Y = 47 and the ×1.5 multiplier", /Y = 47/.test(d) && /× 1\.5/.test(d), d.slice(0, 200));
      await page.keyboard.press("Escape");
    }

    console.log("opening Ophis files");
    const FIX = path.join(__dirname, "fixtures");
    await go(page, "files");
    await page.setInputFiles("#fileInput", path.join(FIX, "two-events-v9.oph"));
    await page.waitForFunction(() => /Opened 2 events/.test(document.getElementById("importReport").textContent), null, { timeout: 10000 });
    let names = await page.$$eval("#eventSelect option", o => o.map(x => x.textContent));
    check("a v9-era file with two events replaces the document", names.length === 3 && names[2] === "+ New event", names.join(" | "));
    await page.click('#openHowSeg button[data-v="append"]');
    await page.setInputFiles("#fileInput", path.join(FIX, "six-anchors-v12.oph"));
    await page.waitForFunction(() => /Opened 1 event/.test(document.getElementById("importReport").textContent), null, { timeout: 10000 });
    names = await page.$$eval("#eventSelect option", o => o.map(x => x.textContent));
    check("a v12 file can be added after them", names.length === 4 && names[2] === "Six anchors", names.join(" | "));
    check("the added event is the open one", (await page.evaluate(() => NC.store.state.current)) === 2);
    await page.click('#openHowSeg button[data-v="replace"]');
    // A document with no events is refused: Loose checking would otherwise put
    // a blank Event 1 in place of the three events open here.
    const doc = () => page.evaluate(() => JSON.stringify(NC.store.state.events) + "|" + NC.store.state.current);
    const docBefore = await doc(), reportBefore = await text(page, "#importReport");
    await page.setInputFiles("#fileInput", { name: "no-events.json", mimeType: "application/json", buffer: Buffer.from('{"app_version":"12","iso_events":[]}') });
    await page.waitForFunction(t => document.getElementById("importReport").textContent.replace(/\s+/g, " ").trim() !== t, reportBefore, { timeout: 10000 });
    await page.waitForTimeout(500);   // past the 400 ms save delay
    const refusal = await text(page, "#importReport");
    check("a document with no events is refused, and nothing changes", /holds no events/.test(refusal) && (await doc()) === docBefore, refusal);
    // Duplicating or deleting an event above the open one leaves that event open.
    const opened = () => page.evaluate(() => ({ names: NC.store.state.events.map(e => e.name).join(" | "), open: NC.store.event().name, picker: document.getElementById("eventSelect").selectedOptions[0].textContent }));
    await page.click('#eventsBody tr:nth-child(1) button:has-text("Duplicate")');
    const dup = await opened();
    check("duplicating an event above the open one keeps it open", dup.names === "Event 1 | Event 1 copy | Event 2 | Six anchors" && dup.open === "Six anchors" && dup.picker === "Six anchors", JSON.stringify(dup));
    expectDialog = /^Delete “Event 1 copy”\?/;
    await page.click('#eventsBody tr:nth-child(2) button:has-text("Delete")');
    await settle(page);
    const del = await opened();
    check("… and so does deleting one", !expectDialog && del.names === "Event 1 | Event 2 | Six anchors" && del.open === "Six anchors" && del.picker === "Six anchors", JSON.stringify(del));
    await page.selectOption("#eventSelect", "0");
    await go(page, "cipher");
    await settle(page);
    check("Event 1 is the open event again", (await page.evaluate(() => NC.store.state.current)) === 0);
    check("its seven anchors give 21 Y-pairs", /\b21\s*Y-pairs/.test(await text(page, "#status")) && (await page.$$eval("#xList input[type=date]", i => i.length)) === 7, await text(page, "#status"));
    check("the opened event projects", (await page.$$eval("#resultsBody tr[data-key]", r => r.length)) > 0);

    console.log("pasting dates");
    await page.click("#xPasteBtn");
    await page.fill("#pasteDates", "7-4-26-8-20-26-3-9-27");
    await page.click("#pasteOk");
    await settle(page);
    const xs = await page.$$eval("#xList input[type=date]", i => i.map(x => x.value));
    check("the file-name date style pastes as three X-Dates", JSON.stringify(xs) === JSON.stringify(["2026-07-04", "2026-08-20", "2027-03-09"]), xs.join(","));
    check("three dates give three Y-pairs", /3\s*Y-pairs/.test(await text(page, "#status")), await text(page, "#status"));

    console.log("operations");
    await go(page, "operations");
    const eq = (await page.$$("#opsBody input[type=text]"))[0];
    await eq.fill("X2+alert(document.cookie)");
    await page.waitForFunction(() => !document.querySelector("#opsBody .err").hidden, null, { timeout: 5000 });
    const opErr = await page.$eval("#opsBody .err", e => e.textContent);
    check("an equation carrying code is refused", /Unknown name 'alert'/.test(opErr), opErr);
    check("… and nothing ran", errors.length === 0, errors.join("\n"));
    await eq.fill("X2+oph_round(Y)");
    await page.waitForFunction(() => document.querySelector("#opsBody .err").hidden, null, { timeout: 5000 });
    check("fixing it clears the error", await page.$eval("#opsBody .err", e => e.hidden));
    await page.fill("#tryEq", "X1+Y^2"); await page.fill("#tryY", "12");
    check("^ is power in the try-it box", /Z = 144 /.test(await text(page, "#tryOut")), await text(page, "#tryOut"));
    const counts = async () => { const m = /(\d+) of (\d+)/.exec(await text(page, "#opsCount")); return m ? [+m[1], +m[2]] : [0, 0]; };
    const before = await counts();
    await page.click("#opsExtras");
    const after = await counts();
    check("the extras add ten operations, switched on", after[0] - before[0] === 10 && after[1] - before[1] === 10, before + " → " + after);

    console.log("sorting and searching");
    await go(page, "cipher");
    await page.selectOption("#sortSel", "SORT_TYPE__SCORE");
    await settle(page);
    const ranked = await page.$$eval("#resultsBody tr[data-key]", rows => rows.map(r => ({ s: parseFloat(r.querySelector("td.score").textContent), h: parseInt(r.querySelector("td.hits").textContent, 10), d: NC.store.state.results.byDate.find(t => t.key === r.dataset.key).start })));
    check("score sort is highest first", ranked.length > 1 && ranked.every((r, i) => !i || ranked[i - 1].s >= r.s), ranked.slice(0, 8).map(r => r.s).join(","));
    check("… ties fall back to hits, then date", ranked.every((r, i) => { if (!i) return true; const q = ranked[i - 1]; return q.s !== r.s || q.h > r.h || (q.h === r.h && q.d < r.d); }));
    await page.fill("#zSearch", "2028");
    await page.waitForFunction(() => / of /.test(document.getElementById("resultCount").textContent), null, { timeout: 5000 });
    const found = await page.$$eval("#resultsBody tr[data-key] td.date", t => t.map(x => x.textContent));
    check("search narrows the table", found.length > 0 && found.every(t => t.includes("2028")), found.length);
    await page.fill("#zSearch", "");
    await page.waitForFunction(() => !/ of /.test(document.getElementById("resultCount").textContent), null, { timeout: 5000 });

    console.log("the Chronicon bridge");
    const zDate = (await text(page, "#resultsBody tr[data-key] td.date")).slice(0, 10);   // MM/DD/YYYY
    await page.click("#resultsBody tr[data-key]");
    await page.waitForSelector("#detailDialog[open]");
    await page.click('#detailBody button:has-text("Open in Chronicon")');
    await page.waitForTimeout(300);
    check("a Z-Date opens in the Chronicon", await page.$eval('.screen[data-screen="chronicon"]', n => n.dataset.active === "true"));
    const dial = await page.evaluate(() => [document.getElementById("chMonth").value, document.getElementById("chDay").value, document.getElementById("chYear").value].map(Number));
    check("… on the same day", dial.join("/") === zDate.split("/").map(Number).join("/"), zDate + " vs " + dial.join("/"));
    const xBefore = await page.evaluate(() => NC.store.event().x_dates.length);
    await page.click("#chToX");
    const xs2 = await page.evaluate(() => NC.store.event().x_dates.map(d => d.date));
    check("Use as X-Date adds that day as an X-Date", xs2.length === xBefore + 1 && xs2[xs2.length - 1] === zDate, xs2.slice(-1)[0]);
    await page.click('#chJumps button:has-text("2040")');
    check("2040 is a Phoenix node", /NODE/.test(await text(page, "#chCycles")), (await text(page, "#chCycles")).slice(0, 120));
    check("the calendar wall has nineteen calendars", (await page.$$eval("#chWall .cal", c => c.length)) === 19);
    check("no raw ERA suffix on the wall", !/ERA\d/.test(await text(page, "#chWall")));
    const c0 = await text(page, "#clocks");
    check("the living clocks tick", /\d\d:\d\d:\d\d/.test(c0) && await page.waitForFunction(t => document.getElementById("clocks").textContent.replace(/\s+/g, " ").trim() !== t, c0, { timeout: 3000 }).then(() => true, () => false));
    check("the Dossier draws the four Stone renders", (await page.$$eval("#renderHost figure svg", f => f.length)) === 4);
    check("the Dossier's live numbers are filled in", await page.$eval('[data-live="amToday"]', n => n.textContent === String(new Date().getFullYear() + 3894)));
    check("the Dossier's eight chapters are present", (await page.$$eval("#dossier details.chapter", d => d.length)) === 8);
    await page.click('#ledgerSeg button[data-k="phx"]');
    const kinds = await page.$$eval("#ledgerBody .dot", d => d.map(x => x.className));
    check("the ledger filters to Phoenix rows", kinds.length > 0 && kinds.every(k => /d-phx/.test(k)), kinds.length);
    // The skip link goes to #main, which is not a screen: it must not switch screens.
    await page.focus("a.skip");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    check("the skip link keeps the Chronicon screen", await page.evaluate(() => location.hash === "#main" && document.querySelector('.screen[data-active="true"]').dataset.screen === "chronicon"));
    await shot(page, "chronicon-2040", { fullPage: true });

    console.log("exports");
    await go(page, "files");
    const shown = await page.evaluate(() => ({ n: NC.store.state.results.sorted.length, first: NC.time.msToDateString(NC.store.state.results.sorted[0].start, NC.store.state.results.zone), dates: NC.store.state.events.map(e => e.x_dates.map(d => d.date)) }));
    for (const [id, test] of [
      ["#saveOph", s => { const j = JSON.parse(s); return j.iso_events.length === 3 && JSON.stringify(j.iso_events.map(e => e.x_dates.map(d => d.date))) === JSON.stringify(shown.dates); }],
      ["#saveCsv", s => { const lines = s.replace(/^\ufeff/, "").split(/\r\n/).filter(Boolean); return /^Rank,Z-Date/.test(lines[0]) && lines.length === shown.n + 1 && lines[1].startsWith("1," + shown.first); }],
      ["#saveSheet", s => /<Workbook/.test(s) && (s.match(/<Row>/g) || []).length === shown.n + 1]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(id)]);
      const out = path.join(tmp, dl.suggestedFilename());
      await dl.saveAs(out);
      const body = fs.readFileSync(out, "utf8");
      check(id.slice(1) + " downloads " + dl.suggestedFilename(), test(body), body.slice(0, 80));
    }
    const saved = fs.readdirSync(tmp).find(f => f.endsWith(".oph"));
    const reopened = JSON.parse(fs.readFileSync(path.join(tmp, saved), "utf8"));
    check("the saved .oph keeps v12's shape", reopened.app_version === "12" && Array.isArray(reopened.iso_events[0].x_dates));

    console.log("HH:MM · sunset scope");
    await go(page, "cipher");
    await page.click('#scopeSeg button[data-v="EVENT_SCOPE__HH_MM"]');
    await settle(page);
    check("switching scope shows the location box", await page.$eval("#locBox", n => !n.hidden));
    const latBefore = await page.evaluate(() => NC.store.event().lat);
    await page.fill("#evLat", "80");
    await page.dispatchEvent("#evLat", "change");
    check("a polar latitude is refused", /within ±65°/.test(await text(page, "#toasts")) && (await page.evaluate(() => NC.store.event().lat)) === latBefore && (await page.$eval("#evLat", i => i.getAttribute("aria-invalid"))) === "true");
    const giza = await page.$$eval("#placeSel option", o => (o.find(x => /^Giza/.test(x.textContent)) || {}).value);
    await page.selectOption("#placeSel", giza);
    await settle(page);
    check("Giza reads as Africa/Cairo", (await text(page, "#evZone")) === "Africa/Cairo", await text(page, "#evZone"));
    const win = await text(page, "#resultsBody tr[data-key] td.date");   // "MM/DD/YYYY HH:MM → MM/DD/YYYY HH:MM"
    const wm = /^(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)\s*→\s*(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)$/.exec(win);
    const evening = wm && +wm[4] >= 16 && +wm[4] <= 20, nextDay = wm && (Date.UTC(+wm[8], +wm[6] - 1, +wm[7]) - Date.UTC(+wm[3], +wm[1] - 1, +wm[2])) === 86400000, sameMinute = wm && Math.abs((+wm[9] * 60 + +wm[10]) - (+wm[4] * 60 + +wm[5])) <= 5;
    check("sunset scope projects sunset-to-sunset windows", /sunset days/.test(await text(page, "#status")) && !!evening && !!nextDay && !!sameMinute, win);
    await shot(page, "cipher-hhmm");

    console.log("the timeline");
    await page.evaluate(() => NC.store.change(e => { NC.C.CHART_LAYERS.forEach(f => { e[f.key] = true; }); }, { immediate: true }));
    await settle(page);
    const box = await (await page.$("#chart")).boundingBox();
    const snap = async () => { await page.mouse.move(box.x - 20, box.y - 20); await page.waitForTimeout(60); return page.$eval("#chart", c => c.toDataURL()); };
    await page.click("#chartFit");
    const s0 = await snap();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -500);
    const s1 = await snap();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
    const s2 = await snap();
    await page.dblclick("#chart", { position: { x: 5, y: 5 } });
    const s3 = await snap();
    check("the wheel zooms the timeline", s1 !== s0);
    check("dragging pans it", s2 !== s1);
    check("double-click fits it back", s3 === s0);
    check("zoom, pan and fit leave the page error-free", errors.length === 0, errors.join("\n"));
    await shot(page, "timeline-layers");

    console.log("keeping work");
    const evCount = await page.evaluate(() => NC.store.state.events.length);
    await page.waitForTimeout(600);
    await page.reload();
    await settle(page);
    check("events survive a reload", (await page.evaluate(() => NC.store.state.events.length)) === evCount);
    check("the place survives a reload", (await page.inputValue("#evLat")) === "29.98");
    // Opened at an address fragment that is not a screen, the app shows the saved
    // screen. Switching to it is enough to save it; no other change is needed.
    await go(page, "guide");
    await page.goto("about:blank");
    await page.goto(PAGE + "#main");
    await settle(page);
    check("opened at #main, the app shows the saved screen", await page.evaluate(() => document.querySelector('.screen[data-active="true"]').dataset.screen === "guide" && location.hash === "#guide"));
    await go(page, "cipher");
    const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click("#themeBtn");
    check("the theme button switches to light, and the page changes", await page.evaluate(b => document.documentElement.dataset.theme === "light" && getComputedStyle(document.body).backgroundColor !== b, bgBefore));
    await shot(page, "light");
    await ctx.close();

    /* =================================================== phone width */
    console.log("phone");
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await prepare(phone);
    const mp = await phone.newPage();
    watchErrors(mp, errors);
    for (const s of ["cipher", "operations", "chronicon", "files", "guide"]) {
      await mp.goto(PAGE + "#" + s);
      if (s === "cipher") await settle(mp); else await mp.waitForTimeout(400);
      const on = await mp.evaluate(() => (document.querySelector('.screen[data-active="true"]') || {}).dataset.screen);
      const w = await mp.evaluate(() => document.documentElement.scrollWidth);
      check("no sideways scroll on " + s + " at 390 px", on === s && w <= 390, on + " " + w);
      await shot(mp, "phone-" + s);
    }
    // Files is the widest screen; hold it to a smaller phone too.
    await mp.setViewportSize({ width: 375, height: 812 });
    await mp.goto(PAGE + "#files");
    await mp.waitForTimeout(400);
    const on375 = await mp.evaluate(() => (document.querySelector('.screen[data-active="true"]') || {}).dataset.screen);
    const w375 = await mp.evaluate(() => document.documentElement.scrollWidth);
    check("no sideways scroll on files at 375 px", on375 === "files" && w375 <= 375, on375 + " " + w375);
    await phone.close();

    check("no page errors in the whole run", errors.length === 0, errors.join("\n"));
  } finally {
    await browser.close();
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (e) { console.warn("could not remove " + tmp + ": " + e.code); }
  }
  console.log(`\n${pass} passed, ${fail} failed` + (SHOTS ? ` · screenshots in ${SHOTS}` : ""));
  if (fail) console.log("failed: " + failures.join("; "));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
