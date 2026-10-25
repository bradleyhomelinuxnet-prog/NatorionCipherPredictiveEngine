/* ==========================================================================
   ophis.store.js — session state, persistence, recalculation
   --------------------------------------------------------------------------
   One object holds everything the UI reads. Mutations go through the setters
   below so that exactly one place decides when to recompute and when to
   persist. Persistence is localStorage only — this build never writes to disk
   on its own (the desktop app's autoSaveToFile path, with no path validation,
   is finding #2 of the report).
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var Expr = root.Ophis.Expr;
  var T = root.Ophis.Time;
  var Engine = root.Ophis.Engine;
  var File = root.Ophis.File;
  var Sop = root.Ophis.Sop;

  var STORAGE_KEY = "ophis.web.session.v1";

  var Store = {
    events: [],
    currentEventIndex: 0,
    globalOptions: {
      local_time_offset_in_millis: 0,
      auto_recalculate: true,
      theme: "light",
      file_input_validation_mode: C.DEFAULT_FILE_INPUT_VALIDATION_MODE,
      show_operations_column: true,
      // 'days' is the table the original drew, one row per Z-Date; 'windows'
      // groups the same rows into 7-day periods, the way the SOP says to read
      // a cast built on older dates. A reading aid: it re-scores nothing.
      results_view: "days",
      // Optional tags (ophis.tags.js), all off by default. They label rows and
      // change nothing; like the rows view, they are this browser's, not the file's.
      tag_fibonacci: false,
      tag_geodetic: false,
      tag_diurnal: false
    },
    results: null,
    selection: { zKey: null, operationHash: null, yOrdinal: null },
    lastMessage: null,
    dirty: false,
    listeners: []
  };

  /* ------------------------------------------------------------ plumbing */

  Store.subscribe = function (fn) { Store.listeners.push(fn); };
  Store.notify = function (reason) {
    Store.listeners.forEach(function (fn) {
      try { fn(reason); } catch (e) { console.error("[ophis] listener failed", e); }
    });
  };

  Store.currentEvent = function () {
    if (!Store.events.length) Store.events.push(File.newEvent("Event 1"));
    if (Store.currentEventIndex >= Store.events.length) Store.currentEventIndex = Store.events.length - 1;
    if (Store.currentEventIndex < 0) Store.currentEventIndex = 0;
    return Store.events[Store.currentEventIndex];
  };

  Store.nowInstant = function () {
    return T.currentInstant(Store.globalOptions.local_time_offset_in_millis);
  };

  /** Re-run the engine for the current event. */
  Store.recalculate = function () {
    var event = Store.currentEvent();
    Store.results = Engine.run(event, { nowInstant: Store.nowInstant() });
    return Store.results;
  };

  /** Mutate, recompute (if auto), persist, then tell the UI.
      `dirty` means edits a .oph file does not hold yet, so opening a file asks
      first. options.edit === false marks a change that is not one: picking
      another event, the Current time override, a new empty session. */
  Store.commit = function (reason, options) {
    options = options || {};
    if (options.edit !== false) Store.dirty = true;
    if (Store.globalOptions.auto_recalculate || options.force) Store.recalculate();
    Store.save();
    Store.notify(reason || "commit");
  };

  Store.message = function (text, kind) {
    Store.lastMessage = text ? { text: text, kind: kind || "info", at: Date.now() } : null;
    Store.notify("message");
  };

  /* --------------------------------------------------------- persistence */

  Store.save = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        events: Store.events,
        currentEventIndex: Store.currentEventIndex,
        globalOptions: Store.globalOptions,
        dirty: Store.dirty,         // unsaved edits are still unsaved after a reload
        ops36: true                 // the one-time move to the 36 defaults is done
      }));
    } catch (e) { /* private mode, quota — the app still works, just forgets */ }
  };

  /** The session has just been written out as a .oph file. */
  Store.markSaved = function () {
    Store.dirty = false;
    Store.save();
  };

  Store.load = function () {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.events) || !saved.events.length) return false;
      // Route the restored events back through the .oph reader so that a
      // half-written or hand-edited localStorage entry is validated like a file.
      var parsed = File.parse(JSON.stringify({
        app_version: C.APP_VERSION, iso_events: saved.events
      }), C.FILE_INPUT_VALIDATION_MODE__ORIGINAL);
      if (!parsed.events.length) return false;
      Store.events = parsed.events;
      // Once, for a session stored before the 36-operation default: an event
      // still on the untouched sixteen moves up to all thirty-six.
      var upgrade = !saved.ops36;
      if (upgrade) Store.events.forEach(function (event) {
        if (C.isUntouchedSixteen(event.operations)) event.operations = C.allOperations();
      });
      Store.currentEventIndex = Math.min(saved.currentEventIndex || 0, parsed.events.length - 1);
      // A session stored before this flag was kept may hold unsaved edits.
      Store.dirty = saved.dirty !== false;
      Object.keys(Store.globalOptions).forEach(function (key) {
        if (saved.globalOptions && saved.globalOptions[key] !== undefined) {
          Store.globalOptions[key] = saved.globalOptions[key];
        }
      });
      if (upgrade) Store.save();   // record the move, so it happens only once
      return true;
    } catch (e) { return false; }
  };

  Store.clearStorage = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  };

  /* ------------------------------------------------------- event actions */

  Store.addEvent = function (template) {
    var event = template || File.newEvent("Event " + (Store.events.length + 1));
    Store.events.push(event);
    Store.currentEventIndex = Store.events.length - 1;
    Store.commit("events");
  };

  Store.duplicateEvent = function (index) {
    var copy = JSON.parse(JSON.stringify(Store.events[index]));
    copy.name = copy.name + " (copy)";
    Store.events.splice(index + 1, 0, copy);
    Store.currentEventIndex = index + 1;
    Store.commit("events");
  };

  Store.deleteEvent = function (index) {
    if (Store.events.length <= 1) {
      Store.events = [File.newEvent("Event 1")];
      Store.currentEventIndex = 0;
    } else {
      Store.events.splice(index, 1);
      if (Store.currentEventIndex >= Store.events.length) Store.currentEventIndex = Store.events.length - 1;
    }
    Store.commit("events");
  };

  Store.selectEvent = function (index) {
    Store.currentEventIndex = index;
    Store.selection = { zKey: null, operationHash: null, yOrdinal: null };
    Store.commit("events", { force: true, edit: false });   // a .oph does not record which event is open
  };

  /** The Current time override: how the session is read, not part of it. */
  Store.setNowOffset = function (millis) {
    Store.globalOptions.local_time_offset_in_millis = millis;
    Store.commit("now", { edit: false });
  };

  /* ------------------------------------------------------- date actions */

  Store.addDate = function (kind, xDate) {
    var event = Store.currentEvent();
    var list = (kind === "t") ? event.t_dates : event.x_dates;
    list.push(xDate || T.newXDate(suggestNextDate(event, list), C.TIMESTAMP_TO_USE_WITHOUT_HH_MM_SCOPE));
    Store.commit("dates");
  };

  /* A new row defaults to a day after the last one (or today for the first),
     so the "must be at least 1 day after" rule is satisfied out of the box. */
  function suggestNextDate(event, list) {
    var base;
    if (list.length) {
      var lastInstant = T.xDateToInstant(event.scope, list[list.length - 1], event.lat, event.long, []);
      base = lastInstant ? new Date(lastInstant.getTime() + C.MILLIS_PER_DAY) : new Date();
    } else {
      base = Store.nowInstant();
    }
    return event.scope === C.EVENT_SCOPE__HH_MM
      ? T.formatDateOnly(base, event.lat, event.long)
      : T.formatUtcDateOnly(base);
  }
  Store.suggestNextDate = suggestNextDate;

  Store.removeDate = function (kind, index) {
    var event = Store.currentEvent();
    var list = (kind === "t") ? event.t_dates : event.x_dates;
    list.splice(index, 1);
    Store.commit("dates");
  };

  Store.insertDate = function (kind, index) {
    var event = Store.currentEvent();
    var list = (kind === "t") ? event.t_dates : event.x_dates;
    var template = list[index] ? JSON.parse(JSON.stringify(list[index])) : T.newXDate(suggestNextDate(event, list));
    list.splice(index, 0, template);
    Store.commit("dates");
  };

  Store.clearDates = function (kind) {
    var event = Store.currentEvent();
    if (kind === "t") event.t_dates = []; else event.x_dates = [];
    Store.commit("dates");
  };

  Store.sortXDates = function () {
    var event = Store.currentEvent();
    event.x_dates.sort(function (a, b) {
      var ia = T.xDateToInstant(event.scope, a, event.lat, event.long, []);
      var ib = T.xDateToInstant(event.scope, b, event.lat, event.long, []);
      if (!ia || !ib) return 0;
      return ia.getTime() - ib.getTime();
    });
    Store.commit("dates");
  };

  /* ------------------------------------- Protocol Prime (ophis.sop.js) */

  /** ☉ Today: the Current time date as an X-Date, in date order, never twice. */
  Store.addToday = function () {
    var result = Sop.addToday(Store.currentEvent(), Store.nowInstant());
    if (result.added) Store.commit("dates");
    return result;
  };

  /**
   * Objective or subjective. Choosing subjective adds today through the same
   * path as ☉ Today, so the two can never disagree. Choosing objective removes
   * nothing: today may be a date the operator wants, and deleting an anchor
   * behind their back would move the results.
   */
  Store.setProjectionKind = function (kind) {
    var event = Store.currentEvent();
    var subjective = kind === Sop.SUBJECTIVE;
    if (subjective === Sop.isSubjective(event)) return { added: false, changed: false };
    var result = { added: false, changed: true };
    if (subjective) {
      event.projection_kind = Sop.SUBJECTIVE;
      result.added = Sop.addToday(event, Store.nowInstant()).added;
    } else {
      delete event.projection_kind;
    }
    Store.commit(result.added ? "dates" : "event-kind");
    return result;
  };

  /** Rows: Days or 7-day windows. How results are read, not part of the session. */
  Store.setResultsView = function (view) {
    Store.globalOptions.results_view = view === "windows" ? "windows" : "days";
    Store.save();
    Store.notify("view");
  };

  /** Switch one optional tag on or off. A way of reading results, not an edit. */
  Store.setTagOption = function (key, on) {
    if (["tag_fibonacci", "tag_geodetic", "tag_diurnal"].indexOf(key) < 0) return;
    Store.globalOptions[key] = on === true;
    Store.save();
    Store.notify("tags");
  };

  /* --------------------------------------------------- operation actions */

  Store.addOperation = function (equation) {
    var event = Store.currentEvent();
    event.operations.push({
      equation: equation || "X2+Y",
      weight: C.POINTS__ALPHA_OPERATION_MATCH,
      enabled: true
    });
    Store.commit("operations");
  };

  Store.removeOperation = function (index) {
    var event = Store.currentEvent();
    event.operations.splice(index, 1);
    Store.commit("operations");
  };

  Store.resetOperations = function () {
    Store.currentEvent().operations = C.allOperations();
    Store.commit("operations");
  };

  /* Append the extras that are not already in the list, compared as the
     normalised equation ("X1+Y x 1.38" counts as present). Returns how many
     were added; nothing is committed when that is none. */
  Store.addExtraOperations = function () {
    var event = Store.currentEvent();
    var have = event.operations.map(function (op) { return Expr.normalize(op.equation, true); });
    var added = 0;
    C.extraOperations().forEach(function (op) {
      if (have.indexOf(Expr.normalize(op.equation, true)) < 0) { event.operations.push(op); added++; }
    });
    if (added > 0) Store.commit("operations");
    return added;
  };

  /* The same, for the Mirrors (which arrive switched off). */
  Store.addMirrorOperations = function () {
    var event = Store.currentEvent();
    var have = event.operations.map(function (op) { return Expr.normalize(op.equation, true); });
    var added = 0;
    C.mirrorOperations().forEach(function (op) {
      if (have.indexOf(Expr.normalize(op.equation, true)) < 0) { event.operations.push(op); added++; }
    });
    if (added > 0) Store.commit("operations");
    return added;
  };

  Store.setAllOperations = function (enabled) {
    Store.currentEvent().operations.forEach(function (op) { op.enabled = enabled; });
    Store.commit("operations");
  };

  /* ------------------------------------------------------------ helpers */

  Store.exportOph = function () {
    return File.serialize(Store.events, { prettify: true });
  };

  Store.importOph = function (text) {
    var parsed = File.parse(text, Store.globalOptions.file_input_validation_mode);
    if (parsed.errors.length) return parsed;
    Store.events = parsed.events;
    Store.currentEventIndex = 0;
    Store.selection = { zKey: null, operationHash: null, yOrdinal: null };
    Store.dirty = false;
    Store.recalculate();
    Store.save();
    Store.notify("import");
    return parsed;
  };

  Store.reset = function () {
    Store.events = [File.newEvent("Event 1")];
    Store.currentEventIndex = 0;
    Store.selection = { zKey: null, operationHash: null, yOrdinal: null };
    Store.dirty = false;
    Store.commit("reset", { force: true, edit: false });   // an empty session holds nothing to lose
  };

  root.Ophis.Store = Store;
})(typeof window !== "undefined" ? window : globalThis);
