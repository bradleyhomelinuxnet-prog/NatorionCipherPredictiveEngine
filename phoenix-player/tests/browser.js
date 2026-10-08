#!/usr/bin/env node
/* Drives the Phoenix Player in headless Chromium against tests/sample-index.txt, whose links point at a fake host
   answered here with tiny generated media (ffmpeg makes them; nothing is fetched from the network).
     node phoenix-player/tests/browser.js            (needs Playwright and ffmpeg) */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const HERE = __dirname, PAGE = "file://" + path.resolve(HERE, "../index.html");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "phoenix-"));
const ff = args => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
ff(["-f", "lavfi", "-i", "color=c=0x123456:s=64x36", "-frames:v", "1", path.join(TMP, "a.png")]);
// VP9 in MP4: Playwright's Chromium has no H.264 decoder (Chrome and Edge do). One H.264 clip stays in, to show
// that a clip the browser can't play is reported and skipped rather than stopping the playlist.
ff(["-f", "lavfi", "-i", "testsrc=s=64x36:d=1.4:r=10", "-pix_fmt", "yuv420p", "-c:v", "libvpx-vp9", "-b:v", "50k", path.join(TMP, "a.mp4")]);
ff(["-f", "lavfi", "-i", "testsrc=s=64x36:d=1.4:r=10", "-pix_fmt", "yuv420p", "-c:v", "libx264", path.join(TMP, "h264.mp4")]);
const MEDIA = { png: fs.readFileSync(path.join(TMP, "a.png")), mp4: fs.readFileSync(path.join(TMP, "a.mp4")), h264: fs.readFileSync(path.join(TMP, "h264.mp4")) };

let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : "   got " + JSON.stringify(got))); };

(async () => {
  const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("https://cdn.test/**", r => {
    const u = r.request().url();
    if (u.includes("gone")) return r.fulfill({ status: 404, body: "" });
    const ext = u.endsWith(".mp4") ? "mp4" : "png", body = u.includes("eeee0005") ? MEDIA.h264 : MEDIA[ext];
    r.fulfill({ status: 200, contentType: ext === "mp4" ? "video/mp4" : "image/png", body, headers: { "Accept-Ranges": "bytes" } });
  });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.goto(PAGE);

  await page.fill("#paste", fs.readFileSync(path.join(HERE, "sample-index.txt"), "utf8"));
  await page.click("#bLoad");
  check("the index parses: 6 assets, 3 stills, 3 clips", (await page.textContent("#hdr")) === "6 assets · 3 stills · 3 clips", await page.textContent("#hdr"));
  check("oldest first by default: the playlist starts at #006", (await page.textContent('#list li[data-i="0"] .n')) === "006", await page.textContent('#list li[data-i="0"] .n'));
  check("day headers are shown", (await page.$$eval("#list li.day", l => l.map(x => x.textContent))).join() === "2026-09-08,2026-09-29,2026-10-08");
  check("the playlist totals its running time", /about 0m 53s/.test(await page.textContent("#count")), await page.textContent("#count"));

  // Reference tokens become chips, not prompt text
  await page.click('#list li[data-i="2"]');                    // #004, the portrait
  check("<<<uuid>>> references become chips", (await page.textContent("#info .ref")) === "@39b82f74" && !(await page.textContent("#info .prompt")).includes("<<<"), await page.textContent("#info"));
  check("a still is shown on the stage", await page.$eval("#stage .layer.show img", i => i.src.endsWith("dddd0004.png")));

  // A dead link says so, and skips on while playing
  await page.click('#list li[data-i="0"]');
  await page.waitForFunction(() => document.getElementById("msg").textContent.includes("Could not load #6"));
  check("a dead link says which FILE failed", (await page.textContent("#msg")).includes("hf_20260908_003000"));
  await page.waitForFunction(() => document.querySelector("#list li[aria-current] .n").textContent === "005", null, { timeout: 6000 }).catch(() => {});
  check("…and the player skips on to #005", (await page.textContent("#list li[aria-current] .n")) === "005", await page.textContent("#list li[aria-current] .n"));

  // A clip the browser can't decode is reported and skipped too
  await page.waitForFunction(() => document.querySelector("#list li[aria-current] .n").textContent === "004", null, { timeout: 8000 }).catch(() => {});
  check("an unplayable clip (#005) is skipped, not left stuck", (await page.textContent("#list li[aria-current] .n")) === "004", await page.textContent("#msg"));

  // A clip plays to its end and the next item comes up
  await page.selectOption("#fType", "VID");
  await page.click('#list li[data-i="1"]');                  // #003
  await page.waitForFunction(() => document.querySelector("#list li[aria-current] .n").textContent === "002", null, { timeout: 8000 }).catch(() => {});
  check("a clip plays through and advances to the next (#003 → #002)", (await page.textContent("#list li[aria-current] .n")) === "002", await page.textContent("#msg"));
  await page.selectOption("#fType", "");

  // A still holds for its time, then advances
  await page.$eval("#hold", h => { h.value = 2; h.dispatchEvent(new Event("input")); });
  await page.click('#list li[data-i="2"]');
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector("#list li[aria-current] .n").textContent === "003", null, { timeout: 6000 }).catch(() => {});
  const held = Date.now() - t0;
  check("a still holds for its 2 seconds, then advances", (await page.textContent("#list li[aria-current] .n")) === "003" && held > 1700, held);

  // Pause stops the clock
  await page.click('#list li[data-i="5"]');                  // #001, a still: clicking starts play
  await page.click("#bPlay");
  const posA = await page.$eval("#bar i", b => b.style.width); await page.waitForTimeout(600);
  check("pause stops a still's clock", (await page.getAttribute("#bPlay", "aria-label")) === "Play" && (await page.$eval("#bar i", b => b.style.width)) === posA, posA);

  // Filters
  await page.selectOption("#fType", "IMG");
  check("filter: stills only", (await page.$$eval("#list li:not(.day)", l => l.length)) === 3);
  await page.selectOption("#fType", "");
  await page.fill("#q", "gallery");
  check("search finds #003 by its prompt", (await page.$$eval("#list li:not(.day) .n", l => l.map(x => x.textContent))).join() === "003");
  await page.fill("#q", "");
  await page.selectOption("#fOrder", "new");
  check("newest first reads the index as listed", (await page.textContent('#list li[data-i="0"] .n')) === "001");

  // Stars persist across a reload when the index is remembered
  await page.click('#list li[data-i="0"] .st');
  await page.click("#bNew"); await page.check("#remember"); await page.click("#bLoad");
  await page.reload();
  check("a remembered index reopens on reload", (await page.isVisible("#app")) && (await page.textContent("#hdr")).startsWith("6 assets"));
  await page.selectOption("#fMore", "star");
  check("the star on #001 survived the reload", (await page.$$eval("#list li:not(.day) .n", l => l.map(x => x.textContent))).join() === "001");
  await page.selectOption("#fMore", "");

  // Downloads: exact names win, then the shared stem in order
  const d = path.join(TMP, "downloads"); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, "hf_20260929_022717_cccc0003.mp4"), MEDIA.mp4);      // exact name → #003
  fs.writeFileSync(path.join(d, "hf_20260929_022717 (1).mp4"), MEDIA.mp4);            // stem only → #002
  fs.writeFileSync(path.join(d, "hf_20261008_034816.png"), MEDIA.png);                // stem only → #001
  fs.writeFileSync(path.join(d, "unrelated.png"), MEDIA.png);
  await page.setInputFiles("#fLocal", fs.readdirSync(d).map(f => path.join(d, f)));
  check("linking downloads reports what matched", /3 of 6 assets linked .* 1 picked files matched nothing/.test(await page.textContent("#msg")), await page.textContent("#msg"));
  await page.selectOption("#fMore", "local");
  check("on disk: #001, #002 and #003", (await page.$$eval("#list li:not(.day) .n", l => l.map(x => x.textContent).sort())).join() === "001,002,003");
  await page.click('#list li:not(.day)');
  check("a linked item plays from disk", (await page.textContent("#info .src")) === "from disk" && (await page.$eval("#stage .layer.show img, #stage .layer.show video", e => e.src.startsWith("blob:"))));
  await page.selectOption("#fMore", "");

  // The .m3u export
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#bM3u")]);
  const m3u = fs.readFileSync(await dl.path(), "utf8");
  check(".m3u lists every item with its link", m3u.startsWith("#EXTM3U") && (m3u.match(/^https:\/\/cdn\.test\//gm) || []).length === 6, m3u.slice(0, 200));

  // Bad input
  await page.click("#bNew"); await page.fill("#paste", "nothing here"); await page.click("#bLoad");
  check("text with no links is refused with a reason", (await page.textContent("#loadErr")).includes("No assets found"));

  // Phone width
  await page.setViewportSize({ width: 375, height: 800 });
  await page.fill("#paste", fs.readFileSync(path.join(HERE, "sample-index.txt"), "utf8")); await page.click("#bLoad");
  check("no sideways scrolling at 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await page.evaluate(() => document.documentElement.scrollWidth));

  check("no script errors or dialogs", errors.length === 0, errors);
  await browser.close();
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
