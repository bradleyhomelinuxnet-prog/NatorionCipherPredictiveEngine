/* NATORION · ui/store.js — the document, the settings, and the one place
   that runs the engine. Everything is kept in this browser's localStorage;
   nothing leaves the machine. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, KEY = "natorion.v1";

  var listeners = {};
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  function emit(name, arg) { (listeners[name] || []).forEach(function (fn) { try { fn(arg); } catch (e) { console.error(e); } }); }

  function demoEvent() {
    // The dates from 7-4-26-8-20-26-3-9-27-3-16-27-8-19-27-4-1-28.oph
    var ev = NC.oph.newEvent("Event 1");
    ev.x_dates = ["07/04/2026", "08/20/2026", "03/09/2027", "03/16/2027", "08/19/2027", "04/01/2028"].map(function (d) { return { date: d, time: "00:00", enabled: true }; });
    return ev;
  }

  function defaultSettings() {
    return { theme: "", autoRun: true, todayOverride: "", minify: false, openHow: "replace", validation: C.VALIDATION.LOOSE, fileName: "natorion", screen: "cipher" };
  }
  // Settings with a fixed set of values: a saved value outside the set is ignored.
  var CHOICES = { theme: ["", "light", "dark"], openHow: ["replace", "append"], validation: Object.keys(C.VALIDATION).map(function (k) { return C.VALIDATION[k]; }) };

  var state = {
    events: [demoEvent()],
    current: 0,
    settings: defaultSettings(),
    results: null,
    selectedKey: null
  };

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.events) && saved.events.length) {
        var parsed = NC.oph.parse(JSON.stringify({ app_version: C.APP_VERSION, iso_events: saved.events }), C.VALIDATION.LOOSE);
        if (parsed.events && parsed.events.length) state.events = parsed.events;
      }
      if (saved && Number.isInteger(saved.current)) state.current = Math.max(0, Math.min(state.events.length - 1, saved.current));
      // A saved setting is kept only when it has its default's type (and, for
      // a choice, one of its values); anything else leaves the default.
      var ss = saved && saved.settings;
      if (ss && typeof ss === "object") Object.keys(state.settings).forEach(function (k) {
        var v = ss[k];
        if (typeof v !== typeof state.settings[k] || (CHOICES[k] && CHOICES[k].indexOf(v) < 0)) return;
        state.settings[k] = v;
      });
    } catch (e) { /* private window or corrupt copy: start fresh */ }
  }

  var saveTimer = null;
  function persistNow() {
    clearTimeout(saveTimer); saveTimer = null;
    try { root.localStorage.setItem(KEY, JSON.stringify({ events: state.events, current: state.current, settings: state.settings })); emit("saved", true); }
    catch (e) { emit("saved", false); }
  }
  function persist() { emit("dirty"); clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 400); }
  // Save now, but only if a change is still waiting. Leaving the page calls
  // this, not persistNow(): a second tab holding an older copy must not
  // overwrite, as it closes, what another tab has saved since.
  function flush() { if (saveTimer !== null) persistNow(); }
  // The open screen is saved at once and on its own: read the stored copy,
  // change only settings.screen, write it back. A full save here would put
  // this tab's events over what another tab has saved since.
  function saveScreen(name) {
    state.settings.screen = name;
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) { persistNow(); return; }   // nothing stored yet, so nothing to overwrite
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (!saved.settings || typeof saved.settings !== "object") saved.settings = {};
      if (saved.settings.screen === name) return;
      saved.settings.screen = name;
      root.localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) { /* storage blocked, full or corrupt: the next full save carries it */ }
  }

  function event() { return state.events[state.current]; }

  /* Change the current event. opts.run === false skips recalculation. */
  function change(mutate, opts) {
    opts = opts || {};
    mutate(event());
    persist();
    emit("event", opts);
    if (opts.run !== false) scheduleRun(opts.immediate);
  }
  function setSetting(k, v) { state.settings[k] = v; persist(); emit("settings", k); }
  // Every setting back to its default except the light/dark choice ("Start over").
  function resetSettings() {
    var d = defaultSettings();
    d.theme = state.settings.theme;
    Object.keys(d).forEach(function (k) { state.settings[k] = d[k]; });
    persist();
  }

  function select(i) {
    state.current = Math.max(0, Math.min(state.events.length - 1, i));
    state.selectedKey = null;
    persist();
    emit("switch");
    scheduleRun(true);
  }
  function replaceEvents(list, current) {
    state.events = list;
    state.current = Math.max(0, Math.min(list.length - 1, current || 0));
    state.selectedKey = null;
    persist();
    emit("switch");
    scheduleRun(true);
  }

  /* ------------------------------------------------------ run the engine -- */
  function nowMs() {
    var o = state.settings.todayOverride;
    if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) {
      var p = o.split("-").map(Number), d = new Date(Date.now());
      return new Date(p[0], p[1] - 1, p[2], d.getHours(), d.getMinutes()).getTime();
    }
    return NC.time.roundMinute(Date.now());
  }
  var runTimer = null;
  function scheduleRun(immediate) {
    clearTimeout(runTimer);
    emit("running");
    runTimer = setTimeout(runNow, immediate ? 0 : (state.settings.autoRun ? 220 : 0));
  }
  function runNow() {
    var ev = event(), res;
    try { res = NC.engine.run(ev, { nowMs: nowMs() }); }
    catch (e) { res = { errors: [String(e && e.message || e)], ys: [], zs: [], ops: [], byDate: [], sorted: [], zone: "UTC" }; }
    state.results = res;
    if (state.selectedKey && !res.byDate.some(function (t) { return t.key === state.selectedKey; })) state.selectedKey = null;
    emit("results", res);
  }

  NC.store = {
    state: state, on: on, emit: emit, load: load, event: event, change: change, setSetting: setSetting, resetSettings: resetSettings,
    select: select, replaceEvents: replaceEvents, persist: persist, persistNow: persistNow, flush: flush, saveScreen: saveScreen,
    scheduleRun: scheduleRun, runNow: runNow, nowMs: nowMs, demoEvent: demoEvent
  };
})(typeof window !== "undefined" ? window : globalThis);
