#!/usr/bin/env node
/* Browser test: drives the real app in headless Chromium through Playwright
   and checks what a person would do with it — every screen, the projection,
   opening a v12 file, pasting dates, editing operations, the Chronicon
   bridge, exports, HH:MM scope, persistence, the timeline and phone width.

     node natorion/tests/browser.js                 # run the checks
     node natorion/tests/browser.js --shots out/    # also save screenshots
     node natorion/tests/browser.js --headed        # watch it run

   Needs Playwright: `npm i -D playwright && npx playwright install chromium`
   (inside natorion/), or a global install. Exit code 0 when every check passes. */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), url = require("url");
const { execSync } = require("child_process");

const APP = path.resolve(__dirname, "..");
const REPO = path.resolve(APP, "..");
const PAGE = url.pathToFileURL(path.join(APP, "index.html")).href;
const argv = process.argv.slice(2);
const SHOTS = argv.includes("--shots") ? path.resolve(argv[argv.indexOf("--shots") + 1] || "shots") : null;
const HEADED = argv.includes("--headed");

/* ------------------------------------------------------ playwright -- */
function loadPlaywright() {
  const tries = [() => require("playwright"), () => require(path.join(APP, "node_modules", "playwright"))];
  tries.push(() => require(path.join(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), "playwright")));
  for (const t of tries) { try { return t(); } catch (e) { /* next */ } }
  console.error("Playwright is not installed. In natorion/: npm i -D playwright && npx playwright install chromium");
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

// Page errors fail the run; a font request that cannot reach Google Fonts does not.
function watchErrors(page, bucket) {
  page.on("pageerror", e => bucket.push("pageerror: " + e.message));
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/fonts\.(googleapis|gstatic)|ERR_CERT|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(t)) return;
    bucket.push("console: " + t);
  });
  page.on("dialog", d => d.accept());
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
    const page = await ctx.newPage();
    watchErrors(page, errors);
    await page.goto(PAGE);
    await settle(page);

    console.log("first open");
    const rows0 = await page.$$eval("#resultsBody tr[data-key]", r => r.length);
    check("the demo event projects Z-Dates", rows0 > 0, rows0);
    check("the status line counts Y-pairs", /15\s*Y-pairs/.test(await text(page, "#status")), await text(page, "#status"));
    check("marks render as text, never as [object …]", !/\[object /.test(await text(page, "#resultsBody")));
    check("the timeline canvas has a size", await page.$eval("#chart", c => c.width > 200 && c.height > 100));
    await shot(page, "cipher");

    for (const s of ["operations", "chronicon", "files", "guide"]) {
      await go(page, s);
      const visible = await page.$eval(`.screen[data-screen="${s}"]`, n => n.dataset.active === "true" && n.offsetHeight > 0);
      check("the " + s + " screen opens", visible);
      await shot(page, s);
    }
    check("the guide lists all three MSRF sets", (await page.$$eval("#msrfSets p", p => p.length)) === 3);

    console.log("the derivation drawer");
    await go(page, "cipher");
    await page.click("#resultsBody tr[data-key]");
    await page.waitForSelector("#detailDialog[open]");
    const detail = await text(page, "#detailBody");
    check("clicking a row opens its derivation", /score/.test(detail) && /Y = /.test(detail), detail.slice(0, 120));
    await shot(page, "detail");
    await page.keyboard.press("Escape");
    check("Escape closes the drawer", !(await page.$("#detailDialog[open]")));

    console.log("opening a v12 file");
    let sample = path.join(REPO, "test-file-bradley-rogue-dates.oph");
    if (!fs.existsSync(sample)) {
      sample = path.join(tmp, "sample.oph");
      fs.writeFileSync(sample, JSON.stringify({ app_version: "12", iso_events: [
        { name: "Event 1", x_dates: [{ date: "07/04/2026" }, { date: "08/20/2026" }, { date: "03/09/2027" }] },
        { name: "Event 2", x_dates: [{ date: "01/01/2027" }, { date: "02/02/2027" }] }] }));
    }
    await go(page, "files");
    await page.setInputFiles("#fileInput", sample);
    await page.waitForFunction(() => /Opened/.test(document.getElementById("importReport").textContent), null, { timeout: 10000 });
    const names = await page.$$eval("#eventSelect option", o => o.map(x => x.textContent));
    check("a .oph file with two events opens", names.length === 3 && names[2] === "+ New event", names.join(" | "));
    await go(page, "cipher");
    await settle(page);
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
    await page.waitForTimeout(450);
    const opErr = await page.$eval("#opsBody .err", e => e.textContent);
    check("an equation carrying code is refused", /Unknown name 'alert'/.test(opErr), opErr);
    await eq.fill("X2+oph_round(Y)");
    await page.waitForTimeout(450);
    check("fixing it clears the error", await page.$eval("#opsBody .err", e => e.hidden));
    await page.fill("#tryEq", "X1+Y^2"); await page.fill("#tryY", "12");
    check("^ is power in the try-it box", /Z = 144 /.test(await text(page, "#tryOut")), await text(page, "#tryOut"));
    const before = await text(page, "#opsCount");
    await page.click("#opsExtras");
    const after = await text(page, "#opsCount");
    check("the extras add ten operations", parseInt(after.split(" of ")[1], 10) - parseInt(before.split(" of ")[1], 10) === 10, before + " → " + after);

    console.log("sorting and searching");
    await go(page, "cipher");
    await page.selectOption("#sortSel", "SORT_TYPE__SCORE");
    await settle(page);
    const scores = await page.$$eval("#resultsBody tr[data-key] td.score", t => t.map(x => parseFloat(x.textContent)));
    check("score sort is highest first", scores.length > 1 && scores.every((s, i) => !i || scores[i - 1] >= s), scores.slice(0, 8).join(","));
    await page.fill("#zSearch", "2028");
    await page.waitForTimeout(350);
    const found = await page.$$eval("#resultsBody tr[data-key] td.date", t => t.map(x => x.textContent));
    check("search narrows the table", found.length > 0 && found.every(t => t.includes("2028")), found.length);
    await page.fill("#zSearch", "");
    await page.waitForTimeout(350);

    console.log("the Chronicon bridge");
    await page.click("#resultsBody tr[data-key]");
    await page.waitForSelector("#detailDialog[open]");
    await page.click('#detailBody button:has-text("Open in Chronicon")');
    await page.waitForTimeout(300);
    check("a Z-Date opens in the Chronicon", await page.$eval('.screen[data-screen="chronicon"]', n => n.dataset.active === "true"));
    const xBefore = await page.evaluate(() => NC.store.event().x_dates.length);
    await page.click("#chToX");
    check("Use as X-Date adds an X-Date", (await page.evaluate(() => NC.store.event().x_dates.length)) === xBefore + 1);
    await page.click('#chJumps button:has-text("2040")');
    check("2040 is a Phoenix node", /NODE/.test(await text(page, "#chCycles")), (await text(page, "#chCycles")).slice(0, 120));
    check("the calendar wall has nineteen calendars", (await page.$$eval("#chWall .cal", c => c.length)) === 19);
    check("no raw ERA suffix on the wall", !/ERA\d/.test(await text(page, "#chWall")));
    check("the living clocks tick", /\d\d:\d\d:\d\d/.test(await text(page, "#clocks")));
    await page.click('#ledgerSeg button[data-k="phx"]');
    const kinds = await page.$$eval("#ledgerBody .dot", d => d.map(x => x.className));
    check("the ledger filters to Phoenix rows", kinds.length > 0 && kinds.every(k => /d-phx/.test(k)), kinds.length);
    await shot(page, "chronicon-2040", { fullPage: true });

    console.log("exports");
    await go(page, "files");
    for (const [id, test] of [["#saveOph", s => JSON.parse(s).iso_events.length === 2], ["#saveCsv", s => /^\ufeff?Rank,Z-Date/.test(s)], ["#saveSheet", s => /<Workbook/.test(s)]]) {
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
    await page.fill("#evLat", "80");
    await page.dispatchEvent("#evLat", "change");
    check("a polar latitude is refused", /within ±65°/.test(await text(page, "#toasts")));
    const giza = await page.$$eval("#placeSel option", o => (o.find(x => /^Giza/.test(x.textContent)) || {}).value);
    await page.selectOption("#placeSel", giza);
    await settle(page);
    check("Giza reads as Africa/Cairo", (await text(page, "#evZone")) === "Africa/Cairo", await text(page, "#evZone"));
    check("sunset scope projects windows", /sunset days/.test(await text(page, "#status")) && /→/.test(await text(page, "#resultsBody")), await text(page, "#status"));
    await shot(page, "cipher-hhmm");

    console.log("the timeline");
    await page.evaluate(() => NC.store.change(e => { NC.C.CHART_LAYERS.forEach(f => { e[f.key] = true; }); }, { immediate: true }));
    await settle(page);
    const box = await (await page.$("#chart")).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -500);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
    await page.dblclick("#chart", { position: { x: 5, y: 5 } });
    check("zoom, pan and fit leave the page error-free", errors.length === 0, errors.join("\n"));
    await shot(page, "timeline-layers");

    console.log("keeping work");
    const evCount = await page.evaluate(() => NC.store.state.events.length);
    await page.waitForTimeout(600);
    await page.reload();
    await settle(page);
    check("events survive a reload", (await page.evaluate(() => NC.store.state.events.length)) === evCount);
    check("the place survives a reload", (await page.inputValue("#evLat")) === "29.98");
    check("the theme button switches to light", await page.click("#themeBtn").then(() => page.evaluate(() => document.documentElement.dataset.theme === "light")));
    await shot(page, "light");
    await ctx.close();

    /* =================================================== phone width */
    console.log("phone");
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const mp = await phone.newPage();
    watchErrors(mp, errors);
    for (const s of ["cipher", "operations", "chronicon", "files", "guide"]) {
      await mp.goto(PAGE + "#" + s);
      if (s === "cipher") await settle(mp); else await mp.waitForTimeout(400);
      const w = await mp.evaluate(() => document.documentElement.scrollWidth);
      check("no sideways scroll on " + s + " at 390 px", w <= 390, w);
      await shot(mp, "phone-" + s);
    }
    await phone.close();

    check("no page errors in the whole run", errors.length === 0, errors.join("\n"));
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${pass} passed, ${fail} failed` + (SHOTS ? ` · screenshots in ${SHOTS}` : ""));
  if (fail) console.log("failed: " + failures.join("; "));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
