/* ==========================================================================
   app.js — bootstrap and wiring
   --------------------------------------------------------------------------
   Renders the panels, routes every input event to the Store, and owns the
   things that are the shell's business: file open/save, the Current Time
   control, keyboard shortcuts, theme.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var T = root.Ophis.Time;
  var Engine = root.Ophis.Engine;
  var File = root.Ophis.File;
  var Store = root.Ophis.Store;
  var UI = root.Ophis.UI;
  var Panels = root.Ophis.Panels;
  var Output = root.Ophis.Output;
  var Chart = root.Ophis.Chart;
  var Ophis = root.Ophis;

  var App = { clockTimer: null };

  var REFIT_REASONS = ["boot", "import", "events", "dates", "reset", "event-settings"];

  var hosts = {};

  /* ====================================================================== */
  /* Render                                                                 */
  /* ====================================================================== */

  /* Panels re-render wholesale on every commit, which would otherwise throw
     away the caret mid-edit. Each editable control carries a stable
     data-focus-key; this puts the operator back where they were. */
  function captureFocus() {
    var active = document.activeElement;
    if (!active || !active.getAttribute) return null;
    var key = active.getAttribute("data-focus-key");
    if (!key) return null;
    var state = { key: key };
    try { state.start = active.selectionStart; state.end = active.selectionEnd; } catch (e) { /* number inputs */ }
    return state;
  }

  function restoreFocus(state) {
    if (!state) return;
    var element = document.querySelector('[data-focus-key="' + state.key + '"]');
    if (!element) return;
    element.focus();
    if (state.start !== undefined && state.start !== null) {
      try { element.setSelectionRange(state.start, state.end); } catch (e) { /* not a text input */ }
    }
  }

  App.render = function (reason) {
    var focusState = captureFocus();

    Panels.renderEventBar(hosts.eventBar);
    Panels.renderXDates(hosts.xDates);
    Panels.renderIntervals(hosts.intervals);
    Panels.renderTDates(hosts.tDates);
    Panels.renderEventSettings(hosts.eventSettings);
    Panels.renderOperations(hosts.operations);
    Panels.renderFilters(hosts.filters);
    Panels.renderChartOptions(hosts.chartOptions);
    Output.render(hosts.output);
    Output.renderDetail(hosts.detail);

    // A freshly picked Z-Date should be readable without hunting for it.
    if (reason === "selection" && Store.selection.zKey && hosts.detail.classList.contains("open")) {
      var box = hosts.detail.getBoundingClientRect();
      if (box.top > window.innerHeight - 80 || box.bottom < 80) {
        hosts.detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Refit the timeline only when the dates themselves moved; a filter or a
    // sort should not throw away the operator's zoom.
    if (REFIT_REASONS.indexOf(reason) >= 0) Chart.reset();
    Chart.draw();

    App.renderStatus();
    restoreFocus(focusState);
  };

  App.renderStatus = function () {
    var event = Store.currentEvent();
    var results = Store.results;
    var offset = Store.globalOptions.local_time_offset_in_millis;
    var now = Store.nowInstant();

    var pieces = [];
    pieces.push('<span class="status-item"><b>' + UI.esc(event.name) + '</b></span>');
    pieces.push('<span class="status-item">' + (event.scope === C.EVENT_SCOPE__HH_MM ? "HH:MM · sunset days" : "Days · UTC") + '</span>');

    if (results && !results.errors.length) {
      pieces.push('<span class="status-item">' + results.y_structs.length + ' intervals</span>');
      pieces.push('<span class="status-item">' + results.total_z_dates + ' projected · ' + results.z_keys_sorted.length + ' shown</span>');
    } else if (results && results.errors.length) {
      pieces.push('<span class="status-item warn-text">' + results.errors.length + ' issue' + (results.errors.length === 1 ? "" : "s") + '</span>');
    }

    pieces.push('<span class="spacer"></span>');
    pieces.push('<span class="status-item' + (offset ? " shifted" : "") + '">Current time ' +
      '<input type="date" id="now-date" value="' + UI.esc(Panels.toInputDate(T.formatUtcDateOnly(now))) + '"' +
      ' data-tip="The date the F3/F4 filters treat as today. Shift it for backtesting.">' +
      (offset ? '<button class="btn small ghost" data-action="reset-now">reset</button>' : '') +
      '</span>');

    hosts.status.innerHTML = pieces.join("");
  };

  /* ====================================================================== */
  /* Wiring                                                                 */
  /* ====================================================================== */

  function currentList(kind) {
    var event = Store.currentEvent();
    return (kind === "t") ? event.t_dates : event.x_dates;
  }

  function wire() {
    /* ---- events bar ---- */
    UI.on(hosts.eventBar, "click", "[data-event]", function (e, target) {
      Store.selectEvent(parseInt(target.getAttribute("data-event"), 10));
    });
    UI.on(hosts.eventBar, "click", '[data-action="add-event"]', function () { Store.addEvent(); });

    /* ---- date rows (X and T) ---- */
    ["xDates", "tDates"].forEach(function (name) {
      var host = hosts[name];

      UI.on(host, "change", ".date-row [data-field]", function (e, target) {
        var row = target.closest(".date-row");
        var kind = row.getAttribute("data-kind");
        var index = parseInt(row.getAttribute("data-index"), 10);
        var entry = currentList(kind)[index];
        var field = target.getAttribute("data-field");

        if (field === "date") entry.date = Panels.fromInputDate(target.value) || entry.date;
        else if (field === "time") entry.time = target.value || "00:00";
        else if (field === "enabled") entry.enabled = target.checked;

        Store.commit("dates");
      });

      UI.on(host, "click", '[data-action="remove-date"]', function (e, target) {
        var row = target.closest(".date-row");
        Store.removeDate(row.getAttribute("data-kind"), parseInt(row.getAttribute("data-index"), 10));
      });

      UI.on(host, "click", '[data-action="insert-date"]', function (e, target) {
        var row = target.closest(".date-row");
        Store.insertDate(row.getAttribute("data-kind"), parseInt(row.getAttribute("data-index"), 10));
      });

      UI.on(host, "click", '[data-action="add-x"]', function () { Store.addDate("x"); });
      UI.on(host, "click", '[data-action="add-t"]', function () { Store.addDate("t"); });
      UI.on(host, "click", '[data-action="sort-x"]', function () { Store.sortXDates(); });
      UI.on(host, "click", '[data-action="clear-x"]', function () {
        UI.confirm("Clear X-Dates", "Remove every X-Date from this event?", function () { Store.clearDates("x"); });
      });
      UI.on(host, "click", '[data-action="clear-t"]', function () { Store.clearDates("t"); });
    });

    /* ---- intervals ---- */
    UI.on(hosts.intervals, "click", '[data-action="select-y"]', function (e, target) {
      var ordinal = parseInt(target.getAttribute("data-y"), 10);
      Store.selection.yOrdinal = (Store.selection.yOrdinal === ordinal) ? null : ordinal;
      Store.notify("selection");
    });

    /* ---- operations ---- */
    UI.on(hosts.operations, "change", ".operation-row [data-field]", function (e, target) {
      var row = target.closest(".operation-row");
      var index = parseInt(row.getAttribute("data-index"), 10);
      var operation = Store.currentEvent().operations[index];
      var field = target.getAttribute("data-field");

      if (field === "equation") operation.equation = target.value;
      else if (field === "weight") {
        var weight = parseFloat(target.value);
        operation.weight = (isNaN(weight) || weight < 0) ? 0 : weight;
      } else if (field === "enabled") operation.enabled = target.checked;

      Store.commit("operations");
    });

    UI.on(hosts.operations, "input", '[data-field="equation"]', function (e, target) {
      var row = target.closest(".operation-row");
      var compiled = Ophis.Expr.compile(target.value);
      row.classList.toggle("broken", !compiled.ok);
      var note = row.querySelector(".operation-error, .operation-preview");
      if (note) {
        note.className = compiled.ok ? "operation-preview" : "operation-error";
        note.textContent = compiled.ok
          ? "Y=10 \u2192 " + UI.number(T.roundTime(compiled.run(C.SAMPLE_Y_VALUE_FOR_VALIDATION))) + " days"
          : compiled.errors.join(" ");
      }
    });

    UI.on(hosts.operations, "click", '[data-action="remove-operation"]', function (e, target) {
      Store.removeOperation(parseInt(target.closest(".operation-row").getAttribute("data-index"), 10));
    });
    UI.on(hosts.operations, "click", '[data-action="add-operation"]', function () { Store.addOperation(); });
    UI.on(hosts.operations, "click", '[data-action="ops-all-on"]', function () { Store.setAllOperations(true); });
    UI.on(hosts.operations, "click", '[data-action="ops-all-off"]', function () { Store.setAllOperations(false); });
    UI.on(hosts.operations, "click", '[data-action="reset-operations"]', function () {
      UI.confirm("Reset operations", "Replace the current list with the 16 shipped operations?", function () { Store.resetOperations(); });
    });
    UI.on(hosts.operations, "click", '[data-action="operation-help"]', function () { Panels.operationHelp(); });

    /* ---- filters ---- */
    UI.on(hosts.filters, "change", "[data-filter]", function (e, target) {
      Store.currentEvent()[target.getAttribute("data-filter")] = target.checked;
      Store.commit("filters");
    });
    UI.on(hosts.filters, "change", "[data-filter-value]", function (e, target) {
      var key = target.getAttribute("data-filter-value");
      var filter = C.FILTERS.filter(function (f) { return f.key === key; })[0];
      var value = parseFloat(target.value);
      Store.currentEvent()[filter.valueKey] = (isNaN(value) || value < 0) ? filter.valueDef : value;
      Store.commit("filters");
    });
    UI.on(hosts.filters, "click", '[data-action="filters-off"]', function () {
      var event = Store.currentEvent();
      C.FILTERS.forEach(function (filter) { event[filter.key] = false; });
      Store.commit("filters");
    });
    UI.on(hosts.filters, "click", '[data-action="filters-default"]', function () {
      var event = Store.currentEvent();
      C.FILTERS.forEach(function (filter) {
        event[filter.key] = filter.def;
        if (filter.valueKey) event[filter.valueKey] = filter.valueDef;
      });
      Store.commit("filters");
    });

    /* ---- event settings ---- */
    UI.on(hosts.eventSettings, "change", "[data-event-field]", function (e, target) {
      var event = Store.currentEvent();
      var field = target.getAttribute("data-event-field");

      if (field === "name") event.name = target.value.trim() || event.name;
      else if (field === "notes") event.notes = target.value;
      else if (field === "scope") {
        event.scope = target.value;
        if (event.scope === C.EVENT_SCOPE__HH_MM) event.location_enabled = true;
      } else if (field === "scoring_system") event.scoring_system = target.value;
      else if (field === "lat" || field === "long") {
        var coordinate = parseFloat(target.value);
        event[field] = isNaN(coordinate) ? 0 : T.roundLocation(coordinate);
        T.clearSunsetCache();
      } else if (field === "day_scope_start") {
        var parts = ("" + target.value).split(":");
        var hours = parseInt(parts[0], 10) || 0;
        var minutes = parseInt(parts[1], 10) || 0;
        event.day_scope_start_time_in_millis = hours * C.MILLIS_PER_HOUR + minutes * C.MILLIS_PER_MINUTE;
      }
      Store.commit("event-settings");
    });
    UI.on(hosts.eventSettings, "input", '[data-event-field="name"]', function (e, target) {
      Store.currentEvent().name = target.value;
      Panels.renderEventBar(hosts.eventBar);
    });
    UI.on(hosts.eventSettings, "click", '[data-action="duplicate-event"]', function () {
      Store.duplicateEvent(Store.currentEventIndex);
    });
    UI.on(hosts.eventSettings, "click", '[data-action="delete-event"]', function () {
      UI.confirm("Delete event", "Delete " + Store.currentEvent().name + "?", function () {
        Store.deleteEvent(Store.currentEventIndex);
      });
    });

    /* ---- chart overlays ---- */
    UI.on(hosts.chartOptions, "change", "[data-chart-option]", function (e, target) {
      Store.currentEvent()[target.getAttribute("data-chart-option")] = target.checked;
      Store.commit("chart-options");
    });

    /* ---- output ---- */
    UI.on(hosts.output, "click", "th.sortable", function (e, target) {
      Store.currentEvent().z_date_sort_type = target.getAttribute("data-sort");
      Store.commit("sort");
    });
    UI.on(hosts.output, "keydown", "th.sortable", function (e, target) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        Store.currentEvent().z_date_sort_type = target.getAttribute("data-sort");
        Store.commit("sort");
      }
    });
    UI.on(hosts.output, "click", ".z-row", function (e, target) {
      var pill = e.target.closest("[data-op-hash]");
      var key = target.getAttribute("data-z-key");
      Store.selection.zKey = (Store.selection.zKey === key && !pill) ? null : key;
      Store.selection.operationHash = pill ? pill.getAttribute("data-op-hash") : null;
      Store.notify("selection");
    });
    UI.on(hosts.output, "click", '[data-action="export-csv"]', function () { App.exportCsv(); });
    UI.on(hosts.detail, "click", '[data-action="close-detail"]', function () {
      Store.selection.zKey = null;
      Store.selection.operationHash = null;
      Store.notify("selection");
    });
    UI.on(hosts.detail, "click", "[data-op-hash]", function (e, target) {
      Store.selection.operationHash = target.getAttribute("data-op-hash");
      Store.notify("selection");
    });

    /* ---- status bar ---- */
    UI.on(hosts.status, "change", "#now-date", function (e, target) {
      var text = Panels.fromInputDate(target.value);
      var parsed = T.parseCalendarDate(text, []);
      if (!parsed) return;
      var wanted = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
      var todayUtc = T.floorToUtcMidnight(new Date()).getTime();
      Store.globalOptions.local_time_offset_in_millis = wanted - todayUtc;
      Store.commit("now");
    });
    UI.on(hosts.status, "click", '[data-action="reset-now"]', function () {
      Store.globalOptions.local_time_offset_in_millis = 0;
      Store.commit("now");
    });

    /* ---- toolbar ---- */
    var toolbar = document.getElementById("toolbar");
    UI.on(toolbar, "click", '[data-action="open"]', function () { document.getElementById("file-input").click(); });
    UI.on(toolbar, "click", '[data-action="save"]', function () { App.saveOph(); });
    UI.on(toolbar, "click", '[data-action="csv"]', function () { App.exportCsv(); });
    UI.on(toolbar, "click", '[data-action="new"]', function () {
      UI.confirm("New session", "Clear every event and start again?", function () {
        Store.reset();
        UI.toast("New session started.");
      });
    });
    UI.on(toolbar, "click", '[data-action="theme"]', function () { App.toggleTheme(); });
    UI.on(toolbar, "click", '[data-action="about"]', function () { App.about(); });

    document.getElementById("file-input").addEventListener("change", function (domEvent) {
      var file = domEvent.target.files && domEvent.target.files[0];
      if (file) App.openFile(file);
      domEvent.target.value = "";
    });

    /* ---- drag and drop a .oph anywhere ---- */
    ["dragenter", "dragover"].forEach(function (type) {
      document.addEventListener(type, function (domEvent) {
        domEvent.preventDefault();
        document.body.classList.add("dropping");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      document.addEventListener(type, function (domEvent) {
        domEvent.preventDefault();
        if (type === "dragleave" && domEvent.relatedTarget) return;
        document.body.classList.remove("dropping");
        if (type === "drop" && domEvent.dataTransfer.files.length) App.openFile(domEvent.dataTransfer.files[0]);
      });
    });

    /* ---- keyboard ---- */
    document.addEventListener("keydown", function (domEvent) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(domEvent.target.tagName);
      if ((domEvent.ctrlKey || domEvent.metaKey) && domEvent.key.toLowerCase() === "s") {
        domEvent.preventDefault(); App.saveOph(); return;
      }
      if ((domEvent.ctrlKey || domEvent.metaKey) && domEvent.key.toLowerCase() === "o") {
        domEvent.preventDefault(); document.getElementById("file-input").click(); return;
      }
      if (typing) return;
      if (domEvent.key === "Escape") {
        Store.selection.zKey = null;
        Store.selection.operationHash = null;
        Store.notify("selection");
      }
    });

    UI.bindTooltips(document);
  }

  /* ====================================================================== */
  /* File actions                                                           */
  /* ====================================================================== */

  App.openFile = function (file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = Store.importOph("" + reader.result);
      if (parsed.errors.length) {
        UI.modal("Could not open " + file.name,
          '<p>The file was rejected. Nothing in the current session has changed.</p><ul class="errors-list">' +
          parsed.errors.slice(0, 40).map(function (error) { return "<li>" + UI.esc(error) + "</li>"; }).join("") +
          '</ul>', {});
        return;
      }
      if (parsed.warnings.length) {
        UI.modal("Opened " + file.name + " with warnings",
          '<p>The events loaded. These operations were disabled because they are not valid formulas:</p><ul class="errors-list">' +
          parsed.warnings.map(function (warning) { return "<li>" + UI.esc(warning) + "</li>"; }).join("") +
          '</ul>', {});
      } else {
        UI.toast("Opened " + file.name + " — " + parsed.events.length + " event" + (parsed.events.length === 1 ? "" : "s") + ".", "ok");
      }
    };
    reader.onerror = function () { UI.toast("Could not read " + file.name, "bad"); };
    reader.readAsText(file);
  };

  App.saveOph = function () {
    var name = (Store.events.length > 1
      ? "ophis-session"
      : File.safeFileName(Store.currentEvent().name || "ophis")) + ".oph";
    File.download(name, Store.exportOph(), "application/json");
    Store.dirty = false;
    UI.toast("Saved " + name, "ok");
  };

  App.exportCsv = function () {
    var event = Store.currentEvent();
    var results = Store.results || Store.recalculate();
    var name = File.safeFileName(event.name || "ophis") + ".csv";
    File.download(name, File.toCsv(event, results), "text/csv");
    UI.toast("Exported " + name, "ok");
  };

  /* ====================================================================== */
  /* Chrome                                                                 */
  /* ====================================================================== */

  App.toggleTheme = function () {
    var next = Store.globalOptions.theme === "dark" ? "light" : "dark";
    Store.globalOptions.theme = next;
    document.documentElement.setAttribute("data-theme", next);
    Store.save();
    Chart.draw();
  };

  App.about = function () {
    var hasSunset = T.sunsetAvailable();
    var hasEclipses = T.eclipsesAvailable();
    UI.modal("About this build", '' +
      '<p><b>Ophis Web</b> — a browser rebuild of Ophis v12 ("PSYFR"), the offline date-projection tool. ' +
      'Same arithmetic, same file format, same output; no Electron, no filesystem access, no network.</p>' +
      '<h3>How a Z-Date is made</h3>' +
      '<ol class="doc-list">' +
        '<li>Every pair of enabled X-Dates gives an interval <b>Y</b>, in whole days.</li>' +
        '<li>Each enabled operation turns that Y into a day-offset, added to X<sub>1</sub> or X<sub>2</sub> as the formula says.</li>' +
        '<li>Offsets landing on the same day collapse into one <b>Z-Date</b>.</li>' +
        '<li>Each contributing operation is a hit worth its weight. Each offset that matches an <b>MSRF</b> number is another hit.</li>' +
        '<li>Score = (operation weights + MSRF points) × the strongest MSRF multiplier.</li>' +
        '<li>Filters hide what is not actionable; the table sorts by whichever column you click.</li>' +
      '</ol>' +
      '<h3>Data in this build</h3>' +
      '<table class="doc-table"><tbody>' +
        '<tr><td>MSRF numbers</td><td>' + (C.MSRF_FILTER__NORMAL.length + C.MSRF_FILTER__IMPORTANT.length + C.MSRF_FILTER__VORTEX.length) +
          ' (' + C.MSRF_FILTER__NORMAL.length + ' normal, ' + C.MSRF_FILTER__IMPORTANT.length + ' important, ' + C.MSRF_FILTER__VORTEX.length + ' vortex)</td></tr>' +
        '<tr><td>Sunset engine</td><td>' + (hasSunset ? "Astronomy Engine — loaded" : "<span class='warn-text'>not loaded — HH:MM scope unavailable</span>") + '</td></tr>' +
        '<tr><td>Eclipse tables</td><td>' + (hasEclipses ? "NASA catalogues — loaded" : "<span class='warn-text'>not loaded — eclipse overlays unavailable</span>") + '</td></tr>' +
        '<tr><td>Session storage</td><td>this browser only (localStorage); nothing leaves the machine</td></tr>' +
      '</tbody></table>' +
      '<h3>Deliberate differences from the desktop app</h3>' +
      '<ul class="doc-list">' +
        '<li>Formulas are parsed and walked, never compiled — a hostile <code>.oph</code> is a syntax error, not code.</li>' +
        '<li>Files are written only when you ask for them, through the browser\'s own download.</li>' +
        '<li>Saved <code>.oph</code> is ordinary JSON (the desktop app rewrites commas inside names and notes).</li>' +
      '</ul>' +
      '<p class="fineprint">Ophis is a worldbuilding and study instrument after the Archaix thesis of Jason Breshears. ' +
      'It is presented as that thesis, not as established science. Not affiliated with Archaix.</p>', {});
  };

  /* ====================================================================== */
  /* Boot                                                                   */
  /* ====================================================================== */

  App.boot = function () {
    hosts = {
      eventBar: document.getElementById("event-bar"),
      status: document.getElementById("statusbar"),
      xDates: document.getElementById("panel-xdates"),
      intervals: document.getElementById("panel-intervals"),
      tDates: document.getElementById("panel-tdates"),
      eventSettings: document.getElementById("panel-event"),
      operations: document.getElementById("panel-operations"),
      filters: document.getElementById("panel-filters"),
      chartOptions: document.getElementById("chart-options"),
      output: document.getElementById("panel-output"),
      detail: document.getElementById("panel-detail")
    };

    var restored = Store.load();
    if (!restored) Store.events = [App.sampleEvent()];

    document.documentElement.setAttribute("data-theme", Store.globalOptions.theme || "dark");

    Chart.attach(document.getElementById("chart-canvas"));
    Store.subscribe(App.render);
    wire();

    Store.recalculate();
    App.render("boot");

    // The status bar clock ticks; nothing else needs a timer.
    App.clockTimer = setInterval(function () {
      if (!document.hidden) App.renderStatus();
    }, 30000);

    if (!restored) {
      UI.toast("Loaded a sample event — open a .oph file or edit the X-Dates to start.", "info");
    }
  };

  /** A sample so the first run shows something real. */
  App.sampleEvent = function () {
    var event = File.newEvent("Sample · four anchors");
    event.notes = "Replace these with your own X-Dates, or open a .oph file.";
    var today = T.floorToUtcMidnight(new Date()).getTime();
    [-1319, -871, -433, -138].forEach(function (offsetDays) {
      event.x_dates.push(T.newXDate(T.formatUtcDateOnly(new Date(today + offsetDays * C.MILLIS_PER_DAY))));
    });
    return event;
  };

  root.Ophis.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.boot);
  } else {
    App.boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
