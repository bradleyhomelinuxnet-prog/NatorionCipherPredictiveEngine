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

  var state = {
    events: [demoEvent()],
    current: 0,
    settings: { theme: "", autoRun: true, todayOverride: "", minify: false, openHow: "replace", validation: C.VALIDATION.LOOSE, fileName: "natorion", screen: "cipher" },
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
      if (saved && typeof saved.current === "number") state.current = Math.max(0, Math.min(state.events.length - 1, saved.current));
      if (saved && saved.settings) Object.keys(state.settings).forEach(function (k) { if (saved.settings[k] !== undefined) state.settings[k] = saved.settings[k]; });
    } catch (e) { /* private window or corrupt copy: start fresh */ }
  }

  var saveTimer = null;
  function persistNow() {
    try { root.localStorage.setItem(KEY, JSON.stringify({ events: state.events, current: state.current, settings: state.settings })); emit("saved", true); }
    catch (e) { emit("saved", false); }
  }
  function persist() { emit("dirty"); clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 400); }

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
    state: state, on: on, emit: emit, load: load, event: event, change: change, setSetting: setSetting,
    select: select, replaceEvents: replaceEvents, persist: persist, persistNow: persistNow,
    scheduleRun: scheduleRun, runNow: runNow, nowMs: nowMs, demoEvent: demoEvent
  };
})(typeof window !== "undefined" ? window : globalThis);
