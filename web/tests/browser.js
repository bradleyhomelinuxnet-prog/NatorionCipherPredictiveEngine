#!/usr/bin/env node
/* ==========================================================================
   browser.js — Ophis Web in headless Chromium
   --------------------------------------------------------------------------
   Drives the real page the way a person would and checks what the Node
   tests cannot see: dialogs, tooltips, focus, touch, the sticky bars, the
   theme, the phone layout, the Cycles panel and the Backtest window.

       node web/tests/browser.js            # run the checks
       node web/tests/browser.js --headed   # watch it run

   Needs Playwright with Chromium: `npm i playwright` somewhere on the module
   path (or NODE_PATH), then `npx playwright install --with-deps chromium`.
   The page is opened from disk, as a person opening web/index.html would.
   Exit code 0 when every check passes.
   ========================================================================== */
"use strict";

const path = require("path");
const url = require("url");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PAGE = url.pathToFileURL(path.join(ROOT, "web", "index.html")).href;
const HEADED = process.argv.includes("--headed");

function loadPlaywright() {
  const tries = [
    () => require("playwright"),
    () => require(path.join(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), "playwright"))
  ];
  for (const attempt of tries) { try { return attempt(); } catch (e) { /* next */ } }
  console.error("Playwright is not installed: npm i playwright && npx playwright install --with-deps chromium");
  process.exit(2);
}
const { chromium } = loadPlaywright();

let passed = 0, failed = 0;
const failures = [];
function check(name, ok, detail) {
  ok ? passed++ : (failed++, failures.push(name));
  console.log((ok ? "  ok   " : "  FAIL ") + name + (!ok && detail !== undefined ? "\n         " + String(detail).slice(0, 400) : ""));
}
function section(name) { console.log("\n" + name); }

// Every page error, console error and failed request fails the run, except
// in the one step below that aborts app.js on purpose.
const errors = [];
let collecting = true;
function watch(page) {
  page.on("pageerror", e => { if (collecting) errors.push("pageerror: " + e.message); });
  page.on("console", m => { if (collecting && m.type() === "error") errors.push("console: " + m.text()); });
  page.on("requestfailed", r => { if (collecting) errors.push("requestfailed: " + r.url()); });
}

const HOSTILE = JSON.stringify({ app_version: "12.0.0", iso_events: [{
  name: 'Evil <b id="inj">b</b><img src="x" id="injimg">', notes: '<i id="inj2">n</i>',
  scope: "EVENT_SCOPE__DAYS",
  x_dates: [{ date: "01/01/2020", time: "00:00", enabled: true }, { date: "05/07/2021", time: "00:00", enabled: true }]
}] });
const openFile = (page, name) => page.setInputFiles("#file-input", { name, mimeType: "application/json", buffer: Buffer.from(HOSTILE) });
const offset = page => page.evaluate(() => Ophis.Store.globalOptions.local_time_offset_in_millis);
// Scrolls until a field sits under the sticky bars, gives it focus, and says
// whether it can then be seen, as Shift+Tab back up the page would.
const focusFromUnderBars = (page, selector) => page.evaluate(sel => {
  const field = document.querySelector(sel);
  window.scrollTo(0, field.getBoundingClientRect().top + window.scrollY - 40);
  field.focus();
  const box = field.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + Math.min(box.width / 2, 20), box.top + box.height / 2);
  return field === hit || field.contains(hit);
}, selector);
const scrollY = page => page.evaluate(() => Math.round(window.scrollY));
const toFoot = page => page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); return Math.round(window.scrollY); });
// Waits up to two seconds for a condition in the page, so a slow machine gets
// the time it needs; a condition that never comes true still fails its check.
const settle = (page, condition, arg) => page.waitForFunction(condition, arg, { timeout: 2000 }).then(() => true, () => false);
// Opening a file over a session either asks first or loads it; waits for either.
const askedOrOpened = page => settle(page, () => !!document.querySelector("#modal.open [data-confirm]") ||
  /Evil/.test(document.querySelector(".event-tab.active").textContent));

async function fresh(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(PAGE);
  await page.waitForSelector(".z-row");
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    let { ctx, page } = await fresh(browser);

    section("start-up");
    check("boots in the light theme", await page.getAttribute("html", "data-theme") === "light");
    check("the sample event projects Z-Dates", (await page.$$(".z-row")).length > 0);

    section("dialogs");
    const xCount = () => page.$$eval("#panel-xdates .date-row", rows => rows.length);
    const opCount = () => page.$$eval("#panel-operations .operation-row", rows => rows.length);
    const before = await xCount();
    await page.click('[data-action="clear-x"]');
    await page.click("#modal footer [data-close]");
    await page.click('#panel-operations [data-action="add-operation"]');
    const opsBefore = await opCount();
    await page.click('[data-action="reset-operations"]');
    await page.click("#modal [data-confirm]");
    check("a cancelled dialog never acts later", await xCount() === before, (await xCount()) + " vs " + before);
    check("a confirmed dialog does its own job", opsBefore === 17 && await opCount() === 16, opsBefore + " -> " + (await opCount()));
    await page.click('[data-action="about"]');
    await page.keyboard.press("Escape");
    await page.focus('[data-action="clear-x"]');
    await page.keyboard.press("Enter");
    const focusedLabel = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
    check("a dialog opens with focus on Cancel, not on the destructive button", focusedLabel === "Cancel", focusedLabel);
    await page.keyboard.press("Enter");
    check("…so Enter twice changes nothing", await xCount() === before, (await xCount()) + " vs " + before);
    await page.focus('[data-action="new"]');
    await page.keyboard.press("Enter");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => document.getElementById("modal").contains(document.activeElement));
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-action"));
    check("Tab stays inside a dialog, and focus returns when it closes", inside && back === "new", inside + " " + back);
    await page.focus('[data-action="clear-x"]');
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    const backToPanel = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-action"));
    check("…also for a dialog opened from a panel, whose buttons are redrawn", backToPanel === "clear-x", backToPanel);
    await page.evaluate(() => { Ophis.Store.selection.zKey = Ophis.Store.results.z_keys_sorted[0]; Ophis.Store.notify("selection"); });
    await page.keyboard.press("Escape");
    check("outside a dialog, Escape still clears the selected Z-Date", await page.evaluate(() => Ophis.Store.selection.zKey) === null);

    // Each section starts from a fresh page, so one failure cannot cascade.
    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("tooltips");
    const pill = await page.$(".pill.op");
    if (pill) { await pill.hover(); await settle(page, () => document.getElementById("tooltip").classList.contains("show")); }
    const opTip = await page.evaluate(() => { const t = document.getElementById("tooltip"); return { sub: !!t.querySelector("sub"), text: t.textContent }; });
    check("an operation tooltip shows the anchor as a subscript, not as markup", !!pill && opTip.sub && opTip.text.indexOf("<sub>") < 0, opTip.text.slice(0, 120));
    await openFile(page, "hostile.oph");
    await page.waitForSelector(".event-tab.active");
    if (await page.$("#modal.open [data-confirm]")) await page.click("#modal [data-confirm]");
    await page.hover(".event-tab.active");
    await settle(page, () => /Evil/.test(document.getElementById("tooltip").textContent));
    const tip = await page.evaluate(() => { const t = document.getElementById("tooltip"); return { html: t.innerHTML, live: t.querySelectorAll("#inj, #injimg, #inj2").length }; });
    check("markup in an event name from a file shows as text", tip.live === 0 && tip.html.indexOf("&lt;b") >= 0, tip.html.slice(0, 120));
    check("the notes keep their italics", /<i>.*&lt;i id/.test(tip.html), tip.html.slice(0, 160));

    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("opening a file over unsaved work");
    await page.fill("#event-name", "Kept");
    await page.press("#event-name", "Tab");
    await openFile(page, "other.oph");
    await page.waitForSelector("#modal.open");
    const asked = /Replace the current session/.test(await page.textContent("#modal h2"));
    await page.click("#modal footer [data-close]");
    check("after an edit, opening a file asks first, and Cancel keeps the session", asked && await page.inputValue("#event-name") === "Kept");
    await page.reload();
    await page.waitForSelector(".z-row");
    await openFile(page, "other.oph");
    await askedOrOpened(page);
    const askedAfterReload = !!(await page.$("#modal.open [data-confirm]"));
    if (askedAfterReload) await page.click("#modal footer [data-close]");
    check("…and still asks after a reload", askedAfterReload && await page.inputValue("#event-name") === "Kept");
    await page.click('[data-action="new"]');
    await page.click("#modal [data-confirm]");
    await openFile(page, "other.oph");
    await askedOrOpened(page);
    const askedAfterNew = !!(await page.$("#modal.open [data-confirm]"));
    if (askedAfterNew) await page.click("#modal footer [data-close]");
    check("a new, untouched session opens a file without asking", !askedAfterNew);

    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("event fields");
    await page.fill("#event-name", "");
    await page.press("#event-name", "Tab");
    check("clearing the name keeps the last one", await page.inputValue("#event-name") !== "" && /\S/.test(await page.textContent(".event-tab.active")));
    await page.selectOption("#event-scope", "EVENT_SCOPE__HH_MM");
    await page.waitForSelector("#event-lat");
    await page.fill("#event-lat", "70");
    await page.press("#event-lat", "Tab");
    await settle(page, () => /Latitude must be/.test(document.getElementById("toast").textContent));
    check("latitude 70 is refused with a message", await page.inputValue("#event-lat") !== "70" && /Latitude must be/.test(await page.textContent("#toast")));
    await page.selectOption("#event-scope", "EVENT_SCOPE__DAYS");

    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("current time");
    const dateBefore = await page.inputValue("#now-date");
    await page.focus("#now-date");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    const dateAfter = await page.inputValue("#now-date");
    const months = (parseInt(dateAfter.slice(5, 7), 10) - parseInt(dateBefore.slice(5, 7), 10) + 12) % 12;
    const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.id === "now-date");
    check("the field keeps focus and takes two steps", stillFocused && months === 2, dateBefore + " -> " + dateAfter);
    await page.click("#panel-event h2");
    const reset = await page.waitForSelector('[data-action="reset-now"]', { timeout: 3000 }).catch(() => null);
    if (reset) {
      await page.focus("#now-date");
      const box = await reset.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.up();
      await settle(page, () => Ophis.Store.globalOptions.local_time_offset_in_millis === 0);
    }
    check("reset works while the field has focus, with a real press", !!reset && await offset(page) === 0, await offset(page));
    await page.evaluate(() => Ophis.Store.setNowOffset(7 * 864e5));
    await page.focus('[data-action="reset-now"]');
    await page.evaluate(() => Ophis.App.renderStatus());   // what the 30-second clock tick does
    check("the reset button keeps keyboard focus when the clock ticks",
      await page.evaluate(() => document.activeElement.getAttribute("data-action")) === "reset-now");

    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("the sticky bars");
    const bars = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const top = document.querySelector(".topbar").getBoundingClientRect();
      return [Math.round(top.top), Math.round(top.bottom), Math.round(document.querySelector(".statusbar").getBoundingClientRect().top)];
    });
    check("the top bar and the status bar stay on screen at the foot of the page", bars[0] === 0 && bars[2] === bars[1], bars.join(", "));
    check("a field under the bars comes clear when it takes focus", await focusFromUnderBars(page, "#event-name"));
    const foot = await toFoot(page);
    await page.focus('#toolbar [data-action="open"]');
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
    check("focus moving along the top bar leaves the page where it was", await scrollY(page) === foot, foot + " -> " + await scrollY(page));
    await page.evaluate(() => window.scrollTo(0, 600));
    const about = await (await page.$('[data-action="about"]')).boundingBox();
    await page.mouse.click(about.x + about.width / 2, about.y + about.height / 2);
    await page.waitForSelector("#modal.open");
    await page.keyboard.press("Escape");
    check("…and so does closing a dialog opened from it", await scrollY(page) === 600, await scrollY(page));
    await page.evaluate(() => document.activeElement.blur());
    await page.setViewportSize({ width: 700, height: 900 });
    const followed = await settle(page, () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) >=
      document.querySelector(".topbar").getBoundingClientRect().bottom);
    check("when the window narrows and the top bar wraps, fields still come clear of it", followed && await focusFromUnderBars(page, "#event-name"));

    await ctx.close();
    ({ ctx, page } = await fresh(browser));

    section("the timeline");
    check("the canvas leaves vertical swipes to the page", await page.$eval("#chart-canvas", c => getComputedStyle(c).touchAction) === "pan-y");
    const canvas = await (await page.$("#chart-canvas")).boundingBox();
    const viewBefore = await page.evaluate(() => JSON.stringify(Ophis.Chart.view));
    const y = canvas.y + canvas.height / 2;
    // A real touch drag through the DevTools protocol, as a finger pans: one
    // move a frame, then a rest before it lifts. A finger that lifts while
    // still moving flicks, and Chrome swallows the tap that stops a flick, by
    // design, so that tap would say nothing about the app.
    const cdp = await ctx.newCDPSession(page);
    const touchAt = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touchAt("touchStart", canvas.x + 300);
    for (let step = 1; step <= 5; step++) { await touchAt("touchMove", canvas.x + 300 - step * 20); await page.waitForTimeout(16); }
    await page.waitForTimeout(150);
    await touchAt("touchEnd");
    await settle(page, before => JSON.stringify(Ophis.Chart.view) !== before, viewBefore);
    check("a finger drag pans the timeline", await page.evaluate(() => JSON.stringify(Ophis.Chart.view)) !== viewBefore);
    const stem = await page.evaluate(() => { const p = Ophis.Chart.points.filter(q => q.kind === "z"); return p.length ? { x: p[0].x, y: p[0].y, key: p[0].key } : null; });
    if (stem) { await page.touchscreen.tap(canvas.x + stem.x, canvas.y + stem.y); await settle(page, key => Ophis.Store.selection.zKey === key, stem.key); }
    check("the first tap after a drag still selects a Z-Date", !!stem && await page.evaluate(() => Ophis.Store.selection.zKey) === stem.key);

    section("accessibility");
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll("button, input[type=checkbox], select")).filter(el => {
      const label = el.closest("label");
      const byFor = el.id && document.querySelector('label[for="' + el.id + '"]');
      const name = (el.getAttribute("aria-label") || (el.tagName === "BUTTON" ? el.textContent : "") || (byFor && byFor.textContent) || (label && label.textContent) || "").trim();
      return !name || (/^[✕⤒?◑+]$/.test(name) && !el.getAttribute("aria-label"));
    }).map(el => el.outerHTML.slice(0, 80)));
    check("every button, checkbox and select has a name", unnamed.length === 0, unnamed.slice(0, 3).join(" | "));
    check("the toast is announced", await page.getAttribute("#toast", "role") === "status");

    section("cycles and the Backtest");
    check("the Cycles panel is drawn", /Cycles/.test(await page.textContent("#panel-cycles")));
    await page.focus('#toolbar [data-action="backtest"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#modal.open .bt-host");
    check("the Backtest window opens", /\S/.test(await page.textContent("#modal .bt-host")));
    await page.keyboard.press("Escape");
    const cleared = await page.$eval("#modal", m => !m.classList.contains("open") && m.innerHTML === "");
    const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-action"));
    check("…closes cleanly and gives focus back", cleared && returned === "backtest", cleared + " " + returned);

    section("theme");
    await page.click('[data-action="theme"]');
    check("the theme button switches to dark", await page.getAttribute("html", "data-theme") === "dark");
    collecting = false;   // the next load aborts app.js on purpose
    await page.route("**/web/js/app.js", r => r.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    check("a saved dark theme is on before the app starts", await page.getAttribute("html", "data-theme") === "dark");
    await page.unroute("**/web/js/app.js");
    await ctx.close();
    collecting = true;

    section("phone");
    ({ ctx, page } = await fresh(browser, { width: 390, height: 844 }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("no sideways scroll at 390 px", overflow <= 0, overflow + " px");
    check("a field under the taller top bar comes clear when it takes focus", await focusFromUnderBars(page, "#event-name"));
    await toFoot(page);
    const phoneBar = await page.evaluate(() => Math.round(document.querySelector(".topbar").getBoundingClientRect().top));
    check("the top bar stays on screen at the foot of the page", phoneBar === 0, phoneBar);
    // A Z-Date is open; the table is scrolled so its details (above the table)
    // sit under the bar; another Z-Date is picked from the table. The page draws
    // in between, as it would for a person, and nothing holds focus (the app
    // gives focus back after a redraw, which would scroll).
    await page.evaluate(() => { document.activeElement.blur(); document.querySelectorAll(".z-row")[0].click(); });
    await settle(page, () => document.getElementById("panel-detail").classList.contains("open"));
    await page.evaluate(() => {
      const detail = document.getElementById("panel-detail");
      window.scrollTo(0, detail.getBoundingClientRect().top + window.scrollY + 120);
      return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await page.evaluate(() => document.querySelectorAll(".z-row")[1].click());
    const detailShown = await settle(page, () => document.getElementById("panel-detail").getBoundingClientRect().top >=
      document.querySelector(".topbar").getBoundingClientRect().bottom - 1);
    check("a Z-Date picked from the table shows its details below the bar", detailShown,
      await page.evaluate(() => Math.round(document.getElementById("panel-detail").getBoundingClientRect().top)));
    await page.setViewportSize({ width: 844, height: 390 });
    await toFoot(page);
    const shortBar = await page.evaluate(() => Math.round(document.querySelector(".topbar").getBoundingClientRect().bottom));
    check("on a screen too short for them, the bars scroll away with the page", shortBar <= 0, shortBar);
    await ctx.close();

    check("no page errors, console errors or failed requests", errors.length === 0, errors.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
  }
  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed) console.log("failed: " + failures.join("; "));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
