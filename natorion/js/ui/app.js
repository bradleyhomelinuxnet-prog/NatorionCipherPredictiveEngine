/* NATORION · ui/app.js — screens, theme, the event picker, start-up. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, D = NC.dom, S = NC.store, $ = D.$, el = D.el;
  var SCREENS = ["cipher", "operations", "chronicon", "files", "guide"];

  function go(name, noFocus) {
    if (SCREENS.indexOf(name) < 0) name = "cipher";
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) { s.dataset.active = String(s.dataset.screen === name); });
    Array.prototype.forEach.call($("tabs").querySelectorAll("button"), function (b) { if (b.dataset.screen === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    if (name === "operations") NC.opsView.render();
    if (name === "files") NC.files.render();
    NC.chronView.active(name === "chronicon");
    if (name === "cipher") NC.chart.draw();
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    S.saveScreen(name);   // remembered at once: leaving the page saves only pending edits
    if (!noFocus) { var h = document.querySelector('.screen[data-active="true"] h1'); if (h) h.focus({ preventScroll: true }); root.scrollTo(0, 0); }
  }

  function applyTheme() {
    var t = S.state.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    NC.chart.draw();
  }
  function toggleTheme() {
    var dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
    S.setSetting("theme", dark ? "light" : "dark");
    applyTheme();
  }

  // Above 720 px the top bar is sticky, and a control that takes keyboard focus
  // could be left underneath it. natorion.css turns the bar's height into
  // scroll padding, so the browser brings such a control out below it. The bar
  // wraps onto a second row on narrower screens or with a long event name, so
  // it is measured, not assumed.
  function keepClearOfBar() {
    var bar = document.querySelector(".topbar");
    function measure() {
      var sticky = getComputedStyle(bar).position === "sticky";
      document.documentElement.style.setProperty("--bar-cover", sticky ? (bar.offsetHeight + 8) + "px" : "0px");
    }
    measure();
    if (root.ResizeObserver) new root.ResizeObserver(measure).observe(bar);
    root.addEventListener("resize", measure);
  }

  function renderEventPicker() {
    var sel = $("eventSelect");
    D.fill(sel, S.state.events.map(function (e, i) { return el("option", { value: String(i), text: (e.name || "Event " + (i + 1)) }); }).concat([el("option", { value: "new", text: "+ New event" })]));
    sel.value = String(S.state.current);
  }

  function renderMsrfSets() {
    function p(label, arr) { return el("p", {}, [el("b", { text: label + " (" + arr.length + "): " }), arr.slice().sort(function (a, b) { return a - b; }).join(", ")]); }
    D.fill($("msrfSets"), [p("Vortex, within 0.1", C.MSRF_VORTEX), p("Important", C.MSRF_IMPORTANT), p("Normal", C.MSRF_NORMAL)]);
  }

  function start() {
    S.load();
    applyTheme();
    keepClearOfBar();
    NC.cipher.init(); NC.opsView.init(); NC.chronView.init(); NC.files.init();
    renderMsrfSets();
    renderEventPicker();
    NC.cipher.renderEvent();

    $("tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-screen]"); if (b) go(b.dataset.screen); });
    $("themeBtn").addEventListener("click", toggleTheme);
    $("eventSelect").addEventListener("change", function () {
      if (this.value === "new") { NC.files.render(); document.getElementById("evNew").click(); return; }
      S.select(parseInt(this.value, 10));
    });
    S.on("switch", function () { renderEventPicker(); NC.cipher.renderEvent(); if ($("opsBody").offsetParent) NC.opsView.render(); });
    S.on("dirty", function () { $("saveState").textContent = "Saving…"; $("saveState").dataset.dirty = "true"; });
    S.on("saved", function (ok) { $("saveState").textContent = ok ? "Saved" : "Not saved"; $("saveState").dataset.dirty = String(!ok); $("saveState").title = ok ? "Kept in this browser. Use Files → Save .oph to keep a copy." : "This browser is not letting the page store anything (private window?). Save a .oph file."; });
    // Only a screen's name switches screens: the skip link's #main must not.
    root.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (SCREENS.indexOf(h) >= 0) go(h, true); });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); NC.files.saveOph(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); go("files"); $("fileInput").click(); }
    });
    // On the way out, save only a change still waiting to be saved (see store.flush).
    root.addEventListener("pagehide", function () { S.flush(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") S.flush(); });

    var hash = location.hash.slice(1);
    go(SCREENS.indexOf(hash) >= 0 ? hash : S.state.settings.screen || "cipher", true);
    S.runNow();
  }

  NC.app = { go: go, renderEventPicker: renderEventPicker, start: start };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(typeof window !== "undefined" ? window : globalThis);
