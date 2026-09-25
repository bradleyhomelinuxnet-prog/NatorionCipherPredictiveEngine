/* NATORION · engine/oph.js
   Reading and writing .oph documents.

   A .oph file is JSON: { "app_version": "12", "iso_events": [ ...events ] }
   (a bare array of events is accepted too). Files written here open in Ophis
   v12, and v12 files open here.

   Three strictness modes, as in v12:
     STRICT   — any problem rejects the file.
     ORIGINAL — v10 behaviour: structural problems reject, small ones repair.
     LOOSE    — repair whatever can be repaired (v12's GUI default).
   With the equation parser in engine/expr.js a hostile operation can no
   longer run code, so LOOSE is safe to keep as the default. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C, T = NC.time, V = C.VALIDATION;

  function isNonNegInt(v) {
    if (v === 0 || v === "0") return true;
    if (v === null || v === undefined || v === "") return false;
    var s = String(v).trim().replace(/^0+(?=\d)/, "");
    var n = Math.floor(Number(s));
    return Number.isFinite(n) && String(n) === s && n >= 0;
  }
  function blank(v) { return v === null || v === undefined || v === ""; }

  function newEvent(name, scope) {
    var ev = {
      name: name || "Event 1", notes: "", x_dates: [], t_dates: [],
      lat: 0, long: 0, location_enabled: false,
      scope: scope || C.SCOPE.DAYS, type: C.TYPE.PERSONAL,
      operations: C.cloneDefaultOperations(),
      scoring_system: C.SCORING.GTE_V8,
      z_date_sort_type: C.SORT.DATE,
      day_scope_start_time_in_millis: 0
    };
    C.ALL_FIELDS.forEach(function (f) { ev[f.key] = f.on; if (f.valueKey) ev[f.valueKey] = f.num; });
    return ev;
  }

  function checkDates(event, list, label, mode, errors, warnings) {
    for (var k = list.length - 1; k >= 0; k--) {
      var d = list[k];
      if (!d || typeof d !== "object") { list.splice(k, 1); continue; }
      if (d.enabled !== true && d.enabled !== false) d.enabled = true;
      if (typeof d.date !== "string") d.date = d.date == null ? "" : String(d.date);
      if (event.scope === C.SCOPE.HH_MM && blank(d.time)) { if (mode === V.LOOSE) d.time = "00:00"; }
      if (event.scope !== C.SCOPE.HH_MM && blank(d.time)) d.time = "00:00";
      var e = [];
      if (T.inputDateToMs(event, d, e) === null) {
        if (mode === V.LOOSE) { warnings.push(label + " " + (k + 1) + " (" + JSON.stringify(d.date) + ") was unreadable and was removed: " + e[0]); list.splice(k, 1); }
        else errors.push(label + " " + (k + 1) + ": " + e[0]);
      }
    }
  }

  function normalizeEvent(ev, i, mode, errors, warnings) {
    var strict = mode === V.STRICT, originalOrStrict = mode !== V.LOOSE, tag = "Event " + (i + 1);
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) { errors.push(tag + " is not an object."); return null; }
    ev.name = blank(ev.name) ? "" : String(ev.name);
    ev.notes = blank(ev.notes) ? "" : String(ev.notes);
    if (!isNonNegInt(ev.day_scope_start_time_in_millis)) ev.day_scope_start_time_in_millis = 0;
    else { ev.day_scope_start_time_in_millis = Number(ev.day_scope_start_time_in_millis); if (ev.day_scope_start_time_in_millis >= C.MS_DAY) ev.day_scope_start_time_in_millis = C.MS_DAY - C.MS_MIN; }

    var scopes = [C.SCOPE.HH_MM, C.SCOPE.DAYS, C.SCOPE.MONTHS, C.SCOPE.YEARS];
    if (blank(ev.scope)) ev.scope = C.SCOPE.DAYS;
    else if (scopes.indexOf(ev.scope) < 0) { if (strict) errors.push(tag + ": unknown scope " + ev.scope); else { warnings.push(tag + ": unknown scope " + ev.scope + ", using Days."); ev.scope = C.SCOPE.DAYS; } }

    var types = [C.TYPE.PERSONAL, C.TYPE.MARKETS];
    if (blank(ev.type)) ev.type = C.TYPE.PERSONAL;
    else if (types.indexOf(ev.type) < 0) { if (strict) errors.push(tag + ": unknown event type " + ev.type); else ev.type = C.TYPE.PERSONAL; }

    C.ALL_FIELDS.forEach(function (f) {
      if (ev[f.key] !== true && ev[f.key] !== false) ev[f.key] = f.on;
      if (f.valueKey) { var v = parseFloat(ev[f.valueKey]); ev[f.valueKey] = Number.isFinite(v) && v >= 0 ? v : f.num; }
    });

    if (ev.operations === undefined || ev.operations === null) ev.operations = C.cloneDefaultOperations();
    else if (!Array.isArray(ev.operations)) { if (strict) errors.push(tag + ": operations must be an array."); else { warnings.push(tag + ": operations were not a list; defaults restored."); ev.operations = C.cloneDefaultOperations(); } }
    if (Array.isArray(ev.operations)) {
      if (ev.operations.length < C.MIN_OPERATIONS) { if (strict) errors.push(tag + " has no operations."); else warnings.push(tag + " has no operations."); }
      ev.operations = ev.operations.filter(function (o) { return o && typeof o === "object"; }).map(function (o) {
        var w = Number(o.weight);
        return { equation: o.equation == null ? "" : String(o.equation), weight: Number.isFinite(w) ? w : C.POINTS_BETA, enabled: o.enabled === true };
      });
    }

    var systems = [C.SCORING.GTE_V8, C.SCORING.LTE_V7];
    if (blank(ev.scoring_system)) ev.scoring_system = C.SCORING.GTE_V8;
    else if (systems.indexOf(ev.scoring_system) < 0) { if (strict) errors.push(tag + ": unknown scoring system " + ev.scoring_system); else ev.scoring_system = C.SCORING.GTE_V8; }

    var sorts = Object.keys(C.SORT).map(function (k) { return C.SORT[k]; });
    if (sorts.indexOf(ev.z_date_sort_type) < 0) ev.z_date_sort_type = C.SORT.DATE;

    // Location. Missing is fine outside HH:MM scope.
    var hh = ev.scope === C.SCOPE.HH_MM;
    if (typeof ev.lat === "string" && ev.lat.trim() !== "") ev.lat = Number(ev.lat);
    if (typeof ev.long === "string" && ev.long.trim() !== "") ev.long = Number(ev.long);
    var latOk = (blank(ev.lat) && !hh) || (typeof ev.lat === "number" && Number.isFinite(ev.lat) && Math.abs(ev.lat) <= C.LAT_LIMIT);
    var lonOk = (blank(ev.long) && !hh) || (typeof ev.long === "number" && Number.isFinite(ev.long) && Math.abs(ev.long) <= C.LONG_LIMIT);
    if (!(latOk && lonOk)) {
      if (originalOrStrict) { errors.push(tag + " has an invalid latitude/longitude: " + ev.lat + ", " + ev.long + " (latitude must be within ±" + C.LAT_LIMIT + "°)."); return null; }
      warnings.push(tag + ": invalid latitude/longitude replaced with the default.");
      if (!latOk) ev.lat = C.DEFAULT_LAT;
      if (!lonOk) ev.long = C.DEFAULT_LONG;
    }
    if (blank(ev.lat)) ev.lat = C.DEFAULT_LAT;
    if (blank(ev.long)) ev.long = C.DEFAULT_LONG;
    ev.location_enabled = hh;

    if (Array.isArray(ev.x_dates) && ev.x_dates.length >= C.MIN_X_DATES) checkDates(ev, ev.x_dates, "X-Date", mode, errors, warnings);
    else if (originalOrStrict) errors.push(tag + " must have two or more x_dates.");
    else { ev.x_dates = Array.isArray(ev.x_dates) ? ev.x_dates : []; checkDates(ev, ev.x_dates, "X-Date", mode, errors, warnings); }

    if (Array.isArray(ev.t_dates)) checkDates(ev, ev.t_dates, "T-Date", mode, errors, warnings);
    else ev.t_dates = [];
    return ev;
  }

  /* text -> { events, errors, warnings, appVersion, empty }. `empty` is true
     when the document held no events and LOOSE started a fresh Event 1 (as
     v12 did); the app refuses such a document instead of opening it. */
  function parse(text, mode) {
    mode = mode || V.LOOSE;
    var errors = [], warnings = [], data;
    try { data = JSON.parse(text); }
    catch (e) { return { events: null, errors: ["Not valid JSON: " + e.message], warnings: warnings }; }
    if (data === null || typeof data !== "object") return { events: null, errors: ["The document is not a JSON object."], warnings: warnings };
    var list = Array.isArray(data) ? data : data.iso_events;
    var appVersion = parseInt(data.app_version, 10);
    if (!(appVersion > 0)) appVersion = parseInt(C.APP_VERSION, 10);
    var createFresh = false;
    if (!list) { if (mode !== V.LOOSE) errors.push("Missing field 'iso_events'."); else createFresh = true; }
    else if (!Array.isArray(list)) { if (mode !== V.LOOSE) errors.push("'iso_events' is not an array."); else createFresh = true; }
    else if (!list.length) { if (mode !== V.LOOSE) errors.push("'iso_events' is empty."); else createFresh = true; }
    var events = [];
    if (createFresh) { warnings.push("No events found; started a fresh Event 1."); events = [newEvent("Event 1")]; }
    else if (Array.isArray(list)) list.forEach(function (ev, i) { var n = normalizeEvent(ev, i, mode, errors, warnings); if (n) events.push(n); });
    if (errors.length) return { events: null, errors: errors, warnings: warnings, appVersion: appVersion };
    return { events: events, errors: [], warnings: warnings, appVersion: appVersion, empty: createFresh };
  }

  /* events -> .oph text. Minify drops everything equal to its default, as
     v12's sanitizeIsoEventsForSaveOperation(minify) did. */
  function serialize(events, opts) {
    opts = opts || {};
    var out = events.map(function (src) {
      var ev = JSON.parse(JSON.stringify(src));
      delete ev.effective_operations; delete ev.checked_for_swap_target; delete ev.checked_for_swap_source;
      if (!opts.minify) return ev;
      var hh = ev.scope === C.SCOPE.HH_MM;
      ["x_dates", "t_dates"].forEach(function (k) {
        (ev[k] || []).forEach(function (d) {
          if (!hh) delete d.time;
          if (d.enabled !== false) delete d.enabled;
        });
        if (ev[k] && !ev[k].length) delete ev[k];
      });
      C.ALL_FIELDS.forEach(function (f) {
        if (ev[f.key] === f.on) delete ev[f.key];
        if (f.valueKey && Number(ev[f.valueKey]) === f.num) delete ev[f.valueKey];
      });
      ["chart_x_min", "chart_x_max", "chart_y_min", "chart_y_max", "type"].forEach(function (k) { delete ev[k]; });
      if (!ev.day_scope_start_time_in_millis) delete ev.day_scope_start_time_in_millis;
      if (!ev.name) delete ev.name;
      if (!ev.notes) delete ev.notes;
      if (!hh) { delete ev.location_enabled; delete ev.lat; delete ev.long; }
      if (ev.scope === C.SCOPE.DAYS) delete ev.scope;
      if (ev.scoring_system === C.SCORING.GTE_V8) delete ev.scoring_system;
      if (ev.z_date_sort_type === C.SORT.DATE) delete ev.z_date_sort_type;
      var d = C.DEFAULT_OPERATIONS;
      if (Array.isArray(ev.operations) && ev.operations.length === d.length && ev.operations.every(function (o, i) { return o.equation === d[i].equation && o.weight === d[i].weight && o.enabled === d[i].enabled; })) delete ev.operations;
      return ev;
    });
    var doc = { app_version: C.APP_VERSION, iso_events: out };
    return opts.minify ? JSON.stringify(doc) : JSON.stringify(doc, null, 2);
  }

  /* ------------------------------------------------------ results out -- */
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // no spreadsheet formula injection
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function resultsTable(event, res) {
    var hh = event.scope === C.SCOPE.HH_MM, tz = res.zone;
    var header = ["Rank", "Z-Date", hh ? "Window ends (sunset)" : "Weekday", "Score", "Hits", "Operation hits", "MSRF matches", "Operations"];
    var rows = res.sorted.map(function (t, i) {
      var start = T.msToDateString(t.start, tz) + (hh ? " " + T.msToTimeString(t.start, tz) : "");
      var end = hh ? T.msToDateString(t.end, tz) + " " + T.msToTimeString(t.end, tz) : T.weekday(t.start, tz);
      var msrf = t.msrf.map(function (m) { return m.number + " (" + m.cls.name + ")"; }).join("; ");
      var ops = t.ops.map(function (h) { return "#" + (h.r.opIndex + 1) + " X" + (h.y.x1 + 1) + "→X" + (h.y.x2 + 1) + " Y=" + h.y.Y + " Z=" + h.r.z; }).join("; ");
      return [i + 1, start, end, t.score, t.hits, t.opHits, msrf, ops];
    });
    return { header: header, rows: rows };
  }
  function toCsv(event, res) {
    var t = resultsTable(event, res);
    return [t.header].concat(t.rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  NC.oph = { parse: parse, serialize: serialize, newEvent: newEvent, resultsTable: resultsTable, toCsv: toCsv, csvCell: csvCell };
})(typeof window !== "undefined" ? window : globalThis);
